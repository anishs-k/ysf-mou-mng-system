/**
 * Purpose: Integration tests for SPEC-22 bulk company upload against the real app
 * and database: both templates download for an authoring user and not for a
 * VIEWER, a clean file creates every company with the wizard's rows and no MOU
 * PDF, and any bad row - invalid field, another zone, a registered or repeated
 * GST - saves nothing (D139). A bulk MOU then accepts a PDF via Upload MoU.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";

import { BULK_COMPANY_COLUMNS, BULK_COMPANY_SHEET } from "@mou/domain";
import ExcelJS from "exceljs";
import { PDFDocument as LibPdf } from "pdf-lib";
import type { Pool } from "pg";

import { createApp } from "./index.ts";
import { buildBulkTemplatePdf } from "./db/bulk-company-files.ts";
import { OUT_OF_ZONE_MESSAGE } from "./auth/zone-scope.ts";
import { createTestPool, insertCompany, insertMou, insertPlant, insertUserWithPassword, insertZone, resetDatabase } from "./db/test-harness.ts";

let pool: Pool;
let server: Server | undefined;
let baseUrl: string;

before(async () => {
  pool = await createTestPool();
  const listening = createApp(pool).listen(0);
  await once(listening, "listening");
  const address = listening.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected the test server to listen on a TCP port");
  }
  server = listening;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await resetDatabase(pool);
});

after(async () => {
  if (server === undefined) {
    return;
  }
  const closing = server;
  await new Promise<void>((resolve, reject) => {
    closing.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
});

async function cookieFor(username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie") ?? "";
}

/** A sheet row: every column filled for a valid company, then the overrides. */
function companyRow(overrides: Readonly<Record<string, string>> = {}): Record<string, string> {
  return {
    companyType: "Private Sector",
    companyName: "Acme Gears",
    registrationType: "Company",
    tanNumber: "PNEA12345B",
    gstNumber: "27AAACA1234A1Z5",
    zoneId: "Pune",
    plantName: "Chakan Plant",
    sector: "Automobile",
    addressLine1: "Plot 4, MIDC",
    city: "Pune",
    district: "Pune",
    pinCode: "410501",
    state: "Maharashtra",
    hrContactName: "Asha Rao",
    hrContactNumber: "9876543210",
    financeHeadContactName: "Ravi Iyer",
    financeHeadContactNumber: "9876501234",
    hrEmail: "hr@acme.in",
    financeEmail: "accounts@acme.in",
    scheme: "NAPS",
    mouStartDate: "2026-10-01",
    tenureValue: "12",
    attendanceCycle: "16th to 15th",
    stipendDate: "7",
    "charge:ADMIN_CHARGES": "1500",
    traineeCategories: "ITI Fitter | ITI | 9000; Diploma",
    ...overrides,
  };
}

async function sheetFile(rows: readonly Readonly<Record<string, string>>[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(BULK_COMPANY_SHEET);
  sheet.addRow(BULK_COMPANY_COLUMNS.map((column) => column.header));
  for (const row of rows) sheet.addRow(BULK_COMPANY_COLUMNS.map((column) => row[column.key] ?? ""));
  return new Blob([await workbook.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

async function upload(cookie: string, file: Blob, filename = "companies.xlsx") {
  const body = new FormData();
  body.append("file", file, filename);
  const response = await fetch(`${baseUrl}/api/companies/bulk`, { method: "POST", headers: { Cookie: cookie }, body });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const count = async (table: string): Promise<number> =>
  Number((await pool.query<{ n: string }>(`SELECT count(*) AS n FROM ${table}`)).rows[0]?.n ?? 0);

async function setup() {
  const pune = await insertZone(pool, "PUNE", "Pune");
  const mumbai = await insertZone(pool, "MUM", "Mumbai");
  const entry = await insertUserWithPassword(pool, { username: "pune.entry", role: "DATA_ENTRY", zoneIds: [pune] });
  return { pune, mumbai, entry, cookie: await cookieFor(entry.username, entry.password) };
}

test("AC2/AC3: both templates download for an authoring user", async () => {
  const { cookie } = await setup();
  const xlsx = await fetch(`${baseUrl}/api/companies/bulk/template?format=xlsx`, { headers: { Cookie: cookie } });
  assert.equal(xlsx.status, 200);
  assert.match(xlsx.headers.get("content-disposition") ?? "", /company-bulk-template\.xlsx/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await xlsx.arrayBuffer());
  assert.equal(workbook.getWorksheet(BULK_COMPANY_SHEET)?.getRow(1).getCell(1).text, BULK_COMPANY_COLUMNS[0]?.header);

  const pdf = await fetch(`${baseUrl}/api/companies/bulk/template?format=pdf`, { headers: { Cookie: cookie } });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get("content-type"), "application/pdf");
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString("latin1"), "%PDF-");
});

test("AC4/AC10: a clean file creates every company with the wizard's rows and no PDF; Upload MoU then works", async () => {
  const { cookie } = await setup();
  const reply = await upload(cookie, await sheetFile([companyRow(), companyRow({ companyName: "Beta Tools", gstNumber: "27AABCB1234B1Z5" })]));
  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  const created = reply.body["created"] as Array<{ row: number; generatedCode: string }>;
  assert.deepEqual(created.map((entry) => entry.row), [2, 3]);
  assert.equal(new Set(created.map((entry) => entry.generatedCode)).size, 2);

  assert.equal(await count("company"), 2);
  assert.equal(await count("company_plant"), 2);
  assert.equal(await count("mou"), 2);
  assert.equal(await count("commercial_item"), 2);
  assert.equal(await count("trainee_category"), 4);
  // PF, ESI and TDS only, at their defaults (D158).
  assert.equal(await count("payroll_item"), 6);
  assert.equal(await count("mou_document"), 0);

  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM mou LIMIT 1`);
  const body = new FormData();
  body.append("file", new Blob(["%PDF-1.4\n%bulk\n"], { type: "application/pdf" }), "mou.pdf");
  const attach = await fetch(`${baseUrl}/api/mous/${rows[0]?.id}/document`, { method: "POST", headers: { Cookie: cookie }, body });
  assert.equal(attach.status, 201);
});

test("AC5: one bad row saves nothing and is reported by row and column", async () => {
  const { cookie } = await setup();
  const reply = await upload(
    cookie,
    await sheetFile([
      companyRow(),
      companyRow({ companyName: "Beta Tools", gstNumber: "bad" }),
      companyRow({ companyName: "Gamma Ltd", gstNumber: "27AABCG1234G1Z5" }),
    ]),
  );
  assert.equal(reply.status, 422);
  const rowErrors = reply.body["rowErrors"] as Array<{ row: number; column: string }>;
  assert.ok(rowErrors.some((error) => error.row === 3 && error.column === "GST Number"));
  assert.equal(await count("company"), 0);
  assert.equal(await count("mou"), 0);
});

test("AC6: a row in a zone outside the uploader's zones is refused", async () => {
  const { cookie } = await setup();
  const reply = await upload(cookie, await sheetFile([companyRow({ zoneId: "Mumbai" })]));
  assert.equal(reply.status, 422);
  assert.deepEqual(reply.body["rowErrors"], [{ row: 2, column: "Zone", message: OUT_OF_ZONE_MESSAGE }]);
});

test("AC7: a registered GST, or one repeated in the file, is refused", async () => {
  const { pune, entry, cookie } = await setup();
  await insertCompany(pool, pune, entry.id, { gstNumber: "27AAACA1234A1Z5" });
  const registered = await upload(cookie, await sheetFile([companyRow()]));
  assert.equal(registered.status, 422);
  assert.ok((registered.body["rowErrors"] as Array<{ message: string }>).some((error) => error.message === "This GST number is already registered"));

  const repeated = await upload(cookie, await sheetFile([companyRow({ gstNumber: "27AABCB1234B1Z5" }), companyRow({ companyName: "Beta Tools", gstNumber: "27AABCB1234B1Z5" })]));
  assert.equal(repeated.status, 422);
  assert.deepEqual(repeated.body["rowErrors"], [{ row: 3, column: "GST Number", message: "Same GST Number as row 2" }]);
  assert.equal(await count("company"), 1);
});

test("AC8: a non-xlsx file or a missing column is a 400", async () => {
  const { cookie } = await setup();
  const csv = await upload(cookie, new Blob(["a,b"], { type: "text/csv" }), "companies.csv");
  assert.equal(csv.status, 400);

  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet(BULK_COMPANY_SHEET).addRow(["Company Name"]);
  const missing = await upload(cookie, new Blob([await workbook.xlsx.writeBuffer()]), "companies.xlsx");
  assert.equal(missing.status, 400);
  assert.match(String(missing.body["error"]), /^Missing columns: /);
});

/** D162: the sheet and its MoU PDFs in one request, under the `files` field. */
async function uploadWithPdfs(cookie: string, sheet: Blob, pdfs: readonly string[]) {
  const body = new FormData();
  body.append("files", sheet, "companies.xlsx");
  for (const name of pdfs) body.append("files", new Blob([`%PDF-1.4\n%${name}\n`], { type: "application/pdf" }), name);
  const response = await fetch(`${baseUrl}/api/companies/bulk`, { method: "POST", headers: { Cookie: cookie }, body });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test("D162: MoU PDFs named by GST Number are stored as the new MOUs' documents", async () => {
  const { cookie } = await setup();
  const sheet = await sheetFile([companyRow(), companyRow({ companyName: "Beta Tools", gstNumber: "27AABCB1234B1Z5" })]);
  const reply = await uploadWithPdfs(cookie, sheet, ["27AAACA1234A1Z5 - Acme MoU.pdf"]);
  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  const created = reply.body["created"] as Array<{ row: number; mouPdf: string | null }>;
  assert.deepEqual(created.map((entry) => entry.mouPdf), ["27AAACA1234A1Z5 - Acme MoU.pdf", null]);
  const { rows } = await pool.query<{ original_filename: string; company_name: string }>(
    `SELECT d.original_filename, c.company_name FROM mou_document d JOIN mou m ON m.id = d.mou_id JOIN company c ON c.id = m.company_id`,
  );
  assert.deepEqual(rows, [{ original_filename: "27AAACA1234A1Z5 - Acme MoU.pdf", company_name: "Acme Gears" }]);
});

test("D163: the Excel file alone, sent the new way, creates the companies with no MoU PDF", async () => {
  const { cookie } = await setup();
  const reply = await uploadWithPdfs(cookie, await sheetFile([companyRow()]), []);
  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  assert.deepEqual((reply.body["created"] as Array<{ mouPdf: string | null }>).map((entry) => entry.mouPdf), [null]);
  assert.equal(await count("company"), 1);
  assert.equal(await count("mou_document"), 0);
});

test("D162: a PDF naming no row saves nothing and is reported as a file error", async () => {
  const { cookie } = await setup();
  const reply = await uploadWithPdfs(cookie, await sheetFile([companyRow()]), ["unknown.pdf"]);
  assert.equal(reply.status, 422);
  assert.equal((reply.body["fileErrors"] as string[]).length, 1);
  assert.equal(await count("company"), 0);
  assert.equal(await count("mou_document"), 0);
});

test("D162: an old .xls file is a 400 with a clear message", async () => {
  const { cookie } = await setup();
  const xls = await upload(cookie, new Blob(["old"]), "companies.xls");
  assert.equal(xls.status, 400);
  assert.match(String(xls.body["error"]), /Save it as Excel Workbook \(\.xlsx\)/);
});

/** D164: PDFs on their own - no sheet in the request. */
async function uploadPdfsOnly(cookie: string, names: readonly string[]) {
  const body = new FormData();
  for (const name of names) body.append("files", new Blob([`%PDF-1.4\n%${name}\n`], { type: "application/pdf" }), name);
  const response = await fetch(`${baseUrl}/api/companies/bulk`, { method: "POST", headers: { Cookie: cookie }, body });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function existingCompany(zoneId: string, createdBy: string, gstNumber: string, mouCount = 1) {
  const companyId = await insertCompany(pool, zoneId, createdBy, { gstNumber, companyName: `Existing ${gstNumber}` });
  const plantId = await insertPlant(pool, companyId);
  const mouIds: string[] = [];
  for (let index = 0; index < mouCount; index += 1) {
    mouIds.push(await insertMou(pool, companyId, plantId, { scheme: ["NAPS", "NATS", "WILP"][index] ?? "BVOC" }));
  }
  return { companyId, mouIds };
}

test("D164: PDFs alone attach to existing companies' newest MoU without a PDF", async () => {
  const { cookie, pune, entry } = await setup();
  const one = await existingCompany(pune, entry.id, "27AAKCS4821M1Z3");
  const two = await existingCompany(pune, entry.id, "27AALCK7310Q1Z8", 2);
  const reply = await uploadPdfsOnly(cookie, ["27AAKCS4821M1Z3.pdf", "27aalck7310q1z8 - MoU.pdf"]);
  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  const attached = reply.body["attached"] as Array<{ fileName: string; companyName: string }>;
  assert.deepEqual(attached.map((entry) => entry.fileName), ["27AAKCS4821M1Z3.pdf", "27aalck7310q1z8 - MoU.pdf"]);
  const { rows } = await pool.query<{ mou_id: string }>(`SELECT mou_id FROM mou_document ORDER BY original_filename`);
  assert.deepEqual(rows.map((row) => row.mou_id), [one.mouIds[0], two.mouIds[1]]);
});

test("D164: once the newest MoU has a PDF, the next PDF goes to the next newest; none left is an error", async () => {
  const { cookie, pune, entry } = await setup();
  const company = await existingCompany(pune, entry.id, "27AAKCS4821M1Z3", 2);
  assert.equal((await uploadPdfsOnly(cookie, ["27AAKCS4821M1Z3.pdf"])).status, 201);
  assert.equal((await uploadPdfsOnly(cookie, ["27AAKCS4821M1Z3.pdf"])).status, 201);
  const { rows } = await pool.query<{ mou_id: string }>(`SELECT mou_id FROM mou_document ORDER BY uploaded_at`);
  assert.deepEqual(rows.map((row) => row.mou_id), [company.mouIds[1], company.mouIds[0]]);
  const third = await uploadPdfsOnly(cookie, ["27AAKCS4821M1Z3.pdf"]);
  assert.equal(third.status, 422);
  assert.match((third.body["fileErrors"] as string[])[0] ?? "", /already has a MoU PDF/);
});

test("D164: a PDF naming no company, no GST, another zone, or one company twice saves nothing", async () => {
  const { cookie, pune, mumbai, entry } = await setup();
  await existingCompany(pune, entry.id, "27AAKCS4821M1Z3");
  await existingCompany(mumbai, entry.id, "27AALCK7310Q1Z8");
  const reply = await uploadPdfsOnly(cookie, [
    "27AAKCS4821M1Z3.pdf",
    "27AAKCS4821M1Z3 copy.pdf",
    "33AAMCM5517F1Z6.pdf",
    "mou.pdf",
    "27AALCK7310Q1Z8.pdf",
  ]);
  assert.equal(reply.status, 422);
  const errors = reply.body["fileErrors"] as string[];
  assert.equal(errors.length, 4, JSON.stringify(errors));
  assert.ok(errors.some((message) => message.includes("More than one PDF")));
  assert.ok(errors.some((message) => message.startsWith("33AAMCM5517F1Z6.pdf: no company")));
  assert.ok(errors.some((message) => message.startsWith("mou.pdf: the file name must start")));
  assert.ok(errors.some((message) => message.startsWith("27AALCK7310Q1Z8.pdf: ") && message.includes("zone")));
  assert.equal(await count("mou_document"), 0);
});

/** D165: the fillable template filled the way a PDF viewer saves it. */
async function filledForm(zones: readonly { id: string; code: string; name: string }[], values: Readonly<Record<string, string>>): Promise<Blob> {
  const pdf = await LibPdf.load(await buildBulkTemplatePdf(zones));
  const form = pdf.getForm();
  for (const [name, value] of Object.entries(values)) {
    const field = form.getField(name);
    if ("select" in field && typeof field.select === "function") (field as unknown as { select(v: string): void }).select(value);
    else (field as unknown as { setText(v: string): void }).setText(value);
  }
  return new Blob([await pdf.save()], { type: "application/pdf" });
}

function formValues(overrides: Readonly<Record<string, string>> = {}): Record<string, string> {
  const row = companyRow({ gstNumber: "27AAKCS4821M1Z3", companyName: "Form Co" });
  const single = Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("charge:") && key !== "traineeCategories" && row[key] !== ""));
  return { ...single, charge1Name: "Admin Charges", charge1Amount: "1500", charge1Period: "Monthly", trainee1Name: "ITI Fitter", ...overrides };
}

async function uploadForm(cookie: string, blob: Blob, name = "Form Co MoU.pdf") {
  const body = new FormData();
  body.append("files", blob, name);
  const response = await fetch(`${baseUrl}/api/companies/bulk`, { method: "POST", headers: { Cookie: cookie }, body });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

test("D165: a filled fillable form for a new GST creates the company and attaches itself as its MoU PDF", async () => {
  const { cookie, pune, mumbai } = await setup();
  const zones = [{ id: pune, code: "PUNE", name: "Pune" }, { id: mumbai, code: "MUM", name: "Mumbai" }];
  const reply = await uploadForm(cookie, await filledForm(zones, formValues()));
  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  const created = reply.body["created"] as Array<{ companyName: string; mouPdf: string }>;
  assert.deepEqual(created.map((entry) => [entry.companyName, entry.mouPdf]), [["Form Co", "Form Co MoU.pdf"]]);
  const { rows } = await pool.query<{ period: string }>(`SELECT period FROM commercial_item WHERE item_key = 'ADMIN_CHARGES'`);
  assert.deepEqual(rows.map((row) => row.period), ["MONTHLY"]);
  assert.equal(await count("mou_document"), 1);
  assert.equal(await count("payroll_item"), 3);
});

test("D165: a filled form with errors saves nothing and names the file and field", async () => {
  const { cookie, pune, mumbai } = await setup();
  const zones = [{ id: pune, code: "PUNE", name: "Pune" }, { id: mumbai, code: "MUM", name: "Mumbai" }];
  const reply = await uploadForm(cookie, await filledForm(zones, formValues({ companyName: "", charge2Amount: "50" })));
  assert.equal(reply.status, 422);
  const errors = reply.body["fileErrors"] as string[];
  assert.ok(errors.includes("Form Co MoU.pdf: Charge row 2 - Choose the charge name"), JSON.stringify(errors));
  assert.ok(errors.some((message) => message.startsWith("Form Co MoU.pdf: Company Name - ")), JSON.stringify(errors));
  assert.equal(await count("company"), 0);
});

test("AC9: a VIEWER can neither download a template nor upload", async () => {
  const viewer = await insertUserWithPassword(pool, { username: "viewer", role: "VIEWER" });
  const cookie = await cookieFor(viewer.username, viewer.password);
  const template = await fetch(`${baseUrl}/api/companies/bulk/template?format=xlsx`, { headers: { Cookie: cookie } });
  assert.equal(template.status, 403);
  assert.equal((await upload(cookie, await sheetFile([companyRow()]))).status, 403);
});
