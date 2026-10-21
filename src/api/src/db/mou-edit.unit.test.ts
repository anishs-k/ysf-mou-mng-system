/**
 * Purpose: Unit tests for derivePayrollItemRows, the pure step of SPEC-10's edit
 * save that turns validated payroll answers into payroll_item rows. Covers the
 * SPEC-23 value kinds: a PF percentage keeps its value, and TDS - a status - never
 * carries an amount, which the database CHECK payroll_item_status_chk would refuse.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { PAYROLL_FIXED_ITEM_KEYS } from "@mou/domain";
import type { PayrollItemAnswer } from "@mou/domain";

import { derivePayrollItemRows } from "./mou-edit.ts";

function answeredNo(): Record<string, PayrollItemAnswer> {
  return Object.fromEntries(PAYROLL_FIXED_ITEM_KEYS.map((key) => [key, { isApplicable: false, amount: "" }]));
}

function rowFor(items: Record<string, PayrollItemAnswer>, key: string) {
  return derivePayrollItemRows(items, []).find((row) => row.itemKey === key);
}

test("every fixed key gets exactly one row", () => {
  const rows = derivePayrollItemRows(answeredNo(), []);
  assert.deepEqual(rows.map((row) => row.itemKey), [...PAYROLL_FIXED_ITEM_KEYS]);
});

test("D158 only PF, ESI and TDS rows are derived", () => {
  assert.deepEqual(
    derivePayrollItemRows(answeredNo(), []).map((row) => row.itemKey),
    ["PF", "ESI", "TDS"],
  );
});

test("SPEC-23 a PF percentage is stored as its value with two decimals", () => {
  const row = rowFor({ ...answeredNo(), PF: { isApplicable: true, amount: "12" } }, "PF");
  assert.equal(row?.amount, "12.00");
  assert.equal(row?.itemType, "DEDUCTION");
});

test("SPEC-23 TDS As applicable is stored with no amount", () => {
  const row = rowFor({ ...answeredNo(), TDS: { isApplicable: true, amount: "" } }, "TDS");
  assert.equal(row?.isApplicable, true);
  assert.equal(row?.amount, null);
});

test("SPEC-23 TDS Not applicable is stored with no amount", () => {
  const row = rowFor(answeredNo(), "TDS");
  assert.equal(row?.isApplicable, false);
  assert.equal(row?.amount, null);
});
