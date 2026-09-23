/**
 * Purpose: Entry point for `npm run db:seed`. Applies the data seeds of SPEC-01
 * section 11 - the provisional zones and the single ADMIN user - separately from
 * the schema migrations, so the real zone list can be swapped in without touching
 * the schema. Both seeds are idempotent, so running this repeatedly is safe.
 */

import { Pool } from "pg";

import { seedAdminUser } from "./admin-user.ts";
import { seedZones } from "./zones.ts";

const DATABASE_URL = requireEnv("DATABASE_URL");
const ADMIN_USERNAME = requireEnv("ADMIN_USERNAME", "admin");
const ADMIN_EMAIL = requireEnv("ADMIN_EMAIL", "admin@localhost");
const ADMIN_PASSWORD = requireEnv("ADMIN_PASSWORD");

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(
      `${name} must be set - see environment.sh and .env.example`,
    );
  }
  return value;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const zonesInserted = await seedZones(pool);
    const adminOutcome = await seedAdminUser(pool, {
      username: ADMIN_USERNAME,
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    console.log(
      `Zones inserted: ${zonesInserted}. Admin user: ${adminOutcome}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
