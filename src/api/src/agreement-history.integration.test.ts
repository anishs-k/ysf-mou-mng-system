/**
 * Purpose: Integration tests for SPEC-11 - the version list, one version's
 * snapshot, compare (including against "current"), and the proof download.
 * Real history rows are produced by driving SPEC-10's own edit-request/apply
 * endpoints rather than inserting `agreement_history` rows by hand, so these
 * tests exercise the exact shape SPEC-10 actually writes.
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
  insertPayrollConfig,
  insertPlant,
  insertTraineeCategory,
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

async function setupMou(): Promise<{ mouId: string; adminCookie: string }> {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);
  const configId = await insertPayrollConfig(pool, mouId);
  await insertTraineeCategory(pool, configId, "Category A");
  const admin = await insertUserWithPassword(pool, { username: "admin1", password: "pass", role: "ADMIN" });
  const adminCookie = await login(admin.username, admin.password);
  return { mouId, adminCookie };
}

interface EditablePayload {
  readonly token: string;
  readonly version: number;
  readonly commercial: Record<string, unknown>;
  readonly payroll: Record<string, unknown>;
}

async function editTenure(
  mouId: string,
  cookie: string,
  reason: string,
  newTenureValue: string,
  proof?: { name: string; mimeType: string; buffer: Buffer },
): Promise<number> {
  const form = new FormData();
  form.append("reason", reason);
  if (proof !== undefined) {
    form.append("proof", new Blob([new Uint8Array(proof.buffer)], { type: proof.mimeType }), proof.name);
  }
  const editResponse = await fetch(`${baseUrl}/api/mous/${mouId}/edit-request`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
  const { token, version, commercial, payroll } = (await editResponse.json()) as EditablePayload;

  const applyResponse = await fetch(`${baseUrl}/api/mous/${mouId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      token,
      version,
      commercial: { ...commercial, tenureValue: newTenureValue },
      payroll,
    }),
  });
  assert.equal(applyResponse.status, 200);
  const { version: newVersion } = (await applyResponse.json()) as { version: number };
  return newVersion;
}

test("AC1/AC2 an MOU edited three times shows three history rows, newest first, with reason and editor", async () => {
  const { mouId, adminCookie } = await setupMou();
  await editTenure(mouId, adminCookie, "ADDENDUM_IN_AGREEMENT", "24");
  await editTenure(mouId, adminCookie, "ADDENDUM_IN_AGREEMENT", "36");
  await editTenure(mouId, adminCookie, "CHANGE_IN_STATUTORY_COMPLIANCE", "48");

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/history`, { headers: { Cookie: adminCookie } });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    currentVersion: number;
    rows: Array<{ version: number; editReason: string; editReasonLabel: string; editedByUsername: string; hasProof: boolean }>;
  };
  assert.equal(body.currentVersion, 4);
  assert.equal(body.rows.length, 3);
  assert.deepEqual(
    body.rows.map((r) => r.version),
    [3, 2, 1],
  );
  assert.equal(body.rows[0]?.editReasonLabel, "Change in Statutory Compliance");
  assert.equal(body.rows[0]?.editedByUsername, "admin1");
});

test("AC3 a Communication from HR row offers a working proof download; other reasons show none", async () => {
  const { mouId, adminCookie } = await setupMou();
  await editTenure(mouId, adminCookie, "COMMUNICATION_FROM_HR", "24", {
    name: "proof.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%proof\n"),
  });
  await editTenure(mouId, adminCookie, "ADDENDUM_IN_AGREEMENT", "36");

  const listResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history`, { headers: { Cookie: adminCookie } });
  const body = (await listResponse.json()) as { rows: Array<{ historyId: string; hasProof: boolean; editReason: string }> };
  const hrRow = body.rows.find((r) => r.editReason === "COMMUNICATION_FROM_HR");
  const addendumRow = body.rows.find((r) => r.editReason === "ADDENDUM_IN_AGREEMENT");
  assert.equal(hrRow?.hasProof, true);
  assert.equal(addendumRow?.hasProof, false);

  const proofResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history/${hrRow?.historyId}/proof`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(proofResponse.status, 200);
  assert.equal(proofResponse.headers.get("content-type"), "application/pdf");

  const noProofResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history/${addendumRow?.historyId}/proof`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(noProofResponse.status, 404);
});

test("AC4 opening a version renders the values as they were at that version", async () => {
  const { mouId, adminCookie } = await setupMou();
  await editTenure(mouId, adminCookie, "ADDENDUM_IN_AGREEMENT", "24");

  const listResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history`, { headers: { Cookie: adminCookie } });
  const { rows } = (await listResponse.json()) as { rows: Array<{ historyId: string }> };
  const historyId = rows[0]?.historyId;

  const detailResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history/${historyId}`, { headers: { Cookie: adminCookie } });
  assert.equal(detailResponse.status, 200);
  const detail = (await detailResponse.json()) as { commercial: { tenureValue: string } };
  assert.equal(detail.commercial.tenureValue, "12");
});

test("AC5 a snapshot missing a field renders blank instead of erroring", async () => {
  const { mouId, adminCookie } = await setupMou();
  await editTenure(mouId, adminCookie, "ADDENDUM_IN_AGREEMENT", "24");

  await pool.query(`UPDATE agreement_history SET snapshot = $1 WHERE mou_id = $2`, [
    JSON.stringify({ commercial: {}, payroll: {} }),
    mouId,
  ]);

  const listResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history`, { headers: { Cookie: adminCookie } });
  const { rows } = (await listResponse.json()) as { rows: Array<{ historyId: string }> };
  const historyId = rows[0]?.historyId;

  const detailResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history/${historyId}`, { headers: { Cookie: adminCookie } });
  assert.equal(detailResponse.status, 200);
  const detail = (await detailResponse.json()) as { commercial: { mouStartDate: string } };
  assert.equal(detail.commercial.mouStartDate, "");
});

test("AC6 comparing version 1 with version 2 lists only the tenure as changed", async () => {
  const { mouId, adminCookie } = await setupMou();
  await editTenure(mouId, adminCookie, "ADDENDUM_IN_AGREEMENT", "24");
  await editTenure(mouId, adminCookie, "ADDENDUM_IN_AGREEMENT", "36");

  const listResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history`, { headers: { Cookie: adminCookie } });
  const { rows } = (await listResponse.json()) as { rows: Array<{ version: number; historyId: string }> };
  const v1 = rows.find((r) => r.version === 1)?.historyId;
  const v2 = rows.find((r) => r.version === 2)?.historyId;

  const compareResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history/compare?from=${v1}&to=${v2}`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(compareResponse.status, 200);
  const body = (await compareResponse.json()) as { rows: Array<{ field: string; changed: boolean }> };
  const changed = body.rows.filter((r) => r.changed);
  assert.equal(changed.length, 1);
  assert.equal(changed[0]?.field, "Tenure");
});

test("AC7 comparing the latest history row with Current reflects the most recent edit", async () => {
  const { mouId, adminCookie } = await setupMou();
  await editTenure(mouId, adminCookie, "ADDENDUM_IN_AGREEMENT", "24");

  const listResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history`, { headers: { Cookie: adminCookie } });
  const { rows } = (await listResponse.json()) as { rows: Array<{ historyId: string }> };
  const v1 = rows[0]?.historyId;

  const compareResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history/compare?from=${v1}&to=current`, {
    headers: { Cookie: adminCookie },
  });
  assert.equal(compareResponse.status, 200);
  const body = (await compareResponse.json()) as { toLabel: string; rows: Array<{ field: string; oldValue: string; newValue: string; changed: boolean }> };
  assert.equal(body.toLabel, "Current");
  const tenureRow = body.rows.find((r) => r.field === "Tenure");
  assert.equal(tenureRow?.changed, true);
  assert.equal(tenureRow?.oldValue, "12 MONTHS");
  assert.equal(tenureRow?.newValue, "24 MONTHS");
});

test("AC8 an MOU with no edits shows an empty history list", async () => {
  const { mouId, adminCookie } = await setupMou();
  const response = await fetch(`${baseUrl}/api/mous/${mouId}/history`, { headers: { Cookie: adminCookie } });
  const body = (await response.json()) as { currentVersion: number; rows: unknown[] };
  assert.equal(body.currentVersion, 1);
  assert.equal(body.rows.length, 0);
});

test("AC9 no endpoint in this router can write - only GET routes exist", async () => {
  const { mouId, adminCookie } = await setupMou();
  const response = await fetch(`${baseUrl}/api/mous/${mouId}/history`, {
    method: "DELETE",
    headers: { Cookie: adminCookie },
  });
  assert.equal(response.status, 404);
});

test("AC10 requesting a proof file without a session returns 401", async () => {
  const { mouId, adminCookie } = await setupMou();
  await editTenure(mouId, adminCookie, "COMMUNICATION_FROM_HR", "24", {
    name: "proof.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%proof\n"),
  });
  const listResponse = await fetch(`${baseUrl}/api/mous/${mouId}/history`, { headers: { Cookie: adminCookie } });
  const { rows } = (await listResponse.json()) as { rows: Array<{ historyId: string }> };

  const response = await fetch(`${baseUrl}/api/mous/${mouId}/history/${rows[0]?.historyId}/proof`);
  assert.equal(response.status, 401);
});
