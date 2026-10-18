/**
 * Purpose: The SPEC-06 Page 3 payroll-detail rules, the last of the wizard's
 * three page-validation modules and modeled directly on
 * commercial-details-validation.ts. Section 3.3 says the "Other" row is "a
 * repeatable block like SPEC-05 section 2.3", so this module reuses
 * validateOtherChargeRows() rather than re-deriving the same all-or-nothing
 * plus duplicate-label rule a second time.
 *
 * The 22 fixed items are input as a string-keyed map of yes/no answers, not 22
 * named fields, for the same reason Page 2's 16 charges are a map: the set is
 * the data-driven PAYROLL_ITEM_BY_KEY catalogue the UI renders from, not a
 * fixed list this module should hardcode.
 */

import {
  type OtherChargeRow,
  type OtherChargeRowErrors,
  validateOtherChargeRows,
} from "./commercial-details-validation.ts";
import { SCHEMES } from "./enums.ts";
import { PAYROLL_FIXED_ITEM_KEYS } from "./payroll-items.ts";
import { validateAmountString } from "./money.ts";

const MAX_CATEGORY_LENGTH = 100;
const MAX_QUALIFICATION_LENGTH = 150;

/** isApplicable undefined means "not yet answered" - distinct from an explicit No. */
export interface PayrollItemAnswer {
  readonly isApplicable: boolean | undefined;
  readonly amount: string;
}

/**
 * SPEC-16 D107: the optional descriptive fields of one trainee category card,
 * matched to a `traineeCategories` entry by name (case-insensitive).
 */
export interface TraineeCategoryDetail {
  readonly categoryName: string;
  readonly qualification?: string;
  readonly stipendRate?: string;
}

export interface TraineeCategoryDetailErrors {
  readonly categoryName?: string;
  readonly qualification?: string;
  readonly stipendRate?: string;
}

/** The SPEC-06 section 3 fields: scheme, trainee categories, and the 23 payroll items. */
export interface PayrollDetails {
  readonly scheme: string;
  readonly traineeCategories: readonly string[];
  /** Optional; absent keeps payloads written before SPEC-16 D107 valid unchanged. */
  readonly traineeCategoryDetails?: readonly TraineeCategoryDetail[];
  /** Keyed by the 22 fixed PayrollItemKeys. */
  readonly items: Readonly<Record<string, PayrollItemAnswer>>;
  readonly otherItems: readonly OtherChargeRow[];
}

export interface PayrollDetailErrors {
  readonly scheme?: string;
  /** Set when there are zero trainee categories (AC5). */
  readonly traineeCategories?: string;
  /** Parallel to the input traineeCategories array. */
  readonly traineeCategoryRows?: readonly (string | undefined)[];
  /** Parallel to the input traineeCategoryDetails array. */
  readonly traineeCategoryDetails?: readonly (TraineeCategoryDetailErrors | undefined)[];
  readonly items?: Readonly<Record<string, string>>;
  readonly otherItems?: readonly (OtherChargeRowErrors | undefined)[];
}

export interface PayrollDetailValidation {
  readonly errors: PayrollDetailErrors;
}

function validateCategoryRows(categories: readonly string[]): (string | undefined)[] {
  const rowErrors = categories.map((category): string | undefined => {
    const trimmed = category.trim();
    if (trimmed === "") {
      return "Required";
    }
    if (trimmed.length > MAX_CATEGORY_LENGTH) {
      return `Enter at most ${MAX_CATEGORY_LENGTH} characters`;
    }
    return undefined;
  });

  // AC6: duplicate category names (case-insensitive, trimmed) are rejected on
  // every row that shares one, not just the second occurrence.
  const nameIndices = new Map<string, number[]>();
  categories.forEach((category, index) => {
    const name = category.trim().toLowerCase();
    if (name === "") {
      return;
    }
    const indices = nameIndices.get(name) ?? [];
    indices.push(index);
    nameIndices.set(name, indices);
  });
  for (const indices of nameIndices.values()) {
    if (indices.length < 2) {
      continue;
    }
    for (const index of indices) {
      if (rowErrors[index] === undefined) {
        rowErrors[index] = "This name is used by another category";
      }
    }
  }

  return rowErrors;
}

function validateCategoryDetails(
  details: readonly TraineeCategoryDetail[],
  categories: readonly string[],
): (TraineeCategoryDetailErrors | undefined)[] {
  const names = new Set(categories.map((category) => category.trim().toLowerCase()));
  return details.map((detail) => {
    const rowErrors: { categoryName?: string; qualification?: string; stipendRate?: string } = {};
    if (!names.has(detail.categoryName.trim().toLowerCase())) {
      rowErrors.categoryName = "Not one of the trainee categories";
    }
    if ((detail.qualification ?? "").trim().length > MAX_QUALIFICATION_LENGTH) {
      rowErrors.qualification = `Enter at most ${MAX_QUALIFICATION_LENGTH} characters`;
    }
    const stipendRate = (detail.stipendRate ?? "").trim();
    if (stipendRate !== "") {
      const amountError = validateAmountString(stipendRate);
      if (amountError !== undefined) {
        rowErrors.stipendRate = amountError;
      }
    }
    return Object.keys(rowErrors).length > 0 ? rowErrors : undefined;
  });
}

export function validatePayrollDetails(input: Partial<PayrollDetails>): PayrollDetailValidation {
  const errors: {
    scheme?: string;
    traineeCategories?: string;
    traineeCategoryRows?: readonly (string | undefined)[];
    traineeCategoryDetails?: readonly (TraineeCategoryDetailErrors | undefined)[];
    items?: Record<string, string>;
    otherItems?: readonly (OtherChargeRowErrors | undefined)[];
  } = {};

  // --- Scheme ------------------------------------------------------------------
  const scheme = (input.scheme ?? "").trim();
  if (scheme === "") {
    errors.scheme = "Required";
  } else if (!SCHEMES.includes(scheme as (typeof SCHEMES)[number])) {
    errors.scheme = "Choose a scheme from the list";
  }

  // --- Trainee categories --------------------------------------------------------
  const traineeCategories = input.traineeCategories ?? [];
  if (traineeCategories.length === 0) {
    errors.traineeCategories = "Add at least one trainee category";
  } else {
    const categoryRowErrors = validateCategoryRows(traineeCategories);
    if (categoryRowErrors.some((rowError) => rowError !== undefined)) {
      errors.traineeCategoryRows = categoryRowErrors;
    }
  }

  const categoryDetailErrors = validateCategoryDetails(input.traineeCategoryDetails ?? [], traineeCategories);
  if (categoryDetailErrors.some((rowErrors) => rowErrors !== undefined)) {
    errors.traineeCategoryDetails = categoryDetailErrors;
  }

  // --- The 22 fixed payroll items --------------------------------------------------
  const items = input.items ?? {};
  const itemErrors: Record<string, string> = {};
  for (const key of PAYROLL_FIXED_ITEM_KEYS) {
    const answer = items[key];
    if (answer === undefined || answer.isApplicable === undefined) {
      // AC2: every one of the 22 items must have an explicit Yes or No.
      itemErrors[key] = "Answer Yes or No";
      continue;
    }
    if (!answer.isApplicable) {
      // AC4: No means the amount box is hidden; whatever is in it is ignored.
      continue;
    }
    const amount = answer.amount.trim();
    if (amount === "") {
      itemErrors[key] = "Required";
      continue;
    }
    const amountError = validateAmountString(amount);
    if (amountError !== undefined) {
      itemErrors[key] = amountError;
    }
  }
  if (Object.keys(itemErrors).length > 0) {
    errors.items = itemErrors;
  }

  // --- "Other" rows ----------------------------------------------------------------
  const otherItems = input.otherItems ?? [];
  const otherItemErrors = validateOtherChargeRows(otherItems);
  if (otherItemErrors.some((rowErrors) => rowErrors !== undefined)) {
    errors.otherItems = otherItemErrors;
  }

  return { errors };
}
