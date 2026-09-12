/**
 * Purpose: Integration tests for SPEC-13 - Search, the Excel export (via the
 * job it creates), the two PDF export scopes, and the export cleanup job.
 * Reads the actual generated workbook back with `exceljs` itself (not a
 * hand-rolled byte check) so AC7/AC8's numeric-vs-blank claims are verified
 * against what a real spreadsheet application would see.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";

import ExcelJS from "exceljs";
import type { Pool } from "pg";

import { createApp } from "./index.ts";
import { runExportCleanup } from "./jobs/export-cleanup.ts";
import {
  createTestPool,
  insertCommercialItem,
  insertCompany,
  insertMou,
  insertPlant,
  insertUserWithPassword,
  insertZone,
  resetDatabase,
} from "./db/test-harness.ts";

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

async function login(username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie !== null && setCookie !== "");
  return setCookie;
}

async function viewerCookie(): Promise<string> {
  const viewer = await insertUserWithPassword(pool, { username: `viewer${Math.random()}`, password: "pass", role: "VIEWER" });
  return login(viewer.username, viewer.password);
}

async function downloadReadyExport(jobId: string, cookie: string): Promise<Buffer> {
  const response = await fetch(`${baseUrl}/api/export/jobs/${jobId}/download`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return Buffer.from(await response.arrayBuffer());
}

test("AC1 searching by Company for a partial, case-insensitive fragment returns matches", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator1", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id, { companyName: "Statue Industries" });
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId);
  const cookie = await viewerCookie();

  const response = await fetch(`${baseUrl}/api/search?by=company&q=TAT`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as { rows: Array<{ companyName: string }>; total: number };
  assert.ok(body.rows.some((row) => row.companyName === "Statue Industries"));
});

test("AC2 searching by the generated code returns the matching company", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator2", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id, { generatedCode: "WEST-26-0099" });
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId);
  const cookie = await viewerCookie();

  const response = await fetch(`${baseUrl}/api/search?by=company&q=WEST-26-0099`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as { rows: Array<{ generatedCode: string }> };
  assert.ok(body.rows.some((row) => row.generatedCode === "WEST-26-0099"));
});

test("AC3 a single-character query is rejected with a minimum-length message", async () => {
  const cookie = await viewerCookie();
  const response = await fetch(`${baseUrl}/api/search?by=company&q=a`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 422);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /at least 2 characters/i);
});

test("AC4 search by Scheme rejects a value that is not a real scheme", async () => {
  const cookie = await viewerCookie();
  const response = await fetch(`${baseUrl}/api/search?by=scheme&q=NOT_A_SCHEME`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 422);
});

test("AC5 a company with WILP and FLEXI MOUs produces two result rows", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator3", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id, { companyName: "Dual Scheme Co" });
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId, { scheme: "WILP" });
  await insertMou(pool, companyId, plantId, { scheme: "FLEXI" });
  const cookie = await viewerCookie();

  const response = await fetch(`${baseUrl}/api/search?by=company&q=Dual Scheme`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as { rows: unknown[] };
  assert.equal(body.rows.length, 2);
});

test("AC6 zone and status filters narrow the results", async () => {
  const zoneA = await insertZone(pool, "EAST", "East");
  const zoneB = await insertZone(pool, "SOUTH", "South");
  const creator = await insertUserWithPassword(pool, { username: "creator4", password: "pass" });
  const companyA = await insertCompany(pool, zoneA, creator.id, { companyName: "Narrow Test Co A" });
  const plantA = await insertPlant(pool, companyA);
  await insertMou(pool, companyA, plantA, { scheme: "WILP" });
  const companyB = await insertCompany(pool, zoneB, creator.id, { companyName: "Narrow Test Co B" });
  const plantB = await insertPlant(pool, companyB);
  await insertMou(pool, companyB, plantB, { scheme: "WILP" });
  const cookie = await viewerCookie();

  const response = await fetch(`${baseUrl}/api/search?by=company&q=Narrow Test&zoneId=${zoneA}`, {
    headers: { Cookie: cookie },
  });
  const body = (await response.json()) as { rows: Array<{ companyName: string }> };
  assert.equal(body.rows.length, 1);
  assert.equal(body.rows[0]?.companyName, "Narrow Test Co A");
});

test("AC7/AC8 the Excel export has all four sheets, numeric amounts, and distinguishes a blank charge from 0", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator5", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id, { companyName: "Excel Test Co" });
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId, { scheme: "WILP" });
  await insertCommercialItem(pool, mouId, "ADMIN_CHARGES", { amount: "0.00" });
  // INSURANCE deliberately left unset - no row - to exercise the blank case.
  const cookie = await viewerCookie();

  const exportResponse = await fetch(`${baseUrl}/api/export/excel?by=company&q=Excel Test`, { headers: { Cookie: cookie } });
  assert.equal(exportResponse.status, 202);
  const { jobId, status } = (await exportResponse.json()) as { jobId: string; status: string };
  assert.equal(status, "ready");

  const buffer = await downloadReadyExport(jobId, cookie);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  assert.deepEqual(workbook.worksheets.map((sheet) => sheet.name), ["Companies", "MOUs", "Commercial", "Payroll"]);

  const commercialSheet = workbook.getWorksheet("Commercial");
  assert.ok(commercialSheet !== undefined);
  const headerRow = commercialSheet.getRow(1).values as unknown[];
  const adminChargeCol = headerRow.findIndex((v) => v === "Admin Charges");
  const insuranceCol = headerRow.findIndex((v) => v === "Insurance");
  const dataRow = commercialSheet.getRow(2);
  assert.equal(dataRow.getCell(adminChargeCol).value, 0);
  assert.equal(dataRow.getCell(insuranceCol).value, null);
});

test("AC9 Export PDF with scope All Zones succeeds and produces a real PDF", async () => {
  const cookie = await viewerCookie();
  const response = await fetch(`${baseUrl}/api/export/pdf?scope=all_zones`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 202);
  const { jobId, status } = (await response.json()) as { jobId: string; status: string };
  assert.equal(status, "ready");

  const buffer = await downloadReadyExport(jobId, cookie);
  assert.equal(buffer.subarray(0, 4).toString("latin1"), "%PDF");
});

test("AC10 Export PDF with the company scope requires companyId and plantId", async () => {
  const cookie = await viewerCookie();
  const response = await fetch(`${baseUrl}/api/export/pdf?scope=company`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 400);
});

test("AC11 the company-scope PDF succeeds once companyId and plantId are given", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator6", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId, { scheme: "WILP" });
  const cookie = await viewerCookie();

  const response = await fetch(`${baseUrl}/api/export/pdf?scope=company&companyId=${companyId}&plantId=${plantId}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 202);
  const { jobId, status } = (await response.json()) as { jobId: string; status: string };
  assert.equal(status, "ready");
  const buffer = await downloadReadyExport(jobId, cookie);
  assert.equal(buffer.subarray(0, 4).toString("latin1"), "%PDF");
});

test("AC12 exporting with a search filter active yields exactly the filtered rows", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator7", password: "pass" });
  const companyA = await insertCompany(pool, zoneId, creator.id, { companyName: "Filtered Export Co" });
  const plantA = await insertPlant(pool, companyA);
  await insertMou(pool, companyA, plantA, { scheme: "WILP" });
  const companyB = await insertCompany(pool, zoneId, creator.id, { companyName: "Other Company" });
  const plantB = await insertPlant(pool, companyB);
  await insertMou(pool, companyB, plantB, { scheme: "WILP" });
  const cookie = await viewerCookie();

  const exportResponse = await fetch(`${baseUrl}/api/export/excel?by=company&q=Filtered Export`, {
    headers: { Cookie: cookie },
  });
  const { jobId } = (await exportResponse.json()) as { jobId: string };
  const buffer = await downloadReadyExport(jobId, cookie);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const mousSheet = workbook.getWorksheet("MOUs");
  assert.ok(mousSheet !== undefined);
  assert.equal(mousSheet.rowCount, 2); // header + exactly one matching MOU
});

test("AC13 a generated export is unreachable without a session, and the cleanup job deletes an expired one", async () => {
  const cookie = await viewerCookie();
  const exportResponse = await fetch(`${baseUrl}/api/export/pdf?scope=all_zones`, { headers: { Cookie: cookie } });
  const { jobId } = (await exportResponse.json()) as { jobId: string };

  const noSessionResponse = await fetch(`${baseUrl}/api/export/jobs/${jobId}/download`);
  assert.equal(noSessionResponse.status, 401);

  await pool.query(`UPDATE export_job SET expires_at = now() - INTERVAL '1 hour' WHERE id = $1`, [jobId]);
  await runExportCleanup(pool);

  const { rows } = await pool.query(`SELECT id FROM export_job WHERE id = $1`, [jobId]);
  assert.equal(rows.length, 0);

  const afterCleanupResponse = await fetch(`${baseUrl}/api/export/jobs/${jobId}/download`, { headers: { Cookie: cookie } });
  assert.equal(afterCleanupResponse.status, 404);
});
