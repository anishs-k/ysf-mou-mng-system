/**
 * Purpose: The four aggregate counts shown on the Login page's stat tiles
 * (reversing ADR D88, at explicit user request). Deliberately its own tiny
 * query module rather than reusing `db/dashboard-summary.ts`'s
 * `fetchDashboardSummary` directly: that function returns `pendingReview` (a
 * `company_draft` row count) alongside the totals, which is operationally
 * sensitive - "how many in-progress wizard sessions exist right now" - and
 * has no business being visible to an unauthenticated visitor. Reuses
 * SPEC-12's own `fetchZoneSummary` aggregation for the three counts that are
 * safe to expose, so there is still only one place zone-level counting logic
 * lives; `activeZones` is a plain count with no per-zone detail leaked.
 */

import type { Pool } from "pg";

import { fetchZoneSummary } from "./zone-dashboard.ts";

export interface PublicStats {
  readonly totalCompanies: number;
  readonly activeMou: number;
  readonly expiringSoon: number;
  readonly activeZones: number;
}

/**
 * Every figure here is a coarse, whole-portal count - no company name, no
 * zone breakdown, no per-record detail - the same class of aggregate a
 * public "About us" page for this kind of government portal would already
 * disclose. That distinction is what makes exposing this without a session
 * a defensible narrowing of D88, not a reversal of its underlying concern.
 */
export async function fetchPublicStats(pool: Pool): Promise<PublicStats> {
  const zones = await fetchZoneSummary(pool, {});
  const totals = zones.reduce(
    (acc, zone) => ({
      totalCompanies: acc.totalCompanies + zone.companies,
      activeMou: acc.activeMou + zone.active,
      expiringSoon: acc.expiringSoon + zone.expiringSoon,
    }),
    { totalCompanies: 0, activeMou: 0, expiringSoon: 0 },
  );

  return { ...totals, activeZones: zones.length };
}
