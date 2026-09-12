/**
 * Purpose: Applies the generated Drizzle migrations in ./drizzle to the database
 * named by DATABASE_URL, and exports the same runner for the integration-test
 * harness so tests and production share one migration path. Running migrations
 * only through here means the schema and the recorded migration history can never
 * disagree. Importing this module has no side effects; the CLI body runs only when
 * the file is executed directly.
 */

import { fileURLToPath } from "node:url";
import path from "node:path";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/** Resolved from this module, so it works from src/ and from dist/ alike. */
export const MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

export async function runMigrations(connectionString: string): Promise<void> {
  const pool = new Pool({ connectionString });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await pool.end();
  }
}

function readDatabaseUrl(): string {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL must be set - see environment.sh and .env.example");
  }
  return connectionString;
}

async function main(): Promise<void> {
  await runMigrations(readDatabaseUrl());
  console.log("Migrations applied.");
}

const invokedPath = process.argv[1];
const isDirectRun =
  invokedPath !== undefined && path.resolve(invokedPath) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
