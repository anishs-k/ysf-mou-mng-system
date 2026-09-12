/**
 * Purpose: Integration tests for SPEC-12 - the zone summary, the scheme
 * matrix, and the drill-down list. `insertMouEndingIn` (test-harness.ts)
 * targets an exact days-remaining value regardless of what day the suite
 * runs on, the same helper SPEC-08's tests use.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";

import type { Pool } from "pg";

import { createApp } from "./index.ts";
import {
  createTestPool,
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

/**
 * `insertMouEndingIn` (test-harness.ts) always uses a 1-month tenure, so an
 * MOU it creates ending 45 days out has necessarily not started yet (NEW),
 * not ACTIVE - a 1-month agreement ending 45 days from now would have to
 * start 15 days from now. AC6 needs an agreement already under way with 45
 * days left, so this local helper inverts the same generated-column formula
 * with a 6-month tenure instead, which comfortably starts in the past.
 */
async function insertActiveMouEndingIn(pool: Pool, companyId: string, plantId: string, daysFromToday: number, scheme: string) {
  const { rows } = await pool.query<{ start_date: string }>(
    `SELECT (business_today() + ($1 * INTERVAL '1 day') + INTERVAL '1 day' - INTERVAL '6 months')::date::text AS start_date`,
    [daysFromToday],
  );
  const startDate = rows[0]?.start_date;
  if (startDate === undefined) {
    throw new Error("Failed to compute a start date");
  }
  return insertMou(pool, companyId, plantId, { scheme, startDate, tenureValue: 6, tenureUnit: "MONTHS" });
}

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

interface SummaryResponse {
  readonly zones: Array<{
    zoneId: string;
    zoneName: string;
    companies: number;
    plants: number;
    mous: number;
    active: number;
    expired: number;
    new: number;
    expiringSoon: number;
  }>;
  readonly totals: { companies: number; mous: number };
  readonly matrix: { schemes: readonly string[]; rows: Array<{ zoneId: string; rowTotal: number; counts: Record<string, number> }> };
}

async function fetchSummary(cookie: string, query = ""): Promise<SummaryResponse> {
  const response = await fetch(`${baseUrl}/api/dashboard/zone-wise${query}`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return (await response.json()) as SummaryResponse;
}

test("AC1 every active zone appears, including a zone with zero companies", async () => {
  const zoneId = await insertZone(pool, "EAST", "East");
  const viewer = await insertUserWithPassword(pool, { username: "viewer1", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const body = await fetchSummary(cookie);
  const zoneRow = body.zones.find((z) => z.zoneId === zoneId);
  assert.ok(zoneRow !== undefined);
  assert.equal(zoneRow?.companies, 0);
  assert.equal(zoneRow?.mous, 0);
});

test("AC2 company counts per zone sum to the total company count", async () => {
  const zoneA = await insertZone(pool, "EAST", "East");
  const zoneB = await insertZone(pool, "SOUTH", "South");
  const creator = await insertUserWithPassword(pool, { username: "creator1", password: "pass" });
  await insertCompany(pool, zoneA, creator.id);
  await insertCompany(pool, zoneA, creator.id);
  await insertCompany(pool, zoneB, creator.id);
  const viewer = await insertUserWithPassword(pool, { username: "viewer2", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const body = await fetchSummary(cookie);
  const sum = body.zones.reduce((total, zone) => total + zone.companies, 0);
  assert.equal(sum, 3);
  assert.equal(body.totals.companies, 3);
});

test("AC3/AC4 an MOU starting next month counts as New, one past its end date counts as Expired", async () => {
  const zoneId = await insertZone(pool, "EAST", "East");
  const creator = await insertUserWithPassword(pool, { username: "creator2", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  await insertMouEndingIn(pool, companyId, plantId, 400); // starts well in the future
  await insertMouEndingIn(pool, companyId, plantId, -10, { scheme: "FLEXI" });
  const viewer = await insertUserWithPassword(pool, { username: "viewer3", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const body = await fetchSummary(cookie);
  const zoneRow = body.zones.find((z) => z.zoneId === zoneId);
  assert.equal(zoneRow?.new, 1);
  assert.equal(zoneRow?.expired, 1);
});

test("AC5 a superseded (is_active = false) MOU is excluded from every count", async () => {
  const zoneId = await insertZone(pool, "EAST", "East");
  const creator = await insertUserWithPassword(pool, { username: "creator3", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId, { isActive: false });
  const viewer = await insertUserWithPassword(pool, { username: "viewer4", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const body = await fetchSummary(cookie);
  const zoneRow = body.zones.find((z) => z.zoneId === zoneId);
  assert.equal(zoneRow?.mous, 0);
});

test("AC6 an MOU ending in 45 days counts in both Active and Expiring <= 90 days", async () => {
  const zoneId = await insertZone(pool, "EAST", "East");
  const creator = await insertUserWithPassword(pool, { username: "creator4", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  await insertActiveMouEndingIn(pool, companyId, plantId, 45, "WILP");
  const viewer = await insertUserWithPassword(pool, { username: "viewer5", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const body = await fetchSummary(cookie);
  const zoneRow = body.zones.find((z) => z.zoneId === zoneId);
  assert.equal(zoneRow?.active, 1);
  assert.equal(zoneRow?.expiringSoon, 1);
});

test("a company with two plants does not inflate the MOU count (join fan-out regression)", async () => {
  const zoneId = await insertZone(pool, "EAST", "East");
  const creator = await insertUserWithPassword(pool, { username: "creator5b", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantA = await insertPlant(pool, companyId, "Plant A");
  await insertPlant(pool, companyId, "Plant B");
  await insertMou(pool, companyId, plantA, { scheme: "WILP" });
  const viewer = await insertUserWithPassword(pool, { username: "viewer5b", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const body = await fetchSummary(cookie);
  const zoneRow = body.zones.find((z) => z.zoneId === zoneId);
  assert.equal(zoneRow?.plants, 2);
  assert.equal(zoneRow?.mous, 1);
});

test("AC7 filtering by scheme WILP restricts every count in both tables to WILP MOUs", async () => {
  const zoneId = await insertZone(pool, "EAST", "East");
  const creator = await insertUserWithPassword(pool, { username: "creator5", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId, { scheme: "WILP" });
  await insertMou(pool, companyId, plantId, { scheme: "FLEXI" });
  const viewer = await insertUserWithPassword(pool, { username: "viewer6", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const body = await fetchSummary(cookie, "?scheme=WILP");
  const zoneRow = body.zones.find((z) => z.zoneId === zoneId);
  assert.equal(zoneRow?.mous, 1);
  const matrixRow = body.matrix.rows.find((z) => z.zoneId === zoneId);
  assert.equal(matrixRow?.counts["WILP"], 1);
  assert.equal(matrixRow?.counts["FLEXI"], 0);
});

test("AC8 clicking the Expired count for a zone lists exactly those MOUs", async () => {
  const zoneId = await insertZone(pool, "EAST", "East");
  const creator = await insertUserWithPassword(pool, { username: "creator6", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  await insertMouEndingIn(pool, companyId, plantId, -10, { scheme: "WILP" });
  await insertMouEndingIn(pool, companyId, plantId, 45, { scheme: "FLEXI" });
  const viewer = await insertUserWithPassword(pool, { username: "viewer7", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const response = await fetch(`${baseUrl}/api/dashboard/zone-wise/${zoneId}/companies?status=EXPIRED`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 200);
  const rows = (await response.json()) as Array<{ status: string; scheme: string }>;
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.status, "EXPIRED");
  assert.equal(rows[0]?.scheme, "WILP");
});

test("AC9 the scheme matrix row total equals the summary MOU count for the same zone", async () => {
  const zoneId = await insertZone(pool, "EAST", "East");
  const creator = await insertUserWithPassword(pool, { username: "creator7", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId, { scheme: "WILP" });
  await insertMou(pool, companyId, plantId, { scheme: "FLEXI" });
  await insertMou(pool, companyId, plantId, { scheme: "MSBTE" });
  const viewer = await insertUserWithPassword(pool, { username: "viewer8", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const body = await fetchSummary(cookie);
  const zoneRow = body.zones.find((z) => z.zoneId === zoneId);
  const matrixRow = body.matrix.rows.find((z) => z.zoneId === zoneId);
  assert.equal(matrixRow?.rowTotal, zoneRow?.mous);
});

test("AC10 no endpoint here accepts a write - only GET routes exist", async () => {
  const zoneId = await insertZone(pool, "EAST", "East");
  const viewer = await insertUserWithPassword(pool, { username: "viewer9", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const response = await fetch(`${baseUrl}/api/dashboard/zone-wise/${zoneId}/companies`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 404);
});
