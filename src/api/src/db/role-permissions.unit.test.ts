/**
 * Purpose: Unit tests for SPEC-33's role permissions store without a database:
 * migration 0023 seeds exactly SPEC-32's default matrix, and permissionChanges
 * reports what a save adds and removes (the audit row's content).
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { EDITABLE_ROLES, ROLE_PERMISSIONS } from "@mou/domain";

import { permissionChanges } from "./role-permissions.ts";

const MIGRATION = new URL("../../drizzle/0023_spec33_role_permissions.sql", import.meta.url);

test("SPEC-33 migration 0023 seeds the SPEC-32 matrix for the four editable roles, and nothing for ADMIN", async () => {
  const sql = await readFile(MIGRATION, "utf8");
  const seeded = [...sql.matchAll(/\('([A-Z_]+)', '([a-z.]+)'\)/g)].map((match) => `${match[1]} ${match[2]}`);
  const expected = EDITABLE_ROLES.flatMap((role) => ROLE_PERMISSIONS[role].map((permission) => `${role} ${permission}`));
  assert.deepEqual(seeded.sort(), expected.sort());
  assert.ok(!seeded.some((row) => row.startsWith("ADMIN ")));
});

test("SPEC-33 permissionChanges lists what was added and removed, in matrix order", () => {
  assert.deepEqual(permissionChanges(["company.view", "export.data"], ["company.view", "contacts.view", "contacts.edit"]), {
    added: ["contacts.view", "contacts.edit"],
    removed: ["export.data"],
  });
  assert.deepEqual(permissionChanges(["company.view"], ["company.view"]), { added: [], removed: [] });
});
