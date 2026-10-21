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

import { createDatabase } from "./db/client.ts";
import { loadCompanyRecord, loadCompanyRecords } from "./db/company-record-pdf.ts";
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

test("AC11 a scheme with only deduction items has an empty allowances array", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator6", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);
  const configId = await insertPayrollConfig(pool, mouId);
  await insertPayrollItem(pool, configId, "PF", { isApplicable: true, amount: "12", itemType: "DEDUCTION" });

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/payroll`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as { allowances: unknown[]; deductions: unknown[] };
  assert.deepEqual(body.allowances, []);
  // D158: payroll is PF, ESI and TDS - all three are always listed.
  assert.equal(body.deductions.length, 3);
});

test("SPEC-23 AC3/AC4 the payroll view carries value kinds, and PF / ESI / TDS appear even when Not applicable", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator-pf", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);
  const configId = await insertPayrollConfig(pool, mouId);
  await insertPayrollItem(pool, configId, "PF", { isApplicable: true, amount: "12", itemType: "DEDUCTION" });
  await insertPayrollItem(pool, configId, "ESI", { isApplicable: false, itemType: "DEDUCTION" });
  await insertPayrollItem(pool, configId, "TDS", { isApplicable: false, itemType: "DEDUCTION" });

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/payroll`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as {
    allowances: Array<{ itemKey: string; valueKind: string; amount: string | null; isApplicable: boolean | null }>;
    deductions: Array<{ itemKey: string; valueKind: string; amount: string | null; isApplicable: boolean | null }>;
  };
  assert.deepEqual(body.allowances, []);
  assert.deepEqual(
    body.deductions.map((row) => [row.itemKey, row.valueKind, row.amount, row.isApplicable]),
    [
      ["PF", "PERCENT", "12.00", true],
      ["ESI", "PERCENT", null, false],
      ["TDS", "STATUS", null, false],
    ],
  );
});

test("SPEC-23 AC6 an MOU saved before PF / ESI / TDS still lists all three, as not recorded", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator-old", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const mouId = await insertMou(pool, companyId, await insertPlant(pool, companyId));
  await insertPayrollConfig(pool, mouId);

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/payroll`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as { deductions: Array<{ itemKey: string; amount: string | null; isApplicable: boolean | null }> };
  assert.deepEqual(
    body.deductions.map((row) => [row.itemKey, row.amount, row.isApplicable]),
    [
      ["PF", null, null],
      ["ESI", null, null],
      ["TDS", null, null],
    ],
  );
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

test("overview also returns the full Page 1 identity, address, zone name and purchase contact", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool, "WEST", "West");
  const user = await insertUserWithPassword(pool, { username: "creator11", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id, { sector: "AUTOMOBILE" });
  await pool.query(
    `UPDATE company SET purchase_name = 'Buyer', purchase_number = '9000000000', purchase_email = 'buy@example.com' WHERE id = $1`,
    [companyId],
  );

  const response = await fetch(`${baseUrl}/api/companies/${companyId}/overview`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body["companyType"], "PRIVATE_SECTOR");
  assert.equal(body["registrationType"], "COMPANY");
  assert.equal(body["tanNumber"], "TANP12345C");
  assert.equal(body["sector"], "AUTOMOBILE");
  assert.equal(body["addressLine1"], "1 Test Road");
  assert.equal(body["addressLine2"], null);
  assert.equal(body["city"], "Pune");
  assert.equal(body["pinCode"], "411001");
  assert.equal(body["district"], "Pune");
  assert.equal(body["state"], "Maharashtra");
  assert.equal(body["zoneName"], "West");
  assert.equal(body["contactType"], "MOBILE");
  assert.match(String(body["hrEmail"]), /@example\.com$/);
  assert.match(String(body["financeEmail"]), /@example\.com$/);
  assert.equal(body["officialEmail"], undefined);
  assert.equal(body["purchaseName"], "Buyer");
  assert.equal(body["purchaseNumber"], "9000000000");
  assert.equal(body["purchaseEmail"], "buy@example.com");
});

test("agreements lists every MoU of the company, active and inactive, newest start first", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator12", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId, "Nashik Plant");
  const oldMou = await insertMou(pool, companyId, plantId, {
    scheme: "WILP",
    startDate: "2020-01-01",
    isActive: false,
    generatedCode: "MOU-WILP-2020-0001",
  });
  const futureMou = await insertMou(pool, companyId, plantId, { scheme: "NAPS", startDate: "2099-01-01" });
  const otherCompany = await insertCompany(pool, zoneId, user.id);
  await insertMou(pool, otherCompany, null, { scheme: "WILP" });

  const response = await fetch(`${baseUrl}/api/companies/${companyId}/agreements`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as Array<{
    mouId: string;
    generatedCode: string;
    scheme: string;
    plantName: string | null;
    mouStartDate: string;
    endDate: string;
    status: string;
    isActive: boolean;
  }>;
  assert.deepEqual(
    body.map((row) => row.mouId),
    [futureMou, oldMou],
  );
  assert.deepEqual(body[1], {
    mouId: oldMou,
    generatedCode: "MOU-WILP-2020-0001",
    scheme: "WILP",
    plantName: "Nashik Plant",
    mouStartDate: "2020-01-01",
    endDate: "2020-12-31",
    status: "EXPIRED",
    isActive: false,
  });
  assert.equal(body[0]?.status, "NEW");
  assert.equal(body[0]?.isActive, true);
});

test("agreements answers 400 for a bad id, 404 for an unknown company, 401 without a session", async () => {
  const cookie = await viewerCookie();
  assert.equal((await fetch(`${baseUrl}/api/companies/nope/agreements`, { headers: { Cookie: cookie } })).status, 400);
  assert.equal(
    (
      await fetch(`${baseUrl}/api/companies/123e4567-e89b-12d3-a456-426614174000/agreements`, {
        headers: { Cookie: cookie },
      })
    ).status,
    404,
  );
  assert.equal((await fetch(`${baseUrl}/api/companies/123e4567-e89b-12d3-a456-426614174000/agreements`)).status, 401);
});

test("commercial detail carries each charge's period and basis codes, null when unset", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator13", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);
  await insertCommercialItem(pool, mouId, "ADMIN_CHARGES", {
    amount: "100.00",
    period: "MONTHLY",
    basis: "PER_TRAINEE_PER_MONTH",
  });

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/commercial`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as {
    charges: Array<{ itemKey: string; period: string | null; basis: string | null }>;
  };
  const admin = body.charges.find((c) => c.itemKey === "ADMIN_CHARGES");
  const insurance = body.charges.find((c) => c.itemKey === "INSURANCE");
  assert.equal(admin?.period, "MONTHLY");
  assert.equal(admin?.basis, "PER_TRAINEE_PER_MONTH");
  assert.equal(insurance?.period, null);
  assert.equal(insurance?.basis, null);
});

test("an unauthenticated request is refused", async () => {
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator10", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);

  const response = await fetch(`${baseUrl}/api/companies/${companyId}/overview`);
  assert.equal(response.status, 401);
});

// --- SPEC-23 §5: the record PDF behind Export PDF ------------------------------------

test("SPEC-23 AC8 the record PDF is served inline as a PDF named after the MoU code, to a VIEWER too", async () => {
  const cookie = await viewerCookie();
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator-pdf", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);
  const configId = await insertPayrollConfig(pool, mouId);
  await insertPayrollItem(pool, configId, "PF", { isApplicable: true, amount: "12", itemType: "DEDUCTION" });

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/record.pdf`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/pdf");
  assert.match(response.headers.get("content-disposition") ?? "", /^inline; filename=".+\.pdf"$/);
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.subarray(0, 4).toString("latin1"), "%PDF");
});

test("SPEC-23 an unknown MoU answers 404 to the record PDF", async () => {
  const cookie = await viewerCookie();
  const response = await fetch(`${baseUrl}/api/mous/00000000-0000-4000-8000-000000000000/record.pdf`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 404);
});

test("SPEC-23 an MoU outside the user's zones answers 404 to the record PDF", async () => {
  const zoneId = await insertZone(pool);
  const otherZone = await insertZone(pool, "OTZ", "Other Zone");
  const user = await insertUserWithPassword(pool, { username: "creator-pdf2", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const mouId = await insertMou(pool, companyId, await insertPlant(pool, companyId));
  const zonal = await insertUserWithPassword(pool, { username: "zonal-pdf", password: "pass", role: "VIEWER", zoneIds: [otherZone] });
  const cookie = await login(zonal.username, zonal.password);

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/record.pdf`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 404);
});

// --- SPEC-24: the batch loaders give exactly what the one-record loaders give ---------

test("SPEC-24 loadCompanyRecords matches loadCompanyRecord for each MoU, in the order asked", async () => {
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator-batch", password: "pass" });
  const firstCompany = await insertCompany(pool, zoneId, user.id);
  const secondCompany = await insertCompany(pool, zoneId, user.id, { companyName: "Second Batch Co", gstNumber: "27AAACB1234B1Z5" });
  const firstMou = await insertMou(pool, firstCompany, await insertPlant(pool, firstCompany));
  const secondMou = await insertMou(pool, secondCompany, await insertPlant(pool, secondCompany), { scheme: "NAPS" });
  await insertCommercialItem(pool, firstMou, "ADMIN_CHARGES", { amount: "100.00" });
  const configId = await insertPayrollConfig(pool, secondMou);
  await insertTraineeCategory(pool, configId, "Category A");
  await insertPayrollItem(pool, configId, "PF", { isApplicable: true, amount: "12", itemType: "DEDUCTION" });
  await insertMouDocument(pool, firstMou, user.id, { originalFilename: "first.pdf" });

  const db = createDatabase(pool);
  const batch = await loadCompanyRecords(db, pool, [secondMou, firstMou], "tester");
  const singles = [await loadCompanyRecord(db, pool, secondMou, "tester"), await loadCompanyRecord(db, pool, firstMou, "tester")];
  assert.deepEqual(batch, singles);
  assert.deepEqual(batch.map((record) => record.commercial.mouId), [secondMou, firstMou]);
});

test("SPEC-24 an unknown or inactive MoU is skipped by the batch loader", async () => {
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "creator-batch2", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, user.id);
  const mouId = await insertMou(pool, companyId, await insertPlant(pool, companyId));
  const batch = await loadCompanyRecords(createDatabase(pool), pool, ["00000000-0000-4000-8000-000000000000", mouId], "tester");
  assert.deepEqual(batch.map((record) => record.commercial.mouId), [mouId]);
});
