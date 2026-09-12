/**
 * Purpose: Allocates the per-zone-per-year sequence number that ends the generated
 * company code, and formats the code (SPEC-01 section 6.3). The allocation is a
 * single INSERT ... ON CONFLICT DO UPDATE, which both creates the counter row for
 * the first company of a zone-year and increments it atomically for every later
 * one, so concurrent saves can never receive the same number. Per D7 the statement
 * runs in its own short transaction before the SPEC-03 save transaction opens, so
 * the counter row is not held while the MOU PDF is written; the cost is that an
 * abandoned save burns its number and the series may contain gaps (open question
 * Q13 - making it gap-free means moving this call inside the save transaction).
 */

import { formatCompanyCode } from "@mou/domain";
import type { Pool } from "pg";

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected the statement to return a row");
  }
  return row;
}

/** Returns the next sequence for the zone-year, creating the counter row if needed. */
export async function allocateCompanyCodeSequence(
  pool: Pool,
  zoneId: string,
  year: number,
): Promise<number> {
  const result = await pool.query<{ last_value: number }>(
    `INSERT INTO company_code_counter (zone_id, year, last_value)
     VALUES ($1, $2, 1)
     ON CONFLICT (zone_id, year)
     DO UPDATE SET last_value = company_code_counter.last_value + 1
     RETURNING last_value`,
    [zoneId, year],
  );
  return firstRow(result.rows).last_value;
}

/** Allocates the sequence and formats the full code, e.g. WEST-26-0042. */
export async function allocateCompanyCode(
  pool: Pool,
  zoneCode: string,
  zoneId: string,
  year: number,
): Promise<string> {
  const sequence = await allocateCompanyCodeSequence(pool, zoneId, year);
  return formatCompanyCode(zoneCode, year, sequence);
}
