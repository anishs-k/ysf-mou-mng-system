/**
 * Purpose: Integration tests for SPEC-14 §5 - the two new read-only
 * endpoints the Figma dashboard design needs. AC6 covers the KPI summary
 * (including that an open wizard draft counts toward pendingReview and a
 * finished one does not); AC7 covers recent activity ordering and its
 * limit cap.
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
 * `insertMouEndingIn` always uses a 1-month tenure, so a large `daysFromToday`
 * still starts in the future (NEW, not ACTIVE) - the same gotcha
 * `zone-dashboard.integration.test.ts` works around. A 6-month tenure
 * starting 30 days ago is safely ACTIVE and far from its own expiry window.
 */
async function insertActiveMou(pool: Pool, companyId: string, plantId: string, scheme = "WILP"): Promise<string> {
  const { rows } = await pool.query<{ start_date: string }>(
    `SELECT (business_today() - INTERVAL '30 days')::date::text AS start_date`,
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
  readonly totalCompanies: number;
  readonly activeMou: number;
  readonly expiringSoon: number;
  readonly expired: number;
  readonly pendingReview: number;
}

async function fetchSummary(cookie: string): Promise<SummaryResponse> {
  const response = await fetch(`${baseUrl}/api/dashboard/summary`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return (await response.json()) as SummaryResponse;
}

interface ActivityRow {
  readonly type: "COMPANY_CREATED" | "MOU_EDITED";
  readonly company: string;
  readonly status: string | null;
  readonly occurredAt: string;
}

async function fetchActivity(cookie: string, query = ""): Promise<ActivityRow[]> {
  const response = await fetch(`${baseUrl}/api/dashboard/recent-activity${query}`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return (await response.json()) as ActivityRow[];
}

test("requires an authenticated session", async () => {
  const summary = await fetch(`${baseUrl}/api/dashboard/summary`);
  assert.equal(summary.status, 401);
  const activity = await fetch(`${baseUrl}/api/dashboard/recent-activity`);
  assert.equal(activity.status, 401);
});

test("AC6 KPI counts sum across zones and include an open draft as pending review", async () => {
  const zoneA = await insertZone(pool, "EAST", "East");
  const zoneB = await insertZone(pool, "WEST", "West");
  const viewer = await insertUserWithPassword(pool, { username: "viewer1", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const companyA = await insertCompany(pool, zoneA, viewer.id);
  const plantA = await insertPlant(pool, companyA);
  await insertActiveMou(pool, companyA, plantA); // active, far from expiry
  // SPEC-16 D101 replaced BOC_AND_DVOC with the separate BVOC and DVOC schemes.
  await insertMouEndingIn(pool, companyA, plantA, 45, { scheme: "BVOC" }); // expiring soon

  const companyB = await insertCompany(pool, zoneB, viewer.id);
  const plantB = await insertPlant(pool, companyB);
  await insertMouEndingIn(pool, companyB, plantB, -10, { scheme: "MSBTE" }); // expired

  let summary = await fetchSummary(cookie);
  assert.equal(summary.totalCompanies, 2);
  assert.equal(summary.activeMou, 1);
  assert.equal(summary.expiringSoon, 1);
  assert.equal(summary.expired, 1);
  assert.equal(summary.pendingReview, 0);

  await pool.query(
    `INSERT INTO company_draft (user_id, payload, current_page) VALUES ($1, $2, 1)`,
    [viewer.id, JSON.stringify({ page1: {} })],
  );

  summary = await fetchSummary(cookie);
  assert.equal(summary.pendingReview, 1);

  await pool.query(`DELETE FROM company_draft WHERE user_id = $1`, [viewer.id]);
  summary = await fetchSummary(cookie);
  assert.equal(summary.pendingReview, 0);
});

test("AC7 recent activity merges company-created and MOU-edited events, newest first, capped by limit", async () => {
  const zone = await insertZone(pool);
  const viewer = await insertUserWithPassword(pool, { username: "viewer1", password: "pass", role: "VIEWER" });
  const cookie = await login(viewer.username, viewer.password);

  const company = await insertCompany(pool, zone, viewer.id, { companyName: "Acme Corp" });
  const plant = await insertPlant(pool, company);
  const mouId = await insertMouEndingIn(pool, company, plant, 400);

  await pool.query(
    `INSERT INTO agreement_history (mou_id, version, edit_reason, snapshot, edited_by, edited_at)
     VALUES ($1, 1, 'ADDENDUM_IN_AGREEMENT', $2, $3, now() + interval '1 hour')`,
    [mouId, JSON.stringify({}), viewer.id],
  );

  const rows = await fetchActivity(cookie);
  assert.ok(rows.length >= 2);
  assert.equal(rows[0]?.type, "MOU_EDITED");
  assert.equal(rows[0]?.company, "Acme Corp");
  assert.equal(rows.some((row) => row.type === "COMPANY_CREATED" && row.company === "Acme Corp"), true);

  const capped = await fetchActivity(cookie, "?limit=1");
  assert.equal(capped.length, 1);
  assert.equal(capped[0]?.type, "MOU_EDITED");

  const clamped = await fetchActivity(cookie, "?limit=999");
  assert.ok(clamped.length <= 50);
});
