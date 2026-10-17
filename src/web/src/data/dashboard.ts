/**
 * Purpose: The Dashboard's fixed content - the recent-activity rows the design
 * shows and the signed-in officer's identity. These are illustrative rows of the
 * prototype (their zones are regions, not the zone master), kept verbatim so the
 * screen matches the design.
 */

import type { MouStatus } from "./mous.ts";

export interface RecentActivityRow {
  readonly company: string;
  readonly zone: string;
  readonly plant: string;
  readonly scheme: string;
  readonly status: MouStatus;
  readonly updated: string;
}

export const RECENT_ACTIVITY: readonly RecentActivityRow[] = [
  { company: "Tata Consultancy Services", zone: "West", plant: "Pune Plant A", scheme: "WILP", status: "Active", updated: "02 Aug 2026" },
  { company: "Reliance Industries Ltd", zone: "West", plant: "Jamnagar", scheme: "BVoc & DVoc", status: "Expiring", updated: "01 Aug 2026" },
  { company: "Infosys BPM Ltd", zone: "South", plant: "Bengaluru IT", scheme: "FLEXI", status: "Active", updated: "31 Jul 2026" },
  { company: "L&T Construction", zone: "North", plant: "Delhi NCR", scheme: "MSBTE", status: "Pending", updated: "30 Jul 2026" },
  { company: "Mahindra & Mahindra", zone: "West", plant: "Nashik", scheme: "WILP", status: "Expired", updated: "28 Jul 2026" },
];

export const CURRENT_OFFICER = {
  name: "Rajendra Kumar",
  firstName: "Rajendra",
  initials: "RK",
  role: "Admin · North Zone",
} as const;
