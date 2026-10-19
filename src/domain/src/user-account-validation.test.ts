/**
 * Purpose: Unit tests for the SPEC-21 section 5.1 user-account field rules,
 * written before the implementation per the working rules. They cover both
 * modes - create (every field required except full name) and edit (only the
 * fields present are checked) - and the zone-access combinations that keep a
 * zonal user from ever being saved with no zone.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { validateUserAccount } from "./user-account-validation.ts";
import type { UserAccountInput } from "./user-account-validation.ts";

const ZONE_A = "11111111-1111-4111-8111-111111111111";
const ZONE_B = "22222222-2222-4222-8222-222222222222";

const VALID: UserAccountInput = {
  username: "pune.west",
  email: "pune@ysf.in",
  fullName: "Pune West Officer",
  password: "Secret@123",
  role: "VIEWER",
  allZones: false,
  zoneIds: [ZONE_A, ZONE_B],
};

const create = (overrides: Partial<UserAccountInput> = {}) => validateUserAccount({ ...VALID, ...overrides }, "create");

test("a complete create request is valid and normalised", () => {
  const result = create({ username: "  Pune.West ", email: " Pune@YSF.in ", fullName: "  Pune West Officer " });
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.value, {
    username: "pune.west",
    email: "pune@ysf.in",
    fullName: "Pune West Officer",
    password: "Secret@123",
    role: "VIEWER",
    allZones: false,
    zoneIds: [ZONE_A, ZONE_B],
  });
});

test("create requires username, email, password, role and zone access", () => {
  const result = validateUserAccount({}, "create");
  assert.equal(result.value, undefined);
  assert.deepEqual(Object.keys(result.errors).sort(), ["allZones", "email", "password", "role", "username"]);
});

test("full name is optional, and a blank one is stored as null", () => {
  assert.equal(create({ fullName: undefined }).value?.fullName, null);
  assert.equal(create({ fullName: "   " }).value?.fullName, null);
  assert.ok(create({ fullName: "A" }).errors.fullName);
});

test("username must be 3-255 characters of letters, digits and . _ - @", () => {
  assert.ok(create({ username: "ab" }).errors.username);
  assert.ok(create({ username: "has space" }).errors.username);
  assert.ok(create({ username: "hash#tag" }).errors.username, "# is reserved for deleted users");
  assert.ok(create({ username: "a".repeat(256) }).errors.username);
  assert.equal(create({ username: "a.b_c-d@e" }).errors.username, undefined);
});

test("email must be a valid address of at most 255 characters", () => {
  assert.ok(create({ email: "not-an-email" }).errors.email);
  assert.ok(create({ email: `${"a".repeat(250)}@x.com` }).errors.email);
});

test("password must be 8 to 128 characters", () => {
  assert.ok(create({ password: "short" }).errors.password);
  assert.ok(create({ password: "x".repeat(129) }).errors.password);
  assert.equal(create({ password: "x".repeat(8) }).errors.password, undefined);
});

test("role must be one of ADMIN, DATA_ENTRY, VIEWER", () => {
  assert.ok(create({ role: "SUPER" }).errors.role);
  assert.equal(create({ role: "ADMIN" }).errors.role, undefined);
});

test("a zonal user needs at least one zone", () => {
  assert.ok(create({ zoneIds: [] }).errors.zoneIds);
  assert.ok(create({ zoneIds: undefined }).errors.zoneIds);
});

test("an all-zone user cannot also list specific zones", () => {
  assert.ok(create({ allZones: true, zoneIds: [ZONE_A] }).errors.zoneIds);
  const result = create({ allZones: true, zoneIds: [] });
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.value?.zoneIds, []);
});

test("zone ids must be UUIDs and listed once each", () => {
  assert.ok(create({ zoneIds: ["PUNE"] }).errors.zoneIds);
  assert.ok(create({ zoneIds: [ZONE_A, ZONE_A] }).errors.zoneIds);
});

test("edit checks only the fields present", () => {
  const result = validateUserAccount({ fullName: "New Name" }, "edit");
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.value, { fullName: "New Name" });
});

test("edit treats an empty password as unchanged", () => {
  const result = validateUserAccount({ password: "" }, "edit");
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.value, {});
});

test("edit still validates a field that is present", () => {
  assert.ok(validateUserAccount({ password: "short" }, "edit").errors.password);
  assert.ok(validateUserAccount({ zoneIds: [] }, "edit").errors.zoneIds);
  assert.ok(validateUserAccount({ allZones: true, zoneIds: [ZONE_A] }, "edit").errors.zoneIds);
});
