/**
 * Purpose: Creates the PostgreSQL connection pool and the Drizzle handle used by
 * every query in @mou/api. Centralising it here keeps two cross-cutting rules in
 * one place: `casing: snake_case` so camelCase properties map to snake_case
 * columns, and a single pool per process. Money columns are left alone on purpose -
 * node-postgres returns NUMERIC as a string, which is exactly what D10 wants.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.ts";

export type Database = NodePgDatabase<typeof schema>;

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}

export function createDatabase(pool: Pool): Database {
  return drizzle(pool, { schema, casing: "snake_case" });
}
