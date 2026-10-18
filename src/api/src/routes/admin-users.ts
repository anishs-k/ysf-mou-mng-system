/**
 * Purpose: SPEC-20 section 5 - the super admin's queue of self sign-ups and the
 * approve/reject decision. A super admin is an ADMIN with no zone (SPEC-19 D117).
 * The decision is a single conditional UPDATE on `approval_status = 'PENDING'`,
 * so two admins deciding the same request at once cannot overwrite each other:
 * the second one finds nothing pending and gets a 409.
 */

import { APPROVABLE_ROLES } from "@mou/domain";
import { asc, eq } from "drizzle-orm";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import type { Pool } from "pg";

import { requireAuth, requireRole, requireSession } from "../auth/middleware.ts";
import type { Database } from "../db/client.ts";
import { user, zone } from "../db/schema.ts";
import { isUuid } from "./request-parse.ts";

/** SPEC-20 D126: an ADMIN restricted to a zone is not a super admin. */
function requireSuperAdmin(request: Request, response: Response, next: NextFunction): void {
  if (requireAuth(request).zoneId !== null) {
    response.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

export function createAdminUsersRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const guards = [requireSession(pool), requireRole("ADMIN"), requireSuperAdmin];

  /** GET /api/admin/users/pending — section 5.1, oldest request first. */
  router.get("/admin/users/pending", ...guards, async (_request: Request, response: Response) => {
    const rows = await db
      .select({
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
        zoneId: user.zoneId,
        zoneName: zone.name,
        requestedAt: user.createdAt,
      })
      .from(user)
      .leftJoin(zone, eq(zone.id, user.zoneId))
      .where(eq(user.approvalStatus, "PENDING"))
      .orderBy(asc(user.createdAt));
    response.json(rows);
  });

  /** POST /api/admin/users/:userId/decision — section 5.2. */
  router.post("/admin/users/:userId/decision", ...guards, async (request: Request, response: Response) => {
    const userId = String(request.params["userId"] ?? "");
    if (!isUuid(userId)) {
      response.status(400).json({ error: "userId must be a UUID" });
      return;
    }
    const body = (typeof request.body === "object" && request.body !== null ? request.body : {}) as Record<string, unknown>;
    const decision = body["decision"];
    const role = body["role"];
    if (decision !== "APPROVE" && decision !== "REJECT") {
      response.status(400).json({ error: "decision must be APPROVE or REJECT" });
      return;
    }
    if (decision === "APPROVE" && !(APPROVABLE_ROLES as readonly unknown[]).includes(role)) {
      response.status(400).json({ error: `role must be ${APPROVABLE_ROLES.join(" or ")}` });
      return;
    }

    // REJECT keeps the placeholder role; only APPROVE replaces it.
    const { rows } = await pool.query<{ id: string; approval_status: string; role: string }>(
      `UPDATE "user"
          SET approval_status = $2,
              role = COALESCE($3, role),
              approval_decided_by = $4,
              approval_decided_at = now()
        WHERE id = $1 AND approval_status = 'PENDING'
        RETURNING id, approval_status, role`,
      [userId, decision === "APPROVE" ? "APPROVED" : "REJECTED", decision === "APPROVE" ? role : null, requireAuth(request).userId],
    );
    const decided = rows[0];
    if (decided === undefined) {
      const existing = await db.select({ id: user.id }).from(user).where(eq(user.id, userId));
      if (existing.length === 0) {
        response.status(404).json({ error: "User not found" });
      } else {
        response.status(409).json({ error: "This request has already been decided" });
      }
      return;
    }
    response.json({ userId: decided.id, approvalStatus: decided.approval_status, role: decided.role });
  });

  return router;
}
