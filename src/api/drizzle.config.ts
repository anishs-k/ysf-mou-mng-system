/**
 * Purpose: Configuration for drizzle-kit, which generates the SQL migrations in
 * ./drizzle from the TypeScript schema in ./src/db/schema.ts. `casing: snake_case`
 * is what lets the schema use camelCase property names while the database keeps
 * snake_case columns (SPEC-01 section 7), so the mapping happens in exactly one
 * place. The connection string is only needed by the push/studio commands - the
 * generate command works offline.
 */

import { defineConfig } from "drizzle-kit";

const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5434/mou_mng_system";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  casing: "snake_case",
  strict: true,
  verbose: true,
  dbCredentials: {
    url: process.env["DATABASE_URL"] ?? DEFAULT_DATABASE_URL,
  },
});
