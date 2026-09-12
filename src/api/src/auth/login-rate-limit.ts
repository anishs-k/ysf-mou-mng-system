/**
 * Purpose: The login lockout rule of SPEC-02 section 2.1 - after five consecutive
 * failures for one username, further attempts are rejected for fifteen minutes, and
 * the counter resets on success. The state lives in the login_attempt table rather
 * than in memory so it survives a restart and holds across processes. It is keyed by
 * the identifier the user typed, lower-cased, so failures against a username that
 * does not exist are counted too: otherwise the lockout would become a way to
 * discover which usernames are real, and the 429 response would leak the same thing.
 */

import type { Pool } from "pg";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

export interface LockoutState {
  readonly locked: boolean;
  readonly retryAfterSeconds: number;
}

/**
 * Counters are keyed case-insensitively, which is also what the table's
 * `username = lower(username)` CHECK constraint requires.
 */
function normalise(identifier: string): string {
  return identifier.trim().toLowerCase();
}

const LOCKOUT_COLUMNS = `
  locked_until IS NOT NULL AND locked_until > now() AS locked,
  locked_until IS NOT NULL AND locked_until <= now() AS lock_expired,
  COALESCE(GREATEST(0, CEIL(EXTRACT(EPOCH FROM (locked_until - now())))), 0)::int AS retry_after_seconds`;

interface LockoutRow {
  readonly locked: boolean;
  readonly lock_expired: boolean;
  readonly retry_after_seconds: number;
}

export async function checkLockout(pool: Pool, identifier: string): Promise<LockoutState> {
  const { rows } = await pool.query<LockoutRow>(
    `SELECT ${LOCKOUT_COLUMNS} FROM login_attempt WHERE username = $1`,
    [normalise(identifier)],
  );

  const row = rows[0];
  if (row === undefined) {
    return { locked: false, retryAfterSeconds: 0 };
  }
  if (row.locked) {
    return { locked: true, retryAfterSeconds: row.retry_after_seconds };
  }
  if (row.lock_expired) {
    // The window has elapsed, so those failures are no longer consecutive. Clearing
    // them means one more wrong password after a lockout does not immediately lock
    // the account again. A row with no lock at all is deliberately left alone: that
    // is a failure count still in progress.
    await clearFailures(pool, identifier);
  }
  return { locked: false, retryAfterSeconds: 0 };
}

export async function recordFailure(pool: Pool, identifier: string): Promise<LockoutState> {
  const { rows } = await pool.query<LockoutRow>(
    `INSERT INTO login_attempt (username, failed_count, locked_until, last_attempt_at)
     VALUES ($1, 1, NULL, now())
     ON CONFLICT (username) DO UPDATE
        SET failed_count = login_attempt.failed_count + 1,
            locked_until = CASE
              WHEN login_attempt.failed_count + 1 >= $2::int
                THEN now() + make_interval(mins => $3::int)
              ELSE login_attempt.locked_until
            END,
            last_attempt_at = now()
     RETURNING ${LOCKOUT_COLUMNS}`,
    [normalise(identifier), MAX_FAILED_ATTEMPTS, LOCKOUT_MINUTES],
  );

  const row = rows[0];
  if (row === undefined) {
    throw new Error("Recording a failed login returned no row");
  }
  return { locked: row.locked, retryAfterSeconds: row.retry_after_seconds };
}

/** Called on a successful login: SPEC-02 says the counter resets on success. */
export async function clearFailures(pool: Pool, identifier: string): Promise<void> {
  await pool.query(`DELETE FROM login_attempt WHERE username = $1`, [normalise(identifier)]);
}
