/**
 * Purpose: Unit tests for the generated company code format in SPEC-01 section
 * 6.3 - acceptance criterion AC3. Covers the zero-padded four-digit sequence,
 * the natural width above 9999, and the two-digit year suffix.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { formatCompanyCode } from "./company-code.ts";

test("AC3 formatCompanyCode: WEST, 2026, 42 -> WEST-26-0042", () => {
  assert.equal(formatCompanyCode("WEST", 2026, 42), "WEST-26-0042");
});

test("AC3 formatCompanyCode: a sequence above 9999 renders at natural width", () => {
  assert.equal(formatCompanyCode("WEST", 2026, 10000), "WEST-26-10000");
});

test("formatCompanyCode: the sequence is zero-padded to four digits", () => {
  assert.equal(formatCompanyCode("NORTH", 2026, 1), "NORTH-26-0001");
  assert.equal(formatCompanyCode("SOUTH", 2026, 999), "SOUTH-26-0999");
  assert.equal(formatCompanyCode("EAST", 2026, 1000), "EAST-26-1000");
});

test("formatCompanyCode: the year suffix is always two digits", () => {
  assert.equal(formatCompanyCode("WEST", 2007, 5), "WEST-07-0005");
  assert.equal(formatCompanyCode("WEST", 2100, 5), "WEST-00-0005");
});

test("formatCompanyCode: the zone code is upper-cased into the format", () => {
  assert.equal(formatCompanyCode("west", 2026, 42), "WEST-26-0042");
});

test("formatCompanyCode: rejects an empty zone code or non-integer numbers", () => {
  assert.throws(() => formatCompanyCode("", 2026, 1), RangeError);
  assert.throws(() => formatCompanyCode("WEST", 2026.5, 1), RangeError);
  assert.throws(() => formatCompanyCode("WEST", 2026, 1.5), RangeError);
});
