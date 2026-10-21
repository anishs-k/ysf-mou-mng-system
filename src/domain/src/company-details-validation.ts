/**
 * Purpose: The SPEC-04 Page 1 company-detail rules, held here in layer 0 so the
 * browser and the server enforce exactly the same thing. Section 4 of the spec
 * requires every rule on both sides, and duplicating them is how the two drift
 * apart. The module is pure - no database, no I/O - so it is unit-testable and
 * usable inside a draft save, a validate endpoint and a React onChange alike.
 *
 * Values are typed as plain strings rather than the enum unions, because the
 * input is untrusted draft JSON: proving a value is a member of COMPANY_TYPES is
 * this module's job, so it cannot assume it. A result carries errors (blocking)
 * and warnings (advisory) separately, which is what lets the GST-vs-State
 * mismatch of AC8 inform the user without preventing them from continuing.
 *
 * D155: the single official email became an HR email and a Finance email, each
 * with its confirmation. D156: Contact Type is no longer asked - a number is
 * accepted as a mobile or as a LAN number on its own; a stored or supplied type
 * still narrows the check to that kind.
 */

import { COMPANY_TYPES, CONTACT_TYPES, REGISTRATION_TYPES } from "./enums.ts";

/** The Page 1 fields of SPEC-04 section 2, as amended by D155 / D156. */
export interface CompanyDetails {
  readonly companyType: string;
  readonly companyName: string;
  readonly registrationType: string;
  readonly tanNumber: string;
  readonly gstNumber: string;
  readonly zoneId: string;
  readonly plantName: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly pinCode: string;
  readonly state: string;
  readonly district: string;
  readonly hrContactName: string;
  readonly financeHeadContactName: string;
  /** D156: optional - blank means each number may be a mobile or a LAN number. */
  readonly contactType: string;
  readonly hrContactNumber: string;
  readonly financeHeadContactNumber: string;
  readonly hrEmail: string;
  readonly confirmHrEmail: string;
  readonly financeEmail: string;
  readonly confirmFinanceEmail: string;
}

export type CompanyDetailField = keyof CompanyDetails;

/** Blocking failures, keyed by field. An absent key means the field passed. */
export type CompanyDetailErrors = Partial<Record<CompanyDetailField, string>>;

export interface CompanyDetailValidation {
  readonly errors: CompanyDetailErrors;
  readonly warnings: CompanyDetailErrors;
}

/**
 * The GST state codes of SPEC-04 section 4, used only for the AC8 advisory
 * warning - a mismatch must never block the user, so this map is deliberately
 * not a validator. Code 28 is retained alongside 37 because both have been
 * issued for Andhra Pradesh across the Telangana bifurcation.
 */
export const GST_STATE_NAMES: Readonly<Record<string, string>> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "25": "Daman and Diu",
  "26": "Dadra and Nagar Haveli",
  "27": "Maharashtra",
  "28": "Andhra Pradesh",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

/** True for a 15-character GST Number in the SPEC-04 pattern (upper case). */
export function isGstNumber(value: string): boolean {
  return GST_PATTERN.test(value);
}

/** The state a GST's leading two digits denote, or undefined if unknown. */
export function stateNameForGstCode(code: string): string | undefined {
  return GST_STATE_NAMES[code];
}

const TAN_PATTERN = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const GST_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9][A-Z][0-9A-Z]$/;
const PIN_PATTERN = /^[0-9]{6}$/;
const MOBILE_PATTERN = /^[6-9][0-9]{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Digits only, after the optional STD separator has been removed. */
const LAN_DIGITS_PATTERN = /^[0-9]{6,15}$/;

const MIN_NAME = 2;
const MAX_COMPANY_NAME = 150;
const MAX_PLANT_NAME = 100;

function isMobile(value: string): boolean {
  return MOBILE_PATTERN.test(value);
}

/**
 * A LAN number is 6-15 digits with an optional STD code separated by a hyphen or
 * a space. A bare mobile is rejected: section 3 insists a LAN number can never
 * be persisted as a mobile number, and "10 digits starting 6-9" is a mobile no
 * matter which contact type is selected.
 */
function validateLandline(value: string): string | undefined {
  if (!/^[0-9]+(?:[- ][0-9]+)?$/.test(value)) {
    return "Enter 6 to 15 digits, with an optional STD code separated by - or a space";
  }
  const digits = value.replace(/[- ]/g, "");
  if (!LAN_DIGITS_PATTERN.test(digits)) {
    return "Enter 6 to 15 digits";
  }
  if (isMobile(digits)) {
    return "This is a mobile number, not a LAN number";
  }
  return undefined;
}

function validateContactNumber(value: string, contactType: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed === "") {
    return "Required";
  }
  if (contactType === "MOBILE") {
    return isMobile(trimmed) ? undefined : "Enter a 10-digit mobile number starting 6 to 9";
  }
  if (contactType === "LAN") {
    return validateLandline(trimmed);
  }
  if (contactType === "") {
    // D156: no type given - a valid mobile or a valid LAN number both pass.
    if (isMobile(trimmed)) return undefined;
    return validateLandline(trimmed) === undefined ? undefined : "Enter a 10-digit mobile number, or a LAN number with its STD code";
  }
  // The contact type itself is invalid; that error is reported instead.
  return undefined;
}

/** An email and its confirmation: required, well formed, and equal ignoring case (AC6). */
function validateEmailPair(
  errors: CompanyDetailErrors,
  fields: { readonly email: CompanyDetailField; readonly confirm: CompanyDetailField },
  email: string,
  confirm: string,
  label: string,
): void {
  if (email === "") {
    errors[fields.email] = "Required";
  } else if (!EMAIL_PATTERN.test(email)) {
    errors[fields.email] = "Enter a valid email address";
  }
  if (confirm === "") {
    errors[fields.confirm] = "Required";
  } else if (errors[fields.email] === undefined && confirm.toLowerCase() !== email.toLowerCase()) {
    errors[fields.confirm] = `Does not match the ${label}`;
  }
}

export function validateCompanyDetails(
  input: Partial<CompanyDetails>,
): CompanyDetailValidation {
  const errors: CompanyDetailErrors = {};
  const warnings: CompanyDetailErrors = {};

  const value = (field: CompanyDetailField): string => (input[field] ?? "").trim();
  const required = (field: CompanyDetailField, message = "Required"): void => {
    if (value(field) === "") {
      errors[field] = message;
    }
  };

  // --- Identity -------------------------------------------------------------
  const companyType = value("companyType");
  if (companyType === "") {
    errors.companyType = "Required";
  } else if (!COMPANY_TYPES.includes(companyType as (typeof COMPANY_TYPES)[number])) {
    errors.companyType = "Choose a company type from the list";
  }

  const companyName = value("companyName");
  if (companyName === "") {
    errors.companyName = "Required";
  } else if (companyName.length < MIN_NAME || companyName.length > MAX_COMPANY_NAME) {
    errors.companyName = `Enter between ${MIN_NAME} and ${MAX_COMPANY_NAME} characters`;
  }

  const registrationType = value("registrationType");
  if (registrationType === "") {
    errors.registrationType = "Required";
  } else if (
    !REGISTRATION_TYPES.includes(registrationType as (typeof REGISTRATION_TYPES)[number])
  ) {
    errors.registrationType = "Choose a registration type from the list";
  }

  const tanNumber = value("tanNumber");
  if (tanNumber === "") {
    errors.tanNumber = "Required";
  } else if (!TAN_PATTERN.test(tanNumber)) {
    errors.tanNumber = "Enter 10 characters: 4 letters, 5 digits, 1 letter (for example ABCD12345E)";
  }

  const gstNumber = value("gstNumber");
  const gstIsValid = GST_PATTERN.test(gstNumber);
  if (gstNumber === "") {
    errors.gstNumber = "Required";
  } else if (!gstIsValid) {
    errors.gstNumber = "Enter a 15-character GST number in upper case";
  }

  required("zoneId", "Choose a zone");

  const plantName = value("plantName");
  if (plantName === "") {
    errors.plantName = "Required";
  } else if (plantName.length < MIN_NAME || plantName.length > MAX_PLANT_NAME) {
    errors.plantName = `Enter between ${MIN_NAME} and ${MAX_PLANT_NAME} characters`;
  }

  // --- Address --------------------------------------------------------------
  required("addressLine1");
  required("city");

  const pinCode = value("pinCode");
  if (pinCode === "") {
    errors.pinCode = "Required";
  } else if (!PIN_PATTERN.test(pinCode)) {
    errors.pinCode = "Enter exactly 6 digits";
  }

  required("state");
  required("district");

  // --- Contacts -------------------------------------------------------------
  required("hrContactName");
  required("financeHeadContactName");

  const contactType = value("contactType");
  if (contactType !== "" && !CONTACT_TYPES.includes(contactType as (typeof CONTACT_TYPES)[number])) {
    errors.contactType = "Choose Mobile No or LAN No";
  }

  const hrNumberError = validateContactNumber(value("hrContactNumber"), contactType);
  if (hrNumberError !== undefined) {
    errors.hrContactNumber = hrNumberError;
  }

  const financeNumberError = validateContactNumber(
    value("financeHeadContactNumber"),
    contactType,
  );
  if (financeNumberError !== undefined) {
    errors.financeHeadContactNumber = financeNumberError;
  }

  validateEmailPair(errors, { email: "hrEmail", confirm: "confirmHrEmail" }, value("hrEmail"), value("confirmHrEmail"), "HR email");
  validateEmailPair(
    errors,
    { email: "financeEmail", confirm: "confirmFinanceEmail" },
    value("financeEmail"),
    value("confirmFinanceEmail"),
    "Finance email",
  );

  // --- AC8: GST state code vs State -----------------------------------------
  // Advisory only - a mismatch warns but must never block Next.
  if (gstIsValid) {
    const state = value("state");
    const expected = stateNameForGstCode(gstNumber.slice(0, 2));
    if (state !== "" && expected !== undefined && state.toLowerCase() !== expected.toLowerCase()) {
      warnings.gstNumber = `This GST belongs to ${expected}, but State is ${state}`;
    }
  }

  return { errors, warnings };
}
