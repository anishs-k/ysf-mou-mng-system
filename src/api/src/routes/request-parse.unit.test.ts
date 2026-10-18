/**
 * Purpose: Unit tests for the shared request-parsing helpers every route
 * previously hand-copied (UUID_PATTERN, isUuid, asRecord, asArray,
 * readJsonField). These are pure string/JSON-shape checks with no database
 * or HTTP involved, so they belong in the cached unit task.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { asArray, asRecord, isIsoDate, isUuid, readJsonField, UUID_PATTERN } from "./request-parse.ts";

test("isUuid accepts a well-formed v4-shaped UUID in any case", () => {
  assert.equal(isUuid("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isUuid("123E4567-E89B-12D3-A456-426614174000"), true);
});

test("isUuid rejects anything that is not exactly that shape", () => {
  assert.equal(isUuid(""), false);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid("123e4567-e89b-12d3-a456-42661417400"), false); // one short
  assert.equal(isUuid("123e4567-e89b-12d3-a456-4266141740001"), false); // one long
  assert.equal(isUuid(" 123e4567-e89b-12d3-a456-426614174000"), false); // leading space
});

test("UUID_PATTERN is exported for callers that need the raw regex", () => {
  assert.equal(UUID_PATTERN.test("123e4567-e89b-12d3-a456-426614174000"), true);
});

test("asRecord returns the value when it is a plain object", () => {
  const input = { a: 1 };
  assert.equal(asRecord(input), input);
});

test("asRecord returns an empty object for anything that is not an object", () => {
  assert.deepEqual(asRecord(null), {});
  assert.deepEqual(asRecord(undefined), {});
  assert.deepEqual(asRecord("string"), {});
  assert.deepEqual(asRecord(42), {});
  assert.deepEqual(asRecord([1, 2]), [1, 2]); // an array is still typeof "object"
});

test("asArray returns the value when it is already an array", () => {
  const input = [1, 2, 3];
  assert.equal(asArray(input), input);
});

test("asArray returns an empty array for anything that is not an array", () => {
  assert.deepEqual(asArray(null), []);
  assert.deepEqual(asArray(undefined), []);
  assert.deepEqual(asArray({}), []);
  assert.deepEqual(asArray("abc"), []);
});

test("readJsonField reads a named field off a plain object body", () => {
  const body = { draftId: "abc-123", currentPage: 2 };
  assert.equal(readJsonField<string>(body, "draftId"), "abc-123");
  assert.equal(readJsonField<number>(body, "currentPage"), 2);
});

test("readJsonField returns undefined for a missing field or a non-object body", () => {
  assert.equal(readJsonField(undefined, "draftId"), undefined);
  assert.equal(readJsonField(null, "draftId"), undefined);
  assert.equal(readJsonField("not an object", "draftId"), undefined);
  assert.equal(readJsonField({}, "draftId"), undefined);
});

test("isIsoDate accepts a real YYYY-MM-DD calendar date", () => {
  assert.equal(isIsoDate("2026-02-28"), true);
  assert.equal(isIsoDate("2024-02-29"), true); // leap day
});

test("isIsoDate rejects other shapes and impossible dates", () => {
  assert.equal(isIsoDate(""), false);
  assert.equal(isIsoDate("2026-2-28"), false);
  assert.equal(isIsoDate("28-02-2026"), false);
  assert.equal(isIsoDate("2026-02-30"), false);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("2026-02-28T00:00:00Z"), false);
});
