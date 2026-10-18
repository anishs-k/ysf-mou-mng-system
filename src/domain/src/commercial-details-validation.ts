/**
 * Purpose: The SPEC-05 Page 2 commercial-detail rules, held here in layer 0 for
 * the same reason company-details-validation.ts is: section 3 requires every
 * rule enforced identically in the browser and on the server, and this module is
 * the one place that can be true. It is pure - no database, no clock - so the
 * caller supplies `today` for the one advisory check (a backdated start date)
 * exactly the way mou-rules.ts's deriveStatus takes `today` as an argument
 * rather than reading the system clock itself.
 *
 * The 16 fixed charges are input as a string-keyed map rather than 16 named
 * fields, because the set is a data-driven catalogue (COMMERCIAL_ITEM_BY_KEY)
 * the UI must render from, not a fixed list this module should hardcode either.
 */

import { COMMERCIAL_FIXED_ITEM_KEYS } from "./commercial-items.ts";
import { COMMERCIAL_BASES, COMMERCIAL_PERIODS, TENURE_UNITS } from "./enums.ts";
import { validateAmountString } from "./money.ts";

const MAX_BACKDATE_DAYS = 365;
const MAX_TENURE_MONTHS = 120;
const MAX_TENURE_YEARS = 10;
const MAX_LABEL_LENGTH = 100;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface OtherChargeRow {
  readonly label: string;
  readonly amount: string;
  readonly itemType: string;
}

/** SPEC-16 D108: the optional period and basis codes a fixed charge may carry. */
export interface ChargeMeta {
  readonly period?: string;
  readonly basis?: string;
}

export interface ChargeMetaErrors {
  readonly period?: string;
  readonly basis?: string;
}

/** The 22 Page 2 fields of SPEC-05 section 2, in diagram order. */
export interface CommercialDetails {
  readonly mouStartDate: string;
  readonly tenureValue: string;
  readonly tenureUnit: string;
  readonly attendanceCycle: string;
  readonly stipendDate: string;
  /** Keyed by the 16 fixed CommercialItemKeys; blank means "not applicable". */
  readonly charges: Readonly<Record<string, string>>;
  readonly otherItems: readonly OtherChargeRow[];
  /**
   * Optional, keyed like `charges`. Absent or blank means "no period/basis" -
   * payloads written before this field existed stay valid unchanged.
   */
  readonly chargeMeta?: Readonly<Record<string, ChargeMeta>>;
  /** Whether a PDF has been accepted by the upload endpoint for this draft. */
  readonly hasMouDocument: boolean;
}

export interface OtherChargeRowErrors {
  readonly label?: string;
  readonly amount?: string;
  readonly itemType?: string;
}

export interface CommercialDetailErrors {
  readonly mouStartDate?: string;
  readonly tenureValue?: string;
  readonly tenureUnit?: string;
  readonly attendanceCycle?: string;
  readonly stipendDate?: string;
  readonly mouDocument?: string;
  readonly charges?: Readonly<Record<string, string>>;
  readonly chargeMeta?: Readonly<Record<string, ChargeMetaErrors>>;
  /** Parallel to the input otherItems array; an all-blank row has no entry. */
  readonly otherItems?: readonly (OtherChargeRowErrors | undefined)[];
}

export interface CommercialDetailWarnings {
  readonly mouStartDate?: string;
}

export interface CommercialDetailValidation {
  readonly errors: CommercialDetailErrors;
  readonly warnings: CommercialDetailWarnings;
}

/** True for a well-formed, real ("2026-02-30" fails) ISO calendar date. */
function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function daysBetween(earlier: string, later: string): number {
  const a = new Date(`${earlier}T00:00:00Z`).getTime();
  const b = new Date(`${later}T00:00:00Z`).getTime();
  return Math.round((b - a) / MS_PER_DAY);
}

/** A positive integer written with digits only - no sign, no decimal point. */
function parsePositiveInteger(value: string): number | undefined {
  if (!/^[0-9]+$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return parsed > 0 ? parsed : undefined;
}

function isBlankRow(row: OtherChargeRow): boolean {
  return row.label.trim() === "" && row.amount.trim() === "" && row.itemType.trim() === "";
}

function validateOtherRow(row: OtherChargeRow): OtherChargeRowErrors | undefined {
  if (isBlankRow(row)) {
    // AC7: a fully empty row is ignored, not an error.
    return undefined;
  }

  const errors: { label?: string; amount?: string; itemType?: string } = {};
  const label = row.label.trim();
  const amount = row.amount.trim();
  const itemType = row.itemType.trim();

  // AC7: any one field filled makes all three required.
  if (label === "") {
    errors.label = "Required";
  } else if (label.length > MAX_LABEL_LENGTH) {
    errors.label = `Enter at most ${MAX_LABEL_LENGTH} characters`;
  }
  if (amount === "") {
    errors.amount = "Required";
  } else {
    const amountError = validateAmountString(amount);
    if (amountError !== undefined) {
      errors.amount = amountError;
    }
  }
  if (itemType === "") {
    errors.itemType = "Choose Allowance or Deduction";
  }

  return Object.keys(errors).length > 0 ? errors : undefined;
}

/**
 * The repeatable "Other" row rule shared by SPEC-05 (commercial charges) and
 * SPEC-06 (payroll items, section 3.3: "a repeatable block like SPEC-05
 * §2.3") - a fully blank row is ignored, a partially filled one requires all
 * three sub-fields, and a label used by more than one row is rejected on
 * every row that shares it, not just the second occurrence.
 */
export function validateOtherChargeRows(
  rows: readonly OtherChargeRow[],
): readonly (OtherChargeRowErrors | undefined)[] {
  const rowErrors = rows.map((row) => validateOtherRow(row));

  const labelIndices = new Map<string, number[]>();
  rows.forEach((row, index) => {
    const label = row.label.trim().toLowerCase();
    if (label === "") {
      return;
    }
    const indices = labelIndices.get(label) ?? [];
    indices.push(index);
    labelIndices.set(label, indices);
  });
  for (const indices of labelIndices.values()) {
    if (indices.length < 2) {
      continue;
    }
    for (const index of indices) {
      const existing = rowErrors[index] ?? {};
      rowErrors[index] = { ...existing, label: "This label is used by another row" };
    }
  }

  return rowErrors;
}

/** A blank code is "not given"; a present one must be a known COMMERCIAL_PERIODS / COMMERCIAL_BASES value. */
function validateChargeMeta(chargeMeta: Readonly<Record<string, ChargeMeta>>): Record<string, ChargeMetaErrors> {
  const fixedKeys: readonly string[] = COMMERCIAL_FIXED_ITEM_KEYS;
  const periods: readonly string[] = COMMERCIAL_PERIODS;
  const bases: readonly string[] = COMMERCIAL_BASES;
  const result: Record<string, ChargeMetaErrors> = {};
  for (const [key, meta] of Object.entries(chargeMeta)) {
    if (!fixedKeys.includes(key)) {
      result[key] = { period: "Unknown charge" };
      continue;
    }
    const keyErrors: { period?: string; basis?: string } = {};
    const period = (meta.period ?? "").trim();
    if (period !== "" && !periods.includes(period)) {
      keyErrors.period = "Choose a period from the list";
    }
    const basis = (meta.basis ?? "").trim();
    if (basis !== "" && !bases.includes(basis)) {
      keyErrors.basis = "Choose a basis from the list";
    }
    if (Object.keys(keyErrors).length > 0) {
      result[key] = keyErrors;
    }
  }
  return result;
}

export function validateCommercialDetails(
  input: Partial<CommercialDetails>,
  today: string,
): CommercialDetailValidation {
  const errors: {
    mouStartDate?: string;
    tenureValue?: string;
    tenureUnit?: string;
    attendanceCycle?: string;
    stipendDate?: string;
    mouDocument?: string;
    charges?: Record<string, string>;
    chargeMeta?: Record<string, ChargeMetaErrors>;
    otherItems?: readonly (OtherChargeRowErrors | undefined)[];
  } = {};
  const warnings: { mouStartDate?: string } = {};

  // --- MOU Start Date --------------------------------------------------------
  const mouStartDate = (input.mouStartDate ?? "").trim();
  if (mouStartDate === "") {
    errors.mouStartDate = "Required";
  } else if (!isValidIsoDate(mouStartDate)) {
    errors.mouStartDate = "Enter a valid date";
  } else if (daysBetween(mouStartDate, today) > MAX_BACKDATE_DAYS) {
    warnings.mouStartDate = "This start date is more than a year in the past";
  }

  // --- Tenure ------------------------------------------------------------------
  const tenureUnit = (input.tenureUnit ?? "").trim();
  if (tenureUnit === "") {
    errors.tenureUnit = "Required";
  } else if (!TENURE_UNITS.includes(tenureUnit as (typeof TENURE_UNITS)[number])) {
    errors.tenureUnit = "Choose Months or Years";
  }

  const tenureValueRaw = (input.tenureValue ?? "").trim();
  if (tenureValueRaw === "") {
    errors.tenureValue = "Required";
  } else {
    const tenureValue = parsePositiveInteger(tenureValueRaw);
    if (tenureValue === undefined) {
      errors.tenureValue = "Enter a positive whole number";
    } else if (tenureUnit === "MONTHS" && (tenureValue < 1 || tenureValue > MAX_TENURE_MONTHS)) {
      errors.tenureValue = `Enter a value between 1 and ${MAX_TENURE_MONTHS} for Months`;
    } else if (tenureUnit === "YEARS" && (tenureValue < 1 || tenureValue > MAX_TENURE_YEARS)) {
      errors.tenureValue = `Enter a value between 1 and ${MAX_TENURE_YEARS} for Years`;
    }
  }

  // --- Attendance cycle / Stipend date ------------------------------------------
  if ((input.attendanceCycle ?? "").trim() === "") {
    errors.attendanceCycle = "Required";
  }

  const stipendDateRaw = (input.stipendDate ?? "").trim();
  if (stipendDateRaw === "") {
    errors.stipendDate = "Required";
  } else {
    const stipendDate = parsePositiveInteger(stipendDateRaw);
    if (stipendDate === undefined || stipendDate > 31) {
      errors.stipendDate = "Enter a day of month between 1 and 31";
    }
  }

  // --- The 16 fixed charges -----------------------------------------------------
  const charges = input.charges ?? {};
  const chargeErrors: Record<string, string> = {};
  for (const key of COMMERCIAL_FIXED_ITEM_KEYS) {
    const raw = (charges[key] ?? "").trim();
    if (raw === "") {
      continue;
    }
    const amountError = validateAmountString(raw);
    if (amountError !== undefined) {
      chargeErrors[key] = amountError;
    }
  }
  if (Object.keys(chargeErrors).length > 0) {
    errors.charges = chargeErrors;
  }

  // --- Per-charge period / basis (SPEC-16 D108) -----------------------------------
  const chargeMetaErrors = validateChargeMeta(input.chargeMeta ?? {});
  if (Object.keys(chargeMetaErrors).length > 0) {
    errors.chargeMeta = chargeMetaErrors;
  }

  // --- "Other" rows --------------------------------------------------------------
  // AC8: duplicate labels (case-insensitive, trimmed) are rejected on every row
  // that shares one, not just the second occurrence.
  const otherItems = input.otherItems ?? [];
  const otherItemErrors = validateOtherChargeRows(otherItems);
  if (otherItemErrors.some((rowErrors) => rowErrors !== undefined)) {
    errors.otherItems = otherItemErrors;
  }

  // --- MOU PDF --------------------------------------------------------------------
  if (input.hasMouDocument !== true) {
    errors.mouDocument = "Upload the signed MOU PDF";
  }

  return { errors, warnings };
}
