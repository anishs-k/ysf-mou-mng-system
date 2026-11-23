/**
 * Purpose: The role rules of the Figma-clone shell, read from the SPEC-02 section
 * 3.3 matrix already declared in dashboard/entry-points.ts rather than restated.
 * The sidebar, the Dashboard quick actions and AppShell's route guard all ask
 * canOpenPath(); a path the matrix does not list is open to every role. The
 * SPEC-21 User Management screen is the one rule that also depends on zone
 * scope: only a super admin (an ADMIN with all zones) may open it.
 */

import { canAuthorRecords, canEditAgreement as canEditAgreementRole } from "@mou/domain";
import type { UserRole } from "@mou/domain";

import type { AuthUser } from "../api/client.ts";
import { DASHBOARD_ENTRY_POINTS } from "../dashboard/entry-points.ts";

export const USER_MANAGEMENT_PATH = "/admin/users";

export function isSuperAdmin(user: Pick<AuthUser, "role" | "allZones">): boolean {
  return user.role === "ADMIN" && user.allZones;
}

/** Whether `user` may open the screen at `path` (the sidebar / route path). */
export function canOpenPath(user: Pick<AuthUser, "role" | "allZones">, path: string): boolean {
  if (path === USER_MANAGEMENT_PATH) return isSuperAdmin(user);
  const entry = DASHBOARD_ENTRY_POINTS.find((candidate) => candidate.path === path);
  return entry === undefined || entry.roles.includes(user.role);
}

/** Admin, Data Entry, HR and Finance may change records, e.g. acknowledge an alert or upload a document (SPEC-26). */
export function canAuthor(role: UserRole): boolean {
  return canAuthorRecords(role);
}

/** SPEC-26: Admin, HR and Finance may edit an agreement. */
export function canEditAgreement(role: UserRole): boolean {
  return canEditAgreementRole(role);
}
