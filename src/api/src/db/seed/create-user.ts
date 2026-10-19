/**
 * Purpose: Entry point for `npm run user:create` (SPEC-19 section 7, SPEC-21
 * section 7) - the operator's way to bootstrap the first super admin, since the
 * User Management screen needs one to exist. Creates one login with a role and,
 * optionally, the zones it is restricted to (--zone takes comma-separated codes;
 * omitting it makes an all-zone user). The password comes from NEW_USER_PASSWORD
 * so it never lands in shell history. An existing username is refused.
 *
 *   NEW_USER_PASSWORD=... npm run user:create -- --username pune.west --role VIEWER --zone PUNE,MUMBAI
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
    throw new Error(`Usage: --username <name> --role ${USER_ROLES.join("|")} [--zone <ZONE_CODE,...>] [--email <email>]`);
  }
  const password = requireEnv("NEW_USER_PASSWORD");

  const pool = new Pool({ connectionString: requireEnv("DATABASE_URL") });
  try {
    const zoneCodes = (values.zone ?? "")
      .split(",")
      .map((code) => code.trim().toUpperCase())
      .filter((code) => code !== "");
    const zoneIds: string[] = [];
    for (const zoneCode of new Set(zoneCodes)) {
      const { rows } = await pool.query<{ id: string }>(`SELECT id FROM zone WHERE code = $1`, [zoneCode]);
      if (rows[0] === undefined) {
        throw new Error(`No zone with code ${zoneCode}`);
      }
      zoneIds.push(rows[0].id);
    }

    const existing = await pool.query(`SELECT 1 FROM "user" WHERE lower(username) = $1`, [username]);
    if (existing.rowCount !== 0) {
      throw new Error(`User ${username} already exists`);
    }

    const passwordHash = await hashPassword(password);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO "user" (username, email, password_hash, role, is_active, all_zones)
         VALUES ($1, $2, $3, $4, true, $5) RETURNING id`,
        [username, values.email ?? `${username}@localhost`, passwordHash, role, zoneIds.length === 0],
      );
      await client.query(`INSERT INTO user_zone (user_id, zone_id) SELECT $1, unnest($2::uuid[])`, [rows[0]?.id, zoneIds]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    console.log(`Created ${role} ${username} (${zoneIds.length === 0 ? "all zones" : `zones ${zoneCodes.join(", ")}`}).`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
