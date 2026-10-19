/**
 * Purpose: Integration tests for SPEC-21 - admin provisioning. They prove that
 * self sign-up is gone, that a super admin can create, edit and soft-delete users
 * with several zones, that passwords are stored only as scrypt hashes, and that
 * the section 5.6 safeguards keep at least one super admin. Each test starts from
 * an empty database (resetDatabase) and talks to the real app over HTTP.
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

const login = (username: string, password: string) => send("POST", "/api/auth/login", { username, password });

async function cookieFor(username: string, password: string): Promise<string> {
  const reply = await login(username, password);
  assert.equal(reply.status, 200, JSON.stringify(reply.body));
  return reply.cookie ?? "";
}

interface Fixture {
  readonly admin: string;
  readonly adminId: string;
  readonly pune: string;
  readonly mumbai: string;
}

async function setup(): Promise<Fixture> {
  const pune = await insertZone(pool, "PUNE", "Pune");
  const mumbai = await insertZone(pool, "MUMBAI", "Mumbai");
  const admin = await insertUserWithPassword(pool, { username: "hq.admin", password: "Admin@123" });
  return { admin: await cookieFor(admin.username, admin.password), adminId: admin.id, pune, mumbai };
}

function newUser(zoneIds: string[], overrides: Record<string, unknown> = {}) {
  return {
    username: "pune.west",
    email: "pune@ysf.in",
    fullName: "Pune West Officer",
    password: "Secret@123",
    role: "VIEWER",
    allZones: false,
    zoneIds,
    ...overrides,
  };
}

async function createUser(f: Fixture, overrides: Record<string, unknown> = {}): Promise<string> {
  const reply = await send("POST", "/api/admin/users", newUser([f.pune, f.mumbai], overrides), f.admin);
  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  return String(reply.body["userId"]);
}

test("AC2 the SPEC-20 sign-up and approval routes no longer exist", async () => {
  const f = await setup();
  assert.equal((await send("POST", "/api/auth/signup", { email: "a@b.com", password: "Secret@123" })).status, 404);
  assert.equal((await send("GET", "/api/public/zones")).status, 404);
  assert.equal((await send("GET", "/api/admin/users/pending", undefined, f.admin)).status, 404);
  const anyId = "00000000-0000-4000-8000-000000000000";
  assert.equal((await send("POST", `/api/admin/users/${anyId}/decision`, { decision: "REJECT" }, f.admin)).status, 404);
});

test("AC3 a super admin creates a two-zone user who then signs in with both zones", async () => {
  const f = await setup();
  const reply = await send("POST", "/api/admin/users", newUser([f.pune, f.mumbai], { username: " Pune.West " }), f.admin);

  assert.equal(reply.status, 201, JSON.stringify(reply.body));
  assert.equal(reply.body["username"], "pune.west");
  assert.equal(reply.body["role"], "VIEWER");
  assert.equal(reply.body["allZones"], false);
  assert.deepEqual(reply.body["zones"], [
    { id: f.mumbai, name: "Mumbai" },
    { id: f.pune, name: "Pune" },
  ]);
  assert.equal("password" in reply.body || "passwordHash" in reply.body, false);

  const me = await send("GET", "/api/auth/me", undefined, await cookieFor("pune.west", "Secret@123"));
  assert.equal(me.body["allZones"], false);
  assert.deepEqual((me.body["zoneIds"] as string[]).sort(), [f.pune, f.mumbai].sort());
});

test("AC6 the password is stored as a scrypt hash and never returned", async () => {
  const f = await setup();
  const userId = await createUser(f);
  const { rows } = await pool.query<{ password_hash: string }>(`SELECT password_hash FROM "user" WHERE id = $1`, [userId]);
  assert.match(rows[0]?.password_hash ?? "", /^scrypt\$/);
  assert.ok(!(rows[0]?.password_hash ?? "").includes("Secret@123"));

  const list = await send("GET", "/api/admin/users", undefined, f.admin);
  assert.ok(!JSON.stringify(list.body).includes("scrypt$"));
});

test("AC7 invalid fields, missing zones, unknown or inactive zones and duplicates are refused", async () => {
  const f = await setup();
  const post = (body: unknown) => send("POST", "/api/admin/users", body, f.admin);

  const invalid = await post(newUser([f.pune], { email: "nope", password: "short", role: "SUPER" }));
  assert.equal(invalid.status, 400);
  assert.deepEqual(Object.keys(invalid.body["errors"] as object).sort(), ["email", "password", "role"]);

  const noZone = await post(newUser([]));
  assert.equal(noZone.status, 400);
  assert.ok((noZone.body["errors"] as Record<string, string>)["zoneIds"]);

  const unknown = await post(newUser(["00000000-0000-4000-8000-000000000000"]));
  assert.equal(unknown.status, 400);
  assert.ok((unknown.body["errors"] as Record<string, string>)["zoneIds"]);

  await pool.query(`UPDATE zone SET is_active = false WHERE id = $1`, [f.mumbai]);
  const inactive = await post(newUser([f.mumbai]));
  assert.equal(inactive.status, 400);

  await createUser(f, { zoneIds: [f.pune] });
  const sameUsername = await post(newUser([f.pune], { username: "PUNE.WEST", email: "other@ysf.in" }));
  assert.equal(sameUsername.status, 409);
  assert.ok((sameUsername.body["errors"] as Record<string, string>)["username"]);
  const sameEmail = await post(newUser([f.pune], { username: "other", email: "PUNE@ysf.in" }));
  assert.equal(sameEmail.status, 409);
  assert.ok((sameEmail.body["errors"] as Record<string, string>)["email"]);
});

test("AC8 editing zones replaces the set at once, and a new password ends old sessions", async () => {
  const f = await setup();
  const userId = await createUser(f);
  const userCookie = await cookieFor("pune.west", "Secret@123");

  const narrowed = await send("PATCH", `/api/admin/users/${userId}`, { zoneIds: [f.mumbai] }, f.admin);
  assert.equal(narrowed.status, 200, JSON.stringify(narrowed.body));
  assert.deepEqual(narrowed.body["zones"], [{ id: f.mumbai, name: "Mumbai" }]);
  const zones = await send("GET", "/api/zones", undefined, userCookie);
  assert.deepEqual((zones.body as unknown as Array<{ id: string }>).map((zone) => zone.id), [f.mumbai]);

  const widened = await send("PATCH", `/api/admin/users/${userId}`, { allZones: true }, f.admin);
  assert.equal(widened.status, 200);
  assert.equal(widened.body["allZones"], true);
  assert.deepEqual(widened.body["zones"], []);

  const renamed = await send("PATCH", `/api/admin/users/${userId}`, { username: "pune.east", password: "NewSecret@1" }, f.admin);
  assert.equal(renamed.status, 200);
  assert.equal((await send("GET", "/api/auth/me", undefined, userCookie)).status, 401);
  assert.equal((await login("pune.west", "Secret@123")).status, 401);
  assert.equal((await login("pune.east", "NewSecret@1")).status, 200);
});

test("AC8 an edit cannot leave a zonal user without a zone", async () => {
  const f = await setup();
  const userId = await createUser(f, { allZones: true, zoneIds: [] });

  const reply = await send("PATCH", `/api/admin/users/${userId}`, { allZones: false }, f.admin);
  assert.equal(reply.status, 400);
  assert.ok((reply.body["errors"] as Record<string, string>)["zoneIds"]);
});

test("AC9 a deleted user cannot sign in, disappears from the list and frees their names", async () => {
  const f = await setup();
  const creatorId = await createUser(f, { role: "DATA_ENTRY" });
  const userCookie = await cookieFor("pune.west", "Secret@123");
  await pool.query(`INSERT INTO company_draft (user_id, payload, current_page) VALUES ($1, '{}', 1)`, [creatorId]);

  assert.equal((await send("DELETE", `/api/admin/users/${creatorId}`, undefined, f.admin)).status, 204);
  assert.equal((await send("GET", "/api/auth/me", undefined, userCookie)).status, 401);
  assert.equal((await login("pune.west", "Secret@123")).status, 401);
  const list = (await send("GET", "/api/admin/users", undefined, f.admin)).body as unknown as Array<{ userId: string }>;
  assert.ok(!list.some((row) => row.userId === creatorId));

  const { rows } = await pool.query<{ username: string; is_active: boolean }>(`SELECT username, is_active FROM "user" WHERE id = $1`, [creatorId]);
  assert.equal(rows[0]?.is_active, false);
  assert.equal(rows[0]?.username, `pune.west#deleted-${creatorId.slice(0, 8)}`);

  await createUser(f);
  assert.equal((await send("DELETE", `/api/admin/users/${creatorId}`, undefined, f.admin)).status, 404);
  assert.equal((await send("PATCH", `/api/admin/users/${creatorId}`, { fullName: "X Y" }, f.admin)).status, 404);
});

test("AC10 a super admin cannot delete or demote themselves", async () => {
  const f = await setup();
  const self = `/api/admin/users/${f.adminId}`;
  assert.equal((await send("DELETE", self, undefined, f.admin)).status, 409);
  assert.equal((await send("PATCH", self, { role: "VIEWER" }, f.admin)).status, 409);
  assert.equal((await send("PATCH", self, { allZones: false, zoneIds: [f.pune] }, f.admin)).status, 409);
  assert.equal((await send("PATCH", self, { fullName: "Head Office" }, f.admin)).status, 200);
});

test("AC10 two super admins demoting each other at once leave at least one", async () => {
  const f = await setup();
  const otherId = await createUser(f, { username: "hq.two", email: "two@ysf.in", role: "ADMIN", allZones: true, zoneIds: [] });
  const other = await cookieFor("hq.two", "Secret@123");

  const results = await Promise.all([
    send("PATCH", `/api/admin/users/${otherId}`, { role: "VIEWER" }, f.admin),
    send("PATCH", `/api/admin/users/${f.adminId}`, { role: "VIEWER" }, other),
  ]);
  const { rows } = await pool.query<{ count: number }>(
    `SELECT count(*)::int AS count FROM "user" WHERE role = 'ADMIN' AND all_zones AND is_active`,
  );
  assert.ok(rows[0]!.count >= 1, `statuses ${results.map((r) => r.status).join(",")}`);
});

test("AC11 the user routes need a session and a super admin", async () => {
  const f = await setup();
  const zonalAdmin = await insertUserWithPassword(pool, { username: "zonal.admin", password: "pass", zoneId: f.pune });
  const dataEntry = await insertUserWithPassword(pool, { username: "clerk", password: "pass", role: "DATA_ENTRY" });
  const viewer = await insertUserWithPassword(pool, { username: "viewer", password: "pass", role: "VIEWER" });
  const anyId = "00000000-0000-4000-8000-000000000000";
  const routes: Array<[string, string, unknown]> = [
    ["GET", "/api/admin/users", undefined],
    ["POST", "/api/admin/users", newUser([f.pune])],
    ["PATCH", `/api/admin/users/${anyId}`, { fullName: "X Y" }],
    ["DELETE", `/api/admin/users/${anyId}`, undefined],
  ];

  for (const [method, path, body] of routes) {
    assert.equal((await send(method, path, body)).status, 401, `${method} ${path} without a session`);
    for (const someone of [zonalAdmin, dataEntry, viewer]) {
      const cookie = await cookieFor(someone.username, someone.password);
      assert.equal((await send(method, path, body, cookie)).status, 403, `${method} ${path} as ${someone.username}`);
    }
  }
});
