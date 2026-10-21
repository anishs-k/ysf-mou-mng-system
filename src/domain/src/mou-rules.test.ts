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

import { EXPIRING_SOON_DAYS, computeEndDate, deriveStatus, displayMouStatus } from "./mou-rules.ts";

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

// --- SPEC-23 D146: the display status, shared by the web app and the record PDF ---

test("SPEC-23 an active MoU ending within 90 days displays as Expiring", () => {
  assert.equal(EXPIRING_SOON_DAYS, 90);
  assert.equal(displayMouStatus("ACTIVE", "2026-11-19", "2026-10-20"), "Expiring");
  assert.equal(displayMouStatus("ACTIVE", "2026-10-20", "2026-10-20"), "Expiring", "ends today");
  assert.equal(displayMouStatus("ACTIVE", "2027-01-18", "2026-10-20"), "Expiring", "exactly 90 days");
});

test("SPEC-23 an active MoU ending in more than 90 days displays as Active", () => {
  assert.equal(displayMouStatus("ACTIVE", "2027-01-19", "2026-10-20"), "Active");
});

test("SPEC-23 expired and new MoUs display their own label, whatever the end date", () => {
  assert.equal(displayMouStatus("EXPIRED", "2026-10-01", "2026-10-20"), "Expired");
  assert.equal(displayMouStatus("NEW", "2026-11-01", "2026-10-20"), "New");
});

test("SPEC-23 an unknown status code passes through unchanged", () => {
  assert.equal(displayMouStatus("Archived", "2026-11-01", "2026-10-20"), "Archived");
});

test("SPEC-23 a status already given as its label is treated the same as the code", () => {
  assert.equal(displayMouStatus("Active", "2026-11-19", "2026-10-20"), "Expiring");
});

test("SPEC-23 an unreadable end date shows the plain label instead of throwing", () => {
  assert.equal(displayMouStatus("ACTIVE", "", "2026-10-20"), "Active");
});
