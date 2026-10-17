/**
 * Purpose: Static catalogues behind the Add New Company wizard - the select option
 * lists of every step, the per-scheme guideline cards, and the fixed summary the
 * prototype's Review step and success screen show. Zones come from data/mous.ts.
 */

export const SCHEMES: readonly string[] = ["NAPS", "NATS", "WILP", "BVoc", "DVoc", "FLEXI", "MSBTE"];

export const SECTORS: readonly string[] = [
  "Automobile", "Banking & Finance", "Chemical", "Construction", "Defence", "Education", "Electronics / IT",
  "Engineering", "FMCG", "Healthcare", "Logistics", "Manufacturing", "Pharmaceutical", "Power & Energy",
  "Retail", "Textile", "Other",
];

export const COMPANY_TYPES: readonly string[] = [
  "Central Govt", "Central PSU", "Private Sector", "Co-operative", "State Govt / Local Authority", "State PSU",
];

export const REGISTRATION_TYPES: readonly string[] = [
  "Proprietorship", "Partnership", "Pvt. Ltd. / Co-operation", "Public", "Trust / Society", "Association",
  "Local Authority", "Others",
];

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export const ATTENDANCE_CYCLES: readonly SelectOption[] = [
  { value: "16-15", label: "16th to 15th" },
  { value: "21-20", label: "21st to 20th" },
  { value: "26-25", label: "26th to 25th" },
  { value: "calendar-month", label: "Calendar Month" },
];

export const CHARGE_HEADS: readonly string[] = [
  "Admin Charges", "Insurance", "Uniform", "Training", "Assessment", "Transportation", "Sourcing",
  "Document Fee", "Joining Fee", "One-Time Registration",
];

export const CHARGE_FREQUENCIES: readonly string[] = ["Monthly", "Quarterly", "One-time", "Annual"];

export const CHARGE_BASES: readonly string[] = ["Flat", "Per trainee per month", "Pro data", "On payble stipend", "Other"];

export interface SchemeGuideline {
  readonly fullName: string;
  readonly eligibility: string;
  readonly duration: string;
  readonly stipend: string;
  readonly keyBenefit: string;
}

export const SCHEME_GUIDELINES: Readonly<Record<string, SchemeGuideline>> = {
  NAPS: {
    fullName: "National Apprenticeship Promotion Scheme",
    eligibility: "Passed Class 5 or higher; age 14–35 years",
    duration: "6 months – 3 years",
    stipend: "₹1,500–₹9,000/month (Govt shares 25%, max ₹1,500)",
    keyBenefit: "Govt. shares 25% of prescribed stipend. Basic training cost shared up to ₹7,500.",
  },
  NATS: {
    fullName: "National Apprenticeship Training Scheme",
    eligibility: "Diploma / Degree holders (Engineering / Technology)",
    duration: "1 year",
    stipend: "As per BOAT norms",
    keyBenefit: "Post-graduation practical exposure; certificate from BOAT.",
  },
  WILP: {
    fullName: "Work Integrated Learning Programme",
    eligibility: "Working professionals / employees",
    duration: "2–3 years (part-time)",
    stipend: "N/A (salaried employee)",
    keyBenefit: "Degree while working; BITS Pilani / equivalent affiliation.",
  },
  BVoc: {
    fullName: "Bachelor of Vocation (B.Voc)",
    eligibility: "Class 12 pass; vocational stream preferred",
    duration: "3 years (UG degree)",
    stipend: "As per MoU terms",
    keyBenefit: "UGC-recognised degree with industry embed; multiple exit options.",
  },
  DVoc: {
    fullName: "Diploma of Vocation (D.Voc)",
    eligibility: "Class 10 / ITI pass",
    duration: "2 years",
    stipend: "As per MoU terms",
    keyBenefit: "Diploma with hands-on industry training; pathway to B.Voc.",
  },
  FLEXI: {
    fullName: "Flexi MoU Scheme",
    eligibility: "Any trainee as per company norms",
    duration: "Flexible — defined in MoU",
    stipend: "Defined in MoU",
    keyBenefit: "Custom training design; company retains full flexibility on duration and structure.",
  },
  MSBTE: {
    fullName: "Maharashtra State Board of Technical Education",
    eligibility: "Class 10 pass (Maharashtra students)",
    duration: "3 years (Diploma)",
    stipend: "As per MoU terms",
    keyBenefit: "State-board diploma; industry internship credits recognised by MSBTE.",
  },
};

export interface ReviewItem {
  readonly label: string;
  readonly value: string;
}

/** The prototype's Review step always shows this sample registration, whatever was typed. */
export const REVIEW_COMPANY: readonly ReviewItem[] = [
  { label: "Company Name", value: "Tata Consultancy Services Pvt. Ltd." },
  { label: "Company Type", value: "Private Sector" },
  { label: "Registration", value: "Pvt. Ltd. / Co-operation" },
  { label: "GST Number", value: "27AABCT1332L1ZV" },
  { label: "TAN Number", value: "MUMM12345T" },
  { label: "Zone", value: "West" },
  { label: "Plant", value: "Pune Plant A" },
  { label: "HR Contact", value: "Priya Sharma · +91 98765 43210" },
  { label: "Email", value: "hr.pune@tcs.com" },
];

export const REVIEW_COMMERCIAL: readonly ReviewItem[] = [
  { label: "Scheme", value: "WILP" },
  { label: "MoU Start", value: "01 August 2026" },
  { label: "Tenure", value: "12 Months" },
  { label: "Attendance Cycle", value: "Monthly" },
  { label: "Stipend Date", value: "5th of every month" },
  { label: "MoU PDF", value: "TCS_MoU_Aug2026.pdf" },
];

export interface ReviewPayrollTag {
  readonly text: string;
  readonly tone: "success" | "info";
}

export const REVIEW_PAYROLL_TAGS: readonly ReviewPayrollTag[] = [
  { text: "Attendance Bonus: ₹500/mo", tone: "success" },
  { text: "Conveyance: ₹300/mo", tone: "success" },
  { text: "PF Deduction: 12%", tone: "info" },
];

export const REVIEW_TRAINING_CATEGORIES = "ITI Graduate · Non-ITI";

/** The code the success screen reports after "Generate Code & Save". */
export const GENERATED_MOU_CODE = "MoU-WILP-2026-0343";
