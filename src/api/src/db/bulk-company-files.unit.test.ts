/**
 * Purpose: Unit tests for the SPEC-22 template files and sheet reader, written
 * before the implementation and needing no database: the Excel template's header
 * row is BULK_COMPANY_COLUMNS in order with dropdowns (the Zone one listing only
 * the zones given), the PDF is a real PDF, and a filled template reads back into
 * cells keyed by column - dates, numbers and rich text included - while broken
 * files are refused with a clear message. The PDF is also rendered uncompressed and
 * its text read back from the TJ operators, to check the D152 layout: YSF band,
 * one table per section, repeated table headers and "Page x of y".
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { BULK_COMPANY_COLUMNS, BULK_COMPANY_SHEET, BULK_MAX_ROWS, BULK_SECTIONS, bulkFormFieldNames } from "@mou/domain";
import { PDFDocument as LibPdf, PDFDropdown, PDFTextField } from "pdf-lib";
import ExcelJS from "exceljs";

import { BULK_MAX_MOU_PDFS, buildBulkTemplatePdf, buildBulkTemplateWorkbook, readBulkSheet, readMouPdfForm, sortBulkUploadFiles } from "./bulk-company-files.ts";

const ZONES = [
  { id: "11111111-1111-4111-8111-111111111111", code: "PUNE", name: "Pune" },
  { id: "22222222-2222-4222-8222-222222222222", code: "MUM", name: "Mumbai" },
];

async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

const LOGO = new URL("../../assets/logo-ysf.png", import.meta.url);

/** Every text line drawn, decoded from the uncompressed content streams. */
function pdfText(pdf: Buffer): string[] {
  const source = pdf.toString("latin1");
  return [...source.matchAll(/\[([^\]]*)\]\s*TJ/g)].map((match) =>
    [...(match[1] ?? "").matchAll(/<([0-9a-f]*)>/g)].map((hex) => Buffer.from(hex[1] ?? "", "hex").toString("latin1")).join(""),
  );
}

const columnNumber = (key: string): number => BULK_COMPANY_COLUMNS.findIndex((column) => column.key === key) + 1;

test("the Excel template's header row is the shared column list, in order", async () => {
  const workbook = await loadWorkbook(await buildBulkTemplateWorkbook(ZONES));
  const sheet = workbook.getWorksheet(BULK_COMPANY_SHEET);
  assert.ok(sheet !== undefined);
  const headers = BULK_COMPANY_COLUMNS.map((_, index) => sheet.getRow(1).getCell(index + 1).text);
  assert.deepEqual(headers, BULK_COMPANY_COLUMNS.map((column) => column.header));
  assert.ok(workbook.getWorksheet("Instructions") !== undefined);
});

test("D154 / D159 each Excel header names its form section and Imp / Yes or No; the Instructions sheet lists the columns by section", async () => {
  const workbook = await loadWorkbook(await buildBulkTemplateWorkbook(ZONES));
  const header = workbook.getWorksheet(BULK_COMPANY_SHEET)?.getRow(1);
  assert.ok(header !== undefined);
  const noteOf = (key: string): string => {
    const note = header.getCell(columnNumber(key)).note;
    return typeof note === "string" ? note : (note?.texts ?? []).map((part) => part.text).join("");
  };
  assert.match(noteOf("companyName"), /^Basic Information & Address · Imp \/ Yes\./);
  assert.match(noteOf("addressLine2"), /^Basic Information & Address · No\./);
  assert.match(noteOf("financeEmail"), /^Contact Information · Imp \/ Yes\./);
  const instructions = workbook.getWorksheet("Instructions");
  assert.ok(instructions !== undefined);
  const cells: string[] = [];
  instructions.eachRow((row) => row.eachCell((cell) => cells.push(cell.text)));
  for (const section of BULK_SECTIONS) assert.ok(cells.includes(section), section);
  assert.ok(cells.includes("Imp / Yes"));
});

test("list columns carry a dropdown; the zone list holds only the zones given", async () => {
  const workbook = await loadWorkbook(await buildBulkTemplateWorkbook(ZONES));
  const sheet = workbook.getWorksheet(BULK_COMPANY_SHEET);
  assert.ok(sheet !== undefined);
  const zoneValidation = sheet.getRow(2).getCell(columnNumber("zoneId")).dataValidation;
  assert.equal(zoneValidation?.type, "list");
  assert.equal(sheet.getRow(2).getCell(columnNumber("companyType")).dataValidation?.type, "list");

  const lists = workbook.getWorksheet("Lists");
  assert.ok(lists !== undefined);
  const zoneFormula = String(zoneValidation?.formulae?.[0] ?? "");
  const zoneColumn = /\$([A-Z]+)\$/.exec(zoneFormula)?.[1] ?? "";
  const zoneNames: string[] = [];
  lists.getColumn(zoneColumn).eachCell((cell) => {
    if (cell.text !== "") zoneNames.push(cell.text);
  });
  assert.deepEqual(zoneNames, ["Pune", "Mumbai"]);
});

test("the PDF template is a PDF", async () => {
  const pdf = await buildBulkTemplatePdf(ZONES);
  assert.equal(pdf.subarray(0, 5).toString("latin1"), "%PDF-");
  assert.ok(pdf.length > 1000);
});

/** The labels the blank form prints for its single fields - every column but the charges and the trainee list. */
const FORM_FIELD_HEADERS = BULK_COMPANY_COLUMNS.filter((column) => !column.key.startsWith("charge:") && column.key !== "traineeCategories").map(
  (column) => column.header,
);

test("D159 the PDF is a blank Add New Company form: YSF band, the four sections in order, numbered pages", async () => {
  const lines = pdfText(await buildBulkTemplatePdf(ZONES, { compress: false }));
  assert.ok(lines.includes("Add New Company"), "band title");
  const order = BULK_SECTIONS.map((section) => lines.indexOf(section.toUpperCase()));
  assert.ok(order.every((index) => index >= 0), "every section heading");
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "sections in the form's order");
  const pages = lines.filter((line) => /^Page \d+ of \d+$/.test(line));
  assert.ok(pages.length >= 1, "footer on every page");
  assert.equal(pages[0], `Page 1 of ${pages.length}`);
});

test("D159 every single field of the form is printed once as a blank labelled cell, required ones marked *", async () => {
  const lines = pdfText(await buildBulkTemplatePdf(ZONES, { compress: false }));
  for (const column of BULK_COMPANY_COLUMNS.filter((entry) => FORM_FIELD_HEADERS.includes(entry.header))) {
    const label = `${column.header.toUpperCase()}${column.required ? " *" : ""}`;
    assert.equal(lines.filter((line) => line === label).length, 1, label);
  }
});

test("D159 Commercial as per MoU and Trainee Categories are blank tables of 5 rows", async () => {
  const lines = pdfText(await buildBulkTemplatePdf(ZONES, { compress: false }));
  for (const header of ["Charge Name", "Amount (Rs.)", "Period", "Basis", "Trainee Category", "Qualification", "Stipend Rate (Rs.)"]) {
    assert.ok(lines.includes(header), header);
  }
  // Each blank row is numbered 1-5 in its first cell, in both tables.
  for (const n of ["1", "2", "3", "4", "5"]) {
    assert.equal(lines.filter((line) => line === n).length, 2, `row ${n}`);
  }
  // The charge names the table may hold are the 9 core charges only.
  const text = lines.join(" ");
  for (const charge of ["Admin Charges", "Insurance", "Shoes and Uniform", "One Time Registration Fees"]) {
    assert.ok(text.includes(charge), charge);
  }
});

test("D153 / D158 / D159 the form has no PF, ESI, TDS, payroll item, Contact Type, Tenure Unit or removed charge", async () => {
  const text = pdfText(await buildBulkTemplatePdf(ZONES, { compress: false })).join("\n");
  for (const label of [
    "Provident Fund",
    "PF",
    "ESI",
    "TDS",
    "Payroll:",
    "Attendance Bonus",
    "HRA",
    "Contact Type",
    "Tenure Unit",
    "Official Email",
    "Canteen Deduction",
    "Left Deduction",
    "Document Fee",
    "Transportation Deduction",
  ]) {
    assert.ok(!text.includes(label), label);
  }
});

test("D160 the form ends with an Upload MoU PDF section holding the attach / staple box", async () => {
  const lines = pdfText(await buildBulkTemplatePdf(ZONES, { compress: false }));
  const heading = lines.indexOf("UPLOAD MOU PDF");
  assert.ok(heading > lines.indexOf("PAYROLL DETAILS"), "after Payroll Details");
  assert.ok(lines.indexOf("Attach / Staple MoU PDF Document Here") > heading, "box text inside the section");
});

test("D159 the form embeds the YSF logo when given", async () => {
  const pdf = await buildBulkTemplatePdf(ZONES, { logo: await readFile(LOGO), compress: false });
  assert.match(pdf.toString("latin1"), /\/Subtype \/Image/);
});

test("a filled template reads back into cells keyed by column, skipping blank rows", async () => {
  const workbook = await loadWorkbook(await buildBulkTemplateWorkbook(ZONES));
  const sheet = workbook.getWorksheet(BULK_COMPANY_SHEET);
  assert.ok(sheet !== undefined);
  sheet.getRow(2).getCell(columnNumber("companyName")).value = { richText: [{ text: "Acme " }, { text: "Gears" }] };
  sheet.getRow(2).getCell(columnNumber("mouStartDate")).value = new Date(Date.UTC(2026, 9, 1));
  sheet.getRow(2).getCell(columnNumber("pinCode")).value = 410501;
  sheet.getRow(4).getCell(columnNumber("companyName")).value = "Second Co";
  const filled = Buffer.from(await workbook.xlsx.writeBuffer());

  const result = await readBulkSheet(filled);
  assert.ok(result.ok);
  assert.deepEqual(result.rows.map((row) => row.row), [2, 4]);
  const first = result.rows[0]?.cells ?? {};
  assert.equal(first["companyName"], "Acme Gears");
  assert.equal(first["mouStartDate"], "2026-10-01");
  assert.equal(first["pinCode"], "410501");
  assert.equal(first["scheme"], "");
});

test("a file that is not a workbook, lacks the sheet or a column, or has no rows is refused", async () => {
  assert.equal((await readBulkSheet(Buffer.from("not a workbook"))).ok, false);

  const other = new ExcelJS.Workbook();
  other.addWorksheet("Sheet1").addRow(["x"]);
  const noSheet = await readBulkSheet(Buffer.from(await other.xlsx.writeBuffer()));
  assert.deepEqual(noSheet, {
    ok: false,
    error: `The file has no "${BULK_COMPANY_SHEET}" sheet and no sheet with the template's header row. Use the downloaded template.`,
  });

  const missing = new ExcelJS.Workbook();
  missing.addWorksheet(BULK_COMPANY_SHEET).addRow(BULK_COMPANY_COLUMNS.filter((column) => column.key !== "zoneId").map((column) => column.header));
  const noZone = await readBulkSheet(Buffer.from(await missing.xlsx.writeBuffer()));
  assert.deepEqual(noZone, { ok: false, error: "Missing column: Zone. Use the downloaded template." });

  const empty = await readBulkSheet(await buildBulkTemplateWorkbook(ZONES));
  assert.deepEqual(empty, { ok: false, error: "The sheet has no company rows." });
});

/** A template workbook with `fill` applied to its Companies sheet, as an upload buffer. */
async function filledTemplate(fill: (sheet: ExcelJS.Worksheet) => void): Promise<Buffer> {
  const workbook = await loadWorkbook(await buildBulkTemplateWorkbook(ZONES));
  const sheet = workbook.getWorksheet(BULK_COMPANY_SHEET);
  assert.ok(sheet !== undefined);
  fill(sheet);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

test("D161 an email Excel turned into a link - plain or formatted text - reads as its text", async () => {
  const result = await readBulkSheet(
    await filledTemplate((sheet) => {
      sheet.getRow(2).getCell(columnNumber("hrEmail")).value = { text: "hr@acme.in", hyperlink: "mailto:hr@acme.in" };
      sheet.getRow(2).getCell(columnNumber("financeEmail")).value = {
        text: { richText: [{ text: "acc" }, { text: "@acme.in" }] },
        hyperlink: "mailto:acc@acme.in",
      } as unknown as ExcelJS.CellValue;
    }),
  );
  assert.ok(result.ok);
  assert.equal(result.rows[0]?.cells["hrEmail"], "hr@acme.in");
  assert.equal(result.rows[0]?.cells["financeEmail"], "acc@acme.in");
});

test("D161 rows holding only spaces, empty formatted text or a formula error are skipped as blank", async () => {
  const result = await readBulkSheet(
    await filledTemplate((sheet) => {
      sheet.getRow(2).getCell(columnNumber("companyName")).value = "  Acme Gears  ";
      sheet.getRow(5).getCell(columnNumber("companyName")).value = "   ";
      sheet.getRow(6).getCell(columnNumber("city")).value = { richText: [{ text: "  " }] };
      sheet.getRow(7).getCell(columnNumber("state")).value = { formula: "NA()", result: { error: "#N/A" } } as ExcelJS.CellValue;
    }),
  );
  assert.ok(result.ok);
  assert.deepEqual(result.rows.map((row) => row.row), [2]);
  assert.equal(result.rows[0]?.cells["companyName"], "Acme Gears");
});

test("D161 a formula cell reads as its result", async () => {
  const result = await readBulkSheet(
    await filledTemplate((sheet) => {
      sheet.getRow(2).getCell(columnNumber("tenureValue")).value = { formula: "12*2", result: 24 };
    }),
  );
  assert.ok(result.ok);
  assert.equal(result.rows[0]?.cells["tenureValue"], "24");
});

test("D161 every template header must be present - optional ones too - and named when missing", async () => {
  const workbook = new ExcelJS.Workbook();
  const keep = BULK_COMPANY_COLUMNS.filter((column) => column.key !== "addressLine2" && column.key !== "purchaseEmail");
  workbook.addWorksheet(BULK_COMPANY_SHEET).addRow(keep.map((column) => column.header));
  const result = await readBulkSheet(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(result, { ok: false, error: "Missing columns: Address Line 2, Purchase Email ID. Use the downloaded template." });
});

test("D161 a template header that appears twice is refused", async () => {
  const workbook = new ExcelJS.Workbook();
  const headers = BULK_COMPANY_COLUMNS.map((column) => column.header);
  workbook.addWorksheet(BULK_COMPANY_SHEET).addRow([...headers, " city "]);
  const result = await readBulkSheet(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(result, { ok: false, error: "Column appears more than once: City. Use the downloaded template." });
});

test("D161 blank or unknown extra columns, in any position, are ignored", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(BULK_COMPANY_SHEET);
  const headers = BULK_COMPANY_COLUMNS.map((column) => column.header).reverse();
  sheet.addRow(["", "My Notes", ...headers, "", "  "]);
  const companyAt = sheet.getRow(1).values as unknown[];
  const companyIndex = companyAt.findIndex((value) => value === "Company Name");
  sheet.getRow(2).getCell(companyIndex).value = "Acme Gears";
  sheet.getRow(2).getCell(2).value = "a note";
  const result = await readBulkSheet(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.ok(result.ok);
  assert.equal(result.rows[0]?.cells["companyName"], "Acme Gears");
  assert.equal(Object.values(result.rows[0]?.cells ?? {}).includes("a note"), false);
});

test("D161 a renamed sheet is used when its header row is the template's", async () => {
  const workbook = await loadWorkbook(await buildBulkTemplateWorkbook(ZONES));
  const sheet = workbook.getWorksheet(BULK_COMPANY_SHEET);
  assert.ok(sheet !== undefined);
  sheet.name = "My Companies";
  sheet.getRow(2).getCell(columnNumber("companyName")).value = "Acme Gears";
  const result = await readBulkSheet(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.ok(result.ok);
  assert.equal(result.rows[0]?.cells["companyName"], "Acme Gears");
});

test(`more than ${BULK_MAX_ROWS} rows are refused`, async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(BULK_COMPANY_SHEET);
  sheet.addRow(BULK_COMPANY_COLUMNS.map((column) => column.header));
  for (let index = 0; index <= BULK_MAX_ROWS; index += 1) sheet.addRow([`Company ${index}`]);
  const result = await readBulkSheet(Buffer.from(await workbook.xlsx.writeBuffer()));
  assert.deepEqual(result, { ok: false, error: `The sheet has more than ${BULK_MAX_ROWS} company rows. Split it into several files.` });
});

// --- D162: one upload carries the Excel file and the MoU PDFs ---------------------------

const PDF_BYTES = Buffer.from("%PDF-1.7 test");
const upload = (originalname: string, buffer: Buffer = Buffer.from("PK zip"), mimetype = "application/octet-stream") => ({
  originalname,
  buffer,
  mimetype,
  size: buffer.length,
});

test("D162 one .xlsx plus PDFs are sorted into the sheet and the MoU PDFs", () => {
  const sorted = sortBulkUploadFiles([
    upload("27AAKCS4821M1Z3.pdf", PDF_BYTES, "application/pdf"),
    upload("companies.XLSX"),
    upload("33AAMCM5517F1Z6.pdf", PDF_BYTES),
  ]);
  assert.ok(sorted.ok);
  assert.equal(sorted.sheet.originalname, "companies.XLSX");
  assert.deepEqual(sorted.pdfs.map((file) => file.originalname), ["27AAKCS4821M1Z3.pdf", "33AAMCM5517F1Z6.pdf"]);
});

test("D163 an Excel file alone is a complete upload - no PDFs needed", () => {
  const sorted = sortBulkUploadFiles([upload("companies.xlsx")]);
  assert.ok(sorted.ok);
  assert.equal(sorted.sheet.originalname, "companies.xlsx");
  assert.deepEqual(sorted.pdfs, []);
});

test("D164 PDFs alone are a complete upload - they go to existing companies", () => {
  const sorted = sortBulkUploadFiles([upload("27AAKCS4821M1Z3.pdf", PDF_BYTES), upload("24AAACN6604H1Z9.pdf", PDF_BYTES)]);
  assert.ok(sorted.ok);
  assert.equal(sorted.sheet, undefined);
  assert.deepEqual(sorted.pdfs.map((file) => file.originalname), ["27AAKCS4821M1Z3.pdf", "24AAACN6604H1Z9.pdf"]);
});

test("D162 two Excel files, or an old .xls, are refused with a clear message", () => {
  assert.deepEqual(sortBulkUploadFiles([upload("a.xlsx"), upload("b.xlsx")]), {
    ok: false,
    errors: ["Upload one Excel file at a time (got a.xlsx, b.xlsx)."],
  });
  assert.deepEqual(sortBulkUploadFiles([upload("old.xls")]), {
    ok: false,
    errors: ["old.xls is an old Excel (.xls) file. Save it as Excel Workbook (.xlsx) and upload again."],
  });
});

test("D162 a file that is not Excel or PDF, or a fake PDF, is refused - every problem listed", () => {
  const sorted = sortBulkUploadFiles([upload("data.xlsx"), upload("notes.docx"), upload("fake.pdf", Buffer.from("PK not a pdf"), "application/pdf")]);
  assert.deepEqual(sorted, {
    ok: false,
    errors: [
      "notes.docx: only the Excel template (.xlsx) and MoU PDFs (.pdf) can be uploaded.",
      "fake.pdf: not a valid PDF file.",
    ],
  });
});

test(`D162 more than ${BULK_MAX_MOU_PDFS} MoU PDFs in one upload are refused`, () => {
  const pdfs = Array.from({ length: BULK_MAX_MOU_PDFS + 1 }, (_, index) => upload(`${index}.pdf`, PDF_BYTES));
  const sorted = sortBulkUploadFiles([upload("data.xlsx"), ...pdfs]);
  assert.deepEqual(sorted, { ok: false, errors: [`Upload at most ${BULK_MAX_MOU_PDFS} MoU PDFs at a time.`] });
});

test("D162 an Excel file over 5 MB is refused", () => {
  const big = upload("data.xlsx", Buffer.alloc(5 * 1024 * 1024 + 1));
  assert.deepEqual(sortBulkUploadFiles([big]), { ok: false, errors: ["The Excel file must be 5 MB or smaller."] });
});

// --- D165: the template is a fillable form, and a filled one can be read back ---------------

test("D165 the PDF template is fillable: one field per form field name, lists as dropdowns", async () => {
  const form = (await LibPdf.load(await buildBulkTemplatePdf(ZONES))).getForm();
  const names = form.getFields().map((field) => field.getName());
  assert.deepEqual([...names].sort(), [...bulkFormFieldNames()].sort());
  assert.ok(form.getField("companyName") instanceof PDFTextField);
  assert.ok(form.getField("zoneId") instanceof PDFDropdown);
  assert.deepEqual(form.getDropdown("zoneId").getOptions(), ["", "Pune", "Mumbai"]);
  assert.ok(form.getDropdown("charge1Name").getOptions().includes("One Time Registration Fees"));
  assert.ok(!form.getDropdown("charge1Name").getOptions().includes("Canteen Deduction"));
  assert.ok(form.getDropdown("charge3Period").getOptions().includes("Monthly"));
});

test("D165 a filled form reads back as its field values; a plain PDF has no form", async () => {
  const pdf = await LibPdf.load(await buildBulkTemplatePdf(ZONES));
  const form = pdf.getForm();
  form.getTextField("companyName").setText("Acme Gears");
  form.getDropdown("zoneId").select("Pune");
  form.getTextField("trainee1Name").setText("ITI Fitter");
  const fields = await readMouPdfForm(Buffer.from(await pdf.save()));
  assert.ok(fields !== undefined);
  assert.equal(fields["companyName"], "Acme Gears");
  assert.equal(fields["zoneId"], "Pune");
  assert.equal(fields["trainee1Name"], "ITI Fitter");
  assert.equal(fields["gstNumber"], "");

  const plain = await LibPdf.create();
  plain.addPage();
  assert.equal(await readMouPdfForm(Buffer.from(await plain.save())), undefined);
  assert.equal(await readMouPdfForm(Buffer.from("%PDF-1.4 broken")), undefined);
});
