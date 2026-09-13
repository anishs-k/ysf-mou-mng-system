/**
 * Purpose: Unit tests for the generated code format in SPEC-16 section 3.3 -
 * decision D109, which supersedes SPEC-01 section 6.3 and its AC3. Covers the
 * literal MOU prefix, the scheme segment, the four-digit year, the zero-padded
 * four-digit sequence and the natural width above 9999.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { formatCompanyCode } from "./company-code.ts";

test("AC3 formatCompanyCode: WILP, 2026, 42 -> MOU-WILP-2026-0042", () => {
  assert.equal(formatCompanyCode("WILP", 2026, 42), "MOU-WILP-2026-0042");
});

test("AC3 formatCompanyCode: a sequence above 9999 renders at natural width", () => {
  assert.equal(formatCompanyCode("WILP", 2026, 10000), "MOU-WILP-2026-10000");
});

test("formatCompanyCode: the sequence is zero-padded to four digits", () => {
  assert.equal(formatCompanyCode("FLEXI", 2026, 1), "MOU-FLEXI-2026-0001");
  assert.equal(formatCompanyCode("MSBTE", 2026, 999), "MOU-MSBTE-2026-0999");
  assert.equal(formatCompanyCode("NATS", 2026, 1000), "MOU-NATS-2026-1000");
});

test("formatCompanyCode: the year segment is always four digits", () => {
  assert.equal(formatCompanyCode("WILP", 2026, 5), "MOU-WILP-2026-0005");
  assert.equal(formatCompanyCode("WILP", 999, 5), "MOU-WILP-0999-0005");
});

test("formatCompanyCode: the scheme is upper-cased into the format", () => {
  // The scheme always arrives from the validated Scheme union, so the formatter
  // upper-cases but does not trim - matching the pre-SPEC-16 contract.
  assert.equal(formatCompanyCode("wilp", 2026, 42), "MOU-WILP-2026-0042");
  assert.equal(formatCompanyCode("bvoc", 2026, 42), "MOU-BVOC-2026-0042");
});

test("formatCompanyCode: every SPEC-16 scheme fits the varchar(30) column", () => {
  for (const scheme of ["NAPS", "NATS", "WILP", "BVOC", "DVOC", "FLEXI", "MSBTE"]) {
    const code = formatCompanyCode(scheme, 2026, 99999);
    assert.ok(code.length <= 30, `${code} exceeds the generated_code column width`);
  }
});

test("formatCompanyCode: rejects an empty scheme or non-positive numbers", () => {
  assert.throws(() => formatCompanyCode("", 2026, 1), RangeError);
  assert.throws(() => formatCompanyCode("   ", 2026, 1), RangeError);
  assert.throws(() => formatCompanyCode("WILP", 2026.5, 1), RangeError);
  assert.throws(() => formatCompanyCode("WILP", 0, 1), RangeError);
  assert.throws(() => formatCompanyCode("WILP", 2026, 1.5), RangeError);
  assert.throws(() => formatCompanyCode("WILP", 2026, 0), RangeError);
  assert.throws(() => formatCompanyCode("WILP", 2026, -3), RangeError);
});
