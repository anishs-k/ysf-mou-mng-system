/**
 * Purpose: Static data of the Agreement History screen - the six past/current
 * agreements the prototype lists, with every column its Excel (CSV) export
 * carries, plus the scheme filter options. Copied verbatim from the prototype.
 */

export type HistoryStatus = "Active" | "Expiring";

export interface AgreementHistoryRecord {
  readonly company: string;
  readonly code: string;
  readonly zone: string;
  readonly plant: string;
  readonly scheme: string;
  readonly start: string;
  readonly end: string;
  readonly tenure: string;
  readonly hrContact: string;
  readonly status: HistoryStatus;
}

/** The scheme filter options, in the prototype's order. */
export const SCHEME_OPTIONS: readonly string[] = ["NAPS", "NATS", "WILP", "BVoc", "DVoc", "FLEXI", "MSBTE"];

export const AGREEMENT_HISTORY: readonly AgreementHistoryRecord[] = [
  {
    company: "Amber Enterprises India Limited, Supa", code: "MoU-NAPS-2025-0101", zone: "Ahilya Nagar", plant: "Supa Plant",
    scheme: "NAPS", start: "01 Jun 2025", end: "30 Jun 2027", tenure: "24 Months", hrContact: "Rajesh Sharma · +91 98765 43210", status: "Active",
  },
  {
    company: "Sungwoo Hitech India Pvt. Ltd.", code: "MoU-NAPS-2024-0104", zone: "Chennai", plant: "Chennai",
    scheme: "NAPS", start: "01 Sep 2024", end: "31 Aug 2026", tenure: "24 Months", hrContact: "Suresh Iyer · +91 97001 22110", status: "Expiring",
  },
  {
    company: "Deepak Novochem Technologies Limited", code: "MoU-WILP-2025-0105", zone: "Chiplun", plant: "Chiplun",
    scheme: "WILP", start: "01 Oct 2025", end: "30 Sep 2027", tenure: "24 Months", hrContact: "Priya Patil · +91 99001 88762", status: "Active",
  },
  {
    company: "Jai Suspension Ltd.", code: "MoU-WILP-2024-0113", zone: "Jamshedpur", plant: "Jamshedpur",
    scheme: "WILP", start: "05 Sep 2024", end: "04 Sep 2026", tenure: "24 Months", hrContact: "Amit Singh · +91 98100 33456", status: "Expiring",
  },
  {
    company: "AVTEC LTD. (CK Birla Group)", code: "MoU-MSBTE-2025-0117", zone: "Madhya Pradesh", plant: "Pithampur",
    scheme: "MSBTE", start: "01 Feb 2025", end: "31 Jan 2028", tenure: "36 Months", hrContact: "Neha Joshi · +91 96001 54321", status: "Active",
  },
  {
    company: "Amber Enterprises India Limited (Corporate)", code: "MoU-WILP-2025-0124", zone: "NCR Haryana", plant: "Gurugram HQ",
    scheme: "WILP", start: "01 Oct 2025", end: "30 Sep 2027", tenure: "24 Months", hrContact: "Vikram Mehta · +91 98800 11223", status: "Active",
  },
];
