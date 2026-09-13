/**
 * Purpose: Seeds the zone master rows from SPEC-16 section 2.1, which replaced the
 * five provisional placeholder zones of SPEC-01 section 11.1 under decision D102.
 * Zone rows are reference data applied as a data seed rather than a schema
 * migration, so the list can be replaced without touching the schema. The seed is
 * idempotent: re-running it inserts nothing.
 *
 * The codes are derived deterministically from the zone names - uppercase, unique,
 * and at most 10 characters to satisfy the varchar(10) column and its
 * `code = upper(code)` CHECK. They are no longer embedded in generated company
 * codes (D109 moved the code onto the MOU and made it scheme-based), so replacing a
 * zone code after go-live no longer orphans historical company codes. That removes
 * the high-impact risk SPEC-01 attached to open question Q14.
 *
 * Q14's content is now closed, but its authority is not: the client should still
 * confirm this list before go-live.
 */

import type { Pool } from "pg";

export const ZONE_SEED = [
  { code: "AHILYANGR", name: "Ahilya Nagar" },
  { code: "ASSAM", name: "Assam" },
  { code: "CHENNAI", name: "Chennai" },
  { code: "CHIPLUN", name: "Chiplun" },
  { code: "COIMBATORE", name: "Coimbatore" },
  { code: "DAMAN", name: "Daman" },
  { code: "GOA", name: "Goa" },
  { code: "GJSANAND", name: "Gujarat Sanand" },
  { code: "GJVADODARA", name: "Gujarat Vadodara" },
  { code: "HARIDWAR", name: "Haridwar" },
  { code: "JAMSHEDPUR", name: "Jamshedpur" },
  { code: "KARNATAKA", name: "Karnataka" },
  { code: "KOLHAPUR", name: "Kolhapur" },
  { code: "MP", name: "Madhya Pradesh" },
  { code: "MUMBAI", name: "Mumbai" },
  { code: "NASHIK", name: "Nashik" },
  { code: "NCRHARYANA", name: "NCR Haryana" },
  { code: "NCRNOIDA", name: "NCR Noida" },
  { code: "PUNE", name: "Pune" },
  { code: "RAJASTHAN", name: "Rajasthan" },
  { code: "RANJANGAON", name: "Ranjangaon" },
  { code: "RUDRAPUR", name: "Rudrapur" },
  { code: "SIKKIM", name: "Sikkim" },
  { code: "SOLAPUR", name: "Solapur" },
] as const;

/** Returns the number of rows actually inserted, so re-seeding reports 0. */
export async function seedZones(pool: Pool): Promise<number> {
  let inserted = 0;
  for (const zone of ZONE_SEED) {
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
