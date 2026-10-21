/**
 * Purpose: The SPEC-22 bulk company sheet in one pure module. BULK_COMPANY_COLUMNS
 * is the single column list the Excel template, the PDF template and the upload
 * parser all use (D136). readBulkRow() turns one sheet row (cells keyed by column)
 * into the wizard's page payloads and runs the same three @mou/domain validators
 * the wizard runs, re-keying their errors onto sheet columns; findInFileDuplicates()
 * catches the same GST or company + plant + zone appearing twice in one file.
 * D152: the sheet has no PF / ESI / TDS column - every row gets the statutory
 * defaults (D148: PF 12%, ESI 0.75%, TDS As applicable), and such a column in an
 * older template is ignored. D159: the columns are the blank Add New Company form's
 * fields in its four sections - no payroll item, Contact Type or Tenure Unit
 * column; the tenure is months (D157) and the numbers need no type (D156).
 * D165: the fillable PDF form names its fields after the same columns (plus 5
 * charge and 5 trainee table rows); formFieldsToBulkRow turns a filled form into
 * the same cells, so a PDF row is checked by exactly the rules an Excel row is.
 */

import type { ChargeMeta, CommercialDetails } from "./commercial-details-validation.ts";
import { ATTENDANCE_CYCLES, validateCommercialDetails } from "./commercial-details-validation.ts";
import { COMMERCIAL_FIXED_ITEM_KEYS, COMMERCIAL_ITEM_BY_KEY } from "./commercial-items.ts";
import type { CompanyDetails } from "./company-details-validation.ts";
import { isGstNumber, validateCompanyDetails } from "./company-details-validation.ts";
import type { EnumOption } from "./enums.ts";
import {
  COMMERCIAL_BASIS_OPTIONS,
  COMMERCIAL_PERIOD_OPTIONS,
  COMPANY_TYPE_OPTIONS,
  REGISTRATION_TYPE_OPTIONS,
  SCHEME_OPTIONS,
  SECTOR_OPTIONS,
} from "./enums.ts";
import type { PayrollDetails, TraineeCategoryDetail } from "./payroll-details-validation.ts";
import { validatePayrollDetails, withStatutoryDefaults } from "./payroll-details-validation.ts";

/** The sheet the template writes and the upload reads. */
export const BULK_COMPANY_SHEET = "Companies";
/** D140: the most data rows one upload may carry. */
export const BULK_MAX_ROWS = 500;

/** D159: the four sections of the blank Add New Company form, in order. */
export const BULK_SECTIONS = ["Basic Information & Address", "Contact Information", "Commercial Details", "Payroll Details"] as const;

export type BulkSection = (typeof BULK_SECTIONS)[number];

/** A list column's dropdown; "zone" is filled with the uploader's zones at template time. */
export type BulkListName = "companyType" | "registrationType" | "sector" | "scheme" | "attendanceCycle" | "zone";

export interface BulkColumn {
  /** A CompanyDetails / CommercialDetails / PayrollDetails field, or `charge:<KEY>`. */
  readonly key: string;
  readonly header: string;
  readonly section: BulkSection;
  readonly required: boolean;
  /** What the cell accepts, printed in the PDF and the Instructions sheet. */
  readonly format: string;
  readonly list?: BulkListName;
}

const AMOUNT_FORMAT = "Amount, e.g. 1500.00; blank = not applicable";
const NUMBER_FORMAT = "10-digit mobile, or LAN number with STD code";

const column = (key: string, header: string, section: BulkSection, required: boolean, format: string, list?: BulkListName): BulkColumn =>
  list === undefined ? { key, header, section, required, format } : { key, header, section, required, format, list };

const field = (section: BulkSection) => (key: string, header: string, required: boolean, format: string, list?: BulkListName) =>
  column(key, header, section, required, format, list);
const basic = field("Basic Information & Address");
const contact = field("Contact Information");
const commercial = field("Commercial Details");

/** D159: the form's fields section by section, in its order. */
export const BULK_COMPANY_COLUMNS: readonly BulkColumn[] = [
  basic("scheme", "Scheme", true, "From the list", "scheme"),
  basic("zoneId", "Zone", true, "One of your zones (name or code)", "zone"),
  basic("sector", "Sector", true, "From the list", "sector"),
  basic("companyName", "Company Name", true, "2-150 characters"),
  basic("companyType", "Company Type", true, "From the list", "companyType"),
  basic("plantName", "Plant / Location", true, "2-100 characters"),
  basic("registrationType", "Registration Type", true, "From the list", "registrationType"),
  basic("gstNumber", "GST Number", true, "15 characters, upper case, e.g. 22AAAAA0000A1Z5"),
  basic("tanNumber", "TAN Number", true, "4 letters, 5 digits, 1 letter, e.g. ABCD12345E"),
  basic("addressLine1", "Address Line 1", true, "Street, building no."),
  basic("addressLine2", "Address Line 2", false, "Area, locality"),
  basic("city", "City", true, "Text"),
  basic("district", "District", true, "Text"),
  basic("pinCode", "PIN Code", true, "6 digits"),
  basic("state", "State", true, "Text"),
  contact("hrContactName", "HR Contact Name", true, "Full name"),
  contact("hrContactNumber", "HR Contact Number", true, NUMBER_FORMAT),
  contact("hrEmail", "HR Email ID", true, "Email address"),
  contact("financeHeadContactName", "Finance Head Name", true, "Full name"),
  contact("financeHeadContactNumber", "Finance Head Contact", true, NUMBER_FORMAT),
  contact("financeEmail", "Finance Email ID", true, "Email address"),
  contact("purchaseName", "Purchase Name", false, "Text"),
  contact("purchaseNumber", "Purchase Number", false, "Phone number"),
  contact("purchaseEmail", "Purchase Email ID", false, "Email address"),
  commercial("mouStartDate", "MoU Start Date", true, "Date: YYYY-MM-DD or DD-MM-YYYY"),
  commercial("tenureValue", "MoU Tenure (Months)", true, "Whole number of months, 1-120"),
  commercial("attendanceCycle", "Attendance Cycle", true, "From the list", "attendanceCycle"),
  commercial("stipendDate", "Stipend Date", true, "Day of month, 1-31"),
  ...COMMERCIAL_FIXED_ITEM_KEYS.map((key) => commercial(`charge:${key}`, COMMERCIAL_ITEM_BY_KEY[key].label, false, AMOUNT_FORMAT)),
  column("traineeCategories", "Trainee Categories", "Payroll Details", true, "Name | Qualification | Stipend Rate; ... (qualification and rate optional)"),
];

/** D154: how the templates mark a column - "Imp / Yes" when it must be filled, "No" when it may stay blank. */
export function bulkRequiredLabel(column: BulkColumn): string {
  return column.required ? "Imp / Yes" : "No";
}

const ATTENDANCE_CYCLE_OPTIONS: readonly EnumOption[] = ATTENDANCE_CYCLES.map((cycle) => ({ value: cycle, label: cycle }));

/** The fixed dropdown lists; "zone" is per uploader and not listed here. */
export const BULK_LIST_OPTIONS: Readonly<Record<Exclude<BulkListName, "zone">, readonly EnumOption[]>> = {
  companyType: COMPANY_TYPE_OPTIONS,
  registrationType: REGISTRATION_TYPE_OPTIONS,
  sector: SECTOR_OPTIONS,
  scheme: SCHEME_OPTIONS,
  attendanceCycle: ATTENDANCE_CYCLE_OPTIONS,
};

/** The steps shown on the Instructions sheet and in the PDF. */
export const BULK_INSTRUCTIONS: readonly string[] = [
  `Fill one row per company on the "${BULK_COMPANY_SHEET}" sheet, starting under the header row. Do not rename the headers.`,
  "Required columns must be filled. List columns accept the label shown in the dropdown (or its code).",
  "Commercial charge columns: enter the amount, or leave blank when not applicable.",
  "MoU Tenure is a whole number of months (e.g. 24 for two years).",
  "Trainee Categories: Name | Qualification | Stipend Rate, several separated by ; - e.g. ITI Fitter | ITI | 9000; Diploma",
  "The MoU PDF is not part of the sheet - attach it afterwards from Upload MoU.",
  `Upload at most ${BULK_MAX_ROWS} rows. If any row has an error nothing is saved; fix the listed cells and upload again.`,
];

const normalise = (value: string): string => value.trim().replace(/\s+/g, " ").toLowerCase();

export interface BulkHeaderMatch {
  /** Column key -> zero-based position in the header row. */
  readonly indexByKey: ReadonlyMap<string, number>;
  /** D161: template headers the sheet lacks - optional columns included. */
  readonly missing: readonly string[];
  /** D161: template headers the sheet has more than once. */
  readonly duplicated: readonly string[];
}

/**
 * D140: headers are matched by text, ignoring case and spacing, so column order is
 * free. D161: every template header must appear exactly once; a blank or unknown
 * header (a stray or note column) is ignored.
 */
export function matchBulkHeaders(headers: readonly string[]): BulkHeaderMatch {
  const positions = new Map<string, number[]>();
  headers.forEach((header, index) => {
    const name = normalise(header);
    if (name !== "") positions.set(name, [...(positions.get(name) ?? []), index]);
  });
  const indexByKey = new Map<string, number>();
  const missing: string[] = [];
  const duplicated: string[] = [];
  for (const entry of BULK_COMPANY_COLUMNS) {
    const found = positions.get(normalise(entry.header)) ?? [];
    if (found.length === 0) missing.push(entry.header);
    if (found.length > 1) duplicated.push(entry.header);
    if (found[0] !== undefined) indexByKey.set(entry.key, found[0]);
  }
  return { indexByKey, missing, duplicated };
}

export interface BulkZone {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

/** Page 1 plus the step-1 fields the wizard keeps outside CompanyDetails. */
export interface BulkCompanyRow {
  readonly company: CompanyDetails;
  readonly sector: string;
  readonly purchaseName: string;
  readonly purchaseNumber: string;
  readonly purchaseEmail: string;
  readonly commercial: CommercialDetails;
  readonly payroll: PayrollDetails;
}

export interface BulkCellError {
  readonly column: string;
  readonly message: string;
}

export interface BulkRowResult {
  /** Present only when the row has no errors. */
  readonly value?: BulkCompanyRow;
  readonly errors: readonly BulkCellError[];
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HEADER_BY_KEY = new Map(BULK_COMPANY_COLUMNS.map((entry) => [entry.key, entry.header]));
/** The sheet header of a column key - errors are reported under it. */
export const bulkColumnHeader = (key: string): string => HEADER_BY_KEY.get(key) ?? key;
const headerOf = bulkColumnHeader;

/** The zone a Zone cell names, by name or code in any case. */
export function findBulkZone(cell: string, zones: readonly BulkZone[]): BulkZone | undefined {
  const wanted = normalise(cell);
  return wanted === "" ? undefined : zones.find((zone) => normalise(zone.name) === wanted || normalise(zone.code) === wanted);
}

/** The option's code for a label or code typed in any case; undefined when nothing matches. */
function matchOption(raw: string, options: readonly EnumOption[]): string | undefined {
  const wanted = normalise(raw);
  return options.find((option) => normalise(option.value) === wanted || normalise(option.label) === wanted)?.value;
}

/** DD-MM-YYYY and DD/MM/YYYY become ISO; anything else is left for the validator to judge. */
function isoDate(raw: string): string {
  const dayFirst = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(raw);
  if (dayFirst === null) return raw;
  const [, day = "", month = "", year = ""] = dayFirst;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

/** `Name | Qualification | Rate; ...` - blank entries are skipped. */
function traineeCategoriesOf(raw: string): TraineeCategoryDetail[] {
  return raw
    .split(";")
    .map((entry) => entry.split("|").map((part) => part.trim()))
    .filter((parts) => parts.some((part) => part !== ""))
    .map(([categoryName = "", qualification = "", stipendRate = ""]) => ({ categoryName, qualification, stipendRate }));
}

/**
 * Maps one sheet row and validates it with the wizard's rules. `cells` is keyed
 * by column key; `zones` are the zones a Zone cell may name (scope is the
 * caller's check). The SPEC-05 PDF rule is skipped (D138).
 */
export function readBulkRow(
  cells: Readonly<Record<string, string>>,
  zones: readonly BulkZone[],
  today: string,
  /** D165: a filled PDF form also carries each charge's period and basis codes. */
  options: { readonly chargeMeta?: Readonly<Record<string, ChargeMeta>> } = {},
): BulkRowResult {
  const cell = (key: string): string => (cells[key] ?? "").trim();
  const errors: BulkCellError[] = [];
  const fail = (key: string, message: string): void => {
    errors.push({ column: headerOf(key), message });
  };

  /** A list cell: blank stays blank (the validator says Required), an unknown value is kept for the validator to refuse. */
  const listValue = (key: string, options: readonly EnumOption[]): string => {
    const raw = cell(key);
    return raw === "" ? "" : (matchOption(raw, options) ?? raw);
  };
  /** A list the domain validators do not check themselves. */
  const checkedListValue = (key: string, options: readonly EnumOption[], noun: string): string => {
    const raw = cell(key);
    if (raw === "") {
      fail(key, "Required");
      return "";
    }
    const matched = matchOption(raw, options);
    if (matched === undefined) fail(key, `Choose ${noun} from the list`);
    return matched ?? raw;
  };

  const zoneCell = cell("zoneId");
  const zone = findBulkZone(zoneCell, zones);
  if (zoneCell === "") {
    fail("zoneId", "Required");
  } else if (zone === undefined) {
    fail("zoneId", "Choose a zone from the list");
  }

  const hrEmail = cell("hrEmail");
  const financeEmail = cell("financeEmail");
  const companyDetails: CompanyDetails = {
    companyType: listValue("companyType", COMPANY_TYPE_OPTIONS),
    companyName: cell("companyName"),
    registrationType: listValue("registrationType", REGISTRATION_TYPE_OPTIONS),
    tanNumber: cell("tanNumber"),
    gstNumber: cell("gstNumber"),
    zoneId: zone?.id ?? "",
    plantName: cell("plantName"),
    addressLine1: cell("addressLine1"),
    addressLine2: cell("addressLine2"),
    city: cell("city"),
    pinCode: cell("pinCode"),
    state: cell("state"),
    district: cell("district"),
    hrContactName: cell("hrContactName"),
    financeHeadContactName: cell("financeHeadContactName"),
    // D156: no Contact Type - each number is accepted as a mobile or a LAN number.
    contactType: "",
    hrContactNumber: cell("hrContactNumber"),
    financeHeadContactNumber: cell("financeHeadContactNumber"),
    // The sheet holds each email once, so the confirmation is the value itself.
    hrEmail,
    confirmHrEmail: hrEmail,
    financeEmail,
    confirmFinanceEmail: financeEmail,
  };
  for (const [field, message] of Object.entries(validateCompanyDetails(companyDetails).errors)) {
    // The zone cell has its own message above; a blank zone would otherwise be reported twice.
    if (field !== "zoneId" && message !== undefined) fail(field, message);
  }

  const sector = checkedListValue("sector", SECTOR_OPTIONS, "a sector");
  const purchaseEmail = cell("purchaseEmail");
  if (purchaseEmail !== "" && !EMAIL_PATTERN.test(purchaseEmail)) fail("purchaseEmail", "Enter a valid email address");

  const attendanceCycle = checkedListValue("attendanceCycle", ATTENDANCE_CYCLE_OPTIONS, "an attendance cycle");
  const commercialDetails: CommercialDetails = {
    mouStartDate: isoDate(cell("mouStartDate")),
    tenureValue: cell("tenureValue"),
    tenureUnit: "MONTHS",
    attendanceCycle,
    stipendDate: cell("stipendDate"),
    charges: Object.fromEntries(COMMERCIAL_FIXED_ITEM_KEYS.map((key) => [key, cell(`charge:${key}`)])),
    ...(options.chargeMeta === undefined ? {} : { chargeMeta: options.chargeMeta }),
    otherItems: [],
    hasMouDocument: false,
  };
  const commercialErrors = validateCommercialDetails(commercialDetails, today).errors;
  for (const field of ["mouStartDate", "tenureValue", "stipendDate"] as const) {
    const message = commercialErrors[field];
    if (message !== undefined) fail(field, message);
  }
  // attendanceCycle was checked against the list above; mouDocument is exempt (D138).
  for (const [key, message] of Object.entries(commercialErrors.charges ?? {})) fail(`charge:${key}`, message);
  for (const [key, meta] of Object.entries(commercialErrors.chargeMeta ?? {})) {
    for (const message of [meta.period, meta.basis]) if (message !== undefined) fail(`charge:${key}`, message);
  }

  const categories = traineeCategoriesOf(cell("traineeCategories"));
  const payrollDetails: PayrollDetails = {
    scheme: listValue("scheme", SCHEME_OPTIONS),
    traineeCategories: categories.map((category) => category.categoryName),
    traineeCategoryDetails: categories,
    // D152 / D158: payroll is only PF, ESI and TDS, never read from the sheet - always their defaults.
    items: withStatutoryDefaults({}),
    otherItems: [],
  };
  const payrollErrors = validatePayrollDetails(payrollDetails).errors;
  if (payrollErrors.scheme !== undefined) fail("scheme", payrollErrors.scheme);
  if (payrollErrors.traineeCategories !== undefined) fail("traineeCategories", payrollErrors.traineeCategories);
  payrollErrors.traineeCategoryRows?.forEach((message, index) => {
    if (message !== undefined) fail("traineeCategories", `Category ${index + 1}: ${message}`);
  });
  payrollErrors.traineeCategoryDetails?.forEach((detailErrors, index) => {
    for (const message of Object.values(detailErrors ?? {})) {
      if (message !== undefined) fail("traineeCategories", `Category ${index + 1}: ${message}`);
    }
  });
  if (errors.length > 0) return { errors };
  return {
    errors,
    value: {
      company: companyDetails,
      sector,
      purchaseName: cell("purchaseName"),
      purchaseNumber: cell("purchaseNumber"),
      purchaseEmail,
      commercial: commercialDetails,
      payroll: payrollDetails,
    },
  };
}

export interface BulkRowError extends BulkCellError {
  /** The Excel row number. */
  readonly row: number;
}

/** The second and later rows repeating a GST, or a company + plant within one zone. */
export function findInFileDuplicates(rows: readonly { readonly row: number; readonly value: BulkCompanyRow }[]): BulkRowError[] {
  const firstByGst = new Map<string, number>();
  const firstByCompany = new Map<string, number>();
  const duplicates: BulkRowError[] = [];
  for (const { row, value } of rows) {
    const gst = value.company.gstNumber.trim().toUpperCase();
    const companyKey = [value.company.zoneId, normalise(value.company.companyName), normalise(value.company.plantName)].join("|");
    const gstRow = firstByGst.get(gst);
    const companyRow = firstByCompany.get(companyKey);
    if (gstRow !== undefined) {
      duplicates.push({ row, column: headerOf("gstNumber"), message: `Same GST Number as row ${gstRow}` });
    } else {
      firstByGst.set(gst, row);
    }
    if (companyRow !== undefined) {
      duplicates.push({ row, column: headerOf("companyName"), message: `Same company and plant as row ${companyRow}` });
    } else {
      firstByCompany.set(companyKey, row);
    }
  }
  return duplicates;
}

/** D162: MoU PDFs uploaded with the sheet - which row each belongs to, and what is wrong. */
export interface BulkPdfMatch {
  /** Sheet row number -> index of its PDF in the given file names. */
  readonly byRow: ReadonlyMap<number, number>;
  /** PDFs that belong to no row. */
  readonly fileErrors: readonly string[];
  /** Rows more than one PDF names. */
  readonly rowErrors: readonly BulkRowError[];
}

const MOU_PDF_COLUMN = "MoU PDF";

/**
 * D162: a MoU PDF belongs to the row whose GST Number its file name starts with
 * (any case; "27AAKCS4821M1Z3 - Acme.pdf" works). A row may have no PDF - it is
 * attached later from Upload MoU (D138) - but not two, and every PDF must name a row.
 */
export function matchBulkMouPdfs(
  fileNames: readonly string[],
  rows: readonly { readonly row: number; readonly gstNumber: string }[],
): BulkPdfMatch {
  const named = rows
    .map((entry) => ({ row: entry.row, gst: entry.gstNumber.trim().toUpperCase() }))
    .filter((entry) => entry.gst !== "");
  const pdfsByRow = new Map<number, number[]>();
  const fileErrors: string[] = [];
  fileNames.forEach((fileName, index) => {
    const name = fileName.trim().toUpperCase();
    const owner = named.find((entry) => name.startsWith(entry.gst));
    if (owner === undefined) {
      fileErrors.push(`${fileName}: no row has this GST Number. Name each MoU PDF after its row's GST Number, e.g. 27AAKCS4821M1Z3.pdf.`);
      return;
    }
    pdfsByRow.set(owner.row, [...(pdfsByRow.get(owner.row) ?? []), index]);
  });
  const byRow = new Map<number, number>();
  const rowErrors: BulkRowError[] = [];
  for (const [row, indexes] of pdfsByRow) {
    if (indexes.length === 1 && indexes[0] !== undefined) {
      byRow.set(row, indexes[0]);
    } else {
      const names = indexes.map((index) => fileNames[index]).join(", ");
      rowErrors.push({ row, column: MOU_PDF_COLUMN, message: `More than one MoU PDF names this GST Number: ${names}` });
    }
  }
  return { byRow, fileErrors, rowErrors };
}

/** GST Numbers are 15 characters. */
const GST_LENGTH = 15;

/**
 * D164: the GST Number a MoU PDF's file name starts with ("27AAKCS4821M1Z3.pdf",
 * "27aakcs4821m1z3 - Acme MoU.pdf"), upper-cased; undefined when the name does not
 * start with a valid one. Used when PDFs are uploaded on their own, for companies
 * that already exist.
 */
export function gstFromPdfName(fileName: string): string | undefined {
  const candidate = fileName.trim().slice(0, GST_LENGTH).toUpperCase();
  return isGstNumber(candidate) ? candidate : undefined;
}

// --- D165: the fillable PDF form ------------------------------------------------------------

/** The blank rows the form's charge and trainee tables have. */
export const BULK_FORM_TABLE_ROWS = 5;

const CHARGE_PARTS = ["Name", "Amount", "Period", "Basis"] as const;
const TRAINEE_PARTS = ["Name", "Qualification", "StipendRate"] as const;
const tableRows = Array.from({ length: BULK_FORM_TABLE_ROWS }, (_, index) => index + 1);

/** The form field holding a charge row's part, e.g. "charge2Amount". */
export const chargeFormField = (row: number, part: (typeof CHARGE_PARTS)[number]): string => `charge${row}${part}`;
/** The form field holding a trainee row's part, e.g. "trainee1StipendRate". */
export const traineeFormField = (row: number, part: (typeof TRAINEE_PARTS)[number]): string => `trainee${row}${part}`;

/** Every field the fillable form has: one per single column (named by its key), then the two tables. */
export function bulkFormFieldNames(): string[] {
  return [
    ...BULK_COMPANY_COLUMNS.filter((column) => !column.key.startsWith("charge:") && column.key !== "traineeCategories").map((column) => column.key),
    ...tableRows.flatMap((row) => CHARGE_PARTS.map((part) => chargeFormField(row, part))),
    ...tableRows.flatMap((row) => TRAINEE_PARTS.map((part) => traineeFormField(row, part))),
  ];
}

export interface BulkFormRow {
  /** The same cells an Excel row gives readBulkRow. */
  readonly cells: Readonly<Record<string, string>>;
  /** Period / basis codes by charge key, for the rows that gave either. */
  readonly chargeMeta: Readonly<Record<string, ChargeMeta>>;
  /** Problems in the charge table, which has no Excel column to report them under. */
  readonly errors: readonly BulkCellError[];
}

/**
 * D165: a filled form's field values as a sheet row. The charge table becomes the
 * per-charge amount cells (a row names one of the 9 core charges, at most once)
 * plus its period and basis codes; the trainee table becomes the
 * "Name | Qualification | Rate; ..." cell. Blank table rows are skipped.
 */
export function formFieldsToBulkRow(fields: Readonly<Record<string, string>>): BulkFormRow {
  const value = (name: string): string => (fields[name] ?? "").trim();
  const cells: Record<string, string> = {};
  for (const column of BULK_COMPANY_COLUMNS) {
    if (!column.key.startsWith("charge:") && column.key !== "traineeCategories") cells[column.key] = value(column.key);
  }

  const errors: BulkCellError[] = [];
  const chargeMeta: Record<string, ChargeMeta> = {};
  const used = new Set<string>();
  for (const row of tableRows) {
    const [name, amount, period, basis] = CHARGE_PARTS.map((part) => value(chargeFormField(row, part)));
    if ([name, amount, period, basis].every((part) => part === "")) continue;
    const fail = (message: string): void => {
      errors.push({ column: `Charge row ${row}`, message });
    };
    if (name === "" || name === undefined) {
      fail("Choose the charge name");
      continue;
    }
    const key = COMMERCIAL_FIXED_ITEM_KEYS.find((candidate) => normalise(COMMERCIAL_ITEM_BY_KEY[candidate].label) === normalise(name) || normalise(candidate) === normalise(name));
    if (key === undefined) {
      fail(`${name} is not one of the core charges`);
      continue;
    }
    if (used.has(key)) {
      fail(`${name} appears in more than one row`);
      continue;
    }
    used.add(key);
    if (amount === "" || amount === undefined) fail("Enter the amount");
    cells[`charge:${key}`] = amount ?? "";
    const periodCode = period === "" ? "" : matchOption(period ?? "", COMMERCIAL_PERIOD_OPTIONS);
    const basisCode = basis === "" ? "" : matchOption(basis ?? "", COMMERCIAL_BASIS_OPTIONS);
    if (periodCode === undefined) fail(`${period} is not a period from the list`);
    if (basisCode === undefined) fail(`${basis} is not a basis from the list`);
    if ((periodCode ?? "") !== "" || (basisCode ?? "") !== "") chargeMeta[key] = { period: periodCode ?? "", basis: basisCode ?? "" };
  }

  cells["traineeCategories"] = tableRows
    .map((row) => TRAINEE_PARTS.map((part) => value(traineeFormField(row, part))))
    .filter((parts) => parts.some((part) => part !== ""))
    .map((parts) => parts.join(" | "))
    .join("; ");
  return { cells, chargeMeta, errors };
}
