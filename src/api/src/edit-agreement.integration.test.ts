/**
 * Purpose: Integration tests for SPEC-10 - requesting an edit and applying
 * one. Fixtures use a minimal MOU (payroll_config + one trainee category, no
 * commercial_item/payroll_item rows) since `fetchEditablePayload` already
 * defaults every absent fixed item to "answered No" and every absent charge
 * to blank, which is itself a valid starting state for SPEC-05/06's own
 * validators.
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

async function setupMou(role: "ADMIN" | "DATA_ENTRY" | "VIEWER" = "ADMIN") {
  const zoneId = await insertZone(pool);
  const creator = await insertUserWithPassword(pool, { username: "creator", password: "pass" });
  const companyId = await insertCompany(pool, zoneId, creator.id);
  const plantId = await insertPlant(pool, companyId);
  const mouId = await insertMou(pool, companyId, plantId);
  const configId = await insertPayrollConfig(pool, mouId);
  await insertTraineeCategory(pool, configId, "Category A");
  const actor = await insertUserWithPassword(pool, { username: "actor", password: "pass", role });
  const cookie = await login(actor.username, actor.password);
  return { mouId, cookie };
}

interface EditablePayload {
  readonly commercial: Record<string, unknown>;
  readonly payroll: Record<string, unknown>;
}

async function requestEdit(
  mouId: string,
  cookie: string,
  reason: string,
  proof?: { name: string; mimeType: string; buffer: Buffer },
): Promise<Response> {
  const form = new FormData();
  form.append("reason", reason);
  if (proof !== undefined) {
    form.append("proof", new Blob([new Uint8Array(proof.buffer)], { type: proof.mimeType }), proof.name);
  }
  return fetch(`${baseUrl}/api/mous/${mouId}/edit-request`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
}

async function applyEdit(
  mouId: string,
  cookie: string,
  token: string,
  version: number,
  commercial: Record<string, unknown>,
  payroll: Record<string, unknown>,
): Promise<Response> {
  return fetch(`${baseUrl}/api/mous/${mouId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ token, version, commercial, payroll }),
  });
}

test("AC5 Addendum in Agreement unlocks the form with no upload", async () => {
  const { mouId, cookie } = await setupMou();
  const response = await requestEdit(mouId, cookie, "ADDENDUM_IN_AGREEMENT");
  assert.equal(response.status, 201);
  const body = (await response.json()) as { token: string; version: number } & EditablePayload;
  assert.ok(body.token !== undefined);
  assert.equal(body.version, 1);
});

test("AC2 Communication from HR without a proof file is rejected with 400", async () => {
  const { mouId, cookie } = await setupMou();
  const response = await requestEdit(mouId, cookie, "COMMUNICATION_FROM_HR");
  assert.equal(response.status, 400);
});

test("Communication from HR with a proof file unlocks the form", async () => {
  const { mouId, cookie } = await setupMou();
  const response = await requestEdit(mouId, cookie, "COMMUNICATION_FROM_HR", {
    name: "proof.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%proof\n"),
  });
  assert.equal(response.status, 201);
});

test("AC6 the editable payload never carries company identity or the generated code", async () => {
  const { mouId, cookie } = await setupMou();
  const response = await requestEdit(mouId, cookie, "ADDENDUM_IN_AGREEMENT");
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body["companyName"], undefined);
  assert.equal(body["gstNumber"], undefined);
  assert.equal(body["generatedCode"], undefined);
});

test("AC4 a PUT without a valid edit token is rejected, even from an ADMIN", async () => {
  const { mouId, cookie } = await setupMou();
  const response = await applyEdit(mouId, cookie, "00000000-0000-0000-0000-000000000000", 1, {
    mouStartDate: "2026-01-01",
    tenureValue: "24",
    tenureUnit: "MONTHS",
    attendanceCycle: "Monthly",
    stipendDate: "5",
    charges: {},
    otherItems: [],
  }, { traineeCategories: ["Category A"], items: {}, otherItems: [] });
  assert.equal(response.status, 400);
});

test("AC7/AC8/AC9 applying an edit bumps version by 1, writes one history row with the pre-edit snapshot, and recomputes end_date", async () => {
  const { mouId, cookie } = await setupMou();
  const edit = await requestEdit(mouId, cookie, "ADDENDUM_IN_AGREEMENT");
  const { token, version, commercial, payroll } = (await edit.json()) as { token: string; version: number } & EditablePayload;

  const newCommercial = { ...commercial, tenureValue: "36" };
  const response = await applyEdit(mouId, cookie, token, version, newCommercial, payroll);
  assert.equal(response.status, 200);
  const applied = (await response.json()) as { version: number };
  assert.equal(applied.version, 2);

  const { rows: mouRows } = await pool.query<{ version: number; tenure_value: number; end_date: string; mou_start_date: string }>(
    `SELECT version, tenure_value, end_date, mou_start_date FROM mou WHERE id = $1`,
    [mouId],
  );
  assert.equal(mouRows[0]?.version, 2);
  assert.equal(mouRows[0]?.tenure_value, 36);

  const { rows: historyRows } = await pool.query<{ version: number; snapshot: { commercial: { tenureValue: string } } }>(
    `SELECT version, snapshot FROM agreement_history WHERE mou_id = $1`,
    [mouId],
  );
  assert.equal(historyRows.length, 1);
  assert.equal(historyRows[0]?.version, 1);
  assert.equal(historyRows[0]?.snapshot.commercial.tenureValue, "12");
});

test("AC6 sending a different scheme has no effect", async () => {
  const { mouId, cookie } = await setupMou();
  const edit = await requestEdit(mouId, cookie, "ADDENDUM_IN_AGREEMENT");
  const { token, version, commercial, payroll } = (await edit.json()) as { token: string; version: number } & EditablePayload;

  const response = await applyEdit(mouId, cookie, token, version, { ...commercial, tenureValue: "24" }, {
    ...payroll,
    scheme: "FLEXI",
  });
  assert.equal(response.status, 200);

  const { rows } = await pool.query<{ scheme: string }>(`SELECT scheme FROM mou WHERE id = $1`, [mouId]);
  assert.equal(rows[0]?.scheme, "WILP");
});

test("AC10 emptying every trainee category is rejected", async () => {
  const { mouId, cookie } = await setupMou();
  const edit = await requestEdit(mouId, cookie, "ADDENDUM_IN_AGREEMENT");
  const { token, version, commercial, payroll } = (await edit.json()) as { token: string; version: number } & EditablePayload;

  const response = await applyEdit(mouId, cookie, token, version, commercial, { ...payroll, traineeCategories: [] });
  assert.equal(response.status, 422);
});

test("AC12 applying with no changed field is rejected", async () => {
  const { mouId, cookie } = await setupMou();
  const edit = await requestEdit(mouId, cookie, "ADDENDUM_IN_AGREEMENT");
  const { token, version, commercial, payroll } = (await edit.json()) as { token: string; version: number } & EditablePayload;

  const response = await applyEdit(mouId, cookie, token, version, commercial, payroll);
  assert.equal(response.status, 422);
  const body = (await response.json()) as { error: string };
  assert.equal(body.error, "No changes to apply");
});

test("AC11 two users loading the same MOU: the second Apply receives the stale-version error", async () => {
  const { mouId, cookie } = await setupMou();
  const first = await requestEdit(mouId, cookie, "ADDENDUM_IN_AGREEMENT");
  const firstPayload = (await first.json()) as { token: string; version: number } & EditablePayload;
  const second = await requestEdit(mouId, cookie, "ADDENDUM_IN_AGREEMENT");
  const secondPayload = (await second.json()) as { token: string; version: number } & EditablePayload;

  const firstApply = await applyEdit(
    mouId,
    cookie,
    firstPayload.token,
    firstPayload.version,
    { ...firstPayload.commercial, tenureValue: "24" },
    firstPayload.payroll,
  );
  assert.equal(firstApply.status, 200);

  const secondApply = await applyEdit(
    mouId,
    cookie,
    secondPayload.token,
    secondPayload.version,
    { ...secondPayload.commercial, tenureValue: "36" },
    secondPayload.payroll,
  );
  assert.equal(secondApply.status, 409);

  const { rows } = await pool.query<{ tenure_value: number }>(`SELECT tenure_value FROM mou WHERE id = $1`, [mouId]);
  assert.equal(rows[0]?.tenure_value, 24);
});

test("AC13 a DATA_ENTRY user calling either endpoint receives 403", async () => {
  const { mouId, cookie } = await setupMou("DATA_ENTRY");
  const editResponse = await requestEdit(mouId, cookie, "ADDENDUM_IN_AGREEMENT");
  assert.equal(editResponse.status, 403);

  const putResponse = await applyEdit(mouId, cookie, "00000000-0000-0000-0000-000000000000", 1, {}, {});
  assert.equal(putResponse.status, 403);
});
