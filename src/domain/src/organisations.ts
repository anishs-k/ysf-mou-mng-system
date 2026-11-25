/**
 * Purpose: SPEC-34's YSF / YSI split. Every agreement belongs to Yuvashakti
 * Foundation (YSF) or Yuvashakti Skill India (YSI), decided by its scheme, so no
 * column stores it and existing MoUs are classified automatically. This file
 * holds which schemes each runs, which fields only a YSI agreement has, and the
 * one check the wizard, the final save, bulk upload and Edit Agreement share.
 * SPEC-35: an Other row named like a YSI-only fee is refused on a YSF agreement too.
 */

import type { CommercialItemKey } from "./commercial-items.ts";
import type { Scheme } from "./enums.ts";

export const ORGANISATIONS = ["YSF", "YSI"] as const;

export type Organisation = (typeof ORGANISATIONS)[number];

export const ORGANISATION_LABELS: Readonly<Record<Organisation, string>> = {
  YSF: "YSF - Yuvashakti Foundation",
  YSI: "YSI - Yuvashakti Skill India",
};

export const ORGANISATION_OPTIONS = ORGANISATIONS.map((value) => ({ value, label: ORGANISATION_LABELS[value] }));

/** The schemes each organisation runs; together they cover SCHEMES exactly once. */
export const ORGANISATION_SCHEMES: Readonly<Record<Organisation, readonly Scheme[]>> = {
  YSF: ["NAPS", "NATS"],
  YSI: ["WILP", "FLEXI", "BVOC", "DVOC", "MSBTE"],
};

const SCHEME_HINT: Readonly<Record<Organisation, string>> = {
  YSF: "NAPS or NATS",
  YSI: "WILP, FLEXI, BVoc, DVoc or MSBTE",
};

export function isOrganisation(value: string): value is Organisation {
  return (ORGANISATIONS as readonly string[]).includes(value);
}

/** The organisation that runs `scheme`; undefined for a blank or unknown scheme. */
export function organisationOfScheme(scheme: string): Organisation | undefined {
  return ORGANISATIONS.find((org) => (ORGANISATION_SCHEMES[org] as readonly string[]).includes(scheme.trim()));
}

/** Fees only a YSI agreement carries (the client sheet's YSI-only columns). */
export const YSI_ONLY_CHARGE_KEYS = [
  "EDUCATION_CHARGES",
  "ONE_TIME_REGISTRATION_FEES",
  "EXAMINATION_FEES",
  "EMPLOYABILITY_TEST_FEES",
  "MSBTE_AFFILIATION_FEES",
] as const satisfies readonly CommercialItemKey[];

/** Whether a charge is asked for this organisation; before one is chosen every charge is shown. */
export function isChargeShown(organisation: Organisation | undefined, key: string): boolean {
  return organisation !== "YSF" || !(YSI_ONLY_CHARGE_KEYS as readonly string[]).includes(key);
}

/** "Who pays the education fee" is a YSI question. */
export function isEducationFeePayerShown(organisation: Organisation | undefined): boolean {
  return organisation !== "YSF";
}

export interface OrganisationFieldsInput {
  /** The organisation chosen in the wizard or the bulk sheet; optional, the scheme decides otherwise. */
  readonly organisation?: string;
  readonly scheme: string;
  readonly charges: Readonly<Record<string, string>>;
  readonly educationFeePayer?: string;
  /** Edit Agreement: YSI-only fees the agreement already held, which may be kept. */
  readonly keepCharges?: readonly string[];
  /** SPEC-35: Other rows - one named like a YSI-only fee is refused on a YSF agreement. */
  readonly otherItems?: readonly { readonly label: string }[];
  /** Edit Agreement: Other row labels the agreement already held, which may be kept. */
  readonly keepOtherLabels?: readonly string[];
}

export interface OrganisationFieldErrors {
  organisation?: string;
  scheme?: string;
  charges?: Record<string, string>;
  educationFeePayer?: string;
  /** SPEC-35: per Other row, in order; undefined for a row that is fine. */
  otherItems?: (string | undefined)[];
}

/**
 * SPEC-35: the core of a fee name - letters only, lower case, without a trailing
 * "fee(s)" / "charge(s)" - so "Examination fee" and "EXAMINATION FEES" compare equal.
 */
function feeCore(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .replace(/(fees|fee|charges|charge)$/, "");
}

/** The cores of every YSI-only fee name: catalogue labels, old labels and the client sheet's names. */
const YSI_ONLY_FEE_CORES = new Set(
  [
    "Education Fees",
    "Education Charges",
    "Course Registration Fees",
    "One Time Registration Fees",
    "Examination Fees",
    "Exam Fees",
    "Employability Skill Test Fees",
    "Employability Test Fees",
    "MSBTE Affiliation Fees",
    "MSBTE Fees",
  ].map(feeCore),
);

export const YSI_ONLY_OTHER_MESSAGE = "This fee is for YSI only. Choose YSI to add it.";

export function validateOrganisationFields(input: OrganisationFieldsInput): OrganisationFieldErrors {
  const errors: OrganisationFieldErrors = {};
  const chosen = (input.organisation ?? "").trim();
  if (chosen !== "" && !isOrganisation(chosen)) {
    errors.organisation = "Choose YSF or YSI";
    return errors;
  }

  const scheme = input.scheme.trim();
  const ofScheme = organisationOfScheme(scheme);
  if (chosen !== "" && ofScheme !== undefined && ofScheme !== chosen) {
    errors.scheme = `Choose a ${chosen} scheme (${SCHEME_HINT[chosen]})`;
    return errors;
  }

  if ((ofScheme ?? chosen) !== "YSF") return errors;

  const keep = input.keepCharges ?? [];
  const charges: Record<string, string> = {};
  for (const key of YSI_ONLY_CHARGE_KEYS) {
    if ((input.charges[key] ?? "").trim() !== "" && !keep.includes(key)) {
      charges[key] = "This fee applies to YSI agreements only";
    }
  }
  if (Object.keys(charges).length > 0) errors.charges = charges;
  if ((input.educationFeePayer ?? "").trim() !== "") errors.educationFeePayer = "This applies to YSI agreements only";

  const keptCores = new Set((input.keepOtherLabels ?? []).map(feeCore));
  const otherItems = (input.otherItems ?? []).map((row) => {
    const core = feeCore(row.label);
    return core !== "" && YSI_ONLY_FEE_CORES.has(core) && !keptCores.has(core) ? YSI_ONLY_OTHER_MESSAGE : undefined;
  });
  if (otherItems.some((message) => message !== undefined)) errors.otherItems = otherItems;
  return errors;
}
