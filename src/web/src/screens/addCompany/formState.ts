/**
 * Purpose: The wizard's typed form state and its two-way mapping to the draft API
 * payload {page1, page2, page3}. The screen keeps row lists (charge rows, trainee
 * category cards, "Other" payroll rows) because that is what the Figma steps edit;
 * toDraftPayload() folds them into the API's keyed maps (charges + chargeMeta,
 * traineeCategories + traineeCategoryDetails) and fromDraftPayload() rebuilds them.
 */

import type { CommercialDetails, CompanyDetails, PayrollDetails } from "@mou/domain";

import type { Draft, EnumsResponse, MouDocumentMeta, ZoneOption } from "../../api/client.ts";

/** Page 1 plus the Figma fields that live on step 1: sector, purchase contact and the scheme. */
export interface CompanyForm extends CompanyDetails {
  readonly sector: string;
  readonly purchaseName: string;
  readonly purchaseNumber: string;
  readonly purchaseEmail: string;
  /** Checked in the browser only; never stored. */
  readonly purchaseEmailConfirm: string;
  /** Shown on step 1 as in the design, stored as page3.scheme. */
  readonly scheme: string;
}

export interface CommercialForm {
  readonly mouStartDate: string;
  readonly tenureValue: string;
  readonly tenureUnit: string;
  /** The readable cycle label, e.g. "16th to 15th" - mou.attendance_cycle is free text. */
  readonly attendanceCycle: string;
  readonly stipendDate: string;
  readonly mouDocument: MouDocumentMeta | undefined;
}

/** "OTHER" as the head marks a custom-labelled charge; any other non-blank head is a fixed commercial key. */
export const OTHER_HEAD = "OTHER";

export interface ChargeRow {
  readonly id: number;
  readonly head: string;
  readonly amount: string;
  readonly period: string;
  readonly basis: string;
  /** Only for an OTHER row. */
  readonly label: string;
  /** Only for an OTHER row: ALLOWANCE or DEDUCTION. */
  readonly itemType: string;
}

export interface CategoryCard {
  readonly id: number;
  readonly name: string;
  readonly qualification: string;
  readonly stipendRate: string;
}

export interface PayrollAnswer {
  readonly isApplicable: boolean | undefined;
  readonly amount: string;
}

export interface OtherRow {
  readonly id: number;
  readonly label: string;
  readonly amount: string;
  readonly itemType: string;
}

export interface WizardForm {
  readonly company: CompanyForm;
  readonly commercial: CommercialForm;
  readonly charges: readonly ChargeRow[];
  readonly categories: readonly CategoryCard[];
  readonly payrollItems: Readonly<Record<string, PayrollAnswer>>;
  readonly payrollOther: readonly OtherRow[];
}

/** Every option list the steps render, all from GET /api/enums and /api/zones. */
export interface WizardReference {
  readonly enums: EnumsResponse;
  readonly zones: readonly ZoneOption[];
}

export const NO_REFERENCE: WizardReference = {
  enums: {
    companyTypes: [],
    registrationTypes: [],
    contactTypes: [],
    itemTypes: [],
    schemes: [],
    commercialItems: [],
    payrollItems: [],
    sectors: [],
    commercialPeriods: [],
    commercialBases: [],
    tenureUnits: [],
  },
  zones: [],
};

let lastRowId = 0;

/** A fresh React key for a new row; rows are never persisted with it. */
export function newRowId(): number {
  lastRowId += 1;
  return lastRowId;
}

export function blankChargeRow(): ChargeRow {
  return { id: newRowId(), head: "", amount: "", period: "", basis: "", label: "", itemType: "" };
}

export function blankCategory(): CategoryCard {
  return { id: newRowId(), name: "", qualification: "", stipendRate: "" };
}

export function blankOtherRow(): OtherRow {
  return { id: newRowId(), label: "", amount: "", itemType: "" };
}

const EMPTY_COMPANY: CompanyForm = {
  companyType: "",
  companyName: "",
  registrationType: "",
  tanNumber: "",
  gstNumber: "",
  zoneId: "",
  plantName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  pinCode: "",
  state: "",
  district: "",
  hrContactName: "",
  financeHeadContactName: "",
  contactType: "MOBILE",
  hrContactNumber: "",
  financeHeadContactNumber: "",
  officialEmail: "",
  confirmEmail: "",
  sector: "",
  purchaseName: "",
  purchaseNumber: "",
  purchaseEmail: "",
  purchaseEmailConfirm: "",
  scheme: "",
};

const EMPTY_COMMERCIAL: CommercialForm = {
  mouStartDate: "",
  tenureValue: "",
  tenureUnit: "MONTHS",
  attendanceCycle: "",
  stipendDate: "",
  mouDocument: undefined,
};

export function emptyForm(): WizardForm {
  return {
    company: EMPTY_COMPANY,
    commercial: EMPTY_COMMERCIAL,
    charges: [blankChargeRow()],
    categories: [blankCategory()],
    payrollItems: {},
    payrollOther: [],
  };
}

const isBlank = (value: string): boolean => value.trim() === "";

/** A charge row nobody has touched - ignored rather than reported. */
export function isBlankChargeRow(row: ChargeRow): boolean {
  return [row.head, row.amount, row.period, row.basis, row.label, row.itemType].every(isBlank);
}

/** The cards whose name is filled, with their position - traineeCategoryDetails is built from these. */
export function namedCategories(categories: readonly CategoryCard[]): readonly CategoryCard[] {
  return categories.filter((card) => !isBlank(card.name));
}

export function toPage1(company: CompanyForm): Record<string, string> {
  // purchaseEmailConfirm is a browser-only check and scheme belongs to page 3.
  const page1: Record<string, string> = { ...company };
  delete page1["purchaseEmailConfirm"];
  delete page1["scheme"];
  return page1;
}

/** Page 2 as stored: the commercial fields plus the uploaded PDF's metadata. */
export interface Page2Payload extends Omit<CommercialDetails, "hasMouDocument"> {
  readonly mouDocument: MouDocumentMeta | undefined;
}

export function toPage2(form: WizardForm): Page2Payload {
  const charges: Record<string, string> = {};
  const chargeMeta: Record<string, { period: string; basis: string }> = {};
  const otherItems: { label: string; amount: string; itemType: string }[] = [];
  for (const row of form.charges) {
    if (row.head === OTHER_HEAD) {
      otherItems.push({ label: row.label, amount: row.amount, itemType: row.itemType });
    } else if (row.head !== "") {
      charges[row.head] = row.amount;
      if (!isBlank(row.period) || !isBlank(row.basis)) {
        chargeMeta[row.head] = { period: row.period, basis: row.basis };
      }
    }
  }
  return { ...form.commercial, charges, chargeMeta, otherItems };
}

export function toPage3(form: WizardForm): PayrollDetails {
  return {
    scheme: form.company.scheme,
    traineeCategories: form.categories.map((card) => card.name),
    traineeCategoryDetails: namedCategories(form.categories).map((card) => ({
      categoryName: card.name,
      qualification: card.qualification,
      stipendRate: card.stipendRate,
    })),
    items: form.payrollItems,
    otherItems: form.payrollOther.map(({ label, amount, itemType }) => ({ label, amount, itemType })),
  };
}

export function toDraftPayload(form: WizardForm): Draft["payload"] {
  return { page1: toPage1(form.company), page2: { ...toPage2(form) }, page3: { ...toPage3(form) } };
}

// ---------------------------------------------------------------------------
// Rebuilding the form from a saved draft
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function otherRowsFrom(value: unknown): OtherRow[] {
  return asArray(value).map((entry) => {
    const row = asRecord(entry);
    return { id: newRowId(), label: text(row, "label"), amount: text(row, "amount"), itemType: text(row, "itemType") };
  });
}

/**
 * `commercialOrder` lists the fixed commercial keys in catalogue order, so resumed
 * fixed charges come back in the order the head dropdown lists them.
 */
export function fromDraftPayload(payload: Draft["payload"], commercialOrder: readonly string[]): WizardForm {
  const page1 = asRecord(payload.page1);
  const page2 = asRecord(payload.page2);
  const page3 = asRecord(payload.page3);

  const company = Object.fromEntries(
    Object.keys(EMPTY_COMPANY).map((key) => [key, text(page1, key)]),
  ) as unknown as Record<keyof CompanyForm, string>;
  const purchaseEmail = text(page1, "purchaseEmail");

  const charges = asRecord(page2["charges"]);
  const chargeMeta = asRecord(page2["chargeMeta"]);
  const fixedKeys = [...new Set([...Object.keys(charges), ...Object.keys(chargeMeta)])].sort(
    (a, b) => commercialOrder.indexOf(a) - commercialOrder.indexOf(b),
  );
  const chargeRows: ChargeRow[] = [
    ...fixedKeys
      .filter((key) => !isBlank(text(charges, key)) || Object.keys(asRecord(chargeMeta[key])).length > 0)
      .map((key) => {
        const meta = asRecord(chargeMeta[key]);
        return {
          ...blankChargeRow(),
          head: key,
          amount: text(charges, key),
          period: text(meta, "period"),
          basis: text(meta, "basis"),
        };
      }),
    ...otherRowsFrom(page2["otherItems"]).map((row) => ({ ...blankChargeRow(), ...row, head: OTHER_HEAD })),
  ];

  const mouDocument = asRecord(page2["mouDocument"]);
  const details = asArray(page3["traineeCategoryDetails"]).map(asRecord);
  const detailFor = (name: string): Record<string, unknown> =>
    details.find((detail) => text(detail, "categoryName").trim().toLowerCase() === name.trim().toLowerCase()) ?? {};
  const categories: CategoryCard[] = asArray(page3["traineeCategories"]).map((entry) => {
    const name = typeof entry === "string" ? entry : "";
    const detail = detailFor(name);
    return { id: newRowId(), name, qualification: text(detail, "qualification"), stipendRate: text(detail, "stipendRate") };
  });

  const payrollItems: Record<string, PayrollAnswer> = {};
  for (const [key, value] of Object.entries(asRecord(page3["items"]))) {
    const answer = asRecord(value);
    const isApplicable = answer["isApplicable"];
    payrollItems[key] = {
      isApplicable: typeof isApplicable === "boolean" ? isApplicable : undefined,
      amount: text(answer, "amount"),
    };
  }

  return {
    company: {
      ...company,
      contactType: company.contactType === "" ? EMPTY_COMPANY.contactType : company.contactType,
      purchaseEmailConfirm: purchaseEmail,
      scheme: text(page3, "scheme"),
    },
    commercial: {
      mouStartDate: text(page2, "mouStartDate"),
      tenureValue: text(page2, "tenureValue"),
      tenureUnit: text(page2, "tenureUnit") === "" ? EMPTY_COMMERCIAL.tenureUnit : text(page2, "tenureUnit"),
      attendanceCycle: text(page2, "attendanceCycle"),
      stipendDate: text(page2, "stipendDate"),
      mouDocument:
        text(mouDocument, "originalFilename") === ""
          ? undefined
          : { originalFilename: text(mouDocument, "originalFilename"), fileSizeBytes: Number(mouDocument["fileSizeBytes"] ?? 0) },
    },
    charges: chargeRows.length > 0 ? chargeRows : [blankChargeRow()],
    categories: categories.length > 0 ? categories : [blankCategory()],
    payrollItems,
    payrollOther: otherRowsFrom(page3["otherItems"]),
  };
}
