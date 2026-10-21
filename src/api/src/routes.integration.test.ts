/**
 * Purpose: Integration tests for the SPEC-01 section 7 master data API -
 * acceptance criteria AC15 and AC16. The real Express application is started on an
 * ephemeral port and driven over HTTP, so routing, JSON casing and the is_active
 * filtering are all exercised end to end against PostgreSQL rather than mocked.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";
import type { Pool } from "pg";

import { createApp } from "./index.ts";
import { seedZones } from "./db/seed/zones.ts";
import {
  createTestPool,
  insertCompany,
  insertPlant,
  insertUser,
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
  // Guarded so that a failure inside before() reports its own error instead of a
  // TypeError from tearing down a server that was never created.
  if (server === undefined) {
    return;
  }
  const closing = server;
  await new Promise<void>((resolve, reject) => {
    closing.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
  await pool.end();
});

test("AC15 GET /api/enums returns every section 2, 3 and 4 list", async () => {
  const response = await fetch(`${baseUrl}/api/enums`);
  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;

  for (const key of [
    "companyTypes",
    "registrationTypes",
    "contactTypes",
    "schemes",
    "mouStatuses",
    "tenureUnits",
    "editAgreementReasons",
    "itemTypes",
    "userRoles",
  ]) {
    const list = body[key] as { value: string; label: string }[];
    assert.ok(Array.isArray(list), `${key} must be a list`);
    assert.ok(list.length > 0, `${key} must not be empty`);
    for (const option of list) {
      assert.equal(typeof option.value, "string");
      assert.equal(typeof option.label, "string");
    }
  }

  const commercial = body["commercialItems"] as { itemType: string | null; displayOrder: number }[];
  const payroll = body["payrollItems"] as { itemType: string | null; displayOrder: number }[];
  // D153: 9 core charges + OTHER; D158: PF, ESI, TDS + OTHER.
  assert.equal(commercial.length, 10);
  assert.equal(payroll.length, 4);
  assert.equal(commercial[0]?.displayOrder, 1);
  assert.equal(commercial[9]?.itemType, null);
  assert.equal(payroll[0]?.itemType, "DEDUCTION");
});

/** SPEC-19 D121: the zone and plant lookups now need a session; an all-zone user sees everything. */
async function signedIn(path: string): Promise<Response> {
  const viewer = await insertUserWithPassword(pool, { username: `viewer${Math.random()}`, password: "pass", role: "VIEWER" });
  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: viewer.username, password: viewer.password }),
  });
  return fetch(`${baseUrl}${path}`, { headers: { Cookie: login.headers.get("set-cookie") ?? "" } });
}

test("AC15 GET /api/zones returns the seeded active zones ordered by name", async () => {
  await seedZones(pool);

  const response = await signedIn("/api/zones");
  assert.equal(response.status, 200);
  const zones = (await response.json()) as { code: string; name: string }[];

  // SPEC-16 D102 replaced the five provisional zones with these 24. The order is
  // the database's own `ORDER BY name` under the en_US.utf8 collation, which sorts
  // "NCR Haryana"/"NCR Noida" ahead of "Nashik".
  assert.deepEqual(
    zones.map((zone) => zone.name),
    [
      "Ahilya Nagar",
      "Assam",
      "Chennai",
      "Chiplun",
      "Coimbatore",
      "Daman",
      "Goa",
      "Gujarat Sanand",
      "Gujarat Vadodara",
      "Haridwar",
      "Jamshedpur",
      "Karnataka",
      "Kolhapur",
      "Madhya Pradesh",
      "Mumbai",
      "NCR Haryana",
      "NCR Noida",
      "Nashik",
      "Pune",
      "Rajasthan",
      "Ranjangaon",
      "Rudrapur",
      "Sikkim",
      "Solapur",
    ],
  );
  assert.deepEqual(
    zones.map((zone) => zone.code),
    [
      "AHILYANGR",
      "ASSAM",
      "CHENNAI",
      "CHIPLUN",
      "COIMBATORE",
      "DAMAN",
      "GOA",
      "GJSANAND",
      "GJVADODARA",
      "HARIDWAR",
      "JAMSHEDPUR",
      "KARNATAKA",
      "KOLHAPUR",
      "MP",
      "MUMBAI",
      "NCRHARYANA",
      "NCRNOIDA",
      "NASHIK",
      "PUNE",
      "RAJASTHAN",
      "RANJANGAON",
      "RUDRAPUR",
      "SIKKIM",
      "SOLAPUR",
    ],
  );
});

test("AC15 GET /api/zones omits deactivated zones", async () => {
  await seedZones(pool);
  // SPEC-16 D102 replaced the five provisional zones with the 24 real zones, so
  // the deactivated row here is one of those, not the old "WEST" placeholder.
  await pool.query(`UPDATE zone SET is_active = false WHERE code = 'GOA'`);

  const zones = (await (await signedIn("/api/zones")).json()) as { code: string }[];

  assert.equal(zones.length, 23);
  assert.ok(!zones.some((zone) => zone.code === "GOA"));
});

test("AC16 a deactivated company leaves the zone list but stays resolvable by id", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId, { companyName: "Acme Trainees" });
  await insertPlant(pool, companyId, "Chakan Plant");

  // SPEC-16 D109: a company no longer carries a generated code, so this
  // company-scoped list reports only its id and name.
  const listed = (await (
    await signedIn(`/api/zones/${zoneId}/companies`)
  ).json()) as { id: string; name: string }[];
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.name, "Acme Trainees");
  assert.equal(Object.keys(listed[0] ?? {}).sort().join(","), "id,name");

  await pool.query(`UPDATE company SET is_active = false WHERE id = $1`, [companyId]);

  const afterDeactivation = (await (
    await signedIn(`/api/zones/${zoneId}/companies`)
  ).json()) as unknown[];
  assert.deepEqual(afterDeactivation, []);

  const plantsResponse = await signedIn(`/api/companies/${companyId}/plants`);
  assert.equal(plantsResponse.status, 200);
  const plants = (await plantsResponse.json()) as { plantName: string }[];
  assert.deepEqual(
    plants.map((plant) => plant.plantName),
    ["Chakan Plant"],
  );
});

test("GET /api/companies/{id}/plants rejects an id that is not a UUID", async () => {
  const response = await signedIn("/api/companies/not-a-uuid/plants");
  assert.equal(response.status, 400);
});
