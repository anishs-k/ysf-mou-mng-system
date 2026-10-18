/**
 * Purpose: Integration tests for SPEC-20 - self sign-up, the login refusal of
 * pending and rejected users, and the super-admin approval routes. Every test
 * starts from an empty database, so the per-IP sign-up limit (all requests here
 * come from 127.0.0.1) never carries over from one test to the next.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";

import type { Pool } from "pg";

import { createApp } from "./index.ts";
import { createTestPool, insertUserWithPassword, insertZone, resetDatabase } from "./db/test-harness.ts";

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

interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly cookie: string | null;
}

async function send(method: string, path: string, body?: unknown, cookie?: string): Promise<Reply> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie === undefined ? {} : { Cookie: cookie }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>),
    cookie: response.headers.get("set-cookie"),
  };
}

const signUp = (body: Record<string, unknown>) => send("POST", "/api/auth/signup", body);
const login = (username: string, password: string) => send("POST", "/api/auth/login", { username, password });

function signUpBody(zoneId: string, email = "new.person@test.com") {
  return { email, password: "Secret@123", fullName: "New Person", zoneId };
}

async function superAdminCookie(): Promise<string> {
  const admin = await insertUserWithPassword(pool, { username: "hq.admin", password: "pass" });
  const reply = await login(admin.username, admin.password);
  assert.equal(reply.status, 200);
  return reply.cookie ?? "";
}

async function pendingUserId(email: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM "user" WHERE email = $1`, [email]);
  const id = rows[0]?.id;
  assert.ok(id !== undefined);
  return id;
}

test("AC2 a valid sign-up creates a pending VIEWER in the chosen zone and signs nobody in", async () => {
  const zoneId = await insertZone(pool, "PUNE", "Pune");
  const reply = await signUp(signUpBody(zoneId, "New.Person@Test.com"));

  assert.equal(reply.status, 201);
  assert.equal(reply.body["approvalStatus"], "PENDING");
  assert.equal(reply.cookie, null);
  const { rows } = await pool.query(
    `SELECT username, email, full_name, role, zone_id, approval_status FROM "user" WHERE email = 'new.person@test.com'`,
  );
  assert.deepEqual(rows, [
    {
      username: "new.person@test.com",
      email: "new.person@test.com",
      full_name: "New Person",
      role: "VIEWER",
      zone_id: zoneId,
      approval_status: "PENDING",
    },
  ]);
});

test("AC11 the sign-up zone list needs no session and exposes only active zones' id and name", async () => {
  const puneId = await insertZone(pool, "PUNE", "Pune");
  const goaId = await insertZone(pool, "GOA", "Goa");
  await pool.query(`UPDATE zone SET is_active = false WHERE id = $1`, [goaId]);

  const response = await fetch(`${baseUrl}/api/public/zones`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{ id: puneId, name: "Pune" }]);
});

test("AC3 each invalid field is rejected with 400 naming that field", async () => {
  const zoneId = await insertZone(pool, "PUNE", "Pune");
  const inactiveZoneId = await insertZone(pool, "GOA", "Goa");
  await pool.query(`UPDATE zone SET is_active = false WHERE id = $1`, [inactiveZoneId]);

  const cases: Array<[string, Record<string, unknown>]> = [
    ["email", { ...signUpBody(zoneId), email: "not-an-email" }],
    ["password", { ...signUpBody(zoneId), password: "short" }],
    ["fullName", { ...signUpBody(zoneId), fullName: " A " }],
    ["zoneId", { ...signUpBody(zoneId), zoneId: "00000000-0000-4000-8000-000000000000" }],
    ["zoneId", { ...signUpBody(zoneId), zoneId: inactiveZoneId }],
    ["zoneId", { ...signUpBody(zoneId), zoneId: "not-a-uuid" }],
  ];
  for (const [field, body] of cases) {
    const reply = await signUp(body);
    assert.equal(reply.status, 400, `${field}: ${JSON.stringify(reply.body)}`);
    assert.ok(typeof (reply.body["errors"] as Record<string, string>)[field] === "string", field);
  }
  const { rows } = await pool.query(`SELECT 1 FROM "user"`);
  assert.equal(rows.length, 0);
});

test("AC4 a second sign-up with the same email in any case is a 409", async () => {
  const zoneId = await insertZone(pool, "PUNE", "Pune");
  assert.equal((await signUp(signUpBody(zoneId, "dup@test.com"))).status, 201);
  const second = await signUp(signUpBody(zoneId, "DUP@test.com"));
  assert.equal(second.status, 409);
  assert.equal(second.body["error"], "This email is already registered.");
});

test("AC5 the sixth sign-up from one IP is refused with 429", async () => {
  const zoneId = await insertZone(pool, "PUNE", "Pune");
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    assert.equal((await signUp(signUpBody(zoneId, `person${attempt}@test.com`))).status, 201);
  }
  const sixth = await signUp(signUpBody(zoneId, "person6@test.com"));
  assert.equal(sixth.status, 429);
  assert.ok(Number(sixth.body["retryAfterSeconds"]) > 0);
});

test("AC6 a pending user is told to wait only with the right password, and gets no session", async () => {
  const zoneId = await insertZone(pool, "PUNE", "Pune");
  await signUp(signUpBody(zoneId));

  const right = await login("new.person@test.com", "Secret@123");
  assert.equal(right.status, 403);
  assert.deepEqual(right.body, { error: "Your account is awaiting admin approval.", approvalStatus: "PENDING" });
  assert.equal(right.cookie, null);

  const wrong = await login("new.person@test.com", "wrong-password");
  assert.equal(wrong.status, 401);
  assert.equal(wrong.body["approvalStatus"], undefined);
});

test("AC7 a rejected user is refused with 403 and no session", async () => {
  const zoneId = await insertZone(pool, "PUNE", "Pune");
  await insertUserWithPassword(pool, { username: "turned.down", password: "pass", zoneId, approvalStatus: "REJECTED" });

  const reply = await login("turned.down", "pass");
  assert.equal(reply.status, 403);
  assert.deepEqual(reply.body, { error: "Your sign-up request was not approved.", approvalStatus: "REJECTED" });
  assert.equal(reply.cookie, null);
});

test("AC6 a session whose user is no longer approved stops working", async () => {
  const user = await insertUserWithPassword(pool, { username: "was.approved", password: "pass" });
  const { cookie } = await login(user.username, user.password);
  assert.equal((await send("GET", "/api/auth/me", undefined, cookie ?? "")).status, 200);

  await pool.query(`UPDATE "user" SET approval_status = 'PENDING' WHERE id = $1`, [user.id]);
  assert.equal((await send("GET", "/api/auth/me", undefined, cookie ?? "")).status, 401);
});

test("AC8 only a super admin may see the pending list", async () => {
  const zoneId = await insertZone(pool, "PUNE", "Pune");
  await signUp(signUpBody(zoneId));

  const list = await fetch(`${baseUrl}/api/admin/users/pending`, { headers: { Cookie: await superAdminCookie() } });
  assert.equal(list.status, 200);
  const pending = (await list.json()) as Array<Record<string, unknown>>;
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.["email"], "new.person@test.com");
  assert.equal(pending[0]?.["fullName"], "New Person");
  assert.equal(pending[0]?.["zoneName"], "Pune");

  const others = [
    { username: "zonal.admin", role: "ADMIN" as const, zoneId },
    { username: "data.entry", role: "DATA_ENTRY" as const },
    { username: "viewer", role: "VIEWER" as const },
  ];
  for (const other of others) {
    const user = await insertUserWithPassword(pool, { ...other, password: "pass" });
    const { cookie } = await login(user.username, user.password);
    const reply = await send("GET", "/api/admin/users/pending", undefined, cookie ?? "");
    assert.equal(reply.status, 403, other.username);
    const decide = await send("POST", `/api/admin/users/${await pendingUserId("new.person@test.com")}/decision`,
      { decision: "APPROVE", role: "VIEWER" }, cookie ?? "");
    assert.equal(decide.status, 403, other.username);
  }
  assert.equal((await fetch(`${baseUrl}/api/admin/users/pending`)).status, 401);
});

test("AC9 approving with DATA_ENTRY lets the user sign in with that role and their zone", async () => {
  const zoneId = await insertZone(pool, "PUNE", "Pune");
  await signUp(signUpBody(zoneId));
  const cookie = await superAdminCookie();
  const userId = await pendingUserId("new.person@test.com");

  for (const body of [{ decision: "APPROVE" }, { decision: "APPROVE", role: "ADMIN" }, { decision: "MAYBE" }]) {
    assert.equal((await send("POST", `/api/admin/users/${userId}/decision`, body, cookie)).status, 400, JSON.stringify(body));
  }

  const approved = await send("POST", `/api/admin/users/${userId}/decision`, { decision: "APPROVE", role: "DATA_ENTRY" }, cookie);
  assert.equal(approved.status, 200);
  assert.deepEqual(approved.body, { userId, approvalStatus: "APPROVED", role: "DATA_ENTRY" });

  const signedIn = await login("new.person@test.com", "Secret@123");
  assert.equal(signedIn.status, 200);
  assert.equal(signedIn.body["role"], "DATA_ENTRY");
  assert.equal(signedIn.body["zoneId"], zoneId);

  const { rows } = await pool.query(`SELECT approval_decided_by IS NOT NULL AS by, approval_decided_at IS NOT NULL AS at FROM "user" WHERE id = $1`, [userId]);
  assert.deepEqual(rows, [{ by: true, at: true }]);
});

test("AC10 a decided user cannot be decided again, and an unknown id is 404", async () => {
  const zoneId = await insertZone(pool, "PUNE", "Pune");
  await signUp(signUpBody(zoneId));
  const cookie = await superAdminCookie();
  const userId = await pendingUserId("new.person@test.com");

  const rejected = await send("POST", `/api/admin/users/${userId}/decision`, { decision: "REJECT" }, cookie);
  assert.equal(rejected.status, 200);
  assert.equal(rejected.body["approvalStatus"], "REJECTED");

  const again = await send("POST", `/api/admin/users/${userId}/decision`, { decision: "APPROVE", role: "VIEWER" }, cookie);
  assert.equal(again.status, 409);
  assert.equal(again.body["error"], "This request has already been decided");

  const unknown = await send("POST", "/api/admin/users/00000000-0000-4000-8000-000000000000/decision", { decision: "REJECT" }, cookie);
  assert.equal(unknown.status, 404);
});
