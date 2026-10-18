/**
 * Purpose: Integration tests for SPEC-02 section 2 - acceptance criteria AC2, AC3,
 * AC5 and the server half of AC7. The real Express application is driven over HTTP
 * with real cookies, so the session cookie, the sliding expiry, the lockout and the
 * generic failure message are all exercised against PostgreSQL rather than mocked.
 * The role check is verified on a throwaway app mounting the real middleware,
 * because the endpoints the matrix protects (Add New Company, Upload MOU, Edit
 * Agreement) do not exist until SPEC-03, SPEC-09 and SPEC-10.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { Server } from "node:http";

import cookieParser from "cookie-parser";
import express from "express";
import type { Pool } from "pg";

import { SESSION_COOKIE_NAME, requireRole, requireSession } from "./auth/middleware.ts";
import { createTestPool, insertUserWithPassword, resetDatabase } from "./db/test-harness.ts";
import { createApp } from "./index.ts";

const GENERIC_MESSAGE = "Invalid username or password.";

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

async function login(username: string, password: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

/** The request cookie pair the browser would send back, taken from Set-Cookie. */
function sessionCookie(response: Response): string {
  const header = response.headers.getSetCookie().find((value) => value.startsWith(`${SESSION_COOKIE_NAME}=`));
  if (header === undefined) {
    throw new Error("The response did not set a session cookie");
  }
  const pair = header.split(";")[0];
  if (pair === undefined) {
    throw new Error("Malformed Set-Cookie header");
  }
  return pair;
}

async function me(cookie?: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/me`, cookie === undefined ? {} : { headers: { cookie } });
}

test("login with valid credentials returns the user and a session cookie", async () => {
  const user = await insertUserWithPassword(pool);

  const response = await login(user.username, user.password);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    userId: user.id,
    username: user.username,
    role: "ADMIN",
    zoneId: null,
  });
  const header = response.headers.getSetCookie().join("; ");
  assert.match(header, new RegExp(`^${SESSION_COOKIE_NAME}=`));
  assert.match(header, /HttpOnly/i);
});

test("AC5 /api/auth/me returns the logged-in user's role", async () => {
  const user = await insertUserWithPassword(pool, { username: "viewer", role: "VIEWER" });
  const cookie = sessionCookie(await login(user.username, user.password));

  const response = await me(cookie);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    userId: user.id,
    username: "viewer",
    role: "VIEWER",
    zoneId: null,
  });
});

test("the email address works as the username", async () => {
  const user = await insertUserWithPassword(pool, { username: "hrlead" });

  const response = await login("hrlead@example.com", user.password);

  assert.equal(response.status, 200);
});

test("the username is matched case-insensitively", async () => {
  const user = await insertUserWithPassword(pool, { username: "hrlead" });

  assert.equal((await login("HRLead", user.password)).status, 200);
});

test("a wrong password is rejected with the generic message", async () => {
  const user = await insertUserWithPassword(pool);

  const response = await login(user.username, "not-the-password");

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: GENERIC_MESSAGE });
});

test("an unknown username is rejected with the very same message", async () => {
  await insertUserWithPassword(pool);

  const unknown = await login("nobody", "whatever");
  const wrongPassword = await login("admin", "whatever");

  assert.equal(unknown.status, 401);
  assert.deepEqual(await unknown.json(), await wrongPassword.json());
});

test("AC2 an inactive user cannot log in", async () => {
  const user = await insertUserWithPassword(pool, { isActive: false });

  const response = await login(user.username, user.password);

  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: GENERIC_MESSAGE });
});

test("AC3 a sixth attempt is rejected even with the correct password", async () => {
  const user = await insertUserWithPassword(pool);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await login(user.username, "wrong")).status, 401, `attempt ${attempt + 1}`);
  }

  const locked = await login(user.username, user.password);

  assert.equal(locked.status, 429);
  const body = (await locked.json()) as { error: string; retryAfterSeconds: number };
  assert.equal(body.error, GENERIC_MESSAGE);
  assert.ok(body.retryAfterSeconds > 0 && body.retryAfterSeconds <= 15 * 60);
});

test("the lockout is per username, not global", async () => {
  const locked = await insertUserWithPassword(pool, { username: "locked" });
  const other = await insertUserWithPassword(pool, { username: "other" });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await login(locked.username, "wrong");
  }

  assert.equal((await login(locked.username, locked.password)).status, 429);
  assert.equal((await login(other.username, other.password)).status, 200);
});

test("a successful login resets the failure counter", async () => {
  const user = await insertUserWithPassword(pool);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal((await login(user.username, "wrong")).status, 401);
  }
  assert.equal((await login(user.username, user.password)).status, 200);

  for (let attempt = 0; attempt < 4; attempt += 1) {
    assert.equal((await login(user.username, "wrong")).status, 401, "the counter must have restarted");
  }
});

test("once the lockout window has passed, one more failure does not re-lock", async () => {
  const user = await insertUserWithPassword(pool);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await login(user.username, "wrong");
  }
  assert.equal((await login(user.username, "wrong")).status, 429);

  await pool.query(
    `UPDATE login_attempt SET locked_until = now() - interval '1 minute' WHERE username = $1`,
    [user.username],
  );

  assert.equal((await login(user.username, "wrong")).status, 401);
  assert.equal((await login(user.username, user.password)).status, 200);
});

test("/api/auth/me without a session is 401", async () => {
  const response = await me();
  assert.equal(response.status, 401);
});

test("an unknown or malformed session cookie is 401 rather than an error", async () => {
  assert.equal((await me(`${SESSION_COOKIE_NAME}=not-a-uuid`)).status, 401);
  assert.equal((await me(`${SESSION_COOKIE_NAME}=00000000-0000-4000-8000-000000000000`)).status, 401);
});

test("an expired session is rejected", async () => {
  const user = await insertUserWithPassword(pool);
  const cookie = sessionCookie(await login(user.username, user.password));

  await pool.query(`UPDATE session SET expires_at = now() - interval '1 minute'`);

  assert.equal((await me(cookie)).status, 401);
});

test("a session belonging to a user deactivated mid-session is rejected", async () => {
  const user = await insertUserWithPassword(pool);
  const cookie = sessionCookie(await login(user.username, user.password));

  await pool.query(`UPDATE "user" SET is_active = false WHERE id = $1`, [user.id]);

  assert.equal((await me(cookie)).status, 401);
});

test("logout invalidates the session on the server, not just in the browser", async () => {
  const user = await insertUserWithPassword(pool);
  const cookie = sessionCookie(await login(user.username, user.password));
  assert.equal((await me(cookie)).status, 200);

  const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { cookie } });
  assert.equal(logout.status, 204);

  // The same cookie must no longer authenticate - a replayed cookie is worthless.
  assert.equal((await me(cookie)).status, 401);
  const { rows } = await pool.query<{ count: string }>(`SELECT count(*)::text AS count FROM session`);
  assert.equal(rows[0]?.count, "0");
});

test("AC7 requireRole refuses a role the visibility matrix does not allow", async () => {
  const viewer = await insertUserWithPassword(pool, { username: "viewer", role: "VIEWER" });
  const admin = await insertUserWithPassword(pool, { username: "boss", role: "ADMIN" });

  // A stand-in for the endpoints SPEC-03, SPEC-09 and SPEC-10 will add, so the real
  // middleware is exercised over HTTP today rather than assumed to work later.
  const guarded = express();
  guarded.use(cookieParser());
  guarded.post("/guarded", requireSession(pool), requireRole("ADMIN"), (_request, response) => {
    response.json({ ok: true });
  });

  const guardedServer = guarded.listen(0);
  await once(guardedServer, "listening");
  const address = guardedServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("Expected the guarded server to listen on a TCP port");
  }
  const guardedUrl = `http://127.0.0.1:${address.port}/guarded`;

  try {
    assert.equal((await fetch(guardedUrl, { method: "POST" })).status, 401);

    const viewerCookie = sessionCookie(await login(viewer.username, viewer.password));
    assert.equal((await fetch(guardedUrl, { method: "POST", headers: { cookie: viewerCookie } })).status, 403);

    const adminCookie = sessionCookie(await login(admin.username, admin.password));
    assert.equal((await fetch(guardedUrl, { method: "POST", headers: { cookie: adminCookie } })).status, 200);
  } finally {
    await new Promise<void>((resolve) => {
      guardedServer.close(() => resolve());
    });
  }
});
