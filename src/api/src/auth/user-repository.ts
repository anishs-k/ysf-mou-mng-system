/**
 * Purpose: The single read the login flow needs from the user table (SPEC-02
 * section 2). A user signs in with either their username or their email, matched
 * case-insensitively, and only an active row is ever returned - an inactive user
 * must fail login in exactly the same way as an unknown one. The role column is a
 * varchar guarded by a CHECK constraint, so it is narrowed to the domain union here
 * rather than cast, which keeps the rest of the auth code type-safe.
 */

import { APPROVAL_STATUSES, USER_ROLES } from "@mou/domain";
import type { ApprovalStatus, UserRole } from "@mou/domain";
import { and, eq, or, sql } from "drizzle-orm";

import type { Database } from "../db/client.ts";
import { user } from "../db/schema.ts";

export interface LoginCandidate {
  readonly id: string;
  readonly username: string;
  readonly role: UserRole;
  readonly zoneId: string | null;
  /** SPEC-20: only APPROVED may be given a session; login checks it after the password. */
  readonly approvalStatus: ApprovalStatus;
  readonly passwordHash: string;
}

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

function isApprovalStatus(value: string): value is ApprovalStatus {
  return (APPROVAL_STATUSES as readonly string[]).includes(value);
}

export async function findActiveUserForLogin(
  db: Database,
  identifier: string,
): Promise<LoginCandidate | null> {
  const rows = await db
    .select({
      id: user.id,
      username: user.username,
      role: user.role,
      zoneId: user.zoneId,
      approvalStatus: user.approvalStatus,
      passwordHash: user.passwordHash,
    })
    .from(user)
    .where(
      and(
        eq(user.isActive, true),
        or(sql`lower(${user.username}) = ${identifier}`, sql`lower(${user.email}) = ${identifier}`),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (row === undefined || !isUserRole(row.role) || !isApprovalStatus(row.approvalStatus)) {
    return null;
  }
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    zoneId: row.zoneId,
    approvalStatus: row.approvalStatus,
    passwordHash: row.passwordHash,
  };
}
