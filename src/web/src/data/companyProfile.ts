/**
 * Purpose: Static detail of the Existing Companies record view - the fixed
 * overview contacts, commercial terms, payroll lines, past agreements and
 * documents the prototype shows for every company (only zone, plant, scheme,
 * code and expiry vary, and those come from the MoU record itself).
 */

export interface LabelledValue {
  readonly label: string;
  readonly value: string;
}

export const PROFILE_OVERVIEW = {
  companyType: "Private Sector",
  registration: "Pvt. Ltd. / Co-operation",
  gst: "22AABCR4849P1ZV",
  tan: "MUMR10234B",
  hrContact: "Anil Mehta · +91 98001 23456",
  financeHead: "Sunita Rao · +91 99001 23456",
  email: "hr.jamnagar@ril.com",
  address: "1, Dhirubhai Ambani Marg, Jamnagar, Gujarat 361142",
} as const;

/** Commercial terms after the scheme cell, in display order. */
export const PROFILE_COMMERCIAL: readonly LabelledValue[] = [
  { label: "MoU Start", value: "01 Sep 2024" },
  { label: "Tenure", value: "24 Months" },
  { label: "Attendance Cycle", value: "Monthly" },
  { label: "Stipend Date", value: "5th of every month" },
  { label: "Admin Charges", value: "₹450/month" },
  { label: "Insurance", value: "₹200/month" },
  { label: "Transportation", value: "₹350/month" },
];

export const PROFILE_ALLOWANCES: readonly LabelledValue[] = [
  { label: "Attendance Bonus", value: "₹500/mo" },
  { label: "Conveyance", value: "₹300/mo" },
  { label: "HRA", value: "₹800/mo" },
];

export const PROFILE_DEDUCTIONS: readonly LabelledValue[] = [
  { label: "PF", value: "12%" },
  { label: "ESI", value: "0.75%" },
  { label: "TDS", value: "As applicable" },
];

export interface PastAgreement {
  readonly code: string;
  readonly start: string;
  readonly end: string;
  readonly scheme: string;
  readonly status: string;
}

export const PROFILE_HISTORY: readonly PastAgreement[] = [
  { code: "MoU-BVoc-2024-0112", start: "01 Sep 2024", end: "31 Aug 2026", scheme: "BVoc & DVoc", status: "Expiring" },
  { code: "MoU-FLEXI-2022-0067", start: "01 Sep 2022", end: "31 Aug 2024", scheme: "FLEXI", status: "Expired" },
  { code: "MoU-WILP-2020-0031", start: "15 Mar 2020", end: "14 Mar 2022", scheme: "WILP", status: "Expired" },
];

export interface ProfileDocument {
  readonly name: string;
  readonly caption: string;
}

export const PROFILE_DOCUMENTS: readonly ProfileDocument[] = [
  { name: "MoU_RIL_Sep2024.pdf", caption: "2.3 MB · Uploaded 01 Sep 2024" },
  { name: "RIL_GST_Certificate.pdf", caption: "0.8 MB · Uploaded 01 Sep 2024" },
  { name: "RIL_Registration_Cert.pdf", caption: "1.1 MB · Uploaded 01 Sep 2024" },
];
