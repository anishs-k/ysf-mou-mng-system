/**
 * Purpose: Integration tests for SPEC-19 zone isolation. Two zones each hold one
 * company, plant, expiring MOU, document and alert; an all-zone ADMIN and a
 * zonal ADMIN of zone A then call every restricted endpoint. Lists must show only
 * zone A to the zonal user, and an id from zone B must be indistinguishable from
 * an id that does not exist (D119) - asserted by comparing the two responses.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";

import { PAYROLL_FIXED_ITEM_KEYS } from "@mou/domain";
import ExcelJS from "exceljs";
import type { Pool } from "pg";

import { createApp } from "./index.ts";
import {
  createTestPool,
  firstRow,
  insertCompany,
  insertMouDocument,
  insertMouEndingIn,
  insertPayrollConfig,
  insertPlant,
  insertTraineeCategory,
  insertUserWithPassword,
  insertZone,
  resetDatabase,
} from "./db/test-harness.ts";

const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000";
const OUT_OF_ZONE = "You can only add companies in your own zone";

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

async function login(username: string, password: string): Promise<{ cookie: string; body: Record<string, unknown> }> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie !== null && cookie !== "");
  return { cookie, body: (await response.json()) as Record<string, unknown> };
}

interface ZoneFixture {
  readonly zoneId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly plantId: string;
  readonly mouId: string;
  readonly documentId: string;
  readonly alertId: string;
}

async function insertZoneData(code: string, name: string, creatorId: string): Promise<ZoneFixture> {
  const zoneId = await insertZone(pool, code, name);
  const companyName = `${name} Works`;
  const companyId = await insertCompany(pool, zoneId, creatorId, { companyName });
  const plantId = await insertPlant(pool, companyId, `${name} Plant`);
  const mouId = await insertMouEndingIn(pool, companyId, plantId, 20);
  const configId = await insertPayrollConfig(pool, mouId);
  await insertTraineeCategory(pool, configId, "Category A");
  const documentId = await insertMouDocument(pool, mouId, creatorId);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO mou_alert (mou_id, threshold_days, triggered_on) VALUES ($1, 30, business_today()) RETURNING id`,
    [mouId],
  );
  return { zoneId, companyId, companyName, plantId, mouId, documentId, alertId: firstRow(rows).id };
}

interface Setup {
  readonly a: ZoneFixture;
  readonly b: ZoneFixture;
  readonly zonal: string;
  readonly allZones: string;
  readonly zonalUserId: string;
}

async function setup(): Promise<Setup> {
  const creator = await insertUserWithPassword(pool, { username: "creator", password: "pass" });
  const a = await insertZoneData("ZA", "Alpha", creator.id);
  const b = await insertZoneData("ZB", "Beta", creator.id);
  const zonalUser = await insertUserWithPassword(pool, { username: "alpha.admin", password: "pass", zoneId: a.zoneId });
  const allZonesUser = await insertUserWithPassword(pool, { username: "hq.admin", password: "pass" });
  return {
    a,
    b,
    zonal: (await login(zonalUser.username, zonalUser.password)).cookie,
    allZones: (await login(allZonesUser.username, allZonesUser.password)).cookie,
    zonalUserId: zonalUser.id,
  };
}

async function call(cookie: string, path: string, init: RequestInit = {}): Promise<{ status: number; text: string }> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Cookie: cookie, ...init.headers } });
  return { status: response.status, text: await response.text() };
}

async function json<T>(cookie: string, path: string): Promise<T> {
  const { status, text } = await call(cookie, path);
  assert.equal(status, 200, `${path} -> ${status} ${text}`);
  return JSON.parse(text) as T;
}

test("AC1 login and /auth/me report the user's zone, null for an all-zone user", async () => {
  const zoneId = await insertZone(pool, "ZA", "Alpha");
  const zonal = await insertUserWithPassword(pool, { username: "zonal", password: "pass", zoneId });
  const hq = await insertUserWithPassword(pool, { username: "hq", password: "pass" });

  const zonalLogin = await login(zonal.username, zonal.password);
  assert.equal(zonalLogin.body["zoneId"], zoneId);
  assert.equal((await json<Record<string, unknown>>(zonalLogin.cookie, "/api/auth/me"))["zoneId"], zoneId);

  const hqLogin = await login(hq.username, hq.password);
  assert.equal(hqLogin.body["zoneId"], null);
  assert.equal((await json<Record<string, unknown>>(hqLogin.cookie, "/api/auth/me"))["zoneId"], null);
});

test("AC8 the formerly anonymous zone and plant routes now require a session", async () => {
  const { a } = await setup();
  for (const path of ["/api/zones", `/api/zones/${a.zoneId}/companies`, `/api/companies/${a.companyId}/plants`]) {
    const response = await fetch(`${baseUrl}${path}`);
    assert.equal(response.status, 401, path);
  }
});

test("AC2 /zones lists only the zonal user's zone, and every zone for an all-zone user", async () => {
  const { a, zonal, allZones } = await setup();
  const zonalZones = await json<Array<{ id: string }>>(zonal, "/api/zones");
  assert.deepEqual(zonalZones.map((zone) => zone.id), [a.zoneId]);
  assert.equal((await json<unknown[]>(allZones, "/api/zones")).length, 2);
});

test("AC3 every list and count is limited to the zonal user's zone", async () => {
  const { a, b, zonal, allZones } = await setup();

  const lists = [
    `/api/zones/${b.zoneId}/companies`,
    "/api/dashboard/zone-wise",
    `/api/dashboard/zone-wise/${b.zoneId}/companies`,
    "/api/dashboard/recent-activity",
    "/api/search",
    "/api/alerts/expiring?days=all&acknowledged=all",
  ];
  for (const path of lists) {
    const { status, text } = await call(zonal, path);
    assert.equal(status, 200, path);
    assert.ok(!text.includes(b.companyName) && !text.includes(b.zoneId), `${path} leaked zone B: ${text}`);
  }
  assert.ok((await call(zonal, "/api/search")).text.includes(a.companyName));
  assert.ok((await call(allZones, "/api/search")).text.includes(b.companyName));

  const zoneWise = await json<{ zones: Array<{ zoneId: string }>; matrix: { rows: Array<{ zoneId: string }> } }>(
    zonal,
    "/api/dashboard/zone-wise",
  );
  assert.deepEqual(zoneWise.zones.map((row) => row.zoneId), [a.zoneId]);
  assert.deepEqual(zoneWise.matrix.rows.map((row) => row.zoneId), [a.zoneId]);

  const summary = (cookie: string) => json<{ totalCompanies: number; expiringSoon: number }>(cookie, "/api/dashboard/summary");
  const zonalSummary = await summary(zonal);
  assert.equal(zonalSummary.totalCompanies, 1);
  assert.equal(zonalSummary.expiringSoon, 1);
  assert.equal((await summary(allZones)).totalCompanies, 2);

  assert.deepEqual(await json(zonal, "/api/alerts/count"), { count: 1 });
  assert.deepEqual(await json(allZones, "/api/alerts/count"), { count: 2 });
});

test("AC3 Pending Review counts only drafts whose Page 1 zone is the zonal user's", async () => {
  const { a, b, zonal, allZones } = await setup();
  const author = await insertUserWithPassword(pool, { username: "author", password: "pass" });
  const other = await insertUserWithPassword(pool, { username: "other", password: "pass" });
  for (const [userId, zoneId] of [[author.id, a.zoneId], [other.id, b.zoneId]] as const) {
    await pool.query(`INSERT INTO company_draft (user_id, payload, current_page) VALUES ($1, $2, 1)`, [
      userId,
      JSON.stringify({ page1: { zoneId } }),
    ]);
  }
  assert.equal((await json<{ pendingReview: number }>(zonal, "/api/dashboard/summary")).pendingReview, 1);
  assert.equal((await json<{ pendingReview: number }>(allZones, "/api/dashboard/summary")).pendingReview, 2);
});

test("AC4 a zone B id answers exactly like an id that does not exist, and zone A still works", async () => {
  const { a, b, zonal, allZones } = await setup();
  const routes: Array<(f: ZoneFixture | null) => string> = [
    (f) => `/api/companies/${f?.companyId ?? UNKNOWN_ID}/plants`,
    (f) => `/api/companies/${f?.companyId ?? UNKNOWN_ID}/overview`,
    (f) => `/api/companies/${f?.companyId ?? UNKNOWN_ID}/agreements`,
    (f) => `/api/companies/${f?.companyId ?? UNKNOWN_ID}/mous`,
    (f) => `/api/mous/${f?.mouId ?? UNKNOWN_ID}/commercial`,
    (f) => `/api/mous/${f?.mouId ?? UNKNOWN_ID}/payroll`,
    (f) => `/api/mous/${f?.mouId ?? UNKNOWN_ID}/print`,
    (f) => `/api/mous/${f?.mouId ?? UNKNOWN_ID}/history`,
    (f) => `/api/mous/${f?.mouId ?? UNKNOWN_ID}/history/current`,
    (f) => `/api/mous/${f?.mouId ?? UNKNOWN_ID}/history/compare?from=current&to=current`,
    (f) => `/api/mous/${f?.mouId ?? UNKNOWN_ID}/documents`,
    (f) => `/api/documents/${f?.documentId ?? UNKNOWN_ID}`,
  ];
  for (const route of routes) {
    const unknown = await call(zonal, route(null));
    const outOfZone = await call(zonal, route(b));
    assert.deepEqual(outOfZone, unknown, `${route(b)} must look like an unknown id`);

    const inZone = await call(zonal, route(a));
    assert.notDeepEqual(inZone, unknown, `${route(a)} must still answer for zone A`);
    // An all-zone user is not restricted: zone B answers like zone A does for its own user.
    assert.notDeepEqual(await call(allZones, route(b)), unknown, `${route(b)} must answer an all-zone user`);
  }
});

test("AC4 writes on a zone B record are refused as not found and change nothing", async () => {
  const { b, zonal } = await setup();

  const acknowledge = await call(zonal, `/api/alerts/${b.alertId}/acknowledge`, { method: "POST" });
  assert.deepEqual(acknowledge, { status: 404, text: JSON.stringify({ error: "Alert not found" }) });
  const mouAcknowledge = await call(zonal, `/api/mous/${b.mouId}/alerts/acknowledge`, { method: "POST" });
  assert.deepEqual(mouAcknowledge, { status: 404, text: JSON.stringify({ error: "MOU not found" }) });
  const { rows: alerts } = await pool.query(`SELECT 1 FROM mou_alert WHERE mou_id = $1 AND acknowledged_at IS NOT NULL`, [b.mouId]);
  assert.equal(alerts.length, 0);

  const editForm = new FormData();
  editForm.append("reason", "ADDENDUM_IN_AGREEMENT");
  const editRequest = await call(zonal, `/api/mous/${b.mouId}/edit-request`, { method: "POST", body: editForm });
  assert.deepEqual(editRequest, { status: 404, text: JSON.stringify({ error: "MOU not found" }) });
  const { rows: editRequests } = await pool.query(`SELECT 1 FROM mou_edit_request WHERE mou_id = $1`, [b.mouId]);
  assert.equal(editRequests.length, 0);

  const put = await call(zonal, `/api/mous/${b.mouId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ editToken: UNKNOWN_ID, version: 1, commercial: {}, payroll: {} }),
  });
  assert.deepEqual(put, { status: 404, text: JSON.stringify({ error: "MOU not found" }) });

  const uploadForm = new FormData();
  uploadForm.append("file", new Blob([new Uint8Array(Buffer.from("%PDF-1.4\n%doc\n"))], { type: "application/pdf" }), "mou.pdf");
  const upload = await call(zonal, `/api/mous/${b.mouId}/document`, { method: "POST", body: uploadForm });
  assert.deepEqual(upload, { status: 404, text: JSON.stringify({ error: "MOU not found" }) });
  const { rows: documents } = await pool.query(`SELECT 1 FROM mou_document WHERE mou_id = $1`, [b.mouId]);
  assert.equal(documents.length, 1); // only the fixture's own document
});

async function downloadExport(cookie: string, path: string): Promise<{ jobId: string; buffer: Buffer }> {
  const started = await call(cookie, path);
  assert.equal(started.status, 202, `${path} -> ${started.status} ${started.text}`);
  const { jobId } = JSON.parse(started.text) as { jobId: string };
  const response = await fetch(`${baseUrl}/api/export/jobs/${jobId}/download`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return { jobId, buffer: Buffer.from(await response.arrayBuffer()) };
}

async function exportedCompanyNames(buffer: Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as never);
  const names: string[] = [];
  workbook.eachSheet((sheet) => {
    sheet.eachRow((row) => {
      row.eachCell((cell) => names.push(String(cell.value)));
    });
  });
  return names;
}

test("AC5 the Excel export holds only zone A for the zonal user, and a zone B company PDF is refused", async () => {
  const { a, b, zonal, allZones } = await setup();

  const zonalCells = await exportedCompanyNames((await downloadExport(zonal, "/api/export/excel")).buffer);
  assert.ok(zonalCells.includes(a.companyName));
  assert.ok(!zonalCells.some((cell) => cell.includes(b.companyName)), "zone B leaked into the export");
  // Naming zone B as a filter matches nothing rather than widening the scope.
  const filtered = await exportedCompanyNames((await downloadExport(zonal, `/api/export/excel?zoneId=${b.zoneId}`)).buffer);
  assert.ok(!filtered.some((cell) => cell.includes(b.companyName)));

  const allCells = await exportedCompanyNames((await downloadExport(allZones, "/api/export/excel")).buffer);
  assert.ok(allCells.includes(b.companyName));

  const pdfB = await call(zonal, `/api/export/pdf?scope=company&companyId=${b.companyId}&plantId=${b.plantId}`);
  const pdfUnknown = await call(zonal, `/api/export/pdf?scope=company&companyId=${UNKNOWN_ID}&plantId=${UNKNOWN_ID}`);
  assert.deepEqual(pdfB, pdfUnknown);
  assert.equal((await call(zonal, `/api/export/pdf?scope=company&companyId=${a.companyId}&plantId=${a.plantId}`)).status, 202);
  assert.equal((await call(zonal, "/api/export/pdf?scope=all_zones")).status, 202);
});

test("AC6 an export job is visible only to the user who created it", async () => {
  const { zonal, allZones } = await setup();
  const { jobId } = await downloadExport(allZones, "/api/export/excel");

  const unknownStatus = await call(zonal, `/api/export/jobs/${UNKNOWN_ID}`);
  assert.deepEqual(await call(zonal, `/api/export/jobs/${jobId}`), unknownStatus);
  const unknownDownload = await call(zonal, `/api/export/jobs/${UNKNOWN_ID}/download`);
  assert.deepEqual(await call(zonal, `/api/export/jobs/${jobId}/download`), unknownDownload);

  assert.equal((await call(allZones, `/api/export/jobs/${jobId}`)).status, 200);
});

function companyPage1(zoneId: string) {
  return {
    zoneId,
    companyName: "Gamma Industries",
    companyType: "PRIVATE_SECTOR",
    registrationType: "COMPANY",
    tanNumber: "ABCD12345E",
    gstNumber: "27AAPFU0939F1ZV",
    plantName: "Gamma Plant",
    addressLine1: "12 Main Street",
    city: "Pune",
    pinCode: "411001",
    state: "Maharashtra",
    district: "Pune",
    hrContactName: "Rita Sharma",
    financeHeadContactName: "Arun Verma",
    contactType: "MOBILE",
    hrContactNumber: "9876543210",
    financeHeadContactNumber: "9123456780",
    officialEmail: "hr@gamma.example",
    confirmEmail: "hr@gamma.example",
  };
}

async function submitDraftForZone(cookie: string, zoneId: string): Promise<{ status: number; text: string }> {
  const postDraft = (payload: unknown, currentPage: number) =>
    call(cookie, "/api/companies/draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payload, currentPage }),
    });
  const { id: draftId } = JSON.parse((await postDraft({ page1: { zoneId } }, 1)).text) as { id: string };
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(Buffer.from("%PDF-1.4\n%doc\n"))], { type: "application/pdf" }), "mou.pdf");
  const upload = await call(cookie, `/api/companies/draft/${draftId}/mou-document`, { method: "POST", body: form });
  assert.equal(upload.status, 200, upload.text);
  const mouDocument = JSON.parse(upload.text) as { originalFilename: string; fileSizeBytes: number };
  const items = Object.fromEntries(PAYROLL_FIXED_ITEM_KEYS.map((key) => [key, { isApplicable: false, amount: "" }]));
  await postDraft(
    {
      page1: companyPage1(zoneId),
      page2: {
        mouStartDate: "2026-01-01", tenureValue: "12", tenureUnit: "MONTHS", attendanceCycle: "MONTHLY",
        stipendDate: "5", charges: {}, otherItems: [], mouDocument,
      },
      page3: { scheme: "WILP", traineeCategories: ["Category A"], items, otherItems: [] },
    },
    3,
  );
  return call(cookie, "/api/companies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ draftId }),
  });
}

test("AC7 a zonal user cannot validate or submit a company in another zone", async () => {
  const { a, b, zonal } = await setup();

  const validate = (zoneId: string) =>
    call(zonal, "/api/companies/validate-page1", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ details: companyPage1(zoneId) }),
    });
  const refused = JSON.parse((await validate(b.zoneId)).text) as { errors: Record<string, string> };
  assert.equal(refused.errors["zoneId"], OUT_OF_ZONE);
  const accepted = JSON.parse((await validate(a.zoneId)).text) as { errors: Record<string, string> };
  assert.equal(accepted.errors["zoneId"], undefined);

  const submitted = await submitDraftForZone(zonal, b.zoneId);
  assert.equal(submitted.status, 422, submitted.text);
  assert.equal((JSON.parse(submitted.text) as { errors: Record<string, string> }).errors["zoneId"], OUT_OF_ZONE);
  const { rows } = await pool.query(`SELECT 1 FROM company WHERE company_name = 'Gamma Industries'`);
  assert.equal(rows.length, 0);

  assert.equal((await submitDraftForZone(zonal, a.zoneId)).status, 201);
});

test("AC9 changing a user's zone changes their very next request", async () => {
  const { a, b, zonal, zonalUserId } = await setup();
  assert.deepEqual((await json<Array<{ id: string }>>(zonal, "/api/zones")).map((zone) => zone.id), [a.zoneId]);

  await pool.query(`UPDATE "user" SET zone_id = $1 WHERE id = $2`, [b.zoneId, zonalUserId]);
  assert.deepEqual((await json<Array<{ id: string }>>(zonal, "/api/zones")).map((zone) => zone.id), [b.zoneId]);

  await pool.query(`UPDATE "user" SET zone_id = NULL WHERE id = $1`, [zonalUserId]);
  assert.equal((await json<unknown[]>(zonal, "/api/zones")).length, 2);
});
