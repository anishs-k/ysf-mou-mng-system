/**
 * Purpose: SPEC-33's Roles & Permissions API for the super admin. GET returns the
 * editable matrix (the four non-admin roles) plus ADMIN's locked full set; PUT
 * saves one or more roles at once through db/role-permissions.ts, which normalises
 * the grants and writes the audit rows. A change applies to every signed-in user
 * on their next request, since sessions read role_permission each time.
 */

import { isEditableRole, PERMISSIONS } from "@mou/domain";
import { Router } from "express";
import type { Request, Response } from "express";
import type { Pool } from "pg";

import { requireAuth, requirePermission, requireSession, requireSuperAdmin } from "../auth/middleware.ts";
import type { Database } from "../db/client.ts";
import { loadRolePermissions, saveRolePermissions } from "../db/role-permissions.ts";
import type { RoleGrant, RolePermissionMatrix } from "../db/role-permissions.ts";
import { asArray, asRecord } from "./request-parse.ts";

function describe(matrix: RolePermissionMatrix) {
  return {
    locked: { role: "ADMIN", permissions: PERMISSIONS },
    roles: Object.entries(matrix).map(([role, permissions]) => ({ role, permissions })),
  };
}

/** `{ roles: [{ role, permissions: string[] }] }`; null when the shape is wrong or a role is not editable. */
export function readGrants(body: unknown): RoleGrant[] | null {
  const rows = asRecord(body)["roles"];
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const grants: RoleGrant[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    const role = record["role"];
    const permissions = record["permissions"];
    if (typeof role !== "string" || !isEditableRole(role) || !Array.isArray(permissions)) return null;
    if (!permissions.every((value) => typeof value === "string")) return null;
    if (grants.some((grant) => grant.role === role)) return null;
    grants.push({ role, permissions: asArray(permissions).map(String) });
  }
  return grants;
}

export function createAdminPermissionsRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const guards = [requireSession(pool), requirePermission("users.manage"), requireSuperAdmin];

  router.get("/admin/permissions", ...guards, async (_request: Request, response: Response) => {
    response.json(describe(await loadRolePermissions(db)));
  });

  router.put("/admin/permissions", ...guards, async (request: Request, response: Response) => {
    const grants = readGrants(request.body);
    if (grants === null) {
      response.status(400).json({ error: "Send roles as [{ role, permissions }] for Data Entry, HR, Finance or Viewer" });
      return;
    }
    const saved = await saveRolePermissions(db, grants, requireAuth(request).userId);
    response.json(describe(saved));
  });

  return router;
}
