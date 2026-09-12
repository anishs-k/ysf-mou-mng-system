/**
 * Purpose: Integration tests for SPEC-08 - the expiry job itself
 * (`runExpiryAlertJob`, called directly rather than through HTTP since it has
 * no endpoint of its own) and the three alert routes. `insertMouEndingIn`
 * (test-harness.ts) is what lets every test target an exact days-remaining
 * value without caring what calendar day the suite happens to run on.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";

import type { Pool } from "pg";

import { createApp } from "./index.ts";
import { runExpiryAlertJob } from "./jobs/expiry-alerts.ts";
import {
  createTestPool,
  insertCompany,
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

async function setupCompanyAndPlant(role: "ADMIN" | "DATA_ENTRY" | "VIEWER" = "VIEWER") {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  const user = await insertUserWithPassword(pool, { username: "actor", password: "pass", role });
  const cookie = await login(user.username, user.password);
  return { zoneId, companyId, plantId, cookie, userId: user.id };
}

// ---------------------------------------------------------------------------
// The job itself
// ---------------------------------------------------------------------------

test("AC1 an MOU ending exactly 90 days from today raises one alert with threshold_days = 90", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator1", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMouEndingIn(pool, companyId, plantId, 90);

  await runExpiryAlertJob(pool);

  const { rows } = await pool.query<{ threshold_days: number }>(
    `SELECT threshold_days FROM mou_alert WHERE mou_id = $1`,
    [mouId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.threshold_days, 90);
});

test("AC2 running the job twice on the same day creates no duplicate row", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator2", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMouEndingIn(pool, companyId, plantId, 60);

  await runExpiryAlertJob(pool);
  await runExpiryAlertJob(pool);

  const { rows } = await pool.query(`SELECT count(*)::int AS c FROM mou_alert WHERE mou_id = $1`, [mouId]);
  assert.equal(rows[0].c, 1);
});

test("AC3 if the job misses 3 days, the next run raises any threshold crossed during those days", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator3", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  // Crossed the 30-day threshold 2 days ago - inside a window the job missed.
  const mouId = await insertMouEndingIn(pool, companyId, plantId, 28);

  await pool.query(
    `INSERT INTO scheduled_job_state (job_name, last_run_date) VALUES ('mou-expiry-alerts', business_today() - 4)`,
  );

  await runExpiryAlertJob(pool);

  const { rows } = await pool.query<{ threshold_days: number }>(
    `SELECT threshold_days FROM mou_alert WHERE mou_id = $1`,
    [mouId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.threshold_days, 30);
});

test("AC8 superseded (is_active = false) MOU versions never raise alerts", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator4", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMouEndingIn(pool, companyId, plantId, 90, { isActive: false });

  await runExpiryAlertJob(pool);

  const { rows } = await pool.query(`SELECT count(*)::int AS c FROM mou_alert WHERE mou_id = $1`, [mouId]);
  assert.equal(rows[0].c, 0);
});

test("AC9 with the email flag off, notified_at stays null", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator5", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMouEndingIn(pool, companyId, plantId, 90);

  await runExpiryAlertJob(pool);

  const { rows } = await pool.query<{ notified_at: string | null }>(
    `SELECT notified_at FROM mou_alert WHERE mou_id = $1`,
    [mouId],
  );
  assert.equal(rows[0]?.notified_at, null);
});

// ---------------------------------------------------------------------------
// GET /api/alerts/expiring, GET /api/alerts/count, POST .../acknowledge
// ---------------------------------------------------------------------------

test("AC4 an MOU ending 45 days out raises no alert but is counted in the badge", async () => {
  const { companyId, plantId, cookie } = await setupCompanyAndPlant();
  await insertMouEndingIn(pool, companyId, plantId, 45);
  await runExpiryAlertJob(pool);

  const countResponse = await fetch(`${baseUrl}/api/alerts/count`, { headers: { Cookie: cookie } });
  const countBody = (await countResponse.json()) as { count: number };
  assert.ok(countBody.count >= 1);

  const listResponse = await fetch(`${baseUrl}/api/alerts/expiring?days=all`, { headers: { Cookie: cookie } });
  const listBody = (await listResponse.json()) as unknown[];
  assert.equal(listBody.length, 0);
});

test("AC5 an MOU ending 120 days out is not in the badge count", async () => {
  const { companyId, plantId, cookie } = await setupCompanyAndPlant();
  await insertMouEndingIn(pool, companyId, plantId, 120);

  const response = await fetch(`${baseUrl}/api/alerts/count`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as { count: number };
  assert.equal(body.count, 0);
});

test("AC6 acknowledging an alert removes it from the default list and records who/when", async () => {
  const { companyId, plantId, cookie, userId } = await setupCompanyAndPlant("ADMIN");
  const mouId = await insertMouEndingIn(pool, companyId, plantId, 30);
  await runExpiryAlertJob(pool);

  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM mou_alert WHERE mou_id = $1`, [mouId]);
  const alertId = rows[0]?.id;
  assert.ok(alertId !== undefined);

  const ackResponse = await fetch(`${baseUrl}/api/alerts/${alertId}/acknowledge`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(ackResponse.status, 204);

  const defaultList = await fetch(`${baseUrl}/api/alerts/expiring`, { headers: { Cookie: cookie } });
  const defaultBody = (await defaultList.json()) as Array<{ alertId: string }>;
  assert.ok(!defaultBody.some((a) => a.alertId === alertId));

  const { rows: ackRows } = await pool.query<{ acknowledged_by: string }>(
    `SELECT acknowledged_by FROM mou_alert WHERE id = $1`,
    [alertId],
  );
  assert.equal(ackRows[0]?.acknowledged_by, userId);
});

test("AC7 an expired MOU shows negative days remaining and status Expired", async () => {
  const { companyId, plantId, cookie } = await setupCompanyAndPlant();
  const mouId = await insertMouEndingIn(pool, companyId, plantId, -10);
  await pool.query(
    `INSERT INTO mou_alert (mou_id, threshold_days, triggered_on) VALUES ($1, 30, business_today())`,
    [mouId],
  );

  const response = await fetch(`${baseUrl}/api/alerts/expiring?days=all`, { headers: { Cookie: cookie } });
  const body = (await response.json()) as Array<{ daysRemaining: number; status: string }>;
  assert.equal(body.length, 1);
  assert.ok(body[0]?.daysRemaining !== undefined && body[0].daysRemaining < 0);
  assert.equal(body[0]?.status, "Expired");
});

test("a DATA_ENTRY user may acknowledge; a VIEWER may not", async () => {
  const { companyId, plantId } = await setupCompanyAndPlant();
  const mouId = await insertMouEndingIn(pool, companyId, plantId, 30);
  await runExpiryAlertJob(pool);
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM mou_alert WHERE mou_id = $1`, [mouId]);
  const alertId = rows[0]?.id;

  const viewer = await insertUserWithPassword(pool, { username: "viewer2", password: "pass", role: "VIEWER" });
  const viewerCookie = await login(viewer.username, viewer.password);
  const viewerResponse = await fetch(`${baseUrl}/api/alerts/${alertId}/acknowledge`, {
    method: "POST",
    headers: { Cookie: viewerCookie },
  });
  assert.equal(viewerResponse.status, 403);

  const dataEntry = await insertUserWithPassword(pool, {
    username: "dataentry1",
    password: "pass",
    role: "DATA_ENTRY",
  });
  const dataEntryCookie = await login(dataEntry.username, dataEntry.password);
  const dataEntryResponse = await fetch(`${baseUrl}/api/alerts/${alertId}/acknowledge`, {
    method: "POST",
    headers: { Cookie: dataEntryCookie },
  });
  assert.equal(dataEntryResponse.status, 204);
});
