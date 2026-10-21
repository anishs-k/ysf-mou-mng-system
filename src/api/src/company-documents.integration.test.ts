/**
 * Purpose: Integration tests for the SPEC-23 §3 company-document endpoints -
 * upload, list and download of GST / Registration certificates - driven over
 * HTTP against the real app, since the role guard, the zone scope, the magic-byte
 * check and the file on disk all have to agree.
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
  insertUserWithPassword,
  insertZone,
  resetDatabase,
} from "./db/test-harness.ts";

let pool: Pool;
let server: Server | undefined;
let baseUrl: string;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
const DOCX = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

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

async function setupCompany(role: "ADMIN" | "DATA_ENTRY" | "VIEWER" = "DATA_ENTRY") {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const actor = await insertUserWithPassword(pool, { username: "actor", password: "pass", role });
  return { zoneId, companyId, cookie: await login(actor.username, actor.password) };
}

function upload(companyId: string, cookie: string, bytes: Buffer, filename: string, documentType: string): Promise<Response> {
  const form = new FormData();
  form.append("documentType", documentType);
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "application/octet-stream" }), filename);
  return fetch(`${baseUrl}/api/companies/${companyId}/documents`, { method: "POST", headers: { Cookie: cookie }, body: form });
}

interface ListedDocument {
  readonly id: string;
  readonly documentType: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSizeBytes: number;
  readonly uploadedAt: string;
  readonly uploadedByUsername: string;
}

test("SPEC-23 AC7 a GST certificate PNG uploads and is listed with its type, size and date", async () => {
  const { companyId, cookie } = await setupCompany();

  const response = await upload(companyId, cookie, PNG, "gst.png", "GST_CERTIFICATE");
  assert.equal(response.status, 201);

  const list = await fetch(`${baseUrl}/api/companies/${companyId}/documents`, { headers: { Cookie: cookie } });
  assert.equal(list.status, 200);
  const rows = (await list.json()) as ListedDocument[];
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.documentType, "GST_CERTIFICATE");
  assert.equal(rows[0]?.originalFilename, "gst.png");
  assert.equal(rows[0]?.mimeType, "image/png");
  assert.equal(rows[0]?.fileSizeBytes, PNG.length);
  assert.equal(rows[0]?.uploadedByUsername, "actor");
  assert.ok(!Number.isNaN(Date.parse(rows[0]?.uploadedAt ?? "")));
});

test("SPEC-23 every upload adds a row; the list is newest first", async () => {
  const { companyId, cookie } = await setupCompany();
  assert.equal((await upload(companyId, cookie, PNG, "old.png", "GST_CERTIFICATE")).status, 201);
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal((await upload(companyId, cookie, PNG, "new.png", "GST_CERTIFICATE")).status, 201);

  const list = await fetch(`${baseUrl}/api/companies/${companyId}/documents`, { headers: { Cookie: cookie } });
  const rows = (await list.json()) as ListedDocument[];
  assert.deepEqual(rows.map((row) => row.originalFilename), ["new.png", "old.png"]);
});

test("SPEC-23 a downloaded document comes back with its stored bytes and type", async () => {
  const { companyId, cookie } = await setupCompany();
  const created = (await (await upload(companyId, cookie, PNG, "reg.png", "REGISTRATION_CERTIFICATE")).json()) as { id: string };

  const response = await fetch(`${baseUrl}/api/company-documents/${created.id}`, { headers: { Cookie: cookie } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
});

test("SPEC-23 AC7 a .docx renamed to .pdf is refused with 422 and nothing is listed", async () => {
  const { companyId, cookie } = await setupCompany();
  const response = await upload(companyId, cookie, DOCX, "gst.pdf", "GST_CERTIFICATE");
  assert.equal(response.status, 422);

  const list = await fetch(`${baseUrl}/api/companies/${companyId}/documents`, { headers: { Cookie: cookie } });
  assert.deepEqual(await list.json(), []);
});

test("SPEC-23 an unknown document type is refused with 422", async () => {
  const { companyId, cookie } = await setupCompany();
  const response = await upload(companyId, cookie, PNG, "pan.png", "PAN_CARD");
  assert.equal(response.status, 422);
});

test("SPEC-23 AC7 a VIEWER may list but not upload", async () => {
  const { companyId, cookie } = await setupCompany("VIEWER");
  assert.equal((await upload(companyId, cookie, PNG, "gst.png", "GST_CERTIFICATE")).status, 403);
  const list = await fetch(`${baseUrl}/api/companies/${companyId}/documents`, { headers: { Cookie: cookie } });
  assert.equal(list.status, 200);
});

test("SPEC-23 AC7 a company outside the user's zones answers 404 to upload and download", async () => {
  const { companyId, cookie } = await setupCompany("ADMIN");
  const created = (await (await upload(companyId, cookie, PNG, "gst.png", "GST_CERTIFICATE")).json()) as { id: string };

  const otherZone = await insertZone(pool, "OTZ", "Other Zone");
  const zonal = await insertUserWithPassword(pool, { username: "zonal", password: "pass", role: "ADMIN", zoneIds: [otherZone] });
  const zonalCookie = await login(zonal.username, zonal.password);

  assert.equal((await upload(companyId, zonalCookie, PNG, "gst.png", "GST_CERTIFICATE")).status, 404);
  const download = await fetch(`${baseUrl}/api/company-documents/${created.id}`, { headers: { Cookie: zonalCookie } });
  assert.equal(download.status, 404);
});

test("SPEC-23 an unknown company answers 404 to upload", async () => {
  const { cookie } = await setupCompany();
  const response = await upload("00000000-0000-4000-8000-000000000000", cookie, PNG, "gst.png", "GST_CERTIFICATE");
  assert.equal(response.status, 404);
});
