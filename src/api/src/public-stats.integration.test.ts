/**
 * Purpose: Integration tests for `GET /api/public/stats` - the one
 * deliberately unauthenticated endpoint in the app (reverses ADR D88 at
 * explicit user request, for the Login page's stat tiles). Covers the two
 * properties that matter most for a public route: it truly requires no
 * session, and it exposes only the four coarse counts it promises - nothing
 * per-zone or per-company.
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

interface PublicStatsResponse {
  readonly totalCompanies: number;
  readonly activeMou: number;
  readonly expiringSoon: number;
  readonly activeZones: number;
}

test("answers with no session cookie at all - this is the one intentionally public route", async () => {
  const response = await fetch(`${baseUrl}/api/public/stats`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as PublicStatsResponse;
  assert.equal(typeof body.totalCompanies, "number");
  assert.equal(typeof body.activeMou, "number");
  assert.equal(typeof body.expiringSoon, "number");
  assert.equal(typeof body.activeZones, "number");
});

test("exposes only the four coarse counts - no zone names, no company data, no pendingReview/expired", async () => {
  const response = await fetch(`${baseUrl}/api/public/stats`);
  const body = (await response.json()) as Record<string, unknown>;
  assert.deepEqual(Object.keys(body).sort(), [
    "activeMou",
    "activeZones",
    "expiringSoon",
    "totalCompanies",
  ]);
});

test("activeZones counts every active zone, and totalCompanies sums across all of them", async () => {
  const zoneA = await insertZone(pool, "EAST", "East");
  const zoneB = await insertZone(pool, "WEST", "West");
  const creator = await insertUserWithPassword(pool, {
    username: "creator1",
    password: "pass",
  });
  await insertCompany(pool, zoneA, creator.id);
  await insertCompany(pool, zoneB, creator.id);

  const response = await fetch(`${baseUrl}/api/public/stats`);
  const body = (await response.json()) as PublicStatsResponse;
  assert.equal(body.activeZones, 2);
  assert.equal(body.totalCompanies, 2);
});

test("activeMou counts a currently-active MOU", async () => {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, {
    username: "creator2",
    password: "pass",
  });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  const { rows } = await pool.query<{ start_date: string }>(
    `SELECT (business_today() - INTERVAL '30 days')::date::text AS start_date`,
  );
  const startDate = rows[0]?.start_date;
  assert.ok(startDate !== undefined);
  await insertMou(pool, companyId, plantId, {
    startDate,
    tenureValue: 6,
    tenureUnit: "MONTHS",
  });

  const response = await fetch(`${baseUrl}/api/public/stats`);
  const body = (await response.json()) as PublicStatsResponse;
  assert.equal(body.activeMou, 1);
});

test("sends a short public Cache-Control header, matching the intent of a cheap public route", async () => {
  const response = await fetch(`${baseUrl}/api/public/stats`);
  const cacheControl = response.headers.get("cache-control");
  assert.ok(cacheControl !== null);
  assert.match(cacheControl, /public/);
  assert.match(cacheControl, /max-age=30/);
});
