/**
 * Purpose: SPEC-33's store for the editable permission matrix. Loads the four
 * non-admin roles' grants from role_permission, and saves a super admin's edit in
 * one transaction: each role's grants are normalised (a change brings its view,
 * "users.manage" is never granted), replaced, and an audit row records who added
 * or removed what. ADMIN is not stored; it always holds every permission.
 */

import { normalizeGrant, PERMISSIONS } from "@mou/domain";
import type { EditableRole, Permission } from "@mou/domain";
import { eq } from "drizzle-orm";

import type { Database } from "./client.ts";
import { rolePermission, rolePermissionAudit } from "./schema.ts";

export type RolePermissionMatrix = Readonly<Record<EditableRole, readonly Permission[]>>;

export interface RoleGrant {
  readonly role: EditableRole;
  readonly permissions: readonly string[];
}

/** What a save adds and removes, each in PERMISSIONS order. Pure, so the audit content is unit-tested. */
export function permissionChanges(
  before: readonly string[],
  after: readonly string[],
): { added: Permission[]; removed: Permission[] } {
  return {
    added: PERMISSIONS.filter((permission) => after.includes(permission) && !before.includes(permission)),
    removed: PERMISSIONS.filter((permission) => before.includes(permission) && !after.includes(permission)),
  };
}

export async function loadRolePermissions(db: Database): Promise<RolePermissionMatrix> {
  const rows = await db.select().from(rolePermission);
  const grantsOf = (role: EditableRole): Permission[] =>
    normalizeGrant(rows.filter((row) => row.role === role).map((row) => row.permission));
  return {
    DATA_ENTRY: grantsOf("DATA_ENTRY"),
    HR: grantsOf("HR"),
    FINANCE: grantsOf("FINANCE"),
    VIEWER: grantsOf("VIEWER"),
  };
}

/** Replaces the grants of each role given; an unchanged role writes nothing. Returns the saved matrix. */
export async function saveRolePermissions(
  db: Database,
  grants: readonly RoleGrant[],
  changedBy: string,
): Promise<RolePermissionMatrix> {
  await db.transaction(async (tx) => {
    for (const grant of grants) {
      const current = (await tx.select().from(rolePermission).where(eq(rolePermission.role, grant.role))).map(
        (row) => row.permission,
      );
      const next = normalizeGrant(grant.permissions);
      const { added, removed } = permissionChanges(current, next);
      if (added.length === 0 && removed.length === 0) continue;

      await tx.delete(rolePermission).where(eq(rolePermission.role, grant.role));
      if (next.length > 0) {
        await tx.insert(rolePermission).values(next.map((permission) => ({ role: grant.role, permission })));
      }
      await tx.insert(rolePermissionAudit).values({ role: grant.role, added, removed, changedBy });
    }
  });
  return loadRolePermissions(db);
}
