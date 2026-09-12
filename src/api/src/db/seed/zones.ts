/**
 * Purpose: Seeds the provisional zone master rows from SPEC-01 section 11.1. Zone
 * rows are reference data applied as a data seed rather than a schema migration, so
 * the real zone list (open question Q14) can replace it without touching the
 * schema. The seed is idempotent: re-running it inserts nothing.
 *
 * The five codes below are placeholders. zone.code is embedded in every generated
 * company code, so replacing this list after companies exist would make historical
 * codes inconsistent with the master data - it must be replaced before go-live.
 */

import type { Pool } from "pg";

export const PROVISIONAL_ZONES = [
  { code: "NORTH", name: "North" },
  { code: "SOUTH", name: "South" },
  { code: "EAST", name: "East" },
  { code: "WEST", name: "West" },
  { code: "CENTRAL", name: "Central" },
] as const;

/** Returns the number of rows actually inserted, so re-seeding reports 0. */
export async function seedZones(pool: Pool): Promise<number> {
  let inserted = 0;
  for (const zone of PROVISIONAL_ZONES) {
    const result = await pool.query(
      `INSERT INTO zone (code, name)
       VALUES ($1, $2)
       ON CONFLICT (code) DO NOTHING`,
      [zone.code, zone.name],
    );
    inserted += result.rowCount ?? 0;
  }
  return inserted;
}
