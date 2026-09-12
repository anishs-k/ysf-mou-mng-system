/**
 * Purpose: Unit tests for validateAmountString, the shared amount rule SPEC-05
 * introduces for the 16 fixed charges and the "Other" rows, and that later specs
 * (SPEC-06 payroll, SPEC-09) reuse rather than re-deriving. Written before the
 * SPEC-05 implementation, per the working rules.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { validateAmountString } from "./money.ts";

test("AC5 a whole number is accepted", () => {
  assert.equal(validateAmountString("1200"), undefined);
});

test("AC5 two decimal places are accepted", () => {
  assert.equal(validateAmountString("1200.50"), undefined);
});

test("AC5 zero is accepted", () => {
  assert.equal(validateAmountString("0"), undefined);
});

test("AC5 a negative amount is rejected", () => {
  assert.ok(validateAmountString("-5"));
});

test("AC5 three decimal places are rejected", () => {
  assert.ok(validateAmountString("12.345"));
});

test("the maximum allowed amount is accepted", () => {
  assert.equal(validateAmountString("9999999.99"), undefined);
});

test("one rupee over the maximum is rejected", () => {
  assert.ok(validateAmountString("10000000.00"));
});

test("a non-numeric string is rejected", () => {
  assert.ok(validateAmountString("abc"));
});

test("an empty string is rejected when checked directly", () => {
  // Callers decide per-field whether blank is allowed; this function alone
  // treats blank as not a valid amount.
  assert.ok(validateAmountString(""));
});
