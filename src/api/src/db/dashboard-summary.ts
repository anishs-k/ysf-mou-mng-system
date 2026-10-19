/**
 * Purpose: SPEC-14 §5 - the two new read-only aggregates the Figma dashboard
 * design needs and nothing else in the app already computes: the five KPI
 * counts (D84) and the merged recent-activity feed (D86). Both reuse
 * existing query layers rather than re-deriving anything - the KPI counts
 * are SPEC-12's own per-zone aggregation (`zone-dashboard.ts`) summed across
 * zones, and MOU status in the activity feed is `@mou/domain`'s
 * `deriveStatus`, computed live, never stored. Both take a SPEC-19 ZoneScope.
 */

import type { Pool } from "pg";

import type { ZoneScope } from "../auth/zone-scope.ts";
import { fetchZoneSummary } from "./zone-dashboard.ts";

export interface DashboardSummary {
  readonly totalCompanies: number;
  readonly activeMou: number;
  readonly expiringSoon: number;
  readonly expired: number;
  readonly pendingReview: number;
}

/** A company belongs to exactly one zone, so summing SPEC-12's per-zone rows never double-counts. */
export async function fetchDashboardSummary(pool: Pool, scope: ZoneScope): Promise<DashboardSummary> {
  const zones = await fetchZoneSummary(pool, {}, scope);
  const totals = zones.reduce(
    (acc, zone) => ({
      totalCompanies: acc.totalCompanies + zone.companies,
      activeMou: acc.activeMou + zone.active,
      expiringSoon: acc.expiringSoon + zone.expiringSoon,
      expired: acc.expired + zone.expired,
    }),
    { totalCompanies: 0, activeMou: 0, expiringSoon: 0, expired: 0 },
  );

  // D85: "Pending Review" is a wizard session started but never finished -
  // zero new schema, company_draft already exists for exactly this (SPEC-03).
  // A draft belongs to the zone its Page 1 names (SPEC-19 section 4.1).
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::int AS count FROM company_draft
      WHERE $1::text[] IS NULL OR payload->'page1'->>'zoneId' = ANY($1::text[])`,
    [scope],
  );
  const pendingReview = Number(rows[0]?.count ?? 0);

  return { ...totals, pendingReview };
}

export interface RecentActivityRow {
  readonly type: "COMPANY_CREATED" | "MOU_EDITED";
  readonly company: string;
  readonly zone: string;
  readonly plant: string | null;
  readonly scheme: string | null;
  readonly status: "ACTIVE" | "EXPIRED" | "NEW" | null;
  readonly occurredAt: string;
}

/**
 * D86: `company.created_at` (COMPANY_CREATED) union `agreement_history.edited_at`
 * (MOU_EDITED, SPEC-10), merged and ordered desc. A COMPANY_CREATED row shows
 * the company's earliest MOU (the wizard always creates exactly one MOU
 * alongside the company, SPEC-03) for its plant/scheme/status; a MOU_EDITED
 * row shows the specific MOU that edit belongs to. No new table.
 */
export async function fetchRecentActivity(pool: Pool, limit: number, scope: ZoneScope): Promise<RecentActivityRow[]> {
  const { rows } = await pool.query<{
    type: "COMPANY_CREATED" | "MOU_EDITED";
    company: string;
    zone: string;
    plant: string | null;
    scheme: string | null;
    status: "ACTIVE" | "EXPIRED" | "NEW" | null;
    occurred_at: string;
  }>(
    `WITH t AS (SELECT business_today() AS d),
          first_mou AS (
            SELECT DISTINCT ON (company_id) company_id, company_plant_id, scheme, mou_start_date, end_date
            FROM mou
            WHERE is_active
            ORDER BY company_id, created_at ASC
          ),
          company_events AS (
            SELECT
              'COMPANY_CREATED'::text AS type,
              c.company_name AS company,
              z.name AS zone,
              cp.plant_name AS plant,
              fm.scheme AS scheme,
              CASE
                WHEN fm.mou_start_date IS NULL THEN NULL
                WHEN t.d < fm.mou_start_date THEN 'NEW'
                WHEN t.d <= fm.end_date THEN 'ACTIVE'
                ELSE 'EXPIRED'
              END AS status,
              c.created_at AS occurred_at
            FROM company c
            CROSS JOIN t
            JOIN zone z ON z.id = c.zone_id
            LEFT JOIN first_mou fm ON fm.company_id = c.id
            LEFT JOIN company_plant cp ON cp.id = fm.company_plant_id
            WHERE c.is_active
              AND ($2::uuid[] IS NULL OR c.zone_id = ANY($2::uuid[]))
          ),
          mou_edit_events AS (
            SELECT
              'MOU_EDITED'::text AS type,
              c.company_name AS company,
              z.name AS zone,
              cp.plant_name AS plant,
              m.scheme AS scheme,
              CASE
                WHEN t.d < m.mou_start_date THEN 'NEW'
                WHEN t.d <= m.end_date THEN 'ACTIVE'
                ELSE 'EXPIRED'
              END AS status,
              ah.edited_at AS occurred_at
            FROM agreement_history ah
            CROSS JOIN t
            JOIN mou m ON m.id = ah.mou_id
            JOIN company c ON c.id = m.company_id
            JOIN zone z ON z.id = c.zone_id
            LEFT JOIN company_plant cp ON cp.id = m.company_plant_id
            WHERE $2::uuid[] IS NULL OR c.zone_id = ANY($2::uuid[])
          )
     SELECT * FROM company_events
     UNION ALL
     SELECT * FROM mou_edit_events
     ORDER BY occurred_at DESC
     LIMIT $1`,
    [limit, scope],
  );

  return rows.map((row) => ({
    type: row.type,
    company: row.company,
    zone: row.zone,
    plant: row.plant,
    scheme: row.scheme,
    status: row.status,
    occurredAt: new Date(row.occurred_at).toISOString(),
  }));
}
