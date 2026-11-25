/**
 * Purpose: Per-step error maps for the Add New Company wizard. Each step runs the
 * same @mou/domain validator the API runs on final save (company, commercial,
 * payroll details) over the draft payload, then maps the payload-keyed errors back
 * onto the rows the screen shows - a charge key to its charge row, the n-th Other
 * item to the n-th Other row - plus the few browser-only rules (sector, scheme,
 * purchase email, a charge row without a head) the design adds. SPEC-34: the
 * YSF / YSI rules (validateOrganisationFields) on the scheme, fees and fee payer.
 */

import {
  validateCommercialDetails,
  validateCompanyDetails,
  validateOrganisationFields,
  validatePayrollDetails,
  withStatutoryDefaults,
} from "@mou/domain";

import { todayIso } from "../../ui/format.ts";
import type { CompanyForm, WizardForm } from "./formState.ts";
import { OTHER_HEAD, isBlankChargeRow, namedCategories, toPage1, toPage2, toPage3 } from "./formState.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CompanyErrors = Partial<Record<keyof CompanyForm, string>>;

export interface CompanyValidation {
  readonly errors: CompanyErrors;
  readonly warnings: CompanyErrors;
}

export function validateCompanyStep(company: CompanyForm, organisation = ""): CompanyValidation {
  const { errors, warnings } = validateCompanyDetails(toPage1(company));
  const all: { -readonly [K in keyof CompanyForm]?: string } = { ...errors };
  if (company.scheme === "") {
    all.scheme = "Choose a scheme";
  } else {
    const schemeError = validateOrganisationFields({ organisation, scheme: company.scheme, charges: {} }).scheme;
    if (schemeError !== undefined) all.scheme = schemeError;
  }
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
    Record<
      | "mouStartDate"
      | "tenureValue"
      | "attendanceCycle"
      | "stipendDate"
      | "mouDocument"
      | "signStatus"
      | "mailConfirmation"
      | "paymentTerm"
      | "remark"
      | "invoiceMatch"
      | "invoiceRemark",
      string
    >
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
  // SPEC-34: a YSI-only fee left on a YSF form (e.g. from a template) is flagged on its row.
  const organisationErrors = validateOrganisationFields({
    organisation: form.organisation,
    scheme: form.company.scheme,
    charges: page2.charges,
    otherItems: page2.otherItems,
  });
  for (const row of form.charges) {
    const message = organisationErrors.charges?.[row.head];
    if (message !== undefined) add(row.id, { head: message });
  }
  // SPEC-35: an Other row named like a YSI-only fee, on a YSF form.
  otherRows.forEach((row, index) => {
    const message = organisationErrors.otherItems?.[index];
    if (message !== undefined) add(row.id, { label: message });
  });

  return {
    fields: {
      mouStartDate: errors.mouStartDate,
      tenureValue: errors.tenureValue ?? errors.tenureUnit,
      attendanceCycle: errors.attendanceCycle,
      stipendDate: errors.stipendDate,
      mouDocument: errors.mouDocument,
      signStatus: errors.signStatus,
      mailConfirmation: errors.mailConfirmation,
      paymentTerm: errors.paymentTerm,
      remark: errors.remark,
      invoiceMatch: errors.invoiceMatch,
      invoiceRemark: errors.invoiceRemark,
    },
    rows,
    startDateWarning: warnings.mouStartDate,
  };
}

export type CategoryErrors = Partial<Record<"name" | "qualification" | "stipendRate", string>>;

export interface PayrollValidation {
  readonly categories: string | undefined;
  /** Keyed by category card id. */
  readonly cards: Readonly<Record<number, CategoryErrors>>;
  /** SPEC-31: the optional payroll terms. */
  readonly terms: Partial<Record<"leftTraineeAmount" | "leftTraineeNote" | "educationFeePayer", string>>;
}

export function validatePayrollStep(form: WizardForm): PayrollValidation {
  // D148 / D158: the wizard asks no payroll item; the server saves the PF / ESI / TDS defaults.
  const page3 = toPage3(form);
  const { errors } = validatePayrollDetails({ ...page3, items: withStatutoryDefaults(page3.items) });
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
  const organisationErrors = validateOrganisationFields({
    organisation: form.organisation,
    scheme: form.company.scheme,
    charges: {},
    educationFeePayer: form.payrollTerms.educationFeePayer,
  });
  return {
    categories: errors.traineeCategories,
    cards,
    terms: {
      leftTraineeAmount: errors.leftTraineeAmount,
      leftTraineeNote: errors.leftTraineeNote,
      educationFeePayer: errors.educationFeePayer ?? organisationErrors.educationFeePayer,
    },
  };
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
