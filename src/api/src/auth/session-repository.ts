/**
 * Purpose: The server-side session store for SPEC-02 section 2.1. A row IS the
 * session, so logging out deletes it and the 30-minute inactivity rule is a sliding
 * expiry - both are real server-side invalidations rather than a cookie the client
 * could simply forget. resolveSession validates and slides in one statement, and
 * refuses a session whose user has since been deactivated or is no longer
 * APPROVED (SPEC-20). The user's role and
 * zone (SPEC-19) are read on every request, so changing either takes effect at once. Raw SQL is used because
 * the interval arithmetic and the conditional UPDATE are clearer as SQL than as a
 * query-builder chain, matching the precedent set by company-code-repository.ts.
 */

import { USER_ROLES } from "@mou/domain";
import type { UserRole } from "@mou/domain";
import type { Pool } from "pg";

/** SPEC-02 section 2.1: a session expires after 30 minutes of inactivity. */
export const SESSION_IDLE_MINUTES = 30;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuthenticatedUser {
  readonly userId: string;
  readonly username: string;
  readonly role: UserRole;
  /** SPEC-19: the zone this user is restricted to; null means every zone. */
  readonly zoneId: string | null;
}

export interface CreatedSession {
  readonly id: string;
  readonly expiresAt: Date;
}

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

export async function createSession(pool: Pool, userId: string): Promise<CreatedSession> {
  const { rows } = await pool.query<{ id: string; expires_at: Date }>(
    `INSERT INTO session (user_id, expires_at)
     VALUES ($1, now() + make_interval(mins => $2::int))
     RETURNING id, expires_at`,
    [userId, SESSION_IDLE_MINUTES],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Creating a session returned no row");
  }
  return { id: row.id, expiresAt: row.expires_at };
}

/**
 * Returns the session's user and slides the expiry forward. Returns null when the
 * session is unknown, expired, or belongs to a user who is no longer active - in
 * every case the caller must treat the request as unauthenticated.
 */
export async function resolveSession(pool: Pool, sessionId: string): Promise<AuthenticatedUser | null> {
  if (!UUID_PATTERN.test(sessionId)) {
    return null;
  }
  const { rows } = await pool.query<{ user_id: string; username: string; role: string; zone_id: string | null }>(
    `WITH touched AS (
       UPDATE session
          SET last_seen_at = now(),
              expires_at = now() + make_interval(mins => $2::int)
        WHERE id = $1
          AND expires_at > now()
          AND EXISTS (
            SELECT 1 FROM "user" u
             WHERE u.id = session.user_id AND u.is_active AND u.approval_status = 'APPROVED'
          )
        RETURNING user_id
     )
     SELECT u.id AS user_id, u.username, u.role, u.zone_id
       FROM touched
       JOIN "user" u ON u.id = touched.user_id`,
    [sessionId, SESSION_IDLE_MINUTES],
  );

  const row = rows[0];
  if (row === undefined || !isUserRole(row.role)) {
    return null;
  }
  return { userId: row.user_id, username: row.username, role: row.role, zoneId: row.zone_id };
}

export async function deleteSession(pool: Pool, sessionId: string): Promise<void> {
  if (!UUID_PATTERN.test(sessionId)) {
    return;
  }
  await pool.query(`DELETE FROM session WHERE id = $1`, [sessionId]);
}

/** Keeps the table bounded; called on the login path, which is rare and indexed. */
export async function deleteExpiredSessions(pool: Pool): Promise<number> {
  const result = await pool.query(`DELETE FROM session WHERE expires_at <= now()`);
  return result.rowCount ?? 0;
}
