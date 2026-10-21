/**
 * Purpose: Unit tests for the SPEC-22 bulk sheet rules, written before the
 * implementation per the working rules: the shared column list, header matching,
 * how each kind of cell maps onto the wizard's page payloads (lists by label or
 * code, dates, charge and payroll cells, the trainee-category cell), errors coming
 * back on the right column, the D138 PDF exemption and in-file duplicates.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BULK_COMPANY_COLUMNS,
  BULK_SECTIONS,
  bulkRequiredLabel,
  BULK_FORM_TABLE_ROWS,
  bulkFormFieldNames,
  findInFileDuplicates,
  formFieldsToBulkRow,
  gstFromPdfName,
  matchBulkMouPdfs,
  matchBulkHeaders,
  readBulkRow,
} from "./bulk-company-sheet.ts";
import type { BulkZone } from "./bulk-company-sheet.ts";
import { COMMERCIAL_FIXED_ITEM_KEYS } from "./commercial-items.ts";
import { PAYROLL_FIXED_ITEM_KEYS } from "./payroll-items.ts";

const TODAY = "2026-10-19";
const PUNE: BulkZone = { id: "11111111-1111-4111-8111-111111111111", code: "PUNE", name: "Pune" };
const MUMBAI: BulkZone = { id: "22222222-2222-4222-8222-222222222222", code: "MUM", name: "Mumbai" };
const ZONES = [PUNE, MUMBAI];

const VALID: Readonly<Record<string, string>> = {
  companyType: "Private Sector",
  companyName: "Acme Gears",
  registrationType: "Company",
  tanNumber: "PNEA12345B",
  gstNumber: "27AAACA1234A1Z5",
  zoneId: "Pune",
  plantName: "Chakan Plant",
  sector: "Automobile",
  addressLine1: "Plot 4, MIDC",
  addressLine2: "",
  city: "Pune",
  district: "Pune",
  pinCode: "410501",
  state: "Maharashtra",
  hrContactName: "Asha Rao",
  hrContactNumber: "9876543210",
  hrEmail: "hr@acme.in",
  financeHeadContactName: "Ravi Iyer",
  financeHeadContactNumber: "9876501234",
  financeEmail: "accounts@acme.in",
  purchaseName: "",
  purchaseNumber: "",
  purchaseEmail: "",
  scheme: "NAPS",
  mouStartDate: "2026-10-01",
  tenureValue: "12",
  attendanceCycle: "16th to 15th",
  stipendDate: "7",
  "charge:ADMIN_CHARGES": "1500",
  traineeCategories: "ITI Fitter | ITI | 9000; Diploma",
};

const read = (overrides: Readonly<Record<string, string>> = {}) => readBulkRow({ ...VALID, ...overrides }, ZONES, TODAY);
const headerOf = (key: string): string => BULK_COMPANY_COLUMNS.find((column) => column.key === key)?.header ?? key;

test("the column list covers the form's fields and every core charge, but no payroll item column", () => {
  const keys = BULK_COMPANY_COLUMNS.map((column) => column.key);
  assert.equal(new Set(keys).size, keys.length, "keys are unique");
  const headers = BULK_COMPANY_COLUMNS.map((column) => column.header.toLowerCase());
  assert.equal(new Set(headers).size, headers.length, "headers are unique");
  for (const key of COMMERCIAL_FIXED_ITEM_KEYS) assert.ok(keys.includes(`charge:${key}`), key);
  for (const key of PAYROLL_FIXED_ITEM_KEYS) assert.ok(!keys.includes(`payroll:${key}`), key);
  for (const key of ["confirmHrEmail", "confirmFinanceEmail", "contactType", "tenureUnit"]) assert.ok(!keys.includes(key), key);
});

/**
 * D159: the sections and their columns, in the order of the blank Add New Company
 * form the client specified (2026-10-21) - one header row, one company per row.
 */
const FORM_LAYOUT: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    "Basic Information & Address",
    ["Scheme", "Zone", "Sector", "Company Name", "Company Type", "Plant / Location", "Registration Type", "GST Number", "TAN Number", "Address Line 1", "Address Line 2", "City", "District", "PIN Code", "State"],
  ],
  [
    "Contact Information",
    ["HR Contact Name", "HR Contact Number", "HR Email ID", "Finance Head Name", "Finance Head Contact", "Finance Email ID", "Purchase Name", "Purchase Number", "Purchase Email ID"],
  ],
  [
    "Commercial Details",
    [
      "MoU Start Date",
      "MoU Tenure (Months)",
      "Attendance Cycle",
      "Stipend Date",
      "Admin Charges",
      "Insurance",
      "Shoes and Uniform",
      "Supervisor Charges",
      "Sourcing Charges",
      "Education Charges",
      "Training Charges",
      "Assessment Charges",
      "One Time Registration Fees",
    ],
  ],
  ["Payroll Details", ["Trainee Categories"]],
];

test("D159 the template's sections and columns are the form's, field for field and in order", () => {
  assert.deepEqual([...BULK_SECTIONS], FORM_LAYOUT.map(([section]) => section));
  assert.deepEqual(
    BULK_COMPANY_COLUMNS.map((column) => [column.section, column.header]),
    FORM_LAYOUT.flatMap(([section, headers]) => headers.map((header) => [section, header])),
  );
});

test("D154 required columns read Imp / Yes, optional ones No", () => {
  const label = (header: string): string => bulkRequiredLabel(BULK_COMPANY_COLUMNS.find((column) => column.header === header)!);
  assert.equal(label("Company Name"), "Imp / Yes");
  assert.equal(label("Address Line 2"), "No");
  assert.equal(label("Admin Charges"), "No");
});

test("headers match by text in any order, ignoring case and spaces; missing required columns are reported", () => {
  const headers = BULK_COMPANY_COLUMNS.map((column) => `  ${column.header.toUpperCase()} `).reverse();
  const matched = matchBulkHeaders(headers);
  assert.deepEqual(matched.missing, []);
  assert.equal(matched.indexByKey.get("companyName"), headers.length - 1 - BULK_COMPANY_COLUMNS.findIndex((c) => c.key === "companyName"));

  const withoutZone = BULK_COMPANY_COLUMNS.filter((column) => column.key !== "zoneId").map((column) => column.header);
  assert.deepEqual(matchBulkHeaders(withoutZone).missing, [headerOf("zoneId")]);
  const withoutAddress2 = BULK_COMPANY_COLUMNS.filter((column) => column.key !== "addressLine2").map((column) => column.header);
  assert.deepEqual(matchBulkHeaders(withoutAddress2).missing, [headerOf("addressLine2")], "D161: optional columns are required headers too");
  const all = BULK_COMPANY_COLUMNS.map((column) => column.header);
  assert.deepEqual(matchBulkHeaders([...all, "CITY", "", "Notes"]).duplicated, ["City"], "D161: a repeated header; blank and unknown ones ignored");
});

test("a valid row maps onto the wizard's three page payloads", () => {
  const result = read();
  assert.deepEqual(result.errors, []);
  const value = result.value;
  assert.ok(value !== undefined);
  assert.equal(value.company.companyType, "PRIVATE_SECTOR");
  assert.equal(value.company.registrationType, "COMPANY");
  assert.equal(value.company.contactType, "");
  assert.equal(value.company.zoneId, PUNE.id);
  assert.equal(value.company.hrEmail, "hr@acme.in");
  assert.equal(value.company.confirmHrEmail, "hr@acme.in");
  assert.equal(value.company.financeEmail, "accounts@acme.in");
  assert.equal(value.company.confirmFinanceEmail, "accounts@acme.in");
  assert.equal(value.sector, "AUTOMOBILE");
  assert.equal(value.commercial.tenureUnit, "MONTHS");
  assert.equal(value.commercial.charges["ADMIN_CHARGES"], "1500");
  assert.equal(value.commercial.charges["INSURANCE"], "");
  assert.equal(value.payroll.scheme, "NAPS");
  assert.deepEqual(value.payroll.traineeCategories, ["ITI Fitter", "Diploma"]);
  assert.deepEqual(value.payroll.traineeCategoryDetails, [
    { categoryName: "ITI Fitter", qualification: "ITI", stipendRate: "9000" },
    { categoryName: "Diploma", qualification: "", stipendRate: "" },
  ]);
  assert.deepEqual(value.payroll.otherItems, []);
});

test("list cells accept the code as well as the label, case-insensitively; zone by code too", () => {
  const result = read({ companyType: "private_sector", sector: "AUTOMOBILE", zoneId: "mum", scheme: "bvoc", hrContactNumber: "020-2345678", financeHeadContactNumber: "9876501234" });
  assert.deepEqual(result.errors, []);
  assert.equal(result.value?.company.companyType, "PRIVATE_SECTOR");
  assert.equal(result.value?.company.zoneId, MUMBAI.id);
  assert.equal(result.value?.payroll.scheme, "BVOC");
});

test("dates are read as ISO, DD-MM-YYYY or DD/MM/YYYY", () => {
  assert.equal(read({ mouStartDate: "01-10-2026" }).value?.commercial.mouStartDate, "2026-10-01");
  assert.equal(read({ mouStartDate: "1/10/2026" }).value?.commercial.mouStartDate, "2026-10-01");
  assert.deepEqual(read({ mouStartDate: "31-02-2026" }).errors, [{ column: headerOf("mouStartDate"), message: "Enter a valid date" }]);
});

test("errors come back under the sheet column that caused them", () => {
  const result = read({ gstNumber: "bad", "charge:INSURANCE": "-5", financeEmail: "nope", tenureValue: "121", sector: "Space", zoneId: "Nagpur", attendanceCycle: "Weekly" });
  assert.equal(result.value, undefined);
  const columns = result.errors.map((error) => error.column);
  for (const key of ["gstNumber", "charge:INSURANCE", "financeEmail", "tenureValue", "sector", "zoneId", "attendanceCycle"]) {
    assert.ok(columns.includes(headerOf(key)), key);
  }
  assert.ok(result.errors.some((error) => error.column === headerOf("zoneId") && error.message === "Choose a zone from the list"));
});

test("required cells left blank are reported as Required", () => {
  const result = read({ companyName: "", scheme: "", sector: "", traineeCategories: "" });
  const byColumn = new Map(result.errors.map((error) => [error.column, error.message]));
  assert.equal(byColumn.get(headerOf("companyName")), "Required");
  assert.equal(byColumn.get(headerOf("scheme")), "Required");
  assert.equal(byColumn.get(headerOf("sector")), "Required");
  assert.equal(byColumn.get(headerOf("traineeCategories")), "Add at least one trainee category");
});

test("D157 the tenure is read as months", () => {
  assert.equal(read({ tenureValue: "36" }).value?.commercial.tenureUnit, "MONTHS");
  assert.equal(read({ tenureValue: "36" }).value?.commercial.tenureValue, "36");
});

test("the MOU PDF is not required for a bulk row (D138)", () => {
  const result = read();
  assert.ok(!result.errors.some((error) => /PDF/.test(error.message)));
});

test("an invalid purchase email is refused; a blank one is fine", () => {
  assert.deepEqual(read({ purchaseEmail: "nope" }).errors, [{ column: headerOf("purchaseEmail"), message: "Enter a valid email address" }]);
});

test("in-file duplicates: same GST, or same company + plant + zone, flag the later row", () => {
  const a = read().value;
  const b = read({ companyName: "ACME GEARS ", gstNumber: "27AAACA9999A1Z5" }).value;
  const c = read({ companyName: "Other Co", plantName: "Other Plant" }).value;
  assert.ok(a !== undefined && b !== undefined && c !== undefined);
  const duplicates = findInFileDuplicates([
    { row: 2, value: a },
    { row: 3, value: b },
    { row: 4, value: c },
  ]);
  assert.deepEqual(duplicates, [
    { row: 3, column: headerOf("companyName"), message: "Same company and plant as row 2" },
    { row: 4, column: headerOf("gstNumber"), message: "Same GST Number as row 2" },
  ]);
});

test("D152 / D158 every row gets the statutory defaults, and payroll cells from an older template are ignored", () => {
  const result = read({ "payroll:PF": "No", "payroll:HRA": "2000", contactType: "LAN", tenureUnit: "Years" });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.value?.payroll.items, {
    PF: { isApplicable: true, amount: "12.00" },
    ESI: { isApplicable: true, amount: "0.75" },
    TDS: { isApplicable: true, amount: "" },
  });
  assert.equal(result.value?.company.contactType, "");
  assert.equal(result.value?.commercial.tenureUnit, "MONTHS");
});

// --- D162: MoU PDFs uploaded with the sheet, matched to rows by GST Number ---------------

const SHEET_ROWS = [
  { row: 2, gstNumber: "27AAKCS4821M1Z3" },
  { row: 3, gstNumber: "33aamcm5517f1z6 " },
  { row: 4, gstNumber: "" },
];

test("D162 a PDF named after a row's GST Number (any case, any suffix) belongs to that row", () => {
  const match = matchBulkMouPdfs(["27AAKCS4821M1Z3.pdf", "33AAMCM5517F1Z6 - Marina MoU.PDF"], SHEET_ROWS);
  assert.deepEqual([...match.byRow.entries()], [
    [2, 0],
    [3, 1],
  ]);
  assert.deepEqual(match.fileErrors, []);
  assert.deepEqual(match.rowErrors, []);
});

test("D162 a row without a PDF is fine - its MoU PDF is attached later", () => {
  const match = matchBulkMouPdfs([], SHEET_ROWS);
  assert.equal(match.byRow.size, 0);
  assert.deepEqual(match.fileErrors, []);
});

test("D162 a PDF that names no row, and two PDFs for one row, are errors", () => {
  const match = matchBulkMouPdfs(["random.pdf", "27AAKCS4821M1Z3.pdf", "27aakcs4821m1z3 copy.pdf"], SHEET_ROWS);
  assert.deepEqual(match.fileErrors, [
    "random.pdf: no row has this GST Number. Name each MoU PDF after its row's GST Number, e.g. 27AAKCS4821M1Z3.pdf.",
  ]);
  assert.deepEqual(match.rowErrors, [
    { row: 2, column: "MoU PDF", message: "More than one MoU PDF names this GST Number: 27AAKCS4821M1Z3.pdf, 27aakcs4821m1z3 copy.pdf" },
  ]);
});

// --- D164: PDFs uploaded on their own name an existing company by GST Number ------------

test("D164 a PDF file name that starts with a GST Number yields it, upper-cased", () => {
  assert.equal(gstFromPdfName("27AAKCS4821M1Z3.pdf"), "27AAKCS4821M1Z3");
  assert.equal(gstFromPdfName("  27aakcs4821m1z3 - Sahyadri MoU.PDF"), "27AAKCS4821M1Z3");
});

test("D164 a PDF file name that does not start with a valid GST Number yields nothing", () => {
  assert.equal(gstFromPdfName("mou.pdf"), undefined);
  assert.equal(gstFromPdfName("MoU 27AAKCS4821M1Z3.pdf"), undefined);
  assert.equal(gstFromPdfName("27AAKCS4821M1.pdf"), undefined);
});

// --- D165: the fillable PDF form's fields read as one sheet row -------------------------

/** VALID as the form's field names hold it: single fields by column key, tables by row. */
function formFields(overrides: Readonly<Record<string, string>> = {}): Record<string, string> {
  const single = Object.fromEntries(Object.entries(VALID).filter(([key]) => !key.startsWith("charge:") && key !== "traineeCategories"));
  return {
    ...single,
    charge1Name: "Admin Charges",
    charge1Amount: "1500",
    charge1Period: "Monthly",
    charge1Basis: "Flat",
    trainee1Name: "ITI Fitter",
    trainee1Qualification: "ITI",
    trainee1StipendRate: "9000",
    trainee2Name: "Diploma",
    ...overrides,
  };
}

test("D165 the form's field names: every single column, then 5 charge rows and 5 trainee rows", () => {
  const names = bulkFormFieldNames();
  for (const column of BULK_COMPANY_COLUMNS.filter((entry) => !entry.key.startsWith("charge:") && entry.key !== "traineeCategories")) {
    assert.ok(names.includes(column.key), column.key);
  }
  assert.equal(BULK_FORM_TABLE_ROWS, 5);
  for (const n of [1, 5]) {
    for (const part of ["Name", "Amount", "Period", "Basis"]) assert.ok(names.includes(`charge${n}${part}`), `charge${n}${part}`);
    for (const part of ["Name", "Qualification", "StipendRate"]) assert.ok(names.includes(`trainee${n}${part}`), `trainee${n}${part}`);
  }
});

test("D165 a filled form becomes the sheet row's cells plus each charge's period and basis codes", () => {
  const { cells, chargeMeta, errors } = formFieldsToBulkRow(formFields());
  assert.deepEqual(errors, []);
  assert.equal(cells["companyName"], "Acme Gears");
  assert.equal(cells["charge:ADMIN_CHARGES"], "1500");
  assert.equal(cells["traineeCategories"], "ITI Fitter | ITI | 9000; Diploma |  | ");
  assert.deepEqual(chargeMeta, { ADMIN_CHARGES: { period: "MONTHLY", basis: "FLAT" } });
  const result = readBulkRow(cells, ZONES, TODAY, { chargeMeta });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.value?.commercial.chargeMeta, { ADMIN_CHARGES: { period: "MONTHLY", basis: "FLAT" } });
  assert.deepEqual(result.value?.payroll.traineeCategories, ["ITI Fitter", "Diploma"]);
});

test("D165 charge rows: unknown name, a name twice, an amount without a name, a name without an amount, a bad period", () => {
  const { errors } = formFieldsToBulkRow(
    formFields({
      charge2Name: "Canteen Deduction",
      charge2Amount: "10",
      charge3Name: "Admin Charges",
      charge3Amount: "20",
      charge4Amount: "30",
      charge5Name: "Insurance",
      charge5Period: "Weekly",
    }),
  );
  assert.deepEqual(errors, [
    { column: "Charge row 2", message: "Canteen Deduction is not one of the core charges" },
    { column: "Charge row 3", message: "Admin Charges appears in more than one row" },
    { column: "Charge row 4", message: "Choose the charge name" },
    { column: "Charge row 5", message: "Enter the amount" },
    { column: "Charge row 5", message: "Weekly is not a period from the list" },
  ]);
});
