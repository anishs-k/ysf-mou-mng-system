/**
 * Purpose: Single source of truth for the fixed master reference lists in
 * SPEC-01 section 2 - company type, registration type, contact type, scheme, MOU
 * status, tenure unit, edit-agreement reason, item type and user role. Per D11
 * each list is a TypeScript union here and is mirrored in Postgres by a CHECK
 * constraint, so this file decides what a valid value is, not the database.
 * Every list is exported four ways: a value tuple, a union type, a value-to-label
 * map, and a ready-made option list for the /api/enums response.
 *
 * SPEC-16 extends it: the scheme list goes from four values to seven (D101), and
 * four new lists join it - sector (D107), the commercial charge period and basis
 * (D108) and the insurance sub-model type (D108). SCHEME_GUIDELINES also lives
 * here rather than in its own module because it is reference content keyed by the
 * Scheme union and is served from the same /api/enums response (D113).
 */

export interface EnumOption<TValue extends string = string> {
  readonly value: TValue;
  readonly label: string;
}

/** Zips a value tuple with its label map into the shape the API serves. */
export function toOptions<TValue extends string>(
  values: readonly TValue[],
  labels: Readonly<Record<TValue, string>>,
): readonly EnumOption<TValue>[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

export const COMPANY_TYPES = [
  "CENTRAL_GOVT",
  "CENTRAL_PSU",
  "CO_OPERATIVE",
  "PRIVATE_SECTOR",
  "STATE_GOVT",
  "STATE_PSU",
] as const;

export type CompanyType = (typeof COMPANY_TYPES)[number];

export const COMPANY_TYPE_LABELS: Readonly<Record<CompanyType, string>> = {
  CENTRAL_GOVT: "Central Govt",
  CENTRAL_PSU: "Central PSU",
  CO_OPERATIVE: "Co-operative",
  PRIVATE_SECTOR: "Private Sector",
  STATE_GOVT: "State Govt",
  STATE_PSU: "State PSU",
};

export const COMPANY_TYPE_OPTIONS = toOptions(COMPANY_TYPES, COMPANY_TYPE_LABELS);

export const REGISTRATION_TYPES = [
  "PROPRIETORSHIP",
  "COMPANY",
  "PARTNERSHIP",
  "HUF",
  "TRUST",
  "SOCIETY",
  "ASSOCIATION",
  "LOCAL_AUTHORITY",
  "OTHERS",
  "GOVERNMENT",
] as const;

export type RegistrationType = (typeof REGISTRATION_TYPES)[number];

export const REGISTRATION_TYPE_LABELS: Readonly<Record<RegistrationType, string>> = {
  PROPRIETORSHIP: "Proprietorship",
  COMPANY: "Company",
  PARTNERSHIP: "Partnership",
  HUF: "HUF",
  TRUST: "Trust",
  SOCIETY: "Society",
  ASSOCIATION: "Association",
  LOCAL_AUTHORITY: "Local Authority",
  OTHERS: "Others",
  GOVERNMENT: "Government",
};

export const REGISTRATION_TYPE_OPTIONS = toOptions(REGISTRATION_TYPES, REGISTRATION_TYPE_LABELS);

export const CONTACT_TYPES = ["MOBILE", "LAN"] as const;

export type ContactType = (typeof CONTACT_TYPES)[number];

export const CONTACT_TYPE_LABELS: Readonly<Record<ContactType, string>> = {
  MOBILE: "Mobile No",
  LAN: "LAN No",
};

export const CONTACT_TYPE_OPTIONS = toOptions(CONTACT_TYPES, CONTACT_TYPE_LABELS);

/**
 * The enum most likely to grow: a new training scheme is ordinary business
 * evolution, and D11 keeps that a one-migration change.
 *
 * SPEC-16 D101 took it from four values to seven. `BOC_AND_DVOC` split into
 * `BVOC` and `DVOC` because the two are genuinely different qualifications
 * (B.Voc is a three-year UG degree, D.Voc a two-year diploma), and `NAPS` and
 * `NATS` joined from the v2 design. No data migration was needed: nothing in
 * this repo seeds or migrates a `mou` row.
 */
export const SCHEMES = ["NAPS", "NATS", "WILP", "BVOC", "DVOC", "FLEXI", "MSBTE"] as const;

export type Scheme = (typeof SCHEMES)[number];

export const SCHEME_LABELS: Readonly<Record<Scheme, string>> = {
  NAPS: "NAPS",
  NATS: "NATS",
  WILP: "WILP",
  BVOC: "B.Voc",
  DVOC: "D.Voc",
  FLEXI: "FLEXI",
  MSBTE: "MSBTE",
};

export const SCHEME_OPTIONS = toOptions(SCHEMES, SCHEME_LABELS);

/**
 * The reference copy shown in the wizard's scheme guidelines panel (SPEC-16 D113).
 * Served from /api/enums so the web app hardcodes nothing, per SPEC-01 section 7.
 * The wording is reproduced from the v2 design; the two typos it contained
 * ("Pro data" and "On payble stipend") were in a different list and are corrected
 * in COMMERCIAL_BASES below rather than carried into stored values.
 */
export interface SchemeGuideline {
  readonly tagline: string;
  readonly eligibility: string;
  readonly duration: string;
  readonly stipend: string;
  readonly benefit: string;
}

export const SCHEME_GUIDELINES: Readonly<Record<Scheme, SchemeGuideline>> = {
  NAPS: {
    tagline: "National Apprenticeship Promotion Scheme",
    eligibility: "Passed Class 5 or higher; age 14-35 years",
    duration: "6 months - 3 years",
    stipend: "Rs 1,500-9,000/month (Govt shares 25%, max Rs 1,500)",
    benefit: "Govt. shares 25% of prescribed stipend. Basic training cost shared up to Rs 7,500.",
  },
  NATS: {
    tagline: "National Apprenticeship Training Scheme",
    eligibility: "Diploma / Degree holders (Engineering / Technology)",
    duration: "1 year",
    stipend: "As per BOAT norms",
    benefit: "Post-graduation practical exposure; certificate from BOAT.",
  },
  WILP: {
    tagline: "Work Integrated Learning Programme",
    eligibility: "Working professionals / employees",
    duration: "2-3 years (part-time)",
    stipend: "N/A (salaried employee)",
    benefit: "Degree while working; BITS Pilani / equivalent affiliation.",
  },
  BVOC: {
    tagline: "Bachelor of Vocation (B.Voc)",
    eligibility: "Class 12 pass; vocational stream preferred",
    duration: "3 years (UG degree)",
    stipend: "As per MOU terms",
    benefit: "UGC-recognised degree with industry embed; multiple exit options.",
  },
  DVOC: {
    tagline: "Diploma of Vocation (D.Voc)",
    eligibility: "Class 10 / ITI pass",
    duration: "2 years",
    stipend: "As per MOU terms",
    benefit: "Diploma with hands-on industry training; pathway to B.Voc.",
  },
  FLEXI: {
    tagline: "Flexi MOU Scheme",
    eligibility: "Any trainee as per company norms",
    duration: "Flexible - defined in MOU",
    stipend: "Defined in MOU",
    benefit: "Custom training design; company retains full flexibility on duration and structure.",
  },
  MSBTE: {
    tagline: "Maharashtra State Board of Technical Education",
    eligibility: "Class 10 pass (Maharashtra students)",
    duration: "3 years (Diploma)",
    stipend: "As per MOU terms",
    benefit: "State-board diploma; industry internship credits recognised by MSBTE.",
  },
};

/** Derived on read from the start and end dates - never stored (section 6.2). */
export const MOU_STATUSES = ["ACTIVE", "EXPIRED", "NEW"] as const;

export type MouStatus = (typeof MOU_STATUSES)[number];

export const MOU_STATUS_LABELS: Readonly<Record<MouStatus, string>> = {
  ACTIVE: "Active",
  EXPIRED: "Expired",
  NEW: "New",
};

export const MOU_STATUS_OPTIONS = toOptions(MOU_STATUSES, MOU_STATUS_LABELS);

export const TENURE_UNITS = ["MONTHS", "YEARS"] as const;

export type TenureUnit = (typeof TENURE_UNITS)[number];

export const TENURE_UNIT_LABELS: Readonly<Record<TenureUnit, string>> = {
  MONTHS: "Months",
  YEARS: "Years",
};

export const TENURE_UNIT_OPTIONS = toOptions(TENURE_UNITS, TENURE_UNIT_LABELS);

export const EDIT_AGREEMENT_REASONS = [
  "COMMUNICATION_FROM_HR",
  "ADDENDUM_IN_AGREEMENT",
  "CHANGE_IN_STATUTORY_COMPLIANCE",
] as const;

export type EditAgreementReason = (typeof EDIT_AGREEMENT_REASONS)[number];

export const EDIT_AGREEMENT_REASON_LABELS: Readonly<Record<EditAgreementReason, string>> = {
  COMMUNICATION_FROM_HR: "Communication from HR",
  ADDENDUM_IN_AGREEMENT: "Addendum in Agreement",
  CHANGE_IN_STATUTORY_COMPLIANCE: "Change in Statutory Compliance",
};

export const EDIT_AGREEMENT_REASON_OPTIONS = toOptions(
  EDIT_AGREEMENT_REASONS,
  EDIT_AGREEMENT_REASON_LABELS,
);

export const ITEM_TYPES = ["ALLOWANCE", "DEDUCTION"] as const;

export type ItemType = (typeof ITEM_TYPES)[number];

export const ITEM_TYPE_LABELS: Readonly<Record<ItemType, string>> = {
  ALLOWANCE: "Allowance",
  DEDUCTION: "Deduction",
};

export const ITEM_TYPE_OPTIONS = toOptions(ITEM_TYPES, ITEM_TYPE_LABELS);

export const USER_ROLES = ["ADMIN", "DATA_ENTRY", "VIEWER"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABELS: Readonly<Record<UserRole, string>> = {
  ADMIN: "Admin",
  DATA_ENTRY: "Data Entry",
  VIEWER: "Viewer",
};

export const USER_ROLE_OPTIONS = toOptions(USER_ROLES, USER_ROLE_LABELS);

/**
 * SPEC-16 D107. The industry sector of a company, captured third on wizard Page 1.
 * Required, so `company.sector` is NOT NULL and existing rows are backfilled with
 * OTHER by the migration.
 */
export const SECTORS = [
  "AUTOMOBILE",
  "BANKING_AND_FINANCE",
  "CHEMICAL",
  "CONSTRUCTION",
  "DEFENCE",
  "EDUCATION",
  "ELECTRONICS_AND_IT",
  "ENGINEERING",
  "FMCG",
  "HEALTHCARE",
  "LOGISTICS",
  "MANUFACTURING",
  "PHARMACEUTICAL",
  "POWER_AND_ENERGY",
  "RETAIL",
  "TEXTILE",
  "OTHER",
] as const;

export type Sector = (typeof SECTORS)[number];

export const SECTOR_LABELS: Readonly<Record<Sector, string>> = {
  AUTOMOBILE: "Automobile",
  BANKING_AND_FINANCE: "Banking & Finance",
  CHEMICAL: "Chemical",
  CONSTRUCTION: "Construction",
  DEFENCE: "Defence",
  EDUCATION: "Education",
  ELECTRONICS_AND_IT: "Electronics / IT",
  ENGINEERING: "Engineering",
  FMCG: "FMCG",
  HEALTHCARE: "Healthcare",
  LOGISTICS: "Logistics",
  MANUFACTURING: "Manufacturing",
  PHARMACEUTICAL: "Pharmaceutical",
  POWER_AND_ENERGY: "Power & Energy",
  RETAIL: "Retail",
  TEXTILE: "Textile",
  OTHER: "Other",
};

export const SECTOR_OPTIONS = toOptions(SECTORS, SECTOR_LABELS);

/**
 * SPEC-16 D108. The two sub-attributes every commercial charge row now carries
 * alongside its amount. Both are optional and nullable: a charge may be recorded
 * with an amount and no period or basis at all.
 *
 * The v2 source labelled these "Pro data" and "On payble stipend". Both are
 * misspellings and are corrected here - a typo must never become a stored value.
 */
export const COMMERCIAL_PERIODS = ["MONTHLY", "QUARTERLY", "ONE_TIME", "ANNUAL"] as const;

export type CommercialPeriod = (typeof COMMERCIAL_PERIODS)[number];

export const COMMERCIAL_PERIOD_LABELS: Readonly<Record<CommercialPeriod, string>> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ONE_TIME: "One-time",
  ANNUAL: "Annual",
};

export const COMMERCIAL_PERIOD_OPTIONS = toOptions(COMMERCIAL_PERIODS, COMMERCIAL_PERIOD_LABELS);

export const COMMERCIAL_BASES = [
  "FLAT",
  "PER_TRAINEE_PER_MONTH",
  "PRO_RATA",
  "ON_PAYABLE_STIPEND",
  "OTHER",
] as const;

export type CommercialBasis = (typeof COMMERCIAL_BASES)[number];

export const COMMERCIAL_BASIS_LABELS: Readonly<Record<CommercialBasis, string>> = {
  FLAT: "Flat",
  PER_TRAINEE_PER_MONTH: "Per trainee per month",
  PRO_RATA: "Pro-rata",
  ON_PAYABLE_STIPEND: "On payable stipend",
  OTHER: "Other",
};

export const COMMERCIAL_BASIS_OPTIONS = toOptions(COMMERCIAL_BASES, COMMERCIAL_BASIS_LABELS);

/**
 * SPEC-16 D108. The insurance sub-model carried only by the INSURANCE payroll
 * item. TOPUP and BOTH require the GFS amount; RECOVERY and BOTH require the MOU
 * amount; BOTH requires both. The database CHECK enforces that a non-INSURANCE
 * row never carries any of the three columns.
 */
export const INSURANCE_TYPES = ["TOPUP", "RECOVERY", "BOTH"] as const;

export type InsuranceType = (typeof INSURANCE_TYPES)[number];

export const INSURANCE_TYPE_LABELS: Readonly<Record<InsuranceType, string>> = {
  TOPUP: "Top Up (GFS)",
  RECOVERY: "Recovery (MOU)",
  BOTH: "Both",
};

export const INSURANCE_TYPE_OPTIONS = toOptions(INSURANCE_TYPES, INSURANCE_TYPE_LABELS);

/**
 * Every list in one object, keyed for the /api/enums response so no route has to
 * enumerate them by hand.
 */
export const ENUM_SETS = {
  companyTypes: COMPANY_TYPE_OPTIONS,
  registrationTypes: REGISTRATION_TYPE_OPTIONS,
  contactTypes: CONTACT_TYPE_OPTIONS,
  schemes: SCHEME_OPTIONS,
  mouStatuses: MOU_STATUS_OPTIONS,
  tenureUnits: TENURE_UNIT_OPTIONS,
  editAgreementReasons: EDIT_AGREEMENT_REASON_OPTIONS,
  itemTypes: ITEM_TYPE_OPTIONS,
  userRoles: USER_ROLE_OPTIONS,
  sectors: SECTOR_OPTIONS,
  commercialPeriods: COMMERCIAL_PERIOD_OPTIONS,
  commercialBases: COMMERCIAL_BASIS_OPTIONS,
  insuranceTypes: INSURANCE_TYPE_OPTIONS,
} as const;
