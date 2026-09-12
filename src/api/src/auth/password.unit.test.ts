/**
 * Purpose: Unit tests for the scrypt password hashing of SPEC-02 section 2.1. These
 * need no database, so they live in the cached unit task. Besides the happy path
 * they pin the two properties the login flow depends on: a stored value is
 * self-describing so the cost parameters can be raised later, and anything that is
 * not a well-formed hash of ours - notably the plaintext value SPEC-01 seeded - is
 * rejected rather than accidentally matched.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_SCRYPT_PARAMETERS,
  hashPassword,
  isPasswordHash,
  verifyPassword,
} from "./password.ts";

test("a password verifies against its own hash", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("correct horse battery staple", hash), true);
});

test("a wrong password does not verify", async () => {
  const hash = await hashPassword("correct horse battery staple");
  assert.equal(await verifyPassword("Correct horse battery staple", hash), false);
  assert.equal(await verifyPassword("", hash), false);
});

test("the same password hashes differently every time", async () => {
  const first = await hashPassword("repeatable");
  const second = await hashPassword("repeatable");

  assert.notEqual(first, second, "a per-hash salt must make the outputs differ");
  assert.equal(await verifyPassword("repeatable", first), true);
  assert.equal(await verifyPassword("repeatable", second), true);
});

test("the stored value never contains the password", async () => {
  const hash = await hashPassword("hunter2");
  assert.ok(!hash.includes("hunter2"));
});

test("the stored value is self-describing so the parameters can change later", async () => {
  const hash = await hashPassword("whatever");
  const [algorithm, cost, blockSize, parallelisation] = hash.split("$");

  assert.equal(algorithm, "scrypt");
  assert.equal(cost, String(DEFAULT_SCRYPT_PARAMETERS.cost));
  assert.equal(blockSize, String(DEFAULT_SCRYPT_PARAMETERS.blockSize));
  assert.equal(parallelisation, String(DEFAULT_SCRYPT_PARAMETERS.parallelisation));
});

test("a hash produced with different cost parameters still verifies", async () => {
  const hash = await hashPassword("tunable", { cost: 4096, blockSize: 8, parallelisation: 1 });
  assert.equal(await verifyPassword("tunable", hash), true);
});

test("isPasswordHash accepts our own output and rejects anything else", async () => {
  assert.equal(isPasswordHash(await hashPassword("x")), true);
  assert.equal(isPasswordHash("change-me"), false);
  assert.equal(isPasswordHash(""), false);
  assert.equal(isPasswordHash("bcrypt$2b$10$abcdefghijklmnopqrstuv"), false);
});

test("a legacy plaintext row can never authenticate", async () => {
  // SPEC-01 seeded ADMIN_PASSWORD verbatim. Such a row must simply never match.
  assert.equal(await verifyPassword("change-me", "change-me"), false);
  assert.equal(await verifyPassword("change-me", ""), false);
  assert.equal(await verifyPassword("change-me", "scrypt$notanumber$8$1$AAAA$BBBB"), false);
});

test("absurd stored parameters are refused rather than allocated", async () => {
  const hostile = `scrypt$${1 << 30}$8$1$AAAA$BBBB`;
  assert.equal(await verifyPassword("x", hostile), false);
});
