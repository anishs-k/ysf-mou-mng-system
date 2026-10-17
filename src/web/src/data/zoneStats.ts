/**
 * Purpose: Per-zone figures for the Zone Dashboard - company count, Active /
 * Expiring / Expired MoU counts and the active rate - plus the zone's company
 * list with each company's first MoU. All derived from the static MoU rows; the
 * rate divides MoUs by companies, so it can exceed 100% exactly like the design.
 */

import { ZONE_COMPANIES } from "./companies.ts";
import { MOUS, ZONE_NAMES } from "./mous.ts";
import type { MouRecord } from "./mous.ts";

export interface ZoneStat {
  readonly zone: string;
  readonly companies: number;
  readonly active: number;
  readonly expiring: number;
  readonly expired: number;
  /** Active MoUs per registered company, as a rounded percentage. */
  readonly activeRate: number;
}

export interface ZoneCompanyRow {
  readonly company: string;
  /** The company's first MoU in the zone, or undefined when it has none. */
  readonly mou: MouRecord | undefined;
}

export const ZONE_STATS: readonly ZoneStat[] = ZONE_NAMES.map((zone) => {
  const mous = MOUS.filter((mou) => mou.zone === zone);
  const companies = ZONE_COMPANIES[zone]?.length ?? 0;
  const active = mous.filter((mou) => mou.status === "Active").length;
  return {
    zone,
    companies,
    active,
    expiring: mous.filter((mou) => mou.status === "Expiring").length,
    expired: mous.filter((mou) => mou.status === "Expired").length,
    activeRate: companies > 0 ? Math.round((active / companies) * 100) : 0,
  };
});

export function zoneCompanyRows(zone: string): readonly ZoneCompanyRow[] {
  return (ZONE_COMPANIES[zone] ?? []).map((company) => ({
    company,
    mou: MOUS.find((mou) => mou.zone === zone && mou.company === company),
  }));
}
