/**
 * Purpose: Unit tests for the two shared MOU rules in SPEC-01 section 6 - the
 * derived end date (section 6.1) and the derived status (section 6.2). These are
 * acceptance criteria AC1 and AC2. No database is involved: `today` is injected
 * into deriveStatus so the results never depend on when the suite runs, and the
 * end-date cases pin the month-end clamping behaviour that Postgres interval
 * arithmetic produces.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeEndDate, deriveStatus } from "./mou-rules.ts";

test("AC1 computeEndDate: 12 months from 2026-01-01 ends 2026-12-31", () => {
  assert.equal(computeEndDate("2026-01-01", 12, "MONTHS"), "2026-12-31");
});

test("AC1 computeEndDate: 1 year from 2026-01-01 ends 2026-12-31", () => {
  assert.equal(computeEndDate("2026-01-01", 1, "YEARS"), "2026-12-31");
});

test("AC1 computeEndDate: month-end clamps before subtracting, like Postgres", () => {
  // 2026-01-31 + 1 month clamps to 2026-02-28, minus one day is 2026-02-27.
  // JavaScript's Date.setUTCMonth would overflow to 2026-03-03 instead.
  assert.equal(computeEndDate("2026-01-31", 1, "MONTHS"), "2026-02-27");
});

test("computeEndDate: leap day plus one year clamps to the 28th", () => {
  assert.equal(computeEndDate("2024-02-29", 1, "YEARS"), "2025-02-27");
});

test("computeEndDate: a one-month term on the first of the month is the day before the next", () => {
  assert.equal(computeEndDate("2026-03-01", 1, "MONTHS"), "2026-03-31");
});

test("computeEndDate: multi-year tenure crosses the year boundary", () => {
  assert.equal(computeEndDate("2025-07-15", 30, "MONTHS"), "2028-01-14");
});

test("computeEndDate: rejects a non-positive or fractional tenure", () => {
  assert.throws(() => computeEndDate("2026-01-01", 0, "MONTHS"), RangeError);
  assert.throws(() => computeEndDate("2026-01-01", 1.5, "MONTHS"), RangeError);
});

test("computeEndDate: rejects a malformed start date", () => {
  assert.throws(() => computeEndDate("01-01-2026", 12, "MONTHS"), RangeError);
});

test("AC2 deriveStatus: the boundaries are inclusive on both ends", () => {
  const start = "2026-01-01";
  const end = "2026-12-31";

  assert.equal(deriveStatus(start, end, "2025-12-31"), "NEW");
  assert.equal(deriveStatus(start, end, "2026-01-01"), "ACTIVE");
  assert.equal(deriveStatus(start, end, "2026-06-30"), "ACTIVE");
  assert.equal(deriveStatus(start, end, "2026-12-31"), "ACTIVE");
  assert.equal(deriveStatus(start, end, "2027-01-01"), "EXPIRED");
});

test("deriveStatus: a single-day term is ACTIVE on its only day", () => {
  assert.equal(deriveStatus("2026-05-04", "2026-05-04", "2026-05-04"), "ACTIVE");
  assert.equal(deriveStatus("2026-05-04", "2026-05-04", "2026-05-05"), "EXPIRED");
});

test("deriveStatus: rejects malformed dates", () => {
  assert.throws(() => deriveStatus("2026-01-01", "2026-12-31", "today"), RangeError);
});
