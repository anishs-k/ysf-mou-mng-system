/**
 * Purpose: Entry point for `npm run user:create` (SPEC-19 section 7). There is no
 * user-management screen, so this creates one login with a role and, optionally,
 * the zone it is restricted to (omitting --zone makes an all-zone user). The
 * password comes from NEW_USER_PASSWORD rather than an argument so it never lands
 * in shell history. It refuses to overwrite an existing username. An operator-made
 * account is trusted, so it is APPROVED at once (SPEC-20 D122).
 *
 *   NEW_USER_PASSWORD=... npm run user:create -- --username pune.viewer --role VIEWER --zone PUNE
 */

import { parseArgs } from "node:util";

import { USER_ROLES } from "@mou/domain";
import { Pool } from "pg";

import { hashPassword } from "../../auth/password.ts";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} must be set - see environment.sh and .env.example`);
  }
  return value;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      username: { type: "string" },
      email: { type: "string" },
      role: { type: "string" },
      zone: { type: "string" },
    },
  });
  const username = values.username?.trim().toLowerCase() ?? "";
  const role = values.role?.trim().toUpperCase() ?? "";
  if (username === "" || !(USER_ROLES as readonly string[]).includes(role)) {
    throw new Error(`Usage: --username <name> --role ${USER_ROLES.join("|")} [--zone <ZONE_CODE>] [--email <email>]`);
  }
  const password = requireEnv("NEW_USER_PASSWORD");

  const pool = new Pool({ connectionString: requireEnv("DATABASE_URL") });
  try {
    let zoneId: string | null = null;
    if (values.zone !== undefined) {
      const zoneCode = values.zone.trim().toUpperCase();
      const { rows } = await pool.query<{ id: string }>(`SELECT id FROM zone WHERE code = $1`, [zoneCode]);
      if (rows[0] === undefined) {
        throw new Error(`No zone with code ${zoneCode}`);
      }
      zoneId = rows[0].id;
    }

    const existing = await pool.query(`SELECT 1 FROM "user" WHERE lower(username) = $1`, [username]);
    if (existing.rowCount !== 0) {
      throw new Error(`User ${username} already exists`);
    }

    await pool.query(
      `INSERT INTO "user" (username, email, password_hash, role, zone_id, is_active, approval_status)
       VALUES ($1, $2, $3, $4, $5, true, 'APPROVED')`,
      [username, values.email ?? `${username}@localhost`, await hashPassword(password), role, zoneId],
    );
    console.log(`Created ${role} ${username} (${zoneId === null ? "all zones" : `zone ${values.zone}`}).`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
