/**
 * Purpose: Integration tests for SPEC-33's Roles & Permissions API against a real
 * database: only a super admin may read or save the matrix, a save is normalised
 * and audited, ADMIN and "users.manage" can never be changed, and a saved change
 * applies to an already signed-in user on their next request.
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
  if (server === undefined) return;
  const closing = server;
  await new Promise<void>((resolve, reject) => {
    closing.close((error) => (error ? reject(error) : resolve()));
  });
  await pool.end();
});

interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

async function send(method: string, path: string, cookie: string, body?: unknown): Promise<Reply> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text === "" ? {} : (JSON.parse(text) as Record<string, unknown>) };
}

async function cookieAs(username: string, options: Parameters<typeof insertUserWithPassword>[1] = {}): Promise<string> {
  const user = await insertUserWithPassword(pool, { username, password: "pass", ...options });
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: user.username, password: "pass" }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie") ?? "";
}

type Matrix = { locked: { role: string; permissions: string[] }; roles: { role: string; permissions: string[] }[] };

function grantsOf(body: Record<string, unknown>, role: string): string[] {
  return (body as unknown as Matrix).roles.find((row) => row.role === role)?.permissions ?? [];
}

test("SPEC-33 a super admin reads the seeded matrix, with ADMIN locked to everything", async () => {
  const admin = await cookieAs("hq.admin");
  const reply = await send("GET", "/api/admin/permissions", admin);
  assert.equal(reply.status, 200);
  const body = reply.body as unknown as Matrix;
  assert.equal(body.locked.role, "ADMIN");
  assert.ok(body.locked.permissions.includes("users.manage"));
  assert.deepEqual(body.roles.map((row) => row.role), ["DATA_ENTRY", "HR", "FINANCE", "VIEWER"]);
  assert.deepEqual(grantsOf(reply.body, "VIEWER"), ["company.view", "commercial.view", "payroll.view", "documents.view"]);
});

test("SPEC-33 only a super admin may read or save the matrix", async () => {
  const zone = await insertZone(pool, "PUNE", "Pune");
  const zonalAdmin = await cookieAs("zonal.admin", { zoneIds: [zone] });
  const hr = await cookieAs("hr.user", { role: "HR" });
  for (const cookie of [zonalAdmin, hr]) {
    assert.equal((await send("GET", "/api/admin/permissions", cookie)).status, 403);
    assert.equal((await send("PUT", "/api/admin/permissions", cookie, { roles: [{ role: "VIEWER", permissions: [] }] })).status, 403);
  }
});

test("SPEC-33 a save adds the implied view, never grants users.manage, and writes an audit row", async () => {
  const admin = await cookieAs("hq.admin");
  const reply = await send("PUT", "/api/admin/permissions", admin, {
    roles: [{ role: "VIEWER", permissions: ["company.view", "contacts.export", "users.manage", "export.data"] }],
  });
  assert.equal(reply.status, 200);
  assert.deepEqual(grantsOf(reply.body, "VIEWER"), ["company.view", "contacts.view", "export.data", "contacts.export"]);

  const { rows } = await pool.query<{ role: string; added: string[]; removed: string[] }>(
    `SELECT role, added, removed FROM role_permission_audit`,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.role, "VIEWER");
  assert.deepEqual(rows[0]?.added, ["contacts.view", "export.data", "contacts.export"]);
  assert.deepEqual(rows[0]?.removed, ["commercial.view", "payroll.view", "documents.view"]);
});

test("SPEC-33 ADMIN, unknown roles and malformed bodies are refused with 400", async () => {
  const admin = await cookieAs("hq.admin");
  for (const body of [
    { roles: [{ role: "ADMIN", permissions: [] }] },
    { roles: [{ role: "MANAGER", permissions: [] }] },
    { roles: [{ role: "HR", permissions: "export.data" }] },
    { roles: [] },
    {},
  ]) {
    assert.equal((await send("PUT", "/api/admin/permissions", admin, body)).status, 400, JSON.stringify(body));
  }
});

test("SPEC-33 a saved change applies to a signed-in user on their next request", async () => {
  const admin = await cookieAs("hq.admin");
  const viewer = await cookieAs("viewer", { role: "VIEWER" });
  assert.equal((await send("GET", "/api/export/excel", viewer)).status, 403);

  const viewerGrants = ["company.view", "commercial.view", "payroll.view", "documents.view", "export.data"];
  assert.equal((await send("PUT", "/api/admin/permissions", admin, { roles: [{ role: "VIEWER", permissions: viewerGrants }] })).status, 200);

  assert.equal((await send("GET", "/api/export/excel", viewer)).status, 202);
  const me = await send("GET", "/api/auth/me", viewer);
  assert.ok((me.body["permissions"] as string[]).includes("export.data"));
});
