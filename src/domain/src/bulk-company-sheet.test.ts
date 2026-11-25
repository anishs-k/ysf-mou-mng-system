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
  BULK_LIST_OPTIONS,
  bulkFormFieldNames,
  findInFileDuplicates,
  formFieldsToBulkRow,
  gstFromPdfName,
  matchBulkMouPdfs,
  matchBulkHeaders,
  bulkRowToPrefill,
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
  pocName: "",
  pocNumber: "",
  decisionMakerName: "",
  decisionMakerNumber: "",
  zonalManager: "Abhishek B.",
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
    ["Organisation (YSF / YSI)", "Scheme", "Zone", "Sector", "Company Name", "Company Type", "Plant / Location", "Registration Type", "GST Number", "TAN Number", "Address Line 1", "Address Line 2", "City", "District", "PIN Code", "State"],
  ],
  [
    "Contact Information",
    ["Zonal Manager", "HR Contact Name", "HR Contact Number", "HR Email ID", "Finance Head Name", "Finance Head Contact", "Finance Email ID", "Purchase Name", "Purchase Number", "Purchase Email ID", "POC Name", "POC Number", "Decision Maker Name", "Decision Maker Number"],
  ],
  [
    "Commercial Details",
    [
      "MoU Start Date",
      "MoU Tenure (Months)",
      "Attendance Cycle",
      "Stipend Date",
      "MoU Sign Status",
      "Mail Confirmation",
      "Match with Invoice",
      "Payment Term",
      "Remark",
      "Invoice Remark",
      "Admin Charges",
      "Insurance",
      "Shoes and Uniform",
      "Supervisor Charges",
      "Sourcing Charges",
      "Education Fees",
      "Training Charges",
      "Assessment Charges",
      "Course Registration Fees",
      "Examination Fees",
      "Employability Skill Test Fees",
      "MSBTE Affiliation Fees",
    ],
  ],
  ["Payroll Details", ["Trainee Categories", "Left Trainee Recovery Amount", "Left Trainee Recovery Note", "Education Fee Paid By"]],
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

test("SPEC-27 POC and Decision Maker are optional columns read into the company", () => {
  for (const key of ["pocName", "pocNumber", "decisionMakerName", "decisionMakerNumber"]) {
    assert.equal(BULK_COMPANY_COLUMNS.find((column) => column.key === key)?.required, false, key);
  }
  const company = read({ pocName: "Rahul Sharma", pocNumber: "9876512345", decisionMakerName: "Meena Gupta", decisionMakerNumber: "8123456789" }).value?.company;
  assert.equal(company?.pocName, "Rahul Sharma");
  assert.equal(company?.pocNumber, "9876512345");
  assert.equal(company?.decisionMakerName, "Meena Gupta");
  assert.equal(company?.decisionMakerNumber, "8123456789");
});

test("SPEC-27 an invalid POC number is refused against its column", () => {
  assert.deepEqual(read({ pocName: "Rahul", pocNumber: "123" }).errors, [
    { column: headerOf("pocNumber"), message: "Enter a 10-digit mobile number starting 6 to 9" },
  ]);
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

// --- SPEC-30: one filled row pre-fills the Add New Company form ----------------

test("SPEC-30 a filled row becomes the wizard's three draft pages, list labels turned into codes", () => {
  const prefill = bulkRowToPrefill({ ...VALID, companyType: "Private Sector", sector: "Automobile", pocName: "Rahul" }, ZONES);
  assert.equal(prefill.page1["companyName"], VALID.companyName);
  assert.equal(prefill.page1["companyType"], "PRIVATE_SECTOR");
  assert.equal(prefill.page1["sector"], "AUTOMOBILE");
  assert.equal(prefill.page1["zoneId"], ZONES[0]?.id);
  assert.equal(prefill.page1["confirmHrEmail"], VALID.hrEmail);
  assert.equal(prefill.page1["confirmFinanceEmail"], VALID.financeEmail);
  assert.equal(prefill.page1["pocName"], "Rahul");
  assert.equal(prefill.page2.tenureValue, "12");
  assert.equal(prefill.page2.attendanceCycle, "16th to 15th");
  assert.deepEqual(prefill.page2.charges, { ADMIN_CHARGES: "1500" });
  assert.equal(prefill.page3.scheme, "NAPS");
  assert.deepEqual(prefill.page3.traineeCategories, ["ITI Fitter", "Diploma"]);
  assert.deepEqual(prefill.page3.traineeCategoryDetails[0], { categoryName: "ITI Fitter", qualification: "ITI", stipendRate: "9000" });
});

test("SPEC-30 a day-first date becomes ISO", () => {
  assert.equal(bulkRowToPrefill({ ...VALID, mouStartDate: "01-10-2026" }, ZONES).page2.mouStartDate, "2026-10-01");
});

test("SPEC-30 an incomplete or unknown value is left blank to fill in, never an error", () => {
  const prefill = bulkRowToPrefill({ companyName: "Half Filled", zoneId: "Nowhere", sector: "Space Mining" }, ZONES);
  assert.equal(prefill.page1["companyName"], "Half Filled");
  assert.equal(prefill.page1["zoneId"], "");
  assert.equal(prefill.page1["sector"], "");
  assert.equal(prefill.page1["hrContactName"], "");
  assert.equal(prefill.page3.scheme, "");
  assert.deepEqual(prefill.page3.traineeCategories, []);
});

test("SPEC-30 a filled PDF form's charge period and basis are kept", () => {
  const prefill = bulkRowToPrefill(VALID, ZONES, { ADMIN_CHARGES: { period: "MONTHLY", basis: "FLAT" } });
  assert.deepEqual(prefill.page2.chargeMeta, { ADMIN_CHARGES: { period: "MONTHLY", basis: "FLAT" } });
});

// --- SPEC-31: the client sheet's missing fields ----------------------------------

/** SPEC-34: the YSI-only fee and fee payer below need a YSI scheme. */
const SPEC31_CELLS: Readonly<Record<string, string>> = {
  scheme: "WILP",
  zonalManager: "Abhishek B.",
  signStatus: "Both Sign",
  mailConfirmation: "Yes",
  paymentTerm: "Invoice within 7 days",
  remark: "Combined MoU",
  "charge:EXAMINATION_FEES": "1250",
  leftTraineeAmount: "500",
  leftTraineeNote: "From the last stipend",
  educationFeePayer: "Deduct from stipend",
};

test("SPEC-31 Zonal Manager is a required column; the other new columns are marked No", () => {
  assert.equal(BULK_COMPANY_COLUMNS.find((entry) => entry.key === "zonalManager")?.required, true);
  for (const key of ["signStatus", "mailConfirmation", "paymentTerm", "remark", "leftTraineeAmount", "leftTraineeNote", "educationFeePayer"]) {
    const column = BULK_COMPANY_COLUMNS.find((entry) => entry.key === key);
    assert.ok(column, key);
    assert.equal(column.required, false, key);
  }
  assert.deepEqual(BULK_LIST_OPTIONS.signStatus.map((option) => option.label), ["Draft", "Single Sign", "Both Sign"]);
  assert.deepEqual(BULK_LIST_OPTIONS.mailConfirmation.map((option) => option.label), ["Yes", "No"]);
  assert.deepEqual(BULK_LIST_OPTIONS.educationFeePayer.map((option) => option.label), ["Company pays", "Deduct from stipend"]);
});

test("SPEC-31 a row with the new cells reads them into the pages, list labels as codes", () => {
  const value = read(SPEC31_CELLS).value;
  assert.ok(value);
  assert.equal(value.company.zonalManager, "Abhishek B.");
  assert.equal(value.commercial.signStatus, "BOTH_SIGN");
  assert.equal(value.commercial.mailConfirmation, "YES");
  assert.equal(value.commercial.paymentTerm, "Invoice within 7 days");
  assert.equal(value.commercial.remark, "Combined MoU");
  assert.equal(value.commercial.charges["EXAMINATION_FEES"], "1250");
  assert.equal(value.payroll.leftTraineeAmount, "500");
  assert.equal(value.payroll.leftTraineeNote, "From the last stipend");
  assert.equal(value.payroll.educationFeePayer, "DEDUCT_FROM_STIPEND");
});

test("SPEC-31 the optional new cells left blank are still a valid row", () => {
  assert.deepEqual(read().errors, []);
});

test("SPEC-31 a blank Zonal Manager is reported as Required", () => {
  assert.deepEqual(read({ zonalManager: "" }).errors, [{ column: headerOf("zonalManager"), message: "Required" }]);
});

test("SPEC-31 an unknown list value or a bad amount is reported on its column", () => {
  const { errors } = read({ signStatus: "Signed", educationFeePayer: "Student", leftTraineeAmount: "abc" });
  const columns = errors.map((error) => error.column);
  assert.ok(columns.includes(headerOf("signStatus")));
  assert.ok(columns.includes(headerOf("educationFeePayer")));
  assert.ok(columns.includes(headerOf("leftTraineeAmount")));
});

test("SPEC-31 the prefill carries the new fields onto their pages", () => {
  const prefill = bulkRowToPrefill({ ...VALID, ...SPEC31_CELLS }, ZONES);
  assert.equal(prefill.page1["zonalManager"], "Abhishek B.");
  assert.equal(prefill.page2.signStatus, "BOTH_SIGN");
  assert.equal(prefill.page2.mailConfirmation, "YES");
  assert.equal(prefill.page2.paymentTerm, "Invoice within 7 days");
  assert.equal(prefill.page2.remark, "Combined MoU");
  assert.equal(prefill.page2.charges["EXAMINATION_FEES"], "1250");
  assert.equal(prefill.page3.leftTraineeAmount, "500");
  assert.equal(prefill.page3.leftTraineeNote, "From the last stipend");
  assert.equal(prefill.page3.educationFeePayer, "DEDUCT_FROM_STIPEND");
});

test("SPEC-31 the fillable PDF names a field for each new single column", () => {
  const names = bulkFormFieldNames();
  for (const key of ["zonalManager", "signStatus", "mailConfirmation", "paymentTerm", "remark", "leftTraineeAmount", "leftTraineeNote", "educationFeePayer"]) {
    assert.ok(names.includes(key), key);
  }
  assert.equal(formFieldsToBulkRow({ remark: "x", educationFeePayer: "Company pays" }).cells["educationFeePayer"], "Company pays");
});

test("SPEC-34 an optional Organisation (YSF / YSI) column comes before the scheme, as a list", () => {
  const column = BULK_COMPANY_COLUMNS.find((entry) => entry.key === "organisation");
  assert.ok(column);
  assert.equal(column.required, false);
  assert.equal(column.list, "organisation");
  assert.deepEqual(BULK_LIST_OPTIONS.organisation.map((option) => option.value), ["YSF", "YSI"]);
});

test("SPEC-34 a blank organisation is fine - the scheme decides it", () => {
  assert.deepEqual(read({ organisation: "" }).errors, []);
  assert.deepEqual(read({ organisation: "YSF" }).errors, []);
});

test("SPEC-34 an organisation that does not run the scheme is reported on the Scheme column", () => {
  const result = read({ organisation: "YSI", scheme: "NAPS" });
  assert.deepEqual(result.errors, [{ column: headerOf("scheme"), message: "Choose a YSI scheme (WILP, FLEXI, BVoc, DVoc or MSBTE)" }]);
  assert.deepEqual(read({ organisation: "XYZ" }).errors, [{ column: headerOf("organisation"), message: "Choose YSF or YSI" }]);
});

test("SPEC-34 a YSF row may not fill a YSI-only fee or the education fee payer", () => {
  const result = read({ "charge:EXAMINATION_FEES": "300", educationFeePayer: "Company pays" });
  assert.deepEqual(result.errors, [
    { column: headerOf("charge:EXAMINATION_FEES"), message: "This fee applies to YSI agreements only" },
    { column: headerOf("educationFeePayer"), message: "This applies to YSI agreements only" },
  ]);
  assert.deepEqual(read({ scheme: "WILP", "charge:EXAMINATION_FEES": "300", educationFeePayer: "Company pays" }).errors, []);
});

test("SPEC-34 the prefill carries the organisation, from its cell or else from the scheme", () => {
  assert.equal(bulkRowToPrefill({ ...VALID, organisation: "YSI - Yuvashakti Skill India", scheme: "WILP" }, ZONES).page3.organisation, "YSI");
  assert.equal(bulkRowToPrefill({ ...VALID, scheme: "NATS" }, ZONES).page3.organisation, "YSF");
  assert.equal(bulkRowToPrefill({ ...VALID, scheme: "" }, ZONES).page3.organisation, "");
});

test("SPEC-35 Match with Invoice (a list) and Invoice Remark are optional commercial columns", () => {
  const match = BULK_COMPANY_COLUMNS.find((entry) => entry.key === "invoiceMatch");
  const remark = BULK_COMPANY_COLUMNS.find((entry) => entry.key === "invoiceRemark");
  assert.equal(match?.header, "Match with Invoice");
  assert.equal(match?.list, "invoiceMatch");
  assert.equal(match?.required, false);
  assert.equal(remark?.header, "Invoice Remark");
  assert.equal(remark?.required, false);
  assert.deepEqual(BULK_LIST_OPTIONS.invoiceMatch.map((option) => option.label), ["Match", "No Match"]);
});

test("SPEC-35 a row reads match with invoice and invoice remark; a bad value is reported on its column", () => {
  const value = read({ invoiceMatch: "No Match", invoiceRemark: "Uniform cost not deducted" }).value;
  assert.equal(value?.commercial.invoiceMatch, "NO_MATCH");
  assert.equal(value?.commercial.invoiceRemark, "Uniform cost not deducted");
  assert.deepEqual(read({ invoiceMatch: "Sometimes" }).errors, [{ column: headerOf("invoiceMatch"), message: "Choose Match or No Match" }]);
  const prefill = bulkRowToPrefill({ ...VALID, invoiceMatch: "Match", invoiceRemark: "ok" }, ZONES);
  assert.equal(prefill.page2.invoiceMatch, "MATCH");
  assert.equal(prefill.page2.invoiceRemark, "ok");
});

test("SPEC-35 the YSI-only fee columns say so in their format", () => {
  for (const key of ["EDUCATION_CHARGES", "ONE_TIME_REGISTRATION_FEES", "EXAMINATION_FEES", "EMPLOYABILITY_TEST_FEES", "MSBTE_AFFILIATION_FEES"]) {
    assert.match(BULK_COMPANY_COLUMNS.find((entry) => entry.key === `charge:${key}`)?.format ?? "", /YSI only - leave blank for YSF/, key);
  }
  assert.doesNotMatch(BULK_COMPANY_COLUMNS.find((entry) => entry.key === "charge:ADMIN_CHARGES")?.format ?? "", /YSI only/);
});

test("SPEC-35 renamed fee columns: a sheet with the old header still matches", () => {
  const headers = BULK_COMPANY_COLUMNS.map((column) =>
    column.key === "charge:EDUCATION_CHARGES" ? "Education Charges" : column.key === "charge:ONE_TIME_REGISTRATION_FEES" ? "One Time Registration Fees" : column.header,
  );
  const matched = matchBulkHeaders(headers);
  assert.deepEqual(matched.missing, []);
  assert.equal(matched.indexByKey.get("charge:EDUCATION_CHARGES"), headers.indexOf("Education Charges"));
});

test("SPEC-35 a PDF charge row may name a fee by its old name", () => {
  const { cells, errors } = formFieldsToBulkRow({ charge1Name: "One Time Registration Fees", charge1Amount: "1000" });
  assert.deepEqual(errors, []);
  assert.equal(cells["charge:ONE_TIME_REGISTRATION_FEES"], "1000");
});
