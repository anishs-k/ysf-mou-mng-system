/**
 * Purpose: The role rules of the signed-in shell. SPEC-33: every rule reads the
 * permissions the API sent with the session (role_permission, edited by a super
 * admin), so the UI follows the same matrix the API enforces. canOpenPath maps the
 * guarded screens to their permission for the sidebar, the Dashboard quick actions
 * and AppShell's route guard; a path not listed is open to every role. User
 * Management and Roles & Permissions are for a super admin (an ADMIN with all zones).
 */

import type { Permission } from "@mou/domain";

import type { AuthUser } from "../api/client.ts";

export const USER_MANAGEMENT_PATH = "/admin/users";
/** SPEC-33: the Roles & Permissions screen, listed under User Management. */
export const ROLE_PERMISSIONS_PATH = "/admin/permissions";

const SUPER_ADMIN_PATHS: readonly string[] = [USER_MANAGEMENT_PATH, ROLE_PERMISSIONS_PATH];

/** The screens a permission guards (SPEC-32 matrix, SPEC-33 stored). */
const PATH_PERMISSIONS: Readonly<Record<string, Permission>> = {
  "/companies/new": "company.create",
  "/agreements/edit": "agreement.edit",
  "/upload-mou": "documents.upload",
  "/export": "export.data",
  "/export/excel": "export.data",
  "/export/pdf": "export.data",
};

export function isSuperAdmin(user: Pick<AuthUser, "role" | "allZones">): boolean {
  return user.role === "ADMIN" && user.allZones;
}

/** SPEC-32 / SPEC-33: whether the signed-in user holds `permission`; false while signed out. */
export function can(user: Pick<AuthUser, "permissions"> | null, permission: Permission): boolean {
  return user !== null && user.permissions.includes(permission);
}

/** Whether `user` may open the screen at `path` (the sidebar / route path). */
export function canOpenPath(user: Pick<AuthUser, "role" | "allZones" | "permissions">, path: string): boolean {
  if (SUPER_ADMIN_PATHS.includes(path)) return isSuperAdmin(user);
  const permission = PATH_PERMISSIONS[path];
  return permission === undefined || can(user, permission);
}
