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
import { promises as fs } from "node:fs";
import type { Server } from "node:http";

import ExcelJS from "exceljs";
import type { Pool } from "pg";

import { createApp } from "./index.ts";
import { runExportCleanup } from "./jobs/export-cleanup.ts";
import { exportFileAbsolutePath } from "./upload/export-storage.ts";
import {
  createTestPool,
  insertCommercialItem,
  insertCompany,
  insertMou,
  insertMouEndingIn,
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
  const viewer = await insertUserWithPassword(pool, {
    username: `viewer${Math.random()}`,
    password: "pass",
    role: "VIEWER",
  });
  return login(viewer.username, viewer.password);
}

async function downloadReadyExport(
  jobId: string,
  cookie: string,
): Promise<Buffer> {
  const response = await fetch(`${baseUrl}/api/export/jobs/${jobId}/download`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  return Buffer.from(await response.arrayBuffer());
}

test("AC1 searching by Company for a partial, case-insensitive fragment returns matches", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, {
    username: "creator1",
    password: "pass",
  });
  const companyId = await insertCompany(pool, zoneId, creator.id, {
    companyName: "Statue Industries",
  });
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId);
  const cookie = await viewerCookie();

  const response = await fetch(`${baseUrl}/api/search?by=company&q=TAT`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    rows: Array<{ companyName: string }>;
    total: number;
  };
  assert.ok(body.rows.some((row) => row.companyName === "Statue Industries"));
});

test("AC2 searching by the generated code returns the matching company", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, {
    username: "creator2",
    password: "pass",
  });
  // SPEC-16 D109: the generated code lives on the MOU, so search matches there.
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId, {
    generatedCode: "MOU-WILP-2026-0099",
  });
  const cookie = await viewerCookie();

  const response = await fetch(
    `${baseUrl}/api/search?by=company&q=MOU-WILP-2026-0099`,
    {
      headers: { Cookie: cookie },
    },
  );
  const body = (await response.json()) as {
    rows: Array<{ generatedCode: string }>;
  };
  assert.ok(
    body.rows.some((row) => row.generatedCode === "MOU-WILP-2026-0099"),
  );
});

test("AC3 a single-character query is rejected with a minimum-length message", async () => {
  const cookie = await viewerCookie();
  const response = await fetch(`${baseUrl}/api/search?by=company&q=a`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 422);
  const body = (await response.json()) as { error: string };
  assert.match(body.error, /at least 2 characters/i);
});

test("AC4 search by Scheme rejects a value that is not a real scheme", async () => {
  const cookie = await viewerCookie();
  const response = await fetch(
    `${baseUrl}/api/search?by=scheme&q=NOT_A_SCHEME`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(response.status, 422);
});

test("AC5 a company with WILP and FLEXI MOUs produces two result rows", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, {
    username: "creator3",
    password: "pass",
  });
  const companyId = await insertCompany(pool, zoneId, creator.id, {
    companyName: "Dual Scheme Co",
  });
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId, { scheme: "WILP" });
  await insertMou(pool, companyId, plantId, { scheme: "FLEXI" });
  const cookie = await viewerCookie();

  const response = await fetch(
    `${baseUrl}/api/search?by=company&q=Dual Scheme`,
    { headers: { Cookie: cookie } },
  );
  const body = (await response.json()) as { rows: unknown[] };
  assert.equal(body.rows.length, 2);
});

test("AC6 zone and status filters narrow the results", async () => {
  const zoneA = await insertZone(pool, "EAST", "East");
  const zoneB = await insertZone(pool, "SOUTH", "South");
  const creator = await insertUserWithPassword(pool, {
    username: "creator4",
    password: "pass",
  });
  const companyA = await insertCompany(pool, zoneA, creator.id, {
    companyName: "Narrow Test Co A",
  });
  const plantA = await insertPlant(pool, companyA);
  await insertMou(pool, companyA, plantA, { scheme: "WILP" });
  const companyB = await insertCompany(pool, zoneB, creator.id, {
    companyName: "Narrow Test Co B",
  });
  const plantB = await insertPlant(pool, companyB);
  await insertMou(pool, companyB, plantB, { scheme: "WILP" });
  const cookie = await viewerCookie();

  const response = await fetch(
    `${baseUrl}/api/search?by=company&q=Narrow Test&zoneId=${zoneA}`,
    {
      headers: { Cookie: cookie },
    },
  );
  const body = (await response.json()) as {
    rows: Array<{ companyName: string }>;
  };
  assert.equal(body.rows.length, 1);
  assert.equal(body.rows[0]?.companyName, "Narrow Test Co A");
});

test("AC7/AC8 the Excel export has all four sheets, numeric amounts, and distinguishes a blank charge from 0", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, {
    username: "creator5",
    password: "pass",
  });
  const companyId = await insertCompany(pool, zoneId, creator.id, {
    companyName: "Excel Test Co",
  });
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId, { scheme: "WILP" });
  await insertCommercialItem(pool, mouId, "ADMIN_CHARGES", { amount: "0.00" });
  // INSURANCE deliberately left unset - no row - to exercise the blank case.
  const cookie = await viewerCookie();

  const exportResponse = await fetch(
    `${baseUrl}/api/export/excel?by=company&q=Excel Test`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(exportResponse.status, 202);
  const { jobId, status } = (await exportResponse.json()) as {
    jobId: string;
    status: string;
  };
  assert.equal(status, "ready");

  const buffer = await downloadReadyExport(jobId, cookie);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  assert.deepEqual(
    workbook.worksheets.map((sheet) => sheet.name),
    ["Companies", "MOUs", "Commercial", "Payroll"],
  );

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
  const response = await fetch(`${baseUrl}/api/export/pdf?scope=all_zones`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 202);
  const { jobId, status } = (await response.json()) as {
    jobId: string;
    status: string;
  };
  assert.equal(status, "ready");

  const buffer = await downloadReadyExport(jobId, cookie);
  assert.equal(buffer.subarray(0, 4).toString("latin1"), "%PDF");
});

test("AC10 Export PDF with the company scope requires companyId and plantId", async () => {
  const cookie = await viewerCookie();
  const response = await fetch(`${baseUrl}/api/export/pdf?scope=company`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 400);
});

test("AC11 the company-scope PDF succeeds once companyId and plantId are given", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, {
    username: "creator6",
    password: "pass",
  });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId, { scheme: "WILP" });
  const cookie = await viewerCookie();

  const response = await fetch(
    `${baseUrl}/api/export/pdf?scope=company&companyId=${companyId}&plantId=${plantId}`,
    {
      headers: { Cookie: cookie },
    },
  );
  assert.equal(response.status, 202);
  const { jobId, status } = (await response.json()) as {
    jobId: string;
    status: string;
  };
  assert.equal(status, "ready");
  const buffer = await downloadReadyExport(jobId, cookie);
  assert.equal(buffer.subarray(0, 4).toString("latin1"), "%PDF");
});

test("AC12 exporting with a search filter active yields exactly the filtered rows", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, {
    username: "creator7",
    password: "pass",
  });
  const companyA = await insertCompany(pool, zoneId, creator.id, {
    companyName: "Filtered Export Co",
  });
  const plantA = await insertPlant(pool, companyA);
  await insertMou(pool, companyA, plantA, { scheme: "WILP" });
  const companyB = await insertCompany(pool, zoneId, creator.id, {
    companyName: "Other Company",
  });
  const plantB = await insertPlant(pool, companyB);
  await insertMou(pool, companyB, plantB, { scheme: "WILP" });
  const cookie = await viewerCookie();

  const exportResponse = await fetch(
    `${baseUrl}/api/export/excel?by=company&q=Filtered Export`,
    {
      headers: { Cookie: cookie },
    },
  );
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
  const exportResponse = await fetch(
    `${baseUrl}/api/export/pdf?scope=all_zones`,
    { headers: { Cookie: cookie } },
  );
  const { jobId } = (await exportResponse.json()) as { jobId: string };

  const noSessionResponse = await fetch(
    `${baseUrl}/api/export/jobs/${jobId}/download`,
  );
  assert.equal(noSessionResponse.status, 401);

  await pool.query(
    `UPDATE export_job SET expires_at = now() - INTERVAL '1 hour' WHERE id = $1`,
    [jobId],
  );
  await runExportCleanup(pool);

  const { rows } = await pool.query(`SELECT id FROM export_job WHERE id = $1`, [
    jobId,
  ]);
  assert.equal(rows.length, 0);

  const afterCleanupResponse = await fetch(
    `${baseUrl}/api/export/jobs/${jobId}/download`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(afterCleanupResponse.status, 404);
});

test("an export whose file has been deleted from disk answers 404, not a crash", async () => {
  const cookie = await viewerCookie();
  const exportResponse = await fetch(
    `${baseUrl}/api/export/pdf?scope=all_zones`,
    { headers: { Cookie: cookie } },
  );
  const { jobId } = (await exportResponse.json()) as { jobId: string };

  // The job row is still 'ready'; only the bytes behind it are gone. This is
  // the ENOENT path - the one case that must stay a 404.
  const { rows } = await pool.query<{ file_path: string }>(
    `SELECT file_path FROM export_job WHERE id = $1`,
    [jobId],
  );
  const filePath = rows[0]?.file_path;
  assert.ok(filePath !== null && filePath !== undefined);
  await fs.rm(exportFileAbsolutePath(filePath), { force: true });

  const response = await fetch(`${baseUrl}/api/export/jobs/${jobId}/download`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: string };
  assert.equal(body.error, "Export file missing");
});

// ---------------------------------------------------------------------------
// List-screen additions: optional by/q, scheme, EXPIRING, start-date range,
// pageSize, YYYY-MM-DD dates and the HR contact on every row.
// ---------------------------------------------------------------------------

interface ListRow {
  mouId: string;
  companyId: string;
  companyName: string;
  scheme: string;
  mouStartDate: string;
  endDate: string;
  status: string;
  hrContactName: string;
  hrContactNumber: string;
}

interface ListBody {
  rows: ListRow[];
  total: number;
  page: number;
  pageSize: number;
}

async function search(
  cookie: string,
  query: string,
): Promise<{ status: number; body: ListBody }> {
  const response = await fetch(`${baseUrl}/api/search${query}`, {
    headers: { Cookie: cookie },
  });
  return { status: response.status, body: (await response.json()) as ListBody };
}

let seedSequence = 0;

/** One company in its own zone with one plant and one MoU. */
async function seedCompanyWithMou(
  companyName: string,
  options: { scheme?: string; startDate?: string } = {},
): Promise<{ companyId: string; mouId: string }> {
  seedSequence += 1;
  const zoneId = await insertZone(pool, `Z${seedSequence}`, `Zone ${seedSequence}`);
  const creator = await insertUserWithPassword(pool, {
    username: `seed${seedSequence}`,
    password: "pass",
  });
  const companyId = await insertCompany(pool, zoneId, creator.id, {
    companyName,
  });
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId, {
    scheme: options.scheme ?? "WILP",
    startDate: options.startDate ?? "2026-01-01",
  });
  return { companyId, mouId };
}

test("search with no filters lists every active MoU, paginated", async () => {
  await seedCompanyWithMou("Alpha Co");
  await seedCompanyWithMou("Beta Co");
  await seedCompanyWithMou("Gamma Co");
  const cookie = await viewerCookie();

  const all = await search(cookie, "");
  assert.equal(all.status, 200);
  assert.equal(all.body.total, 3);
  assert.equal(all.body.pageSize, 25);

  const paged = await search(cookie, "?pageSize=2&page=2");
  assert.equal(paged.status, 200);
  assert.equal(paged.body.total, 3);
  assert.equal(paged.body.pageSize, 2);
  assert.deepEqual(
    paged.body.rows.map((row) => row.companyName),
    ["Gamma Co"],
  );
});

test("search rows carry YYYY-MM-DD dates, companyId and the HR contact", async () => {
  const { companyId } = await seedCompanyWithMou("Dated Co", {
    startDate: "2026-03-15",
  });
  const cookie = await viewerCookie();

  const { body } = await search(cookie, "");
  const row = body.rows[0];
  assert.ok(row !== undefined);
  assert.equal(row.mouStartDate, "2026-03-15");
  assert.equal(row.endDate, "2027-03-14");
  assert.equal(row.companyId, companyId);
  assert.equal(row.hrContactName, "HR Name");
  assert.equal(row.hrContactNumber, "9876543210");
});

test("the scheme filter combines with a company query", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, {
    username: "schemecreator",
    password: "pass",
  });
  const companyId = await insertCompany(pool, zoneId, creator.id, {
    companyName: "Combo Works",
  });
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId, { scheme: "WILP" });
  await insertMou(pool, companyId, plantId, { scheme: "NAPS" });
  await seedCompanyWithMou("Unrelated Co", { scheme: "NAPS" });
  const cookie = await viewerCookie();

  const { status, body } = await search(
    cookie,
    "?by=company&q=Combo&scheme=NAPS",
  );
  assert.equal(status, 200);
  assert.equal(body.total, 1);
  assert.equal(body.rows[0]?.scheme, "NAPS");
  assert.equal(body.rows[0]?.companyName, "Combo Works");

  assert.equal((await search(cookie, "?scheme=NOT_A_SCHEME")).status, 422);
});

test("status=EXPIRING selects MoUs ending within the dashboard's 90-day window; rows keep their derived status", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, {
    username: "expcreator",
    password: "pass",
  });
  const companyId = await insertCompany(pool, zoneId, creator.id, {
    companyName: "Expiry Co",
  });
  const plantId = await insertPlant(pool, companyId);
  const soon = await insertMouEndingIn(pool, companyId, plantId, 10, {
    scheme: "WILP",
  });
  const edge = await insertMouEndingIn(pool, companyId, plantId, 90, {
    scheme: "NAPS",
  });
  await insertMouEndingIn(pool, companyId, plantId, 91, { scheme: "NATS" });
  await insertMouEndingIn(pool, companyId, plantId, -1, { scheme: "FLEXI" });
  const cookie = await viewerCookie();

  const { status, body } = await search(cookie, "?status=EXPIRING");
  assert.equal(status, 200);
  assert.deepEqual(
    body.rows.map((row) => row.mouId).sort(),
    [soon, edge].sort(),
  );
  assert.ok(body.rows.every((row) => row.status === "ACTIVE"));

  // Same definition as the Dashboard "Expiring Soon" KPI, so the numbers agree.
  const summary = await fetch(`${baseUrl}/api/dashboard/summary`, {
    headers: { Cookie: cookie },
  });
  const kpis = (await summary.json()) as { expiringSoon: number };
  assert.equal(kpis.expiringSoon, body.total);
});

test("startFrom/startTo filter on the MoU start date, inclusive", async () => {
  await seedCompanyWithMou("Jan Co", { startDate: "2026-01-01" });
  await seedCompanyWithMou("Feb Co", { startDate: "2026-02-15" });
  await seedCompanyWithMou("Mar Co", { startDate: "2026-03-31" });
  const cookie = await viewerCookie();

  const { status, body } = await search(
    cookie,
    "?startFrom=2026-02-15&startTo=2026-03-31",
  );
  assert.equal(status, 200);
  assert.deepEqual(
    body.rows.map((row) => row.companyName),
    ["Feb Co", "Mar Co"],
  );

  assert.equal((await search(cookie, "?startFrom=2026-02-30")).status, 422);
  assert.equal(
    (await search(cookie, "?startFrom=2026-03-01&startTo=2026-02-01")).status,
    422,
  );
});

test("an out-of-range pageSize is rejected", async () => {
  const cookie = await viewerCookie();
  assert.equal((await search(cookie, "?pageSize=101")).status, 400);
});

test("the Expiry Report is the Excel export with status=EXPIRING, combinable with scheme", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, {
    username: "reportcreator",
    password: "pass",
  });
  const companyId = await insertCompany(pool, zoneId, creator.id, {
    companyName: "Report Co",
  });
  const plantId = await insertPlant(pool, companyId);
  await insertMouEndingIn(pool, companyId, plantId, 5, { scheme: "WILP" });
  await insertMouEndingIn(pool, companyId, plantId, 5, { scheme: "NAPS" });
  await insertMouEndingIn(pool, companyId, plantId, 200, { scheme: "NATS" });
  const cookie = await viewerCookie();

  const exportResponse = await fetch(
    `${baseUrl}/api/export/excel?status=EXPIRING&scheme=WILP`,
    { headers: { Cookie: cookie } },
  );
  assert.equal(exportResponse.status, 202);
  const { jobId } = (await exportResponse.json()) as { jobId: string };
  const buffer = await downloadReadyExport(jobId, cookie);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const mousSheet = workbook.getWorksheet("MOUs");
  assert.ok(mousSheet !== undefined);
  assert.equal(mousSheet.rowCount, 2); // header + the one WILP MoU ending in 5 days

  // Real date cells, now that the shared query returns YYYY-MM-DD text.
  const headers = mousSheet.getRow(1).values as unknown[];
  const startCol = headers.findIndex((v) => v === "MOU Start Date");
  const startValue = mousSheet.getRow(2).getCell(startCol).value;
  assert.ok(startValue instanceof Date && !Number.isNaN(startValue.getTime()));

  const badFilter = await fetch(`${baseUrl}/api/export/excel?startTo=nope`, {
    headers: { Cookie: cookie },
  });
  assert.equal(badFilter.status, 422);
});
