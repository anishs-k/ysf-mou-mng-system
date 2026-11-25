/**
 * Purpose: Unit tests for SPEC-32's API side - requirePermission (401 / 403 /
 * allow) and the response filters that strip a company's contacts from what a
 * role without "contacts.view" receives (overview, search rows, history snapshots).
 * SPEC-33: both read the session's permissions; here the default matrix stands in.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { ROLE_PERMISSIONS } from "@mou/domain";
import type { UserRole } from "@mou/domain";
import type { NextFunction, Request, Response } from "express";

import { requirePermission } from "./middleware.ts";
import { overviewFor, searchRowFor, snapshotFor } from "./section-access.ts";

function holder(role: UserRole) {
  return { permissions: ROLE_PERMISSIONS[role] };
}

function run(role: UserRole | undefined, permission: Parameters<typeof requirePermission>[0]) {
  const request = { auth: role === undefined ? undefined : holder(role) } as unknown as Request;
  let status = 200;
  let body: unknown;
  const response = {
    status(code: number) {
      status = code;
      return this;
    },
    json(value: unknown) {
      body = value;
      return this;
    },
  } as unknown as Response;
  let nextCalled = false;
  requirePermission(permission)(request, response, (() => {
    nextCalled = true;
  }) as NextFunction);
  return { status, body, nextCalled };
}

test("SPEC-32 requirePermission answers 401 without a session", () => {
  const result = run(undefined, "export.data");
  assert.equal(result.status, 401);
  assert.equal(result.nextCalled, false);
});

test("SPEC-32 requirePermission answers 403 when the role lacks the permission", () => {
  const result = run("VIEWER", "export.data");
  assert.equal(result.status, 403);
  assert.deepEqual(result.body, { error: "Forbidden" });
  assert.equal(result.nextCalled, false);
});

test("SPEC-32 requirePermission lets a role with the permission through", () => {
  assert.equal(run("DATA_ENTRY", "export.data").nextCalled, true);
  assert.equal(run("HR", "agreement.edit").nextCalled, true);
});

const OVERVIEW = {
  id: "c1",
  companyName: "Acme",
  gstNumber: "27AAAAA0000A1Z5",
  contactType: "HR",
  hrContactName: "Ravi",
  hrContactNumber: "9876543210",
  financeHeadContactName: "Sita",
  financeHeadContactNumber: "9876543211",
  hrEmail: "hr@acme.in",
  financeEmail: "fin@acme.in",
  purchaseName: "Om",
  purchaseNumber: "9876543212",
  purchaseEmail: "buy@acme.in",
  pocName: "Raj",
  pocNumber: "9876543213",
  decisionMakerName: "Dev",
  decisionMakerNumber: "9876543214",
  zonalManager: "Abhishek B.",
};

test("SPEC-32 a Viewer's overview carries no contact details", () => {
  const view = overviewFor(holder("VIEWER"), OVERVIEW);
  assert.equal(view.companyName, "Acme");
  assert.equal(view.gstNumber, "27AAAAA0000A1Z5");
  for (const field of ["hrContactName", "hrContactNumber", "financeHeadContactName", "financeHeadContactNumber", "hrEmail", "financeEmail"] as const) {
    assert.equal(view[field], "", field);
  }
  for (const field of ["purchaseName", "purchaseNumber", "purchaseEmail", "pocName", "pocNumber", "decisionMakerName", "decisionMakerNumber", "zonalManager"] as const) {
    assert.equal(view[field], null, field);
  }
});

test("SPEC-32 roles with contacts.view get the overview unchanged", () => {
  for (const role of ["ADMIN", "DATA_ENTRY", "HR", "FINANCE"] as const) {
    assert.deepEqual(overviewFor(holder(role), OVERVIEW), OVERVIEW, role);
  }
});

test("SPEC-32 a Viewer's search row hides the HR contact", () => {
  const row = { mouId: "m1", companyName: "Acme", hrContactName: "Ravi", hrContactNumber: "9876543210" };
  assert.deepEqual(searchRowFor(holder("VIEWER"), row), { mouId: "m1", companyName: "Acme", hrContactName: "", hrContactNumber: "" });
  assert.deepEqual(searchRowFor(holder("FINANCE"), row), row);
});

test("SPEC-32 a Viewer's history snapshot drops the contacts, so the compare shows none", () => {
  const snapshot = { commercial: { a: 1 }, payroll: { b: 2 }, contacts: { hrContactName: "Ravi" } };
  assert.deepEqual(snapshotFor(holder("VIEWER"), snapshot), { commercial: { a: 1 }, payroll: { b: 2 } });
  assert.deepEqual(snapshotFor(holder("HR"), snapshot), snapshot);
});

test("SPEC-33 requirePermission follows the session's stored permissions, not the role's default", () => {
  const request = { auth: { role: "VIEWER", permissions: ["export.data"] } } as unknown as Request;
  let nextCalled = false;
  const response = { status: () => response, json: () => response } as unknown as Response;
  requirePermission("export.data")(request, response, (() => {
    nextCalled = true;
  }) as NextFunction);
  assert.equal(nextCalled, true);
});
