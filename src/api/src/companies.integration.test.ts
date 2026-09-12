/**
 * Purpose: Integration tests for SPEC-03 — the wizard draft endpoints and the
 * final save transaction. Every test drives the real Express application over
 * HTTP with real cookies, so the session, role checks and the database
 * transaction are all exercised together.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, promises as fs, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";

import type { Pool } from "pg";

import { PAYROLL_FIXED_ITEM_KEYS } from "@mou/domain";

import { createApp } from "./index.ts";
import {
  createTestPool,
  firstRow,
  insertZone,
  insertUserWithPassword,
  resetDatabase,
} from "./db/test-harness.ts";
import { tempDocumentFilePath } from "./upload/mou-document-storage.ts";

let pool: Pool;
let server: Server | undefined;
let baseUrl: string;
let uploadRoot: string;

before(async () => {
  pool = await createTestPool();
  // SPEC-05: an isolated, disposable directory so file assertions (AC10) never
  // touch a developer's real UPLOAD_ROOT and start every run empty.
  uploadRoot = mkdtempSync(path.join(tmpdir(), "mou-upload-test-"));
  process.env["UPLOAD_ROOT"] = uploadRoot;
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
  rmSync(uploadRoot, { recursive: true, force: true });
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function login(username: string, password: string): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  assert.equal(response.status, 200);
  const setCookie = response.headers.get("set-cookie");
  assert.ok(setCookie !== null && setCookie !== "", "expected a session cookie");
  return setCookie;
}

async function postDraft(cookie: string, payload: unknown, currentPage: number): Promise<Response> {
  return fetch(`${baseUrl}/api/companies/draft`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ payload, currentPage }),
  });
}

async function getDraft(cookie: string): Promise<Response> {
  return fetch(`${baseUrl}/api/companies/draft`, {
    headers: { Cookie: cookie },
  });
}

async function deleteDraft(cookie: string, draftId: string): Promise<Response> {
  return fetch(`${baseUrl}/api/companies/draft/${draftId}`, {
    method: "DELETE",
    headers: { Cookie: cookie },
  });
}

async function submitCompany(cookie: string, draftId: string): Promise<Response> {
  return fetch(`${baseUrl}/api/companies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ draftId }),
  });
}

const VALID_PDF_BYTES = Buffer.from("%PDF-1.4\n%mock mou document\n");

async function uploadDocument(
  cookie: string,
  draftId: string,
  options: { bytes?: Buffer; filename?: string; mimetype?: string } = {},
): Promise<Response> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array(options.bytes ?? VALID_PDF_BYTES)], {
      type: options.mimetype ?? "application/pdf",
    }),
    options.filename ?? "agreement.pdf",
  );
  return fetch(`${baseUrl}/api/companies/draft/${draftId}/mou-document`, {
    method: "POST",
    headers: { Cookie: cookie },
    body: form,
  });
}

/** Uploads a valid PDF to an already-created draft and returns the metadata
 * the wizard would embed in its own page2.mouDocument. */
async function uploadValidDocument(
  cookie: string,
  draftId: string,
): Promise<{ originalFilename: string; fileSizeBytes: number }> {
  const response = await uploadDocument(cookie, draftId);
  assert.equal(response.status, 200);
  return (await response.json()) as { originalFilename: string; fileSizeBytes: number };
}

/**
 * Creates a draft, uploads a valid MOU PDF to it (SPEC-05 AC9 - final save
 * refuses a draft with no PDF), then persists a complete Page 1-3 payload at
 * step 3, ready for submitCompany(). `transform` lets a caller spoil one part
 * of the otherwise-complete payload, mirroring how Page 1's tests spoil one
 * field of a shared valid baseline.
 */
async function createDraftAtStep3(
  cookie: string,
  zoneId: string,
  transform: (payload: ReturnType<typeof completePayload>) => ReturnType<typeof completePayload> = (
    payload,
  ) => payload,
): Promise<{ draftId: string; payload: ReturnType<typeof completePayload> }> {
  const initial = await postDraft(cookie, { page1: { zoneId } }, 1);
  const { id: draftId } = (await initial.json()) as { id: string };
  const mouDocument = await uploadValidDocument(cookie, draftId);
  const payload = transform(completePayload(zoneId, mouDocument));
  await postDraft(cookie, payload, 3);
  return { draftId, payload };
}

function completePayload(zoneId: string, mouDocument?: { originalFilename: string; fileSizeBytes: number }) {
  return {
    page1: {
      zoneId,
      companyName: "Test Company",
      companyType: "PRIVATE_SECTOR",
      registrationType: "COMPANY",
      tanNumber: "TANP12345C",
      gstNumber: "27AAAAA0001A1Z5",
      addressLine1: "1 Test Road",
      city: "Pune",
      pinCode: "411001",
      state: "Maharashtra",
      district: "Pune",
      hrContactName: "HR Person",
      financeHeadContactName: "Finance Person",
      contactType: "MOBILE",
      hrContactNumber: "9876543210",
      financeHeadContactNumber: "9876543211",
      officialEmail: "test@example.com",
      // Confirm Email is UI-only (there is no column for it) but SPEC-04 makes
      // it a required Page 1 field, so the final save must see it.
      confirmEmail: "test@example.com",
      plantName: "Main Plant",
    },
    page2: {
      mouStartDate: "2026-01-01",
      tenureValue: "12",
      tenureUnit: "MONTHS",
      attendanceCycle: "MONTHLY",
      stipendDate: "5",
      charges: {} as Record<string, string>,
      otherItems: [] as Array<{ label: string; amount: string; itemType: string }>,
      ...(mouDocument !== undefined ? { mouDocument } : {}),
    },
    page3: {
      scheme: "WILP",
      traineeCategories: ["Category A"] as string[],
      items: allPayrollItemsAnsweredNo(),
      otherItems: [] as Array<{ label: string; amount: string; itemType: string }>,
    },
  };
}

/** All 22 fixed payroll items answered No - the simplest fully-valid baseline. */
function allPayrollItemsAnsweredNo(): Record<string, { isApplicable: boolean; amount: string }> {
  const items: Record<string, { isApplicable: boolean; amount: string }> = {};
  for (const key of PAYROLL_FIXED_ITEM_KEYS) {
    items[key] = { isApplicable: false, amount: "" };
  }
  return items;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("AC8: a VIEWER calling POST /api/companies receives 403", async () => {
  const viewer = await insertUserWithPassword(pool, { username: "viewer", password: "pass", role: "VIEWER" });
  const zoneId = await insertZone(pool);
  const cookie = await login(viewer.username, viewer.password);

  const draftResponse = await postDraft(cookie, { page1: { zoneId } }, 1);
  assert.equal(draftResponse.status, 403);
});

test("AC1: invalid upsert body returns 400 and does not create a draft", async () => {
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const cookie = await login(user.username, user.password);

  const response = await postDraft(cookie, { page1: {} }, 0); // currentPage 0 is invalid
  assert.equal(response.status, 400);

  const getResponse = await getDraft(cookie);
  assert.equal(getResponse.status, 404);
});

test("draft create → get → update flow", async () => {
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const zoneId = await insertZone(pool);
  const cookie = await login(user.username, user.password);

  // Create draft on page 1
  const createResponse = await postDraft(cookie, { page1: { zoneId, companyName: "Acme" } }, 1);
  assert.equal(createResponse.status, 201);
  const createBody = (await createResponse.json()) as { id: string; created: boolean };
  assert.equal(createBody.created, true);

  // Get draft
  const getResponse = await getDraft(cookie);
  assert.equal(getResponse.status, 200);
  const getBody = (await getResponse.json()) as { id: string; payload: unknown; currentPage: number };
  assert.equal(getBody.currentPage, 1);

  // Update to page 2
  const updateResponse = await postDraft(
    cookie,
    { page1: { zoneId, companyName: "Acme Updated" }, page2: { mouStartDate: "2026-01-01" } },
    2,
  );
  assert.equal(updateResponse.status, 200);
  const updateBody = (await updateResponse.json()) as { id: string; created: boolean };
  assert.equal(updateBody.created, false);
  assert.equal(updateBody.id, createBody.id);

  // Get again — now on page 2
  const get2 = await getDraft(cookie);
  assert.equal(get2.status, 200);
  const get2Body = (await get2.json()) as { currentPage: number };
  assert.equal(get2Body.currentPage, 2);
});

test("AC7: cancel deletes the draft", async () => {
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const zoneId = await insertZone(pool);
  const cookie = await login(user.username, user.password);

  const createResponse = await postDraft(cookie, { page1: { zoneId } }, 1);
  const { id: draftId } = (await createResponse.json()) as { id: string };

  const deleteResponse = await deleteDraft(cookie, draftId);
  assert.equal(deleteResponse.status, 204);

  const getResponse = await getDraft(cookie);
  assert.equal(getResponse.status, 404);
});

test("AC4 + AC6: final save creates company and is idempotent", async () => {
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const zoneId = await insertZone(pool);
  const cookie = await login(user.username, user.password);

  // Create draft through page 3
  const { draftId } = await createDraftAtStep3(cookie, zoneId);

  // Verify no company exists yet
  const { rows: before } = await pool.query(`SELECT count(*)::int AS c FROM company`);
  assert.equal(before[0].c, 0);

  // Submit
  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 201);
  const submitBody = (await submitResponse.json()) as { companyId: string; generatedCode: string };
  assert.ok(submitBody.companyId.length > 0);
  assert.ok(submitBody.generatedCode.includes("WEST"));

  // Verify company now exists
  const { rows: after } = await pool.query(`SELECT count(*)::int AS c FROM company`);
  assert.equal(after[0].c, 1);

  // Verify draft is gone
  const getResponse = await getDraft(cookie);
  assert.equal(getResponse.status, 404);

  // Idempotency: second submit with same draftId returns the same company
  const submit2 = await submitCompany(cookie, draftId);
  assert.equal(submit2.status, 200);
  const submit2Body = (await submit2.json()) as { companyId: string; generatedCode: string };
  assert.equal(submit2Body.companyId, submitBody.companyId);
  assert.equal(submit2Body.generatedCode, submitBody.generatedCode);

  // Still only one company
  const { rows: final } = await pool.query(`SELECT count(*)::int AS c FROM company`);
  assert.equal(final[0].c, 1);
});

test("AC5: a save that fails inside the transaction leaves zero rows", async () => {
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const zoneId = await insertZone(pool);
  const cookie = await login(user.username, user.password);

  // An Other row's itemType is only checked for being non-blank by
  // validatePayrollDetails (the user's own free choice of Allowance/
  // Deduction), so a garbage value slips past every pre-transaction
  // validation and only fails at the database's item_type CHECK constraint,
  // deep inside the transaction (the payroll_item insert, after company,
  // plant, mou and commercial_item have all already been inserted) - exactly
  // the "fails inside the transaction" case this test is for.
  const { draftId } = await createDraftAtStep3(cookie, zoneId, (payload) => ({
    ...payload,
    page3: {
      ...payload.page3,
      otherItems: [{ label: "Bad Row", amount: "100", itemType: "NOT_A_REAL_TYPE" }],
    },
  }));

  // Submit should fail
  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 500);

  // Verify zero rows in all related tables
  const tables = [
    "company",
    "company_plant",
    "mou",
    "commercial_item",
    "mou_document",
    "payroll_config",
    "trainee_category",
    "payroll_item",
  ];
  for (const table of tables) {
    const { rows } = await pool.query(`SELECT count(*)::int AS c FROM ${table}`);
    assert.equal(rows[0].c, 0, `expected 0 rows in ${table}`);
  }

  // Draft should still exist because the transaction rolled back
  const getResponse = await getDraft(cookie);
  assert.equal(getResponse.status, 200);
});

test("a user cannot delete another user's draft", async () => {
  const user1 = await insertUserWithPassword(pool, { username: "admin1", password: "pass", role: "ADMIN" });
  const user2 = await insertUserWithPassword(pool, { username: "admin2", password: "pass", role: "ADMIN" });
  const zoneId = await insertZone(pool);

  const cookie1 = await login(user1.username, user1.password);
  const cookie2 = await login(user2.username, user2.password);

  const draftResponse = await postDraft(cookie1, { page1: { zoneId } }, 1);
  const { id: draftId } = (await draftResponse.json()) as { id: string };

  const deleteResponse = await deleteDraft(cookie2, draftId);
  assert.equal(deleteResponse.status, 403);
});

test("a DATA_ENTRY user can create and submit a draft", async () => {
  const user = await insertUserWithPassword(pool, { username: "data", password: "pass", role: "DATA_ENTRY" });
  const zoneId = await insertZone(pool);
  const cookie = await login(user.username, user.password);

  const { draftId } = await createDraftAtStep3(cookie, zoneId);

  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 201);
});

// ---------------------------------------------------------------------------
// SPEC-04 — Page 1 validation
// ---------------------------------------------------------------------------

async function validatePage1(
  cookie: string,
  details: Record<string, unknown>,
): Promise<{ status: number; errors: Record<string, string>; warnings: Record<string, string> }> {
  const response = await fetch(`${baseUrl}/api/companies/validate-page1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ details }),
  });
  const body = (await response.json()) as {
    errors?: Record<string, string>;
    warnings?: Record<string, string>;
  };
  return { status: response.status, errors: body.errors ?? {}, warnings: body.warnings ?? {} };
}

/** A valid Page 1 for an authoring user, ready to be spoiled one field at a time. */
function validPage1(zoneId: string) {
  return {
    companyType: "PRIVATE_SECTOR",
    companyName: "Acme Industries",
    registrationType: "COMPANY",
    tanNumber: "ABCD12345E",
    gstNumber: "27AAPFU0939F1ZV",
    zoneId,
    plantName: "Pune Plant",
    addressLine1: "12 Main Street",
    addressLine2: "",
    city: "Pune",
    pinCode: "411001",
    state: "Maharashtra",
    district: "Pune",
    hrContactName: "Rita Sharma",
    financeHeadContactName: "Arun Verma",
    contactType: "MOBILE",
    hrContactNumber: "9876543210",
    financeHeadContactNumber: "9123456780",
    officialEmail: "hr@acme.example",
    confirmEmail: "hr@acme.example",
  };
}

async function authorCookie(username = "admin"): Promise<string> {
  const user = await insertUserWithPassword(pool, {
    username,
    password: "pass",
    role: "ADMIN",
  });
  return login(user.username, user.password);
}

test("SPEC-04 a complete Page 1 validates with no errors and no warnings", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const result = await validatePage1(cookie, validPage1(zoneId));
  assert.equal(result.status, 200);
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.warnings, {});
});

test("SPEC-04 AC2 a valid TAN passes and a 9-character TAN is rejected", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const good = await validatePage1(cookie, { ...validPage1(zoneId), tanNumber: "ABCD12345E" });
  assert.equal(good.errors["tanNumber"], undefined);

  const bad = await validatePage1(cookie, { ...validPage1(zoneId), tanNumber: "ABCD1234E" });
  assert.ok(bad.errors["tanNumber"], "expected a TAN error");
});

test("SPEC-04 AC3 a duplicate GST number is rejected on the server", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  // Save one company so its GST is taken.
  const { draftId, payload } = await createDraftAtStep3(cookie, zoneId);
  assert.equal((await submitCompany(cookie, draftId)).status, 201);

  const takenGst = payload.page1.gstNumber;
  const clash = await validatePage1(cookie, { ...validPage1(zoneId), gstNumber: takenGst });
  assert.ok(clash.errors["gstNumber"], "expected a duplicate GST error");
  assert.match(clash.errors["gstNumber"] as string, /already registered/i);

  const free = await validatePage1(cookie, validPage1(zoneId));
  assert.equal(free.errors["gstNumber"], undefined);
});

test("SPEC-04 AC8 a GST state code disagreeing with State warns but does not block", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const result = await validatePage1(cookie, {
    ...validPage1(zoneId),
    gstNumber: "09AAPFU0939F1ZV", // 09 = Uttar Pradesh
    state: "Maharashtra",
  });
  assert.ok(result.warnings["gstNumber"], "expected a state mismatch warning");
  assert.equal(result.errors["gstNumber"], undefined);
});

test("SPEC-04 AC9 every required field left empty is reported", async () => {
  const cookie = await authorCookie();

  const result = await validatePage1(cookie, {});
  assert.equal(result.status, 200);
  for (const field of ["companyType", "companyName", "tanNumber", "gstNumber", "zoneId", "plantName"]) {
    assert.ok(result.errors[field], `expected an error on ${field}`);
  }
  assert.equal(result.errors["addressLine2"], undefined, "address line 2 is optional");
});

test("SPEC-04 AC10 the same name and plant in the same zone is a duplicate, a different zone is not", async () => {
  const zoneA = await insertZone(pool, "WEST", "West");
  const zoneB = await insertZone(pool, "EAST", "East");
  const cookie = await authorCookie();

  // Create "Acme Industries / Pune Plant" in zone A for real.
  const { draftId } = await createDraftAtStep3(cookie, zoneA, (payload) => ({
    ...payload,
    page1: { ...payload.page1, companyName: "Acme Industries", plantName: "Pune Plant" },
  }));
  assert.equal((await submitCompany(cookie, draftId)).status, 201);

  const duplicate = await validatePage1(cookie, validPage1(zoneA));
  assert.ok(duplicate.errors["companyName"], "expected a duplicate company error");

  const elsewhere = await validatePage1(cookie, validPage1(zoneB));
  assert.equal(elsewhere.errors["companyName"], undefined);
});

test("SPEC-04 a VIEWER is refused Page 1 validation", async () => {
  const viewer = await insertUserWithPassword(pool, {
    username: "viewer2",
    password: "pass",
    role: "VIEWER",
  });
  const cookie = await login(viewer.username, viewer.password);

  const result = await validatePage1(cookie, {});
  assert.equal(result.status, 403);
});

// ---------------------------------------------------------------------------
// SPEC-05 — MOU document upload
// ---------------------------------------------------------------------------

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

test("SPEC-05 a valid PDF is accepted and recorded on the draft", async () => {
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const zoneId = await insertZone(pool);
  const cookie = await login(user.username, user.password);

  const draftResponse = await postDraft(cookie, { page1: { zoneId } }, 1);
  const { id: draftId } = (await draftResponse.json()) as { id: string };

  const uploadResponse = await uploadDocument(cookie, draftId, { filename: "signed-mou.pdf" });
  assert.equal(uploadResponse.status, 200);
  const meta = (await uploadResponse.json()) as { originalFilename: string; fileSizeBytes: number };
  assert.equal(meta.originalFilename, "signed-mou.pdf");
  assert.equal(meta.fileSizeBytes, VALID_PDF_BYTES.byteLength);

  const getResponse = await getDraft(cookie);
  const draft = (await getResponse.json()) as { payload: { page2?: { mouDocument?: unknown } } };
  assert.deepEqual(draft.payload.page2?.mouDocument, meta);

  assert.ok(await fileExists(tempDocumentFilePath(draftId)), "expected the temp file to exist on disk");
});

test("SPEC-05 AC2 a file whose bytes are not a real PDF is rejected", async () => {
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const cookie = await login(user.username, user.password);
  const draftResponse = await postDraft(cookie, { page1: {} }, 1);
  const { id: draftId } = (await draftResponse.json()) as { id: string };

  // A renamed .docx: the browser-supplied mimetype lies, but the bytes do not
  // start with %PDF.
  const response = await uploadDocument(cookie, draftId, {
    bytes: Buffer.from("this is not a pdf"),
    filename: "agreement.pdf",
    mimetype: "application/pdf",
  });
  assert.equal(response.status, 422);
  assert.equal(await fileExists(tempDocumentFilePath(draftId)), false);
});

test("SPEC-05 AC2 a non-PDF mimetype is rejected even with a .pdf filename", async () => {
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const cookie = await login(user.username, user.password);
  const draftResponse = await postDraft(cookie, { page1: {} }, 1);
  const { id: draftId } = (await draftResponse.json()) as { id: string };

  const response = await uploadDocument(cookie, draftId, {
    mimetype: "application/msword",
    filename: "agreement.pdf",
  });
  assert.equal(response.status, 422);
});

test("SPEC-05 AC3 an 11 MB file is rejected with a size error", async () => {
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const cookie = await login(user.username, user.password);
  const draftResponse = await postDraft(cookie, { page1: {} }, 1);
  const { id: draftId } = (await draftResponse.json()) as { id: string };

  const oversized = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024)]);
  const response = await uploadDocument(cookie, draftId, { bytes: oversized });
  assert.equal(response.status, 422);
  const body = (await response.json()) as { error?: string };
  assert.match(body.error ?? "", /10 ?MB/i);
});

test("SPEC-05 a VIEWER cannot upload a document", async () => {
  const viewer = await insertUserWithPassword(pool, { username: "viewer3", password: "pass", role: "VIEWER" });
  const admin = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const adminCookie = await login(admin.username, admin.password);
  const draftResponse = await postDraft(adminCookie, { page1: {} }, 1);
  const { id: draftId } = (await draftResponse.json()) as { id: string };

  const viewerCookie = await login(viewer.username, viewer.password);
  const response = await uploadDocument(viewerCookie, draftId);
  assert.equal(response.status, 403);
});

test("SPEC-05 a user cannot upload to another user's draft", async () => {
  const user1 = await insertUserWithPassword(pool, { username: "owner", password: "pass", role: "ADMIN" });
  const user2 = await insertUserWithPassword(pool, { username: "intruder", password: "pass", role: "ADMIN" });
  const cookie1 = await login(user1.username, user1.password);
  const cookie2 = await login(user2.username, user2.password);

  const draftResponse = await postDraft(cookie1, { page1: {} }, 1);
  const { id: draftId } = (await draftResponse.json()) as { id: string };

  const response = await uploadDocument(cookie2, draftId);
  assert.equal(response.status, 403);
});

test("SPEC-05 replacing the file overwrites the draft's recorded metadata", async () => {
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const cookie = await login(user.username, user.password);
  const draftResponse = await postDraft(cookie, { page1: {} }, 1);
  const { id: draftId } = (await draftResponse.json()) as { id: string };

  await uploadDocument(cookie, draftId, { filename: "first.pdf" });
  const second = await uploadDocument(cookie, draftId, { filename: "second.pdf" });
  assert.equal(second.status, 200);

  const getResponse = await getDraft(cookie);
  const draft = (await getResponse.json()) as { payload: { page2?: { mouDocument?: { originalFilename: string } } } };
  assert.equal(draft.payload.page2?.mouDocument?.originalFilename, "second.pdf");
});

// ---------------------------------------------------------------------------
// SPEC-05 — final save: commercial items and the MOU document
// ---------------------------------------------------------------------------

async function mouIdForCompany(companyId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM mou WHERE company_id = $1`, [companyId]);
  return firstRow(rows).id;
}

test("SPEC-05 AC6 a blank charge and an entered 0 are distinguishable after save", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const { draftId } = await createDraftAtStep3(cookie, zoneId, (payload) => ({
    ...payload,
    page2: { ...payload.page2, charges: { ADMIN_CHARGES: "0", INSURANCE: "" } },
  }));
  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 201);
  const { companyId } = (await submitResponse.json()) as { companyId: string };
  const mouId = await mouIdForCompany(companyId);

  const { rows } = await pool.query<{ item_key: string; amount: string }>(
    `SELECT item_key, amount FROM commercial_item WHERE mou_id = $1 AND item_key IN ('ADMIN_CHARGES', 'INSURANCE')`,
    [mouId],
  );
  assert.equal(rows.length, 1, "expected only the entered charge to have a row");
  assert.equal(rows[0]?.item_key, "ADMIN_CHARGES");
  assert.equal(rows[0]?.amount, "0.00");
});

test("SPEC-05 an Other row persists with item_key OTHER, its label and chosen type", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const { draftId } = await createDraftAtStep3(cookie, zoneId, (payload) => ({
    ...payload,
    page2: {
      ...payload.page2,
      otherItems: [{ label: "Festival Bonus", amount: "500", itemType: "ALLOWANCE" }],
    },
  }));
  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 201);
  const { companyId } = (await submitResponse.json()) as { companyId: string };
  const mouId = await mouIdForCompany(companyId);

  const { rows } = await pool.query<{ custom_label: string; amount: string; item_type: string }>(
    `SELECT custom_label, amount, item_type FROM commercial_item WHERE mou_id = $1 AND item_key = 'OTHER'`,
    [mouId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.custom_label, "Festival Bonus");
  assert.equal(rows[0]?.amount, "500.00");
  assert.equal(rows[0]?.item_type, "ALLOWANCE");
});

test("SPEC-05 AC9 final save with no MOU PDF is blocked", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const draftResponse = await postDraft(cookie, completePayload(zoneId), 3);
  const { id: draftId } = (await draftResponse.json()) as { id: string };

  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 422);

  const { rows } = await pool.query(`SELECT count(*)::int AS c FROM company`);
  assert.equal(rows[0].c, 0);
});

test("SPEC-05 final save is blocked when Page 2 fails validation", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const { draftId } = await createDraftAtStep3(cookie, zoneId, (payload) => ({
    ...payload,
    // 200 months exceeds the 120-month cap.
    page2: { ...payload.page2, tenureValue: "200" },
  }));

  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 422);
  const body = (await submitResponse.json()) as { errors?: { tenureValue?: string } };
  assert.ok(body.errors?.tenureValue);
});

test("SPEC-05 the mou_document row records the uploaded file's metadata", async () => {
  const zoneId = await insertZone(pool);
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const cookie = await login(user.username, user.password);

  const initial = await postDraft(cookie, { page1: { zoneId } }, 1);
  const { id: draftId } = (await initial.json()) as { id: string };
  const meta = await uploadValidDocument(cookie, draftId);
  await postDraft(cookie, completePayload(zoneId, meta), 3);

  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 201);
  const { companyId } = (await submitResponse.json()) as { companyId: string };
  const mouId = await mouIdForCompany(companyId);

  const { rows } = await pool.query<{
    original_filename: string;
    file_size_bytes: string;
    uploaded_by: string;
  }>(`SELECT original_filename, file_size_bytes, uploaded_by FROM mou_document WHERE mou_id = $1`, [mouId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.original_filename, meta.originalFilename);
  assert.equal(Number(rows[0]?.file_size_bytes), meta.fileSizeBytes);
  assert.equal(rows[0]?.uploaded_by, user.id);
});

test("SPEC-05 AC10 cancelling a draft leaves no temp file behind, even after replacing it", async () => {
  const user = await insertUserWithPassword(pool, { username: "admin", password: "pass", role: "ADMIN" });
  const cookie = await login(user.username, user.password);
  const draftResponse = await postDraft(cookie, { page1: {} }, 1);
  const { id: draftId } = (await draftResponse.json()) as { id: string };

  await uploadDocument(cookie, draftId, { filename: "first.pdf" });
  await uploadDocument(cookie, draftId, { filename: "second.pdf" });
  assert.ok(await fileExists(tempDocumentFilePath(draftId)), "expected a temp file to exist before cancelling");

  const deleteResponse = await deleteDraft(cookie, draftId);
  assert.equal(deleteResponse.status, 204);

  assert.equal(await fileExists(tempDocumentFilePath(draftId)), false);
});

test("SPEC-05 a completed save moves the temp file out and leaves nothing behind", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const { draftId } = await createDraftAtStep3(cookie, zoneId);
  assert.ok(await fileExists(tempDocumentFilePath(draftId)), "expected a temp file to exist before save");

  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 201);

  assert.equal(await fileExists(tempDocumentFilePath(draftId)), false);
});

// ---------------------------------------------------------------------------
// SPEC-06 — Page 3: payroll details, code generation and save
// ---------------------------------------------------------------------------

async function payrollConfigIdForMou(mouId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(`SELECT id FROM payroll_config WHERE mou_id = $1`, [mouId]);
  return firstRow(rows).id;
}

test("SPEC-06 AC4 switching Yes with an amount to No persists is_applicable=false, amount=NULL", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const { draftId } = await createDraftAtStep3(cookie, zoneId, (payload) => ({
    ...payload,
    page3: {
      ...payload.page3,
      items: {
        ...allPayrollItemsAnsweredNo(),
        // The wizard itself clears the amount when switching back to No
        // (AC4); this simulates that already-cleared state reaching the server.
        BONUS: { isApplicable: false, amount: "" },
      },
    },
  }));
  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 201);
  const { companyId } = (await submitResponse.json()) as { companyId: string };
  const mouId = await mouIdForCompany(companyId);
  const configId = await payrollConfigIdForMou(mouId);

  const { rows } = await pool.query<{ is_applicable: boolean; amount: string | null }>(
    `SELECT is_applicable, amount FROM payroll_item WHERE payroll_config_id = $1 AND item_key = 'BONUS'`,
    [configId],
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.is_applicable, false);
  assert.equal(rows[0]?.amount, null);
});

test("SPEC-06 AC5 saving with zero trainee categories is rejected", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const { draftId } = await createDraftAtStep3(cookie, zoneId, (payload) => ({
    ...payload,
    page3: { ...payload.page3, traineeCategories: [] as string[] },
  }));

  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 422);
  const body = (await submitResponse.json()) as { errors?: { traineeCategories?: string } };
  assert.ok(body.errors?.traineeCategories);

  const { rows } = await pool.query(`SELECT count(*)::int AS c FROM company`);
  assert.equal(rows[0].c, 0);
});

test("SPEC-06 AC6 two categories named Trainee and trainee are rejected as duplicates", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const { draftId } = await createDraftAtStep3(cookie, zoneId, (payload) => ({
    ...payload,
    page3: {
      ...payload.page3,
      traineeCategories: ["Trainee", "trainee"],
    },
  }));

  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 422);
  const body = (await submitResponse.json()) as {
    errors?: { traineeCategoryRows?: (string | undefined)[] };
  };
  assert.ok(body.errors?.traineeCategoryRows?.[0]);
  assert.ok(body.errors?.traineeCategoryRows?.[1]);
});

test("SPEC-06 AC7 exactly 22 payroll_item rows exist for the fixed keys, plus one per Other row", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const { draftId } = await createDraftAtStep3(cookie, zoneId, (payload) => ({
    ...payload,
    page3: {
      ...payload.page3,
      otherItems: [{ label: "Special Bonus", amount: "250", itemType: "ALLOWANCE" }],
    },
  }));
  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 201);
  const { companyId } = (await submitResponse.json()) as { companyId: string };
  const mouId = await mouIdForCompany(companyId);
  const configId = await payrollConfigIdForMou(mouId);

  const { rows: fixedRows } = await pool.query(
    `SELECT count(*)::int AS c FROM payroll_item WHERE payroll_config_id = $1 AND item_key <> 'OTHER'`,
    [configId],
  );
  assert.equal(fixedRows[0].c, PAYROLL_FIXED_ITEM_KEYS.length);

  const { rows: otherRows } = await pool.query(
    `SELECT count(*)::int AS c FROM payroll_item WHERE payroll_config_id = $1 AND item_key = 'OTHER'`,
    [configId],
  );
  assert.equal(otherRows[0].c, 1);
});

test("SPEC-06 AC8 two saves in the same zone and year produce consecutive generated codes", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const first = await createDraftAtStep3(cookie, zoneId);
  const firstSubmit = await submitCompany(cookie, first.draftId);
  assert.equal(firstSubmit.status, 201);
  const firstBody = (await firstSubmit.json()) as { generatedCode: string };

  const second = await createDraftAtStep3(cookie, zoneId, (payload) => ({
    ...payload,
    page1: { ...payload.page1, companyName: "Second Company", gstNumber: "27AAAAA0002A1Z5" },
  }));
  const secondSubmit = await submitCompany(cookie, second.draftId);
  assert.equal(secondSubmit.status, 201);
  const secondBody = (await secondSubmit.json()) as { generatedCode: string };

  const firstSequence = Number(firstBody.generatedCode.split("-").pop());
  const secondSequence = Number(secondBody.generatedCode.split("-").pop());
  assert.equal(secondSequence, firstSequence + 1);
});

test("SPEC-06 AC9 DOCUMENT_FEE and REGISTRATION_FEE persist as DEDUCTION, the rest as ALLOWANCE", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const { draftId } = await createDraftAtStep3(cookie, zoneId);
  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 201);
  const { companyId } = (await submitResponse.json()) as { companyId: string };
  const mouId = await mouIdForCompany(companyId);
  const configId = await payrollConfigIdForMou(mouId);

  const { rows } = await pool.query<{ item_key: string; item_type: string }>(
    `SELECT item_key, item_type FROM payroll_item WHERE payroll_config_id = $1 AND item_key <> 'OTHER'`,
    [configId],
  );
  for (const row of rows) {
    const expected = row.item_key === "DOCUMENT_FEE" || row.item_key === "REGISTRATION_FEE" ? "DEDUCTION" : "ALLOWANCE";
    assert.equal(row.item_type, expected, `expected ${row.item_key} to be ${expected}`);
  }
});

test("SPEC-06 AC11 a save that fails Page 3 validation writes nothing and leaves the draft intact", async () => {
  const zoneId = await insertZone(pool);
  const cookie = await authorCookie();

  const { draftId } = await createDraftAtStep3(cookie, zoneId, (payload) => ({
    ...payload,
    page3: { ...payload.page3, scheme: "" },
  }));

  const submitResponse = await submitCompany(cookie, draftId);
  assert.equal(submitResponse.status, 422);
  const body = (await submitResponse.json()) as { errors?: { scheme?: string } };
  assert.ok(body.errors?.scheme);

  const { rows } = await pool.query(`SELECT count(*)::int AS c FROM company`);
  assert.equal(rows[0].c, 0);

  const getResponse = await getDraft(cookie);
  assert.equal(getResponse.status, 200);
});
