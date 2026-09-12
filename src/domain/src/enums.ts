/**
 * Purpose: Single source of truth for the fixed master reference lists in
 * SPEC-01 section 2 - company type, registration type, contact type, scheme, MOU
 * status, tenure unit, edit-agreement reason, item type and user role. Per D11
 * each list is a TypeScript union here and is mirrored in Postgres by a CHECK
 * constraint, so this file decides what a valid value is, not the database.
 * Every list is exported four ways: a value tuple, a union type, a value-to-label
 * map, and a ready-made option list for the /api/enums response.
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
 */
export const SCHEMES = ["WILP", "BOC_AND_DVOC", "MSBTE", "FLEXI"] as const;

export type Scheme = (typeof SCHEMES)[number];

export const SCHEME_LABELS: Readonly<Record<Scheme, string>> = {
  WILP: "WILP",
  BOC_AND_DVOC: "BOC and DVOC",
  MSBTE: "MSBTE",
  FLEXI: "FLEXI",
};

export const SCHEME_OPTIONS = toOptions(SCHEMES, SCHEME_LABELS);

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
} as const;
