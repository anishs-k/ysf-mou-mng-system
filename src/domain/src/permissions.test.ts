/**
 * Purpose: Unit tests for SPEC-32's role x permission matrix. The expected
 * table below is written out in full, independently of ROLE_PERMISSIONS, so any
 * change to who may see or change what fails here first. Also covers the
 * Edit Agreement section check (forbiddenEditSections).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { USER_ROLES } from "./enums.ts";
import type { UserRole } from "./enums.ts";
import {
  EDITABLE_ROLES,
  effectivePermissions,
  forbiddenEditSections,
  hasPermission,
  normalizeGrant,
  PERMISSION_SECTIONS,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from "./permissions.ts";
import type { Permission } from "./permissions.ts";

/** A = Admin, D = Data Entry, H = HR, F = Finance, V = Viewer. */
const EXPECTED: Readonly<Record<Permission, string>> = {
  "company.create": "ADHF",
  "company.view": "ADHFV",
  "company.edit": "ADH",
  "contacts.view": "ADHF",
  "contacts.edit": "ADH",
  "commercial.view": "ADHFV",
  "commercial.edit": "ADF",
  "payroll.view": "ADHFV",
  "payroll.edit": "ADHF",
  "documents.view": "ADHFV",
  "documents.upload": "ADHF",
  "agreement.edit": "AHF",
  "alerts.ack": "ADHF",
  "export.data": "ADHF",
  "contacts.export": "AHF",
  "users.manage": "A",
};

const LETTER: Readonly<Record<UserRole, string>> = { ADMIN: "A", DATA_ENTRY: "D", HR: "H", FINANCE: "F", VIEWER: "V" };

test("SPEC-32 every permission in the matrix is covered by the expected table", () => {
  assert.deepEqual([...PERMISSIONS].sort(), Object.keys(EXPECTED).sort());
});

test("SPEC-32 each role holds exactly the permissions of the approved matrix", () => {
  for (const permission of PERMISSIONS) {
    for (const role of USER_ROLES) {
      assert.equal(hasPermission(role, permission), EXPECTED[permission].includes(LETTER[role]), `${role} ${permission}`);
    }
  }
});

test("SPEC-32 an edit permission always comes with its view permission", () => {
  const pairs: readonly (readonly [Permission, Permission])[] = [
    ["company.edit", "company.view"],
    ["contacts.edit", "contacts.view"],
    ["commercial.edit", "commercial.view"],
    ["payroll.edit", "payroll.view"],
    ["documents.upload", "documents.view"],
    ["contacts.export", "contacts.view"],
  ];
  for (const role of USER_ROLES) {
    for (const [edit, view] of pairs) {
      if (hasPermission(role, edit)) assert.ok(hasPermission(role, view), `${role} ${edit} needs ${view}`);
    }
  }
});

test("SPEC-32 Edit Agreement: an unchanged section is never forbidden", () => {
  for (const role of USER_ROLES) {
    assert.deepEqual(forbiddenEditSections(ROLE_PERMISSIONS[role], { contacts: false, commercial: false, payroll: false }), []);
  }
});

test("SPEC-32 Edit Agreement: HR may not change commercial, Finance may not change contacts", () => {
  const all = { contacts: true, commercial: true, payroll: true };
  assert.deepEqual(forbiddenEditSections(ROLE_PERMISSIONS.ADMIN, all), []);
  assert.deepEqual(forbiddenEditSections(ROLE_PERMISSIONS.HR, all), ["Commercial Details"]);
  assert.deepEqual(forbiddenEditSections(ROLE_PERMISSIONS.FINANCE, all), ["Contact Details"]);
  assert.deepEqual(forbiddenEditSections(ROLE_PERMISSIONS.HR, { contacts: true, commercial: false, payroll: true }), []);
  assert.deepEqual(forbiddenEditSections(ROLE_PERMISSIONS.FINANCE, { contacts: false, commercial: true, payroll: true }), []);
  assert.deepEqual(forbiddenEditSections(ROLE_PERMISSIONS.VIEWER, all), ["Contact Details", "Commercial Details", "Payroll Details"]);
});

test("SPEC-33 ADMIN is locked to every permission; the other four roles are editable", () => {
  assert.deepEqual([...EDITABLE_ROLES], ["DATA_ENTRY", "HR", "FINANCE", "VIEWER"]);
  assert.deepEqual(effectivePermissions("ADMIN", []), [...PERMISSIONS]);
  assert.deepEqual(effectivePermissions("VIEWER", ["payroll.view"]), ["payroll.view"]);
});

test("SPEC-33 a change permission brings its view permission with it", () => {
  assert.deepEqual(normalizeGrant(["contacts.edit"]), ["contacts.view", "contacts.edit"]);
  assert.deepEqual(normalizeGrant(["documents.upload", "contacts.export"]), ["contacts.view", "documents.view", "documents.upload", "contacts.export"]);
});

test("SPEC-33 unknown values, duplicates and users.manage are never granted", () => {
  assert.deepEqual(normalizeGrant(["users.manage", "bogus", "export.data", "export.data"]), ["export.data"]);
});

test("SPEC-33 the default matrix is already normalised for every editable role", () => {
  for (const role of EDITABLE_ROLES) assert.deepEqual(normalizeGrant(ROLE_PERMISSIONS[role]), [...ROLE_PERMISSIONS[role]], role);
});

test("SPEC-33 the screen's sections cover every grantable permission exactly once", () => {
  const listed = PERMISSION_SECTIONS.flatMap((section) => [section.view, section.change]).filter((value) => value !== undefined);
  assert.deepEqual([...listed].sort(), PERMISSIONS.filter((permission) => permission !== "users.manage").sort());
});
