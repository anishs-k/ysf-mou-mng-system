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

interface AlertRow {
  mouId: string;
  companyId: string;
  companyName: string;
  generatedCode: string;
  zoneId: string;
  zoneName: string;
  plantName: string;
  scheme: string;
  mouStartDate: string;
  endDate: string;
  daysRemaining: number;
  thresholdDays: number;
  status: string;
  alertId: string | null;
  acknowledgedAt: string | null;
}

async function listAlerts(cookie: string, query = ""): Promise<AlertRow[]> {
  const response = await fetch(`${baseUrl}/api/alerts/expiring${query}`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  return (await response.json()) as AlertRow[];
}

test("AC4 (live list) an MOU ending 45 days out has no alert row yet but is listed and counted", async () => {
  const { zoneId, companyId, plantId, cookie } = await setupCompanyAndPlant();
  const mouId = await insertMouEndingIn(pool, companyId, plantId, 45);
  await runExpiryAlertJob(pool);

  const countResponse = await fetch(`${baseUrl}/api/alerts/count`, { headers: { Cookie: cookie } });
  const countBody = (await countResponse.json()) as { count: number };
  assert.equal(countBody.count, 1);

  const list = await listAlerts(cookie, "?days=all");
  assert.equal(list.length, 1);
  const row = list[0];
  assert.ok(row !== undefined);
  assert.equal(row.mouId, mouId);
  assert.equal(row.companyId, companyId);
  assert.equal(row.zoneId, zoneId);
  assert.equal(row.daysRemaining, 45);
  assert.equal(row.thresholdDays, 60);
  assert.equal(row.alertId, null);
  assert.equal(row.acknowledgedAt, null);
  assert.match(row.endDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(row.mouStartDate, /^\d{4}-\d{2}-\d{2}$/);
});

test("the days window narrows the live list: 30 excludes a 45-day MOU, 60 includes it", async () => {
  const { companyId, plantId, cookie } = await setupCompanyAndPlant();
  await insertMouEndingIn(pool, companyId, plantId, 45, { scheme: "WILP" });
  await insertMouEndingIn(pool, companyId, plantId, 10, { scheme: "NAPS" });
  await insertMouEndingIn(pool, companyId, plantId, 91, { scheme: "NATS" });

  assert.deepEqual((await listAlerts(cookie, "?days=30")).map((r) => r.daysRemaining), [10]);
  assert.deepEqual((await listAlerts(cookie, "?days=60")).map((r) => r.daysRemaining), [10, 45]);
  assert.deepEqual((await listAlerts(cookie, "?days=90")).map((r) => r.daysRemaining), [10, 45]);
  assert.deepEqual((await listAlerts(cookie)).map((r) => r.daysRemaining), [10, 45]);
});

test("an MOU with several alert rows is listed once, carrying the latest threshold row", async () => {
  const { companyId, plantId, cookie, userId } = await setupCompanyAndPlant();
  const mouId = await insertMouEndingIn(pool, companyId, plantId, 50);
  await pool.query(
    `INSERT INTO mou_alert (mou_id, threshold_days, triggered_on, acknowledged_at, acknowledged_by)
     VALUES ($1, 90, business_today() - 40, now(), $2)`,
    [mouId, userId],
  );
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO mou_alert (mou_id, threshold_days, triggered_on) VALUES ($1, 60, business_today() - 10) RETURNING id`,
    [mouId],
  );

  const all = await listAlerts(cookie, "?acknowledged=all");
  assert.equal(all.length, 1);
  assert.equal(all[0]?.alertId, rows[0]?.id);
  assert.equal(all[0]?.acknowledgedAt, null);
  // The 60-day alert is still open, so the MOU shows in the default (unacknowledged) list.
  assert.equal((await listAlerts(cookie)).length, 1);
  assert.equal((await listAlerts(cookie, "?acknowledged=true")).length, 0);
});

test("inactive MOUs and MOUs of inactive companies are never listed or counted", async () => {
  const { companyId, plantId, zoneId, cookie } = await setupCompanyAndPlant();
  await insertMouEndingIn(pool, companyId, plantId, 20, { isActive: false });
  const creator = await insertUserWithPassword(pool, { username: "creator9", password: "pass" });
  const inactiveCompany = await insertCompany(pool, zoneId, creator.id);
  await insertMouEndingIn(pool, inactiveCompany, null, 20);
  await pool.query(`UPDATE company SET is_active = false WHERE id = $1`, [inactiveCompany]);

  assert.equal((await listAlerts(cookie, "?acknowledged=all")).length, 0);
  const countResponse = await fetch(`${baseUrl}/api/alerts/count`, { headers: { Cookie: cookie } });
  assert.equal(((await countResponse.json()) as { count: number }).count, 0);
});

test("zone and scheme filters still narrow the live list", async () => {
  const { companyId, plantId, cookie } = await setupCompanyAndPlant();
  await insertMouEndingIn(pool, companyId, plantId, 20, { scheme: "WILP" });
  await insertMouEndingIn(pool, companyId, plantId, 20, { scheme: "NAPS" });
  const otherZone = await insertZone(pool, "EAST", "East");
  const creator = await insertUserWithPassword(pool, { username: "creator10", password: "pass" });
  const otherCompany = await insertCompany(pool, otherZone, creator.id);
  await insertMouEndingIn(pool, otherCompany, null, 20, { scheme: "WILP" });

  assert.equal((await listAlerts(cookie, "?scheme=NAPS")).length, 1);
  assert.equal((await listAlerts(cookie, `?zoneId=${otherZone}`)).length, 1);
  assert.equal((await listAlerts(cookie)).length, 3);
});

test("POST /api/mous/:mouId/alerts/acknowledge acknowledges an MOU that has no alert row yet", async () => {
  const { companyId, plantId, cookie, userId } = await setupCompanyAndPlant("ADMIN");
  const mouId = await insertMouEndingIn(pool, companyId, plantId, 45);

  const ackResponse = await fetch(`${baseUrl}/api/mous/${mouId}/alerts/acknowledge`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(ackResponse.status, 204);

  const { rows } = await pool.query<{ threshold_days: number; acknowledged_by: string }>(
    `SELECT threshold_days, acknowledged_by FROM mou_alert WHERE mou_id = $1`,
    [mouId],
  );
  assert.deepEqual(rows, [{ threshold_days: 60, acknowledged_by: userId }]);

  assert.equal((await listAlerts(cookie)).length, 0);
  const acknowledged = await listAlerts(cookie, "?acknowledged=true");
  assert.equal(acknowledged.length, 1);
  assert.ok(acknowledged[0]?.alertId !== null && acknowledged[0]?.acknowledgedAt !== null);

  // Acknowledging again is idempotent - still exactly one row.
  const again = await fetch(`${baseUrl}/api/mous/${mouId}/alerts/acknowledge`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(again.status, 204);
  const { rows: countRows } = await pool.query(`SELECT count(*)::int AS c FROM mou_alert WHERE mou_id = $1`, [mouId]);
  assert.equal(countRows[0].c, 1);

  // Running the job afterwards must not raise a duplicate for the same threshold.
  await runExpiryAlertJob(pool);
  assert.equal((await listAlerts(cookie)).length, 0);
});

test("POST /api/mous/:mouId/alerts/acknowledge: 403 for a VIEWER, 422 outside the window, 404 for an unknown MOU", async () => {
  const { companyId, plantId, cookie } = await setupCompanyAndPlant("ADMIN");
  const soon = await insertMouEndingIn(pool, companyId, plantId, 20, { scheme: "WILP" });
  const later = await insertMouEndingIn(pool, companyId, plantId, 120, { scheme: "NAPS" });

  const viewer = await insertUserWithPassword(pool, { username: "viewer3", password: "pass", role: "VIEWER" });
  const viewerCookie = await login(viewer.username, viewer.password);
  const viewerResponse = await fetch(`${baseUrl}/api/mous/${soon}/alerts/acknowledge`, {
    method: "POST",
    headers: { Cookie: viewerCookie },
  });
  assert.equal(viewerResponse.status, 403);

  const outside = await fetch(`${baseUrl}/api/mous/${later}/alerts/acknowledge`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(outside.status, 422);

  const unknown = await fetch(`${baseUrl}/api/mous/123e4567-e89b-12d3-a456-426614174000/alerts/acknowledge`, {
    method: "POST",
    headers: { Cookie: cookie },
  });
  assert.equal(unknown.status, 404);
});

test("the badge count equals the default list window with acknowledged=all", async () => {
  const { companyId, plantId, cookie } = await setupCompanyAndPlant();
  await insertMouEndingIn(pool, companyId, plantId, 0, { scheme: "WILP" });
  await insertMouEndingIn(pool, companyId, plantId, 90, { scheme: "NAPS" });
  await insertMouEndingIn(pool, companyId, plantId, 91, { scheme: "NATS" });
  await insertMouEndingIn(pool, companyId, plantId, -1, { scheme: "FLEXI" });

  const countResponse = await fetch(`${baseUrl}/api/alerts/count`, { headers: { Cookie: cookie } });
  const { count } = (await countResponse.json()) as { count: number };
  assert.equal(count, 2);
  assert.equal((await listAlerts(cookie, "?acknowledged=all")).length, count);
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

test("AC7 (live list) an already-expired MOU drops out of the list even if it has an alert row", async () => {
  const { companyId, plantId, cookie } = await setupCompanyAndPlant();
  const mouId = await insertMouEndingIn(pool, companyId, plantId, -10);
  await pool.query(
    `INSERT INTO mou_alert (mou_id, threshold_days, triggered_on) VALUES ($1, 30, business_today())`,
    [mouId],
  );

  assert.equal((await listAlerts(cookie, "?days=all&acknowledged=all")).length, 0);
});

test("a listed MOU ending today shows 0 days remaining, the 30-day band and status Active", async () => {
  const { companyId, plantId, cookie } = await setupCompanyAndPlant();
  await insertMouEndingIn(pool, companyId, plantId, 0);

  const body = await listAlerts(cookie);
  assert.equal(body.length, 1);
  assert.equal(body[0]?.daysRemaining, 0);
  assert.equal(body[0]?.thresholdDays, 30);
  assert.equal(body[0]?.status, "Active");
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
