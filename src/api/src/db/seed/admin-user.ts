/**
 * Purpose: Seeds the single ADMIN row that SPEC-01 section 11.2 requires, now
 * hashing the password with SPEC-02's scrypt implementation so nothing plaintext is
 * ever stored. The seed is idempotent, and it also repairs the row SPEC-01 seeded
 * before hashing existed: if the stored value is not a well-formed hash of ours it
 * is replaced with a hash of ADMIN_PASSWORD. That is why it reports which of the
 * three things it did rather than a bare boolean.
 */

import type { Pool } from "pg";

import { hashPassword, isPasswordHash } from "../../auth/password.ts";

export type AdminSeedOutcome = "created" | "password-upgraded" | "unchanged";

export interface AdminSeedInput {
  readonly username: string;
  readonly email: string;
  readonly password: string;
}

export async function seedAdminUser(pool: Pool, input: AdminSeedInput): Promise<AdminSeedOutcome> {
  const existing = await pool.query<{ password_hash: string }>(
    `SELECT password_hash FROM "user" WHERE username = $1`,
    [input.username],
  );
  const row = existing.rows[0];

  if (row !== undefined && isPasswordHash(row.password_hash)) {
    return "unchanged";
  }

  const passwordHash = await hashPassword(input.password);

  if (row === undefined) {
    await pool.query(
      // SPEC-21: the seeded ADMIN is the first super admin, so it sees every zone.
      `INSERT INTO "user" (username, email, password_hash, role, is_active, all_zones)
       VALUES ($1, $2, $3, 'ADMIN', true, true)`,
      [input.username, input.email, passwordHash],
    );
    return "created";
  }

  await pool.query(`UPDATE "user" SET password_hash = $2 WHERE username = $1`, [
    input.username,
    passwordHash,
  ]);
  return "password-upgraded";
}
