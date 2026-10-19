/**
 * Purpose: SPEC-21 section 5 - the super admin's user management API, replacing
 * SPEC-20's sign-up queue: GET/POST /api/admin/users, PATCH and DELETE
 * /api/admin/users/:userId. A super admin is an active ADMIN with all_zones. The
 * route validates with @mou/domain's validateUserAccount, checks zones and
 * identifier clashes, hashes the password, and leaves the transactional writes and
 * the D133 lock-out safeguards to db/user-admin.ts.
 */

import { validateUserAccount } from "@mou/domain";
import type { UserAccountInput, UserAccountMode, UserAccountValues } from "@mou/domain";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { Pool } from "pg";

import { requireAuth, requireRole, requireSession } from "../auth/middleware.ts";
import { hashPassword } from "../auth/password.ts";
import type { Database } from "../db/client.ts";
import {
  allZonesActive,
  createManagedUser,
  deleteManagedUser,
  findManagedUser,
  listManagedUsers,
  takenIdentifiers,
  updateManagedUser,
} from "../db/user-admin.ts";
import type { WriteRefusal } from "../db/user-admin.ts";
import { asRecord, isUuid } from "./request-parse.ts";

const UNIQUE_VIOLATION = "23505";
const NOT_FOUND = { error: "User not found" };

/** SPEC-21 section 2.2: an ADMIN limited to zones is not a super admin. */
function requireSuperAdmin(request: Request, response: Response, next: NextFunction): void {
  if (!requireAuth(request).allZones) {
    response.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

/** A field of the wrong JSON type is kept as an invalid value, never silently dropped. */
function readInput(body: unknown): UserAccountInput {
  const raw = asRecord(body);
  const text = (name: string): string | undefined => {
    const value = raw[name];
    return value === undefined ? undefined : typeof value === "string" ? value : "";
  };
  const zoneIds = raw["zoneIds"];
  const allZones = raw["allZones"];
  return {
    username: text("username"),
    email: text("email"),
    fullName: raw["fullName"] === null ? null : text("fullName"),
    password: text("password"),
    role: text("role"),
    allZones: typeof allZones === "boolean" ? allZones : undefined,
    zoneIds:
      zoneIds === undefined ? undefined : Array.isArray(zoneIds) ? zoneIds.map((id) => (typeof id === "string" ? id : "")) : [""],
  };
}

type Checked =
  | { readonly ok: true; readonly value: UserAccountValues }
  | { readonly ok: false; readonly status: number; readonly body: object };

/** Field rules, then zone existence, then uniqueness - the order section 5.1 lists. */
async function check(db: Database, body: unknown, mode: UserAccountMode, exceptUserId?: string): Promise<Checked> {
  const input = readInput(body);
  const { value, errors } = validateUserAccount(input, mode);
  if (asRecord(body)["allZones"] !== undefined && input.allZones === undefined) {
    errors.allZones = "Choose zone access";
  }
  if (value === undefined || Object.keys(errors).length > 0) {
    return { ok: false, status: 400, body: { error: "User details are not valid", errors } };
  }
  if (value.zoneIds !== undefined && !(await allZonesActive(db, value.zoneIds))) {
    return { ok: false, status: 400, body: { error: "User details are not valid", errors: { zoneIds: "Choose active zones from the list" } } };
  }
  const taken = await takenIdentifiers(db, { username: value.username, email: value.email }, exceptUserId);
  if (taken.username || taken.email) {
    return {
      ok: false,
      status: 409,
      body: {
        error: "That username or email is already in use",
        errors: {
          ...(taken.username ? { username: "This username is already in use" } : {}),
          ...(taken.email ? { email: "This email is already in use" } : {}),
        },
      },
    };
  }
  return { ok: true, value };
}

const REFUSALS: Record<WriteRefusal, { readonly status: number; readonly body: object }> = {
  "not-found": { status: 404, body: NOT_FOUND },
  "not-super-admin": { status: 403, body: { error: "Forbidden" } },
  "own-access": { status: 409, body: { error: "You cannot remove your own super admin access" } },
  "last-super-admin": { status: 409, body: { error: "At least one super admin must remain" } },
  "no-zones": { status: 400, body: { error: "User details are not valid", errors: { zoneIds: "Choose at least one zone" } } },
  "zones-with-all": {
    status: 400,
    body: { error: "User details are not valid", errors: { zoneIds: "All zones cannot be combined with specific zones" } },
  },
};

/** A race between the clash check and the write still answers 409, not 500. */
function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } }).cause;
  return (error as { code?: string }).code === UNIQUE_VIOLATION || cause?.code === UNIQUE_VIOLATION;
}

const CLASH = { error: "That username or email is already in use" };

export function createAdminUsersRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const guards = [requireSession(pool), requireRole("ADMIN"), requireSuperAdmin];

  /** GET /api/admin/users — section 5.2. */
  router.get("/admin/users", ...guards, async (_request: Request, response: Response) => {
    response.json(await listManagedUsers(db));
  });

  /** POST /api/admin/users — section 5.3. */
  router.post("/admin/users", ...guards, async (request: Request, response: Response) => {
    const checked = await check(db, request.body, "create");
    if (!checked.ok) {
      response.status(checked.status).json(checked.body);
      return;
    }
    const value = checked.value;
    if (value.username === undefined || value.email === undefined || value.password === undefined || value.role === undefined) {
      throw new Error("validateUserAccount returned an incomplete create");
    }
    try {
      const userId = await createManagedUser(db, {
        username: value.username,
        email: value.email,
        fullName: value.fullName ?? null,
        passwordHash: await hashPassword(value.password),
        role: value.role,
        allZones: value.allZones ?? false,
        zoneIds: value.zoneIds ?? [],
      });
      response.status(201).json(await findManagedUser(db, userId));
    } catch (error) {
      if (isUniqueViolation(error)) {
        response.status(409).json(CLASH);
        return;
      }
      throw error;
    }
  });

  /** PATCH /api/admin/users/:userId — section 5.4. */
  router.patch("/admin/users/:userId", ...guards, async (request: Request, response: Response) => {
    const userId = String(request.params["userId"] ?? "");
    if (!isUuid(userId)) {
      response.status(404).json(NOT_FOUND);
      return;
    }
    const checked = await check(db, request.body, "edit", userId);
    if (!checked.ok) {
      response.status(checked.status).json(checked.body);
      return;
    }
    const { password, ...rest } = checked.value;
    try {
      const result = await updateManagedUser(db, requireAuth(request).userId, userId, {
        ...rest,
        ...(password === undefined ? {} : { passwordHash: await hashPassword(password) }),
      });
      if (!result.ok) {
        response.status(REFUSALS[result.reason].status).json(REFUSALS[result.reason].body);
        return;
      }
      response.json(await findManagedUser(db, userId));
    } catch (error) {
      if (isUniqueViolation(error)) {
        response.status(409).json(CLASH);
        return;
      }
      throw error;
    }
  });

  /** DELETE /api/admin/users/:userId — section 5.5, a soft delete (D132). */
  router.delete("/admin/users/:userId", ...guards, async (request: Request, response: Response) => {
    const userId = String(request.params["userId"] ?? "");
    if (!isUuid(userId)) {
      response.status(404).json(NOT_FOUND);
      return;
    }
    const result = await deleteManagedUser(db, requireAuth(request).userId, userId);
    if (!result.ok) {
      response.status(REFUSALS[result.reason].status).json(REFUSALS[result.reason].body);
      return;
    }
    response.status(204).end();
  });

  return router;
}
