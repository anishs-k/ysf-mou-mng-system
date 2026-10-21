/**
 * Purpose: The one query SPEC-13 section 5 says both Search and the two
 * Exports must share ("what Search selects is what Export writes out") -
 * one row per current MOU matching a Company/Plant/Scheme query plus the
 * zone/status filters. Status is derived once in SQL (the same reasoning as
 * SPEC-12's `scoped_mou` CTE) because pagination has to happen after
 * filtering by a derived value, which application-code filtering after the
 * fact cannot do correctly.
 *
 * Every filter is optional, so the same query also backs the plain
 * "all MoUs" list screens, and dates are selected as `::text` so rows carry
 * YYYY-MM-DD strings rather than driver-parsed Date objects.
 *
 * The SPEC-19 zone scope is a required argument rather than one more optional
 * filter, so no caller can forget it; it is ANDed with the user's own zoneId.
 */

import { EXPIRING_SOON_DAYS } from "@mou/domain";
import type { Pool } from "pg";

import type { ZoneScope } from "../auth/zone-scope.ts";

/**
 * "Expiring soon" = end date between today and today + 90 days, the same
 * window as the Dashboard KPI (zone-dashboard.ts), the alert badge
 * (routes/alerts.ts) and the displayed "Expiring" status (SPEC-23 D146), so the
 * list a KPI links to holds exactly that many rows. Re-exported for its callers.
 */
export { EXPIRING_SOON_DAYS };

/** The derived statuses plus EXPIRING, which is a filter only - rows never carry it. */
export type SearchStatusFilter = "ACTIVE" | "EXPIRED" | "NEW" | "EXPIRING";

export interface SearchFilters {
  readonly by?: "company" | "plant" | "scheme";
  readonly q?: string;
  readonly zoneId?: string;
  readonly status?: SearchStatusFilter;
  /** Independent of `by=scheme`, so it can narrow a company/plant query. */
  readonly scheme?: string;
  /** Inclusive bounds on mou_start_date, YYYY-MM-DD. */
  readonly startFrom?: string;
  readonly startTo?: string;
}

export interface SearchRow {
  readonly mouId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly generatedCode: string;
  readonly zoneId: string;
  readonly zoneName: string;
  readonly plantName: string | null;
  readonly scheme: string;
  readonly mouStartDate: string;
  readonly endDate: string;
  readonly status: string;
  readonly hrContactName: string;
  readonly hrContactNumber: string;
  /** Not part of Search's own display (section 2.2) - carried along for Export's MOUs sheet (section 3.2), which needs the full row. */
  readonly tenureValue: number;
  readonly tenureUnit: string;
  readonly attendanceCycle: string;
  readonly stipendDate: number | null;
}

export interface SearchPage {
  readonly limit: number;
  readonly offset: number;
}

const STATUS_CASE = `CASE WHEN t.d < m.mou_start_date THEN 'NEW' WHEN t.d <= m.end_date THEN 'ACTIVE' ELSE 'EXPIRED' END`;

/**
 * `page` omitted returns every matching row (Export's use); provided,
 * returns one page plus the total match count in one round trip via
 * `COUNT(*) OVER()`.
 */
export async function searchMous(
  pool: Pool,
  scope: ZoneScope,
  filters: SearchFilters,
  page?: SearchPage,
): Promise<{ rows: SearchRow[]; total: number }> {
  const by = filters.by ?? null;
  const q = filters.q ?? null;
  const zoneId = filters.zoneId ?? null;
  const status = filters.status ?? null;
  const scheme = filters.scheme ?? null;
  const startFrom = filters.startFrom ?? null;
  const startTo = filters.startTo ?? null;
  const limit = page?.limit ?? null;
  const offset = page?.offset ?? 0;

  const { rows } = await pool.query<{
    mou_id: string;
    company_id: string;
    company_name: string;
    generated_code: string;
    zone_id: string;
    zone_name: string;
    plant_name: string | null;
    scheme: string;
    mou_start_date: string;
    end_date: string;
    status: string;
    hr_contact_name: string;
    hr_contact_number: string;
    tenure_value: number;
    tenure_unit: string;
    attendance_cycle: string;
    stipend_date: number | null;
    total_count: string;
  }>(
    `WITH t AS (SELECT business_today() AS d)
     SELECT
       m.id AS mou_id,
       c.id AS company_id,
       c.company_name,
       m.generated_code,
       c.zone_id,
       z.name AS zone_name,
       cp.plant_name,
       m.scheme,
       m.mou_start_date::text AS mou_start_date,
       m.end_date::text AS end_date,
       ${STATUS_CASE} AS status,
       c.hr_contact_name,
       c.hr_contact_number,
       m.tenure_value,
       m.tenure_unit,
       m.attendance_cycle,
       m.stipend_date,
       COUNT(*) OVER() AS total_count
     FROM mou m
     JOIN company c ON c.id = m.company_id AND c.is_active
     JOIN zone z ON z.id = c.zone_id
     LEFT JOIN company_plant cp ON cp.id = m.company_plant_id
     CROSS JOIN t
     WHERE m.is_active
       AND ($1::uuid IS NULL OR c.zone_id = $1)
       AND (
         $2::text IS NULL
         OR ($2 = 'EXPIRING' AND m.end_date BETWEEN t.d AND t.d + ${EXPIRING_SOON_DAYS})
         OR ${STATUS_CASE} = $2
       )
       AND (
         $3::text IS NULL
         OR ($3 = 'company' AND (c.company_name ILIKE '%' || $4 || '%' OR m.generated_code ILIKE '%' || $4 || '%'))
         OR ($3 = 'plant' AND cp.plant_name ILIKE '%' || $4 || '%')
         OR ($3 = 'scheme' AND m.scheme = $4)
       )
       AND ($7::text IS NULL OR m.scheme = $7)
       AND ($8::date IS NULL OR m.mou_start_date >= $8)
       AND ($9::date IS NULL OR m.mou_start_date <= $9)
       AND ($10::uuid[] IS NULL OR c.zone_id = ANY($10::uuid[]))
     ORDER BY c.company_name, m.scheme
     LIMIT COALESCE($5::int, 2147483647) OFFSET $6`,
    [zoneId, status, by, q, limit, offset, scheme, startFrom, startTo, scope],
  );

  const total = rows.length > 0 ? Number(rows[0]?.total_count ?? 0) : 0;
  return {
    total,
    rows: rows.map((row) => ({
      mouId: row.mou_id,
      companyId: row.company_id,
      companyName: row.company_name,
      generatedCode: row.generated_code,
      zoneId: row.zone_id,
      zoneName: row.zone_name,
      plantName: row.plant_name,
      scheme: row.scheme,
      mouStartDate: row.mou_start_date,
      endDate: row.end_date,
      status: row.status,
      hrContactName: row.hr_contact_name,
      hrContactNumber: row.hr_contact_number,
      tenureValue: row.tenure_value,
      tenureUnit: row.tenure_unit,
      attendanceCycle: row.attendance_cycle,
      stipendDate: row.stipend_date,
    })),
  };
}
