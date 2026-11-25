/**
 * Purpose: Unit tests for the "Only MoU" Excel export, fed fixed records so no
 * database is involved. It must mirror the client's MOU TEMPLATE: one YSF and
 * one YSI sheet, YSI with its five extra fee columns, one row per MoU.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { CompanyRecord } from "./company-record-pdf.ts";
import { buildMouSheetWorkbook, MOU_SHEET_HEADERS } from "./mou-sheet-export.ts";

function record(scheme: string, code: string, charges: Record<string, string>): CompanyRecord {
  return {
    overview: { companyName: "Acme Gears Pvt Ltd", gstNumber: "27AAACA1234A1Z5", zoneName: "Nashik", zonalManager: "Abhishek B.", plants: [] },
    commercial: {
      generatedCode: code,
      companyPlantId: null,
      scheme,
      mouStartDate: "2026-01-01",
      endDate: "2028-12-31",
      status: "ACTIVE",
      stipendDate: 7,
      charges: Object.entries(charges).map(([itemKey, amount]) => ({ itemKey, label: itemKey, amount, period: null, basis: null })),
      otherItems: [{ label: "Safety Kit", amount: "250.00", itemType: "DEDUCTION" }],
      signStatus: "BOTH_SIGN",
      mailConfirmation: "YES",
      paymentTerm: "Within 7 days",
      remark: "Combined MoU",
      invoiceMatch: "NO_MATCH",
      invoiceRemark: "Uniform cost not deducted",
    },
    payroll: { leftTraineeAmount: "500.00", leftTraineeNote: "From last stipend" },
  } as unknown as CompanyRecord;
}

const YSF = record("NAPS", "MOU-NAPS-2026-0001", { ADMIN_CHARGES: "1500.00", TRAINING_CHARGES: "100.00" });
const YSI = record("WILP", "MOU-WILP-2026-0001", { ADMIN_CHARGES: "700.00", EXAMINATION_FEES: "1250.00" });

function headers(workbook: ReturnType<typeof buildMouSheetWorkbook>, sheet: string): string[] {
  return ((workbook.getWorksheet(sheet)?.getRow(1).values ?? []) as unknown[]).slice(1).map(String);
}

function cell(workbook: ReturnType<typeof buildMouSheetWorkbook>, sheet: string, row: number, header: string): unknown {
  const index = headers(workbook, sheet).indexOf(header) + 1;
  return workbook.getWorksheet(sheet)?.getRow(row).getCell(index).value;
}

test("Only MoU: only the sheets of the organisations exported - a YSI MoU gives no YSF sheet", () => {
  assert.deepEqual(buildMouSheetWorkbook([YSI]).worksheets.map((sheet) => sheet.name), ["YSI"]);
  assert.deepEqual(buildMouSheetWorkbook([YSF]).worksheets.map((sheet) => sheet.name), ["YSF"]);
  assert.deepEqual(buildMouSheetWorkbook([YSI, YSF]).worksheets.map((sheet) => sheet.name), ["YSF", "YSI"]);
});

test("Only MoU: with nothing to export, both empty sheets still show the layout", () => {
  assert.deepEqual(buildMouSheetWorkbook([]).worksheets.map((sheet) => sheet.name), ["YSF", "YSI"]);
});

test("Only MoU: the YSF columns follow the client sheet; YSI adds its five fees in the sheet's places", () => {
  assert.deepEqual(MOU_SHEET_HEADERS.YSF, [
    "Sr. No.", "MoU Code", "Company Name (GST)", "Zonal Manager", "Division", "TYPE", "MoU Status", "Mail Confirmation",
    "Match with Invoice", "Payment Term", "Stipend Date", "Admin", "Supervisor", "Insurance", "Shoes & Uniform", "Sourcing",
    "Education / Training", "Left Trainee", "Assessment", "Other Charges", "MoU Date", "Validity", "Status", "Remark", "Invoice Remark",
  ]);
  assert.deepEqual(MOU_SHEET_HEADERS.YSI, [
    "Sr. No.", "MoU Code", "Company Name (GST)", "Zonal Manager", "Division", "TYPE", "MoU Status", "Mail Confirmation",
    "Match with Invoice", "Payment Term", "Stipend Date", "Admin", "Supervisor", "Insurance", "Shoes & Uniform", "Sourcing",
    "Education / Training", "Education Fees", "Left Trainee", "Course Registration Fees", "Examination Fees",
    "Employability Skill Test Fees", "MSBTE Affiliation Fees", "Assessment", "Other Charges", "MoU Date", "Validity", "Status",
    "Remark", "Invoice Remark",
  ]);
  const workbook = buildMouSheetWorkbook([YSF, YSI]);
  assert.deepEqual(headers(workbook, "YSF"), [...MOU_SHEET_HEADERS.YSF]);
  assert.deepEqual(headers(workbook, "YSI"), [...MOU_SHEET_HEADERS.YSI]);
});

test("Only MoU: each MoU goes to its organisation's sheet, one row each, numbered", () => {
  const workbook = buildMouSheetWorkbook([YSI, YSF]);
  assert.equal(workbook.getWorksheet("YSF")?.rowCount, 2);
  assert.equal(workbook.getWorksheet("YSI")?.rowCount, 2);
  assert.equal(cell(workbook, "YSF", 2, "MoU Code"), "MOU-NAPS-2026-0001");
  assert.equal(cell(workbook, "YSI", 2, "MoU Code"), "MOU-WILP-2026-0001");
  assert.equal(cell(workbook, "YSF", 2, "Sr. No."), 1);
});

test("Only MoU: a row carries the sheet's values - labels for codes, numbers for amounts", () => {
  const workbook = buildMouSheetWorkbook([YSF, YSI]);
  assert.equal(cell(workbook, "YSF", 2, "Company Name (GST)"), "Acme Gears Pvt Ltd (27AAACA1234A1Z5)");
  assert.equal(cell(workbook, "YSF", 2, "Zonal Manager"), "Abhishek B.");
  assert.equal(cell(workbook, "YSF", 2, "Division"), "Nashik");
  assert.equal(cell(workbook, "YSF", 2, "TYPE"), "NAPS");
  assert.equal(cell(workbook, "YSF", 2, "MoU Status"), "Both Sign");
  assert.equal(cell(workbook, "YSF", 2, "Mail Confirmation"), "Yes");
  assert.equal(cell(workbook, "YSF", 2, "Match with Invoice"), "No Match");
  assert.equal(cell(workbook, "YSF", 2, "Admin"), 1500);
  assert.equal(cell(workbook, "YSF", 2, "Education / Training"), 100);
  assert.equal(cell(workbook, "YSF", 2, "Insurance"), null);
  assert.equal(cell(workbook, "YSF", 2, "Left Trainee"), "500.00 (From last stipend)");
  assert.equal(cell(workbook, "YSF", 2, "Other Charges"), "Safety Kit: 250.00");
  assert.equal(cell(workbook, "YSF", 2, "Status"), "Active");
  assert.equal(cell(workbook, "YSF", 2, "Invoice Remark"), "Uniform cost not deducted");
  assert.equal(cell(workbook, "YSI", 2, "Examination Fees"), 1250);
});

test("every header cell is bold, on every sheet", () => {
  for (const sheet of buildMouSheetWorkbook([YSF, YSI]).worksheets) {
    sheet.getRow(1).eachCell((headerCell) => assert.equal(headerCell.font?.bold, true, `${sheet.name} ${String(headerCell.value)}`));
  }
});
