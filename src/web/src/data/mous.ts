/**
 * Purpose: Turns the prototype's 233 source rows into the MoU records every screen
 * shows - each with a status, an MoU code and an expiry date - and the headline
 * figures derived from them. The prototype assigns these by row position rather
 * than by real dates, and the clone keeps exactly that rule so every count, badge
 * and code matches the design.
 */

import { MOU_SOURCE_ROWS, ZONE_COMPANIES } from "./companies.ts";

export type MouStatus = "Active" | "Expiring" | "Expired" | "Pending";

export interface MouRecord {
  readonly id: number;
  readonly company: string;
  readonly zone: string;
  readonly plant: string;
  readonly scheme: string;
  readonly status: MouStatus;
  readonly code: string;
  readonly expires: string;
}

const ACTIVE_EXPIRY_DATES = [
  "31 Mar 2027", "30 Jun 2027", "31 Aug 2027", "30 Sep 2027", "31 Oct 2027", "30 Nov 2027",
  "31 Dec 2027", "31 Jan 2028", "28 Feb 2028", "31 Mar 2028", "30 Apr 2028", "31 May 2028",
];
const EXPIRING_DATES = ["12 Sep 2026", "18 Sep 2026", "25 Sep 2026", "01 Oct 2026", "05 Oct 2026", "08 Oct 2026"];
const EXPIRED_DATES = [
  "31 Jan 2026", "28 Feb 2026", "31 Mar 2026", "30 Apr 2026", "31 May 2026", "30 Jun 2026", "31 Jul 2026", "10 Aug 2026",
];

/** Every 12th row cycles through the non-active statuses at fixed positions. */
function statusAt(index: number): MouStatus {
  const position = (index + 1) % 12;
  if (position === 5) return "Expiring";
  if (position === 0) return "Expired";
  if (position === 9) return "Pending";
  return "Active";
}

function codeYear(status: MouStatus, index: number): string {
  if (status === "Expired") return "2023";
  if (status === "Expiring") return "2024";
  return index < 120 ? "2025" : "2024";
}

function expiryDate(status: MouStatus, index: number): string {
  if (status === "Expiring") return EXPIRING_DATES[index % EXPIRING_DATES.length] ?? "";
  if (status === "Expired") return EXPIRED_DATES[index % EXPIRED_DATES.length] ?? "";
  return ACTIVE_EXPIRY_DATES[index % ACTIVE_EXPIRY_DATES.length] ?? "";
}

export const MOUS: readonly MouRecord[] = MOU_SOURCE_ROWS.map(([company, zone, plant, scheme], index) => {
  const status = statusAt(index);
  return {
    id: index + 1,
    company,
    zone,
    plant,
    scheme,
    status,
    code: `MoU-${scheme}-${codeYear(status, index)}-${String(index + 1).padStart(4, "0")}`,
    expires: expiryDate(status, index),
  };
});

export const ZONE_NAMES: readonly string[] = Object.keys(ZONE_COMPANIES);

export const TOTAL_COMPANIES = Object.values(ZONE_COMPANIES).reduce((total, list) => total + list.length, 0);

export function countByStatus(status: MouStatus): number {
  return MOUS.filter((mou) => mou.status === status).length;
}
