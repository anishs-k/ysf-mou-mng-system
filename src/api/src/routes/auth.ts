/**
 * Purpose: The three authentication endpoints of SPEC-02 section 2.2 - login,
 * logout and me. Login answers one generic message for every kind of failure so the
 * response never reveals whether a username exists, whether it is inactive, or
 * whether the password was wrong; an unknown username still pays for a full scrypt
 * verification so response latency does not leak the same fact. The lockout is
 * checked before the password, which is what makes a sixth attempt fail even when
 * the password is correct.
 */

import { Router } from "express";
import type { Request } from "express";
import type { Pool } from "pg";

import { clearFailures, checkLockout, recordFailure } from "../auth/login-rate-limit.ts";
import { clearSessionCookie, readSessionCookie, requireAuth, requireSession, setSessionCookie } from "../auth/middleware.ts";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import { createSession, deleteExpiredSessions, deleteSession } from "../auth/session-repository.ts";
import { findActiveUserForLogin } from "../auth/user-repository.ts";
import type { Database } from "../db/client.ts";

/** SPEC-02 section 2.1: one message for every failure, so nothing leaks. */
const GENERIC_FAILURE_MESSAGE = "Invalid username or password.";

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
    await deleteExpiredSessions(pool);
    const session = await createSession(pool, candidate.id);
    setSessionCookie(response, session.id, session.expiresAt);
    response.json({ userId: candidate.id, username: candidate.username, role: candidate.role });
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
    response.json({ userId: auth.userId, username: auth.username, role: auth.role });
  });

  return router;
}
