/**
 * Purpose: The three authentication endpoints of SPEC-02 section 2.2 - login,
 * logout and me. Login answers one generic message for every kind of failure so the
 * response never reveals whether a username exists, whether it is inactive, or
 * whether the password was wrong; an unknown username still pays for a full scrypt
 * verification so response latency does not leak the same fact. The lockout is
 * checked before the password, which is what makes a sixth attempt fail even when
 * the password is correct.
 *
 * SPEC-20 adds self sign-up, which creates a PENDING account and no session, and
 * makes login refuse a PENDING or REJECTED account - but only after the password
 * has been verified, so the status is never revealed to someone without it.
 */

import { and, eq, or, sql } from "drizzle-orm";
import { Router } from "express";
import type { Request } from "express";
import type { Pool } from "pg";

import { clearFailures, checkLockout, recordFailure } from "../auth/login-rate-limit.ts";
import { clearSessionCookie, readSessionCookie, requireAuth, requireSession, setSessionCookie } from "../auth/middleware.ts";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import { createSession, deleteExpiredSessions, deleteSession } from "../auth/session-repository.ts";
import { findActiveUserForLogin } from "../auth/user-repository.ts";
import type { Database } from "../db/client.ts";
import { user, zone } from "../db/schema.ts";

/** SPEC-02 section 2.1: one message for every failure, so nothing leaks. */
const GENERIC_FAILURE_MESSAGE = "Invalid username or password.";

/** SPEC-20 section 4: shown only after a correct password. */
const NOT_APPROVED_MESSAGES = {
  PENDING: "Your account is awaiting admin approval.",
  REJECTED: "Your sign-up request was not approved.",
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const MIN_NAME = 2;
const MAX_NAME = 150;
const MAX_EMAIL = 255;
const UNIQUE_VIOLATION = "23505";

/** SPEC-20 D125: sign-ups are counted per client IP in the login lockout table. */
const signUpThrottleKey = (request: Request): string => `signup-ip:${request.ip ?? "unknown"}`;

interface SignUp {
  readonly email: string;
  readonly password: string;
  readonly fullName: string;
  readonly zoneId: string;
}

/** SPEC-20 section 3's field rules; the zone's existence is checked by the caller. */
function validateSignUp(body: unknown): { value?: SignUp; errors: Record<string, string> } {
  const field = (name: string): string => {
    const raw = typeof body === "object" && body !== null ? (body as Record<string, unknown>)[name] : undefined;
    return typeof raw === "string" ? raw : "";
  };
  const email = field("email").trim().toLowerCase();
  const password = field("password");
  const fullName = field("fullName").trim();
  const zoneId = field("zoneId").trim();

  const errors: Record<string, string> = {};
  if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL) {
    errors["email"] = "Enter a valid email address";
  }
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    errors["password"] = `Use ${MIN_PASSWORD} to ${MAX_PASSWORD} characters`;
  }
  if (fullName.length < MIN_NAME || fullName.length > MAX_NAME) {
    errors["fullName"] = `Enter between ${MIN_NAME} and ${MAX_NAME} characters`;
  }
  if (!UUID_PATTERN.test(zoneId)) {
    errors["zoneId"] = "Choose a zone";
  }
  return Object.keys(errors).length > 0 ? { errors } : { value: { email, password, fullName, zoneId }, errors };
}

let dummyHash: string | undefined;

/**
 * Spends roughly the same time on an unknown username as on a real one, so response
 * latency cannot be used to discover which usernames exist.
 */
async function spendEquivalentVerifyTime(password: string): Promise<void> {
  dummyHash ??= await hashPassword("not-a-real-password");
  await verifyPassword(password, dummyHash);
}

function readStringField(body: unknown, field: string): string | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const value = (body as Record<string, unknown>)[field];
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  return value;
}

export function createAuthRouter(pool: Pool, db: Database): Router {
  const router = Router();

  router.post("/auth/login", async (request: Request, response) => {
    const username = readStringField(request.body, "username");
    const password = readStringField(request.body, "password");
    if (username === null || password === null) {
      response.status(400).json({ error: "username and password are required" });
      return;
    }

    const lockout = await checkLockout(pool, username);
    if (lockout.locked) {
      response.status(429).json({
        error: GENERIC_FAILURE_MESSAGE,
        retryAfterSeconds: lockout.retryAfterSeconds,
      });
      return;
    }

    const candidate = await findActiveUserForLogin(db, username.trim().toLowerCase());
    if (candidate === null) {
      await spendEquivalentVerifyTime(password);
      await recordFailure(pool, username);
      response.status(401).json({ error: GENERIC_FAILURE_MESSAGE });
      return;
    }

    if (!(await verifyPassword(password, candidate.passwordHash))) {
      await recordFailure(pool, username);
      response.status(401).json({ error: GENERIC_FAILURE_MESSAGE });
      return;
    }

    await clearFailures(pool, username);
    if (candidate.approvalStatus !== "APPROVED") {
      response.status(403).json({
        error: NOT_APPROVED_MESSAGES[candidate.approvalStatus],
        approvalStatus: candidate.approvalStatus,
      });
      return;
    }
    await deleteExpiredSessions(pool);
    const session = await createSession(pool, candidate.id);
    setSessionCookie(response, session.id, session.expiresAt);
    response.json({ userId: candidate.id, username: candidate.username, role: candidate.role, zoneId: candidate.zoneId });
  });

  /** POST /api/auth/signup — SPEC-20 section 3. Creates a PENDING account; never a session. */
  router.post("/auth/signup", async (request: Request, response) => {
    const throttle = await checkLockout(pool, signUpThrottleKey(request));
    if (throttle.locked) {
      response.status(429).json({
        error: "Too many sign-up requests. Please try again later.",
        retryAfterSeconds: throttle.retryAfterSeconds,
      });
      return;
    }
    await recordFailure(pool, signUpThrottleKey(request));

    const { value, errors } = validateSignUp(request.body);
    if (value !== undefined) {
      const zones = await db
        .select({ id: zone.id })
        .from(zone)
        .where(and(eq(zone.id, value.zoneId), eq(zone.isActive, true)));
      if (zones.length === 0) {
        errors["zoneId"] = "Choose a zone";
      }
    }
    if (value === undefined || Object.keys(errors).length > 0) {
      response.status(400).json({ error: "Sign-up details are not valid", errors });
      return;
    }

    // The unique indexes are case-sensitive, so an older mixed-case email is caught here.
    const taken = await db
      .select({ id: user.id })
      .from(user)
      .where(or(sql`lower(${user.email}) = ${value.email}`, sql`lower(${user.username}) = ${value.email}`));
    if (taken.length > 0) {
      response.status(409).json({ error: "This email is already registered." });
      return;
    }

    try {
      // D123: the email is the username. Role VIEWER is a least-privilege
      // placeholder; the approving super admin chooses the real one (D126).
      await pool.query(
        `INSERT INTO "user" (username, email, password_hash, role, zone_id, full_name, approval_status)
         VALUES ($1, $1, $2, 'VIEWER', $3, $4, 'PENDING')`,
        [value.email, await hashPassword(value.password), value.zoneId, value.fullName],
      );
    } catch (error) {
      if ((error as { code?: string }).code === UNIQUE_VIOLATION) {
        response.status(409).json({ error: "This email is already registered." });
        return;
      }
      throw error;
    }

    response.status(201).json({
      approvalStatus: "PENDING",
      message: "Sign-up received. An administrator must approve your account before you can log in.",
    });
  });

  router.post("/auth/logout", async (request: Request, response) => {
    const sessionId = readSessionCookie(request);
    if (sessionId !== null) {
      await deleteSession(pool, sessionId);
    }
    clearSessionCookie(response);
    response.status(204).end();
  });

  router.get("/auth/me", requireSession(pool), (request: Request, response) => {
    const auth = requireAuth(request);
    response.json({ userId: auth.userId, username: auth.username, role: auth.role, zoneId: auth.zoneId });
  });

  return router;
}
