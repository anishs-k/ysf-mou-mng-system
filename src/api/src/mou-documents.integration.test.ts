/**
 * Purpose: Integration tests for SPEC-09 - list/upload/download for a
 * standalone MOU document, covering AC5-AC10 (the cascading-selector rules
 * AC1-AC4 are pure client behaviour, covered by the Playwright UI suite).
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import type { Server } from "node:http";

import type { Pool } from "pg";

import { fetchMouCommercialDetail } from "./db/mou-view.ts";
import { createDatabase } from "./db/client.ts";
import { createApp } from "./index.ts";
import { mouDocumentAbsolutePath } from "./upload/mou-document-storage.ts";
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

const TINY_PDF = Buffer.from("%PDF-1.4\n%tiny test file\n");

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

async function setupMou(role: "ADMIN" | "DATA_ENTRY" | "VIEWER" = "ADMIN") {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, {
    username: "creator",
    password: "pass",
  });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);
  const actor = await insertUserWithPassword(pool, {
    username: "actor",
    password: "pass",
    role,
  });
  const cookie = await login(actor.username, actor.password);
  return { companyId, plantId, mouId, cookie };
}

function pdfFormData(
  bytes: Buffer,
  filename: string,
  mimeType: string,
): FormData {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(bytes)], { type: mimeType }),
    filename,
  );
  return form;
}

test("AC7 a successful upload adds a row and leaves a previously attached document in place", async () => {
  const { mouId, cookie } = await setupMou();

  const first = await fetch(`${baseUrl}/api/mous/${mouId}/document`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: pdfFormData(TINY_PDF, "first.pdf", "application/pdf"),
  });
  assert.equal(first.status, 201);

  const second = await fetch(`${baseUrl}/api/mous/${mouId}/document`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: pdfFormData(TINY_PDF, "second.pdf", "application/pdf"),
  });
  assert.equal(second.status, 201);

  const listResponse = await fetch(`${baseUrl}/api/mous/${mouId}/documents`, {
    headers: { Cookie: cookie },
  });
  const list = (await listResponse.json()) as Array<{
    originalFilename: string;
  }>;
  assert.equal(list.length, 2);
  assert.ok(list.some((d) => d.originalFilename === "first.pdf"));
  assert.ok(list.some((d) => d.originalFilename === "second.pdf"));
});

test("AC8 after a second upload, the commercial view shows the newer document as current", async () => {
  const { mouId, cookie } = await setupMou();
  const db = createDatabase(pool);

  await fetch(`${baseUrl}/api/mous/${mouId}/document`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: pdfFormData(TINY_PDF, "older.pdf", "application/pdf"),
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await fetch(`${baseUrl}/api/mous/${mouId}/document`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: pdfFormData(TINY_PDF, "newer.pdf", "application/pdf"),
  });

  const detail = await fetchMouCommercialDetail(db, pool, mouId);
  assert.equal(detail?.document?.originalFilename, "newer.pdf");
});

test("AC5 a .docx renamed to .pdf is rejected", async () => {
  const { mouId, cookie } = await setupMou();
  const notAPdf = Buffer.from("this is not a pdf");

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/document`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: pdfFormData(notAPdf, "renamed.pdf", "application/pdf"),
  });
  assert.equal(response.status, 422);

  const listResponse = await fetch(`${baseUrl}/api/mous/${mouId}/documents`, {
    headers: { Cookie: cookie },
  });
  assert.equal(((await listResponse.json()) as unknown[]).length, 0);
});

test("AC6 an 11 MB file is rejected", async () => {
  const { mouId, cookie } = await setupMou();
  const oversized = Buffer.concat([
    Buffer.from("%PDF-1.4\n"),
    Buffer.alloc(11 * 1024 * 1024, 0),
  ]);

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/document`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: pdfFormData(oversized, "big.pdf", "application/pdf"),
  });
  assert.equal(response.status, 422);
});

test("AC9 requesting a document URL without a session returns 401", async () => {
  const { mouId, cookie } = await setupMou();
  const uploadResponse = await fetch(`${baseUrl}/api/mous/${mouId}/document`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: pdfFormData(TINY_PDF, "doc.pdf", "application/pdf"),
  });
  const { id } = (await uploadResponse.json()) as { id: string };

  const response = await fetch(`${baseUrl}/api/documents/${id}`);
  assert.equal(response.status, 401);
});

test("AC10 a VIEWER attempting an upload receives 403 but can still download", async () => {
  const { mouId, cookie } = await setupMou("ADMIN");
  const uploadResponse = await fetch(`${baseUrl}/api/mous/${mouId}/document`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: pdfFormData(TINY_PDF, "doc.pdf", "application/pdf"),
  });
  const { id } = (await uploadResponse.json()) as { id: string };

  const viewer = await insertUserWithPassword(pool, {
    username: "viewer1",
    password: "pass",
    role: "VIEWER",
  });
  const viewerCookie = await login(viewer.username, viewer.password);

  const viewerUpload = await fetch(`${baseUrl}/api/mous/${mouId}/document`, {
    method: "POST",
    headers: { Cookie: viewerCookie },
    body: pdfFormData(TINY_PDF, "second.pdf", "application/pdf"),
  });
  assert.equal(viewerUpload.status, 403);

  const download = await fetch(`${baseUrl}/api/documents/${id}`, {
    headers: { Cookie: viewerCookie },
  });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("content-type"), "application/pdf");
});

test("a document whose file has been deleted from disk answers 404, not a crash", async () => {
  const { mouId, cookie } = await setupMou();
  const uploadResponse = await fetch(`${baseUrl}/api/mous/${mouId}/document`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: pdfFormData(TINY_PDF, "doc.pdf", "application/pdf"),
  });
  const { id } = (await uploadResponse.json()) as { id: string };

  // The row still exists; only the bytes behind it are gone. This is the
  // ENOENT path - the one case that must stay a 404.
  const { rows } = await pool.query<{ file_path: string }>(
    `SELECT file_path FROM mou_document WHERE id = $1`,
    [id],
  );
  const filePath = rows[0]?.file_path;
  assert.ok(filePath !== undefined);
  await fs.rm(mouDocumentAbsolutePath(filePath), { force: true });

  const response = await fetch(`${baseUrl}/api/documents/${id}`, {
    headers: { Cookie: cookie },
  });
  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: string };
  assert.equal(body.error, "Document file missing");
});
