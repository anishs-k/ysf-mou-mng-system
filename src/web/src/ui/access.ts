/**
 * Purpose: The role rules of the Figma-clone shell, read from the SPEC-02 section
 * 3.3 matrix already declared in dashboard/entry-points.ts rather than restated.
 * The sidebar, the Dashboard quick actions and AppShell's route guard all ask
 * canOpenPath(); a path the matrix does not list is open to every role. The
 * SPEC-20 approval screen is the one rule that also depends on the zone: only a
 * super admin (an ADMIN with no zone, SPEC-19 D117) may open it.
 */

import type { UserRole } from "@mou/domain";

import type { AuthUser } from "../api/client.ts";
import { DASHBOARD_ENTRY_POINTS } from "../dashboard/entry-points.ts";

export const APPROVALS_PATH = "/admin/approvals";

export function isSuperAdmin(user: Pick<AuthUser, "role" | "zoneId">): boolean {
  return user.role === "ADMIN" && user.zoneId === null;
}

/** Whether `user` may open the screen at `path` (the sidebar / route path). */
export function canOpenPath(user: Pick<AuthUser, "role" | "zoneId">, path: string): boolean {
  if (path === APPROVALS_PATH) return isSuperAdmin(user);
  const entry = DASHBOARD_ENTRY_POINTS.find((candidate) => candidate.path === path);
  return entry === undefined || entry.roles.includes(user.role);
}

/** ADMIN and DATA_ENTRY may change records, e.g. acknowledge an alert or upload a document. */
export function canAuthor(role: UserRole): boolean {
  return role === "ADMIN" || role === "DATA_ENTRY";
}
