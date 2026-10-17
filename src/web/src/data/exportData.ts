/**
 * Purpose: Static data behind the Export screen. The prototype filters its own
 * 18-row sample (not the 233 MoU rows) for the "N records match" count and the CSV
 * it downloads, and offers a fixed, older company list in its Company filter; both
 * are copied here verbatim, together with the three report cards.
 */

export interface ExportRecord {
  readonly company: string;
  readonly zone: string;
  readonly scheme: string;
  readonly code: string;
  readonly start: string;
  readonly end: string;
  readonly status: string;
}

export const EXPORT_RECORDS: readonly ExportRecord[] = [
  { company: "Amber Enterprises India Limited, Supa", zone: "Ahilya Nagar", scheme: "NAPS", code: "MoU-NAPS-2025-0101", start: "01 Jun 2025", end: "30 Jun 2027", status: "Active" },
  { company: "Amber Technoplast India Pvt. Ltd.", zone: "Ahilya Nagar", scheme: "WILP", code: "MoU-WILP-2025-0102", start: "01 Aug 2025", end: "15 Aug 2027", status: "Active" },
  { company: "Sungwoo Hitech India Pvt. Ltd.", zone: "Chennai", scheme: "NAPS", code: "MoU-NAPS-2024-0104", start: "01 Sep 2024", end: "31 Aug 2026", status: "Expiring" },
  { company: "Brite Brothers Limited Plant 1", zone: "Chennai", scheme: "FLEXI", code: "MoU-FLEXI-2025-0103", start: "01 Mar 2025", end: "28 Feb 2027", status: "Active" },
  { company: "Deepak Novochem Technologies Limited", zone: "Chiplun", scheme: "WILP", code: "MoU-WILP-2025-0105", start: "01 Oct 2025", end: "30 Sep 2027", status: "Active" },
  { company: "Gillanex Vender Boot India Pvt Ltd", zone: "Coimbatore", scheme: "NAPS", code: "MoU-NAPS-2025-0107", start: "01 Apr 2025", end: "31 Mar 2027", status: "Active" },
  { company: "MSY Limited", zone: "Goa", scheme: "MSBTE", code: "MoU-MSBTE-2025-0108", start: "01 May 2025", end: "30 Apr 2027", status: "Active" },
  { company: "CTM India Limited", zone: "Gujarat Sanand", scheme: "FLEXI", code: "MoU-FLEXI-2024-0110", start: "20 Sep 2024", end: "20 Sep 2026", status: "Expiring" },
  { company: "Timbani India Ltd (Woc Bearing)", zone: "Gujarat Sanand", scheme: "WILP", code: "MoU-WILP-2025-0109", start: "01 Jun 2025", end: "31 May 2027", status: "Active" },
  { company: "Amber Enterprises India Ltd. (Unit-S)", zone: "Haridwar", scheme: "NAPS", code: "MoU-NAPS-2025-0111", start: "01 Mar 2025", end: "28 Feb 2027", status: "Active" },
  { company: "Jai Suspension Ltd.", zone: "Jamshedpur", scheme: "WILP", code: "MoU-WILP-2024-0113", start: "05 Sep 2024", end: "04 Sep 2026", status: "Expiring" },
  { company: "AVTEC LTD. (CK Birla Group)", zone: "Madhya Pradesh", scheme: "MSBTE", code: "MoU-MSBTE-2025-0117", start: "01 Feb 2025", end: "31 Jan 2028", status: "Active" },
  { company: "KLT Automotive & Tubular Products Ltd., Palghar", zone: "Mumbai", scheme: "NAPS", code: "MoU-NAPS-2025-0119", start: "01 Jul 2025", end: "30 Jun 2027", status: "Active" },
  { company: "Alcon Electronics Pvt Ltd", zone: "Nashik", scheme: "NAPS", code: "MoU-NAPS-2025-0121", start: "01 Sep 2025", end: "31 Aug 2027", status: "Active" },
  { company: "Amber Enterprises India Limited (Corporate)", zone: "NCR Haryana", scheme: "WILP", code: "MoU-WILP-2025-0124", start: "01 Oct 2025", end: "30 Sep 2027", status: "Active" },
  { company: "IL Jin Electronics India Pvt Ltd, Greater Noida", zone: "NCR Haryana", scheme: "NAPS", code: "MoU-NAPS-2024-0125", start: "12 Sep 2024", end: "12 Sep 2026", status: "Expiring" },
  { company: "Amber Enterprises India Limited, Rajanpur", zone: "Ranjangaon", scheme: "NAPS", code: "MoU-NAPS-2025-0127", start: "01 May 2025", end: "30 Apr 2028", status: "Active" },
  { company: "Amber Enterprises India Limited, Rudrapur", zone: "Rudrapur", scheme: "NAPS", code: "MoU-NAPS-2025-0129", start: "01 Jun 2025", end: "31 May 2028", status: "Active" },
];

/** The Company filter's options - the prototype's older sample list, unrelated to EXPORT_RECORDS. */
export const EXPORT_COMPANY_OPTIONS: readonly string[] = [
  "Reliance Industries Ltd",
  "Infosys BPM Ltd",
  "L&T Construction",
  "Mahindra & Mahindra",
  "Wipro Technologies",
  "Bajaj Auto Ltd",
  "BHEL Hardwar",
  "Tata Consultancy Services",
  "Tata Steel Jamshedpur",
  "HUL Ltd Silvassa",
  "Honda Motorcycles",
  "Sun Pharma Halol",
];

export const EXPORT_STATUS_OPTIONS: readonly string[] = ["All", "Active", "Expiring", "Expired", "Pending"];

export interface ExportReport {
  readonly title: string;
  readonly caption: string;
  readonly format: string;
}

export const EXPORT_REPORTS: readonly ExportReport[] = [
  { title: "MoU Summary Report", caption: "All company MoU records with status", format: "Excel (.xlsx)" },
  { title: "Expiry Report", caption: "Companies with upcoming expirations", format: "Excel (.xlsx)" },
  { title: "MoU Documents Bulk", caption: "Bulk PDF download of signed MoUs", format: "ZIP (.zip)" },
];
