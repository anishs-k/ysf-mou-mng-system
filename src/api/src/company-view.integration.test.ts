/**
 * Purpose: Integration tests for the SPEC-07 read-only view endpoints. Every
 * test drives the real Express application over HTTP, since MOU status is
 * derived from `business_today()` in Postgres and the query assembly in
 * db/mou-view.ts is worth proving against real rows, not just its own logic.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";

import type { Pool } from "pg";

import { createApp } from "./index.ts";
import {
  createTestPool,
  insertCommercialItem,
  insertCompany,
  insertMou,
  insertMouDocument,
  insertPayrollConfig,
  insertPayrollItem,
  insertPlant,
  insertTraineeCategory,
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
  const user = await insertUserWithPassword(pool, { username: "viewer", password: "pass", role: "VIEWER" });
  return login(user.username, user.password);
}

test("AC2 overview shows plant, GST, and both contact names and numbers", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id, { companyName: "Acme Industries" });
  await insertPlant(pool, companyId, "Pune Plant");

  const response = await fetch(`${baseUrl}/api/companies/${companyId}/overview`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    companyName: string;
    gstNumber: string;
    hrContactName: string;
    hrContactNumber: string;
    financeHeadContactName: string;
    financeHeadContactNumber: string;
    plants: Array<{ plantName: string }>;
  };
  assert.equal(body.companyName, "Acme Industries");
  assert.ok(body.gstNumber.length > 0);
  assert.ok(body.hrContactName.length > 0 && body.hrContactNumber.length > 0);
  assert.ok(body.financeHeadContactName.length > 0 && body.financeHeadContactNumber.length > 0);
  assert.equal(body.plants[0]?.plantName, "Pune Plant");
});

test("AC4 a company with WILP and FLEXI MOUs shows exactly those two schemes", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator2", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId, { scheme: "WILP" });
  await insertMou(pool, companyId, plantId, { scheme: "FLEXI" });

  const response = await fetch(`${baseUrl}/api/companies/${companyId}/mous?plantId=${plantId}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as Array<{ scheme: string }>;
  const schemes = body.map((row) => row.scheme).sort();
  assert.deepEqual(schemes, ["FLEXI", "WILP"]);
});

test("AC6 a future start date shows New and a past end date shows Expired", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator3", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);

  const futureMouId = await insertMou(pool, companyId, plantId, {
    scheme: "WILP",
    startDate: "2099-01-01",
    tenureValue: 12,
  });
  const pastMouId = await insertMou(pool, companyId, plantId, {
    scheme: "FLEXI",
    startDate: "2000-01-01",
    tenureValue: 12,
  });

  const futureResponse = await fetch(`${baseUrl}/api/mous/${futureMouId}/commercial`, { headers: { Cookie: cookie } });
  const futureBody = (await futureResponse.json()) as { status: string };
  assert.equal(futureBody.status, "NEW");

  const pastResponse = await fetch(`${baseUrl}/api/mous/${pastMouId}/commercial`, { headers: { Cookie: cookie } });
  const pastBody = (await pastResponse.json()) as { status: string };
  assert.equal(pastBody.status, "EXPIRED");
});

test("AC8 a charge saved as NULL is null and one saved as 0.00 is distinguishable", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator4", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);
  await insertCommercialItem(pool, mouId, "ADMIN_CHARGES", { amount: "0.00" });
  // INSURANCE is left unset entirely (no row) - the NULL case.

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/commercial`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as { charges: Array<{ itemKey: string; amount: string | null }> };
  const admin = body.charges.find((c) => c.itemKey === "ADMIN_CHARGES");
  const insurance = body.charges.find((c) => c.itemKey === "INSURANCE");
  assert.equal(admin?.amount, "0.00");
  assert.equal(insurance?.amount, null);
});

test("AC10 an item answered No does not appear in the payroll view", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator5", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);
  const configId = await insertPayrollConfig(pool, mouId);
  await insertTraineeCategory(pool, configId, "Category A");
  await insertPayrollItem(pool, configId, "BONUS", { isApplicable: true, amount: "500", itemType: "ALLOWANCE" });
  await insertPayrollItem(pool, configId, "ARREARS", { isApplicable: false, itemType: "ALLOWANCE" });

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/payroll`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as { allowances: Array<{ itemKey: string }>; deductions: unknown[] };
  const keys = body.allowances.map((row) => row.itemKey);
  assert.ok(keys.includes("BONUS"));
  assert.ok(!keys.includes("ARREARS"));
});

test("AC11 a scheme with only deduction items has an empty allowances array", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator6", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);
  const configId = await insertPayrollConfig(pool, mouId);
  await insertPayrollItem(pool, configId, "DOCUMENT_FEE", { isApplicable: true, amount: "100", itemType: "DEDUCTION" });

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/payroll`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as { allowances: unknown[]; deductions: unknown[] };
  assert.deepEqual(body.allowances, []);
  assert.equal(body.deductions.length, 1);
});

test("SPEC-07 the most recently uploaded document is returned as current", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator7", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);
  await insertMouDocument(pool, mouId, user.id, { originalFilename: "first.pdf" });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await insertMouDocument(pool, mouId, user.id, { originalFilename: "second.pdf" });

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/commercial`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as { document?: { originalFilename: string } };
  assert.equal(body.document?.originalFilename, "second.pdf");
});

test("AC9 print returns a PDF document", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator8", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/print`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  const buffer = await response.arrayBuffer();
  assert.ok(buffer.byteLength > 0);
});

test("SPEC-07 every read endpoint is reachable by a VIEWER (no role restriction)", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator9", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);

  for (const path of [
    `/api/companies/${companyId}/overview`,
    `/api/companies/${companyId}/mous`,
    `/api/mous/${mouId}/commercial`,
    `/api/mous/${mouId}/payroll`,
  ]) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookie } });
    assert.equal(response.status, 200, `expected 200 for ${path}`);
  }
});

test("an unauthenticated request is refused", async () => {
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator10", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);

  const response = await fetch(`${baseUrl}/api/companies/${companyId}/overview`);
  assert.equal(response.status, 401);
});
