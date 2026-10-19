/**
 * Purpose: SPEC-12's two read-only aggregations - the zone summary table and
 * the zone x scheme matrix, both computed by conditional-aggregate SQL
 * (section 3: "not by loading rows and counting in application code"), and
 * the drill-down list. `mou_active_end_date_idx (is_active, end_date)` and
 * `mou_company_idx (company_id)` already exist from SPEC-01, so section 3's
 * performance requirement needed no new migration. Section 1's "is_current"
 * wording is SPEC-01's pre-D4 vocabulary for what this schema calls
 * `mou.is_active` (D4/D8's known gap, tracked in implementation_plan.md).
 * Every query takes a SPEC-19 ZoneScope; the default `null` covers every zone.
 */

import { SCHEMES } from "@mou/domain";
import type { MouStatus, Scheme } from "@mou/domain";
import { deriveStatus } from "@mou/domain";
import { and, eq, inArray } from "drizzle-orm";
import type { Pool } from "pg";

import type { ZoneScope } from "../auth/zone-scope.ts";
import type { Database } from "./client.ts";
import { company, companyPlant, mou } from "./schema.ts";

export interface ZoneDashboardFilters {
  readonly scheme?: string;
  readonly status?: string;
}

export interface ZoneSummaryRow {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly companies: number;
  readonly plants: number;
  readonly mous: number;
  readonly active: number;
  readonly expired: number;
  readonly new: number;
  readonly expiringSoon: number;
}

/** Section 2.1: one row per active zone, aggregated with FILTER clauses so a single query does the work. */
export async function fetchZoneSummary(
  pool: Pool,
  filters: ZoneDashboardFilters,
  scope: ZoneScope = null,
): Promise<ZoneSummaryRow[]> {
  const scheme = filters.scheme ?? null;
  const status = filters.status ?? null;
  const { rows } = await pool.query<{
    zone_id: string;
    zone_name: string;
    companies: string;
    plants: string;
    mous: string;
    active: string;
    expired: string;
    new: string;
    expiring_soon: string;
  }>(
    `WITH t AS (SELECT business_today() AS d),
          scoped_mou AS (
            SELECT m.id, m.company_id,
              CASE
                WHEN t.d < m.mou_start_date THEN 'NEW'
                WHEN t.d <= m.end_date THEN 'ACTIVE'
                ELSE 'EXPIRED'
              END AS status,
              (m.end_date - t.d) AS days_remaining
            FROM mou m, t
            WHERE m.is_active
              AND ($1::text IS NULL OR m.scheme = $1)
          )
     SELECT
       z.id AS zone_id,
       z.name AS zone_name,
       COUNT(DISTINCT c.id) AS companies,
       COUNT(DISTINCT cp.id) AS plants,
       COUNT(DISTINCT sm.id) FILTER (WHERE $2::text IS NULL OR sm.status = $2) AS mous,
       COUNT(DISTINCT sm.id) FILTER (WHERE sm.status = 'ACTIVE' AND ($2::text IS NULL OR sm.status = $2)) AS active,
       COUNT(DISTINCT sm.id) FILTER (WHERE sm.status = 'EXPIRED' AND ($2::text IS NULL OR sm.status = $2)) AS expired,
       COUNT(DISTINCT sm.id) FILTER (WHERE sm.status = 'NEW' AND ($2::text IS NULL OR sm.status = $2)) AS new,
       COUNT(DISTINCT sm.id) FILTER (WHERE sm.days_remaining BETWEEN 0 AND 90 AND ($2::text IS NULL OR sm.status = $2)) AS expiring_soon
     FROM zone z
     LEFT JOIN company c ON c.zone_id = z.id AND c.is_active
     LEFT JOIN company_plant cp ON cp.company_id = c.id AND cp.is_active
     LEFT JOIN scoped_mou sm ON sm.company_id = c.id
     WHERE z.is_active
       AND ($3::uuid[] IS NULL OR z.id = ANY($3::uuid[]))
     GROUP BY z.id, z.name
     ORDER BY z.name`,
    [scheme, status, scope],
  );

  return rows.map((row) => ({
    zoneId: row.zone_id,
    zoneName: row.zone_name,
    companies: Number(row.companies),
    plants: Number(row.plants),
    mous: Number(row.mous),
    active: Number(row.active),
    expired: Number(row.expired),
    new: Number(row.new),
    expiringSoon: Number(row.expiring_soon),
  }));
}

export interface SchemeMatrixRow {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly rowTotal: number;
}

export interface SchemeMatrix {
  readonly schemes: readonly string[];
  readonly rows: readonly SchemeMatrixRow[];
  readonly columnTotals: Readonly<Record<string, number>>;
  readonly grandTotal: number;
}

/** Section 2.2: zone x scheme counts of current MOUs, with row/column totals. */
export async function fetchSchemeMatrix(
  pool: Pool,
  filters: ZoneDashboardFilters,
  scope: ZoneScope = null,
): Promise<SchemeMatrix> {
  const scheme = filters.scheme ?? null;
  const status = filters.status ?? null;
  const { rows } = await pool.query<{ zone_id: string; zone_name: string; scheme: string; count: string }>(
    `WITH t AS (SELECT business_today() AS d),
          scoped_mou AS (
            SELECT m.id, m.company_id, m.scheme,
              CASE
                WHEN t.d < m.mou_start_date THEN 'NEW'
                WHEN t.d <= m.end_date THEN 'ACTIVE'
                ELSE 'EXPIRED'
              END AS status
            FROM mou m, t
            WHERE m.is_active
              AND ($1::text IS NULL OR m.scheme = $1)
              AND ($2::text IS NULL OR (
                CASE
                  WHEN t.d < m.mou_start_date THEN 'NEW'
                  WHEN t.d <= m.end_date THEN 'ACTIVE'
                  ELSE 'EXPIRED'
                END
              ) = $2)
          )
     SELECT z.id AS zone_id, z.name AS zone_name, sm.scheme AS scheme, COUNT(sm.id) AS count
     FROM zone z
     LEFT JOIN company c ON c.zone_id = z.id AND c.is_active
     LEFT JOIN scoped_mou sm ON sm.company_id = c.id
     WHERE z.is_active
       AND ($3::uuid[] IS NULL OR z.id = ANY($3::uuid[]))
     GROUP BY z.id, z.name, sm.scheme
     ORDER BY z.name`,
    [scheme, status, scope],
  );

  const byZone = new Map<string, { zoneName: string; counts: Record<string, number> }>();
  const columnTotals: Record<string, number> = Object.fromEntries(SCHEMES.map((s) => [s, 0]));
  let grandTotal = 0;

  for (const row of rows) {
    if (!byZone.has(row.zone_id)) {
      byZone.set(row.zone_id, { zoneName: row.zone_name, counts: Object.fromEntries(SCHEMES.map((s) => [s, 0])) });
    }
    if (row.scheme === null) {
      continue;
    }
    const count = Number(row.count);
    const zoneEntry = byZone.get(row.zone_id);
    if (zoneEntry !== undefined && (SCHEMES as readonly string[]).includes(row.scheme)) {
      zoneEntry.counts[row.scheme] = count;
      columnTotals[row.scheme] = (columnTotals[row.scheme] ?? 0) + count;
      grandTotal += count;
    }
  }

  const matrixRows: SchemeMatrixRow[] = [...byZone.entries()]
    .sort((a, b) => a[1].zoneName.localeCompare(b[1].zoneName))
    .map(([zoneId, entry]) => ({
      zoneId,
      zoneName: entry.zoneName,
      counts: entry.counts,
      rowTotal: Object.values(entry.counts).reduce((sum, value) => sum + value, 0),
    }));

  return { schemes: SCHEMES, rows: matrixRows, columnTotals, grandTotal };
}

export interface ZoneDrillDownRow {
  readonly mouId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly generatedCode: string;
  readonly plantName: string | null;
  readonly scheme: string;
  readonly status: MouStatus;
  readonly endDate: string;
}

/** Section 2.4: the row list behind a drill-down click, filtered the same way the summary/matrix are. */
export async function fetchZoneDrillDown(
  db: Database,
  today: string,
  zoneId: string,
  filters: ZoneDashboardFilters,
  scope: ZoneScope = null,
): Promise<ZoneDrillDownRow[]> {
  const conditions = [eq(company.zoneId, zoneId), eq(company.isActive, true), eq(mou.isActive, true)];
  if (scope !== null) {
    conditions.push(inArray(company.zoneId, [...scope]));
  }
  if (filters.scheme !== undefined) {
    conditions.push(eq(mou.scheme, filters.scheme));
  }

  const rows = await db
    .select({
      mouId: mou.id,
      companyId: company.id,
      companyName: company.companyName,
      generatedCode: mou.generatedCode,
      plantName: companyPlant.plantName,
      scheme: mou.scheme,
      mouStartDate: mou.mouStartDate,
      endDate: mou.endDate,
    })
    .from(mou)
    .innerJoin(company, eq(company.id, mou.companyId))
    .leftJoin(companyPlant, eq(companyPlant.id, mou.companyPlantId))
    .where(and(...conditions));

  const withStatus = rows
    .filter((row): row is typeof row & { endDate: string } => row.endDate !== null)
    .map((row) => ({
      mouId: row.mouId,
      companyId: row.companyId,
      companyName: row.companyName,
      generatedCode: row.generatedCode,
      plantName: row.plantName,
      scheme: row.scheme as Scheme,
      status: deriveStatus(row.mouStartDate, row.endDate, today),
      endDate: row.endDate,
    }));

  return filters.status === undefined ? withStatus : withStatus.filter((row) => row.status === filters.status);
}
