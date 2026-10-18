/**
 * Purpose: Per-step error maps for the Add New Company wizard. Each step runs the
 * same @mou/domain validator the API runs on final save (company, commercial,
 * payroll details) over the draft payload, then maps the payload-keyed errors back
 * onto the rows the screen shows - a charge key to its charge row, the n-th Other
 * item to the n-th Other row - plus the few browser-only rules (sector, scheme,
 * purchase email, a charge row without a head) the design adds.
 */

import { validateCommercialDetails, validateCompanyDetails, validatePayrollDetails } from "@mou/domain";

import { todayIso } from "../../ui/format.ts";
import type { CompanyForm, WizardForm } from "./formState.ts";
import { OTHER_HEAD, isBlankChargeRow, namedCategories, toPage1, toPage2, toPage3 } from "./formState.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CompanyErrors = Partial<Record<keyof CompanyForm, string>>;

export interface CompanyValidation {
  readonly errors: CompanyErrors;
  readonly warnings: CompanyErrors;
}

export function validateCompanyStep(company: CompanyForm): CompanyValidation {
  const { errors, warnings } = validateCompanyDetails(toPage1(company));
  const all: { -readonly [K in keyof CompanyForm]?: string } = { ...errors };
  if (company.scheme === "") all.scheme = "Choose a scheme";
  if (company.sector === "") all.sector = "Choose a sector";
  const purchaseEmail = company.purchaseEmail.trim();
  if (purchaseEmail !== "" && !EMAIL_PATTERN.test(purchaseEmail)) {
    all.purchaseEmail = "Enter a valid email address";
  } else if (purchaseEmail.toLowerCase() !== company.purchaseEmailConfirm.trim().toLowerCase()) {
    all.purchaseEmailConfirm = "Does not match the purchase email";
  }
  return { errors: all, warnings };
}

export type ChargeRowErrors = Partial<Record<"head" | "amount" | "period" | "basis" | "label" | "itemType", string>>;

export interface CommercialValidation {
  readonly fields: Partial<
    Record<"mouStartDate" | "tenureValue" | "tenureUnit" | "attendanceCycle" | "stipendDate" | "mouDocument", string>
  >;
  /** Keyed by charge row id. */
  readonly rows: Readonly<Record<number, ChargeRowErrors>>;
  readonly startDateWarning: string | undefined;
}

export function validateCommercialStep(form: WizardForm): CommercialValidation {
  const page2 = toPage2(form);
  const { errors, warnings } = validateCommercialDetails(
    { ...page2, hasMouDocument: form.commercial.mouDocument !== undefined },
    todayIso(),
  );
  const rows: Record<number, ChargeRowErrors> = {};
  const add = (id: number, patch: ChargeRowErrors): void => {
    rows[id] = { ...rows[id], ...patch };
  };

  const otherRows = form.charges.filter((row) => row.head === OTHER_HEAD);
  for (const row of form.charges) {
    if (isBlankChargeRow(row)) continue;
    if (row.head === "") {
      add(row.id, { head: "Choose a charge head" });
    } else if (row.head !== OTHER_HEAD) {
      // A fixed head with no amount would silently drop the row on save.
      const amountError = row.amount.trim() === "" ? "Required" : errors.charges?.[row.head];
      if (amountError !== undefined) add(row.id, { amount: amountError });
      const meta = errors.chargeMeta?.[row.head];
      if (meta !== undefined) add(row.id, { ...meta });
    }
  }
  otherRows.forEach((row, index) => {
    const rowErrors = errors.otherItems?.[index];
    if (rowErrors !== undefined) add(row.id, { ...rowErrors });
  });

  return {
    fields: {
      mouStartDate: errors.mouStartDate,
      tenureValue: errors.tenureValue,
      tenureUnit: errors.tenureUnit,
      attendanceCycle: errors.attendanceCycle,
      stipendDate: errors.stipendDate,
      mouDocument: errors.mouDocument,
    },
    rows,
    startDateWarning: warnings.mouStartDate,
  };
}

export type CategoryErrors = Partial<Record<"name" | "qualification" | "stipendRate", string>>;
export type OtherRowErrors = Partial<Record<"label" | "amount" | "itemType", string>>;

export interface PayrollValidation {
  readonly categories: string | undefined;
  /** Keyed by category card id. */
  readonly cards: Readonly<Record<number, CategoryErrors>>;
  /** Keyed by fixed payroll item key. */
  readonly items: Readonly<Record<string, string>>;
  /** Keyed by Other row id. */
  readonly other: Readonly<Record<number, OtherRowErrors>>;
}

export function validatePayrollStep(form: WizardForm): PayrollValidation {
  const { errors } = validatePayrollDetails(toPage3(form));
  const cards: Record<number, CategoryErrors> = {};
  form.categories.forEach((card, index) => {
    const nameError = errors.traineeCategoryRows?.[index];
    if (nameError !== undefined) cards[card.id] = { name: nameError };
  });
  namedCategories(form.categories).forEach((card, index) => {
    const detail = errors.traineeCategoryDetails?.[index];
    if (detail !== undefined) {
      cards[card.id] = { ...cards[card.id], qualification: detail.qualification, stipendRate: detail.stipendRate };
    }
  });
  const other: Record<number, OtherRowErrors> = {};
  form.payrollOther.forEach((row, index) => {
    const rowErrors = errors.otherItems?.[index];
    if (rowErrors !== undefined) other[row.id] = { ...rowErrors };
  });
  return { categories: errors.traineeCategories, cards, items: errors.items ?? {}, other };
}

/** Appended to TextInput's classes so an invalid field's border turns red. */
export function invalidBorder(message: string | undefined): string {
  return message === undefined ? "" : "border-red-400!";
}

/** True when any value in a (possibly nested) error map is a message. */
export function hasErrors(value: unknown): boolean {
  if (typeof value === "string") return true;
  if (typeof value === "object" && value !== null) return Object.values(value).some(hasErrors);
  return false;
}
