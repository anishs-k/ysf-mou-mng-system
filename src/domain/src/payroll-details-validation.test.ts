/**
 * Purpose: Unit tests for the SPEC-06 Page 3 payroll-detail rules. Written
 * before the implementation, per the working rules, and follow SPEC-06 section
 * 7's acceptance criteria.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { PAYROLL_FIXED_ITEM_KEYS } from "./payroll-items.ts";
import { validatePayrollDetails } from "./payroll-details-validation.ts";
import type { PayrollDetails, PayrollItemAnswer } from "./payroll-details-validation.ts";

/** All 22 fixed items answered No - the simplest fully-valid baseline. */
function allAnsweredNo(): Record<string, PayrollItemAnswer> {
  const items: Record<string, PayrollItemAnswer> = {};
  for (const key of PAYROLL_FIXED_ITEM_KEYS) {
    items[key] = { isApplicable: false, amount: "" };
  }
  return items;
}

const VALID: PayrollDetails = {
  scheme: "WILP",
  traineeCategories: ["Category A"],
  items: allAnsweredNo(),
  otherItems: [],
};

function validate(overrides: Partial<PayrollDetails> = {}) {
  return validatePayrollDetails({ ...VALID, ...overrides });
}

test("a complete valid record produces no errors", () => {
  assert.deepEqual(validate().errors, {});
});

// --- Scheme -----------------------------------------------------------------

test("a missing scheme is required", () => {
  assert.ok(validate({ scheme: "" }).errors.scheme);
});

test("an unknown scheme is rejected", () => {
  assert.ok(validate({ scheme: "NOT_A_SCHEME" }).errors.scheme);
});

// --- AC5 / AC6: trainee categories --------------------------------------------

test("AC5 zero trainee categories is rejected", () => {
  assert.ok(validate({ traineeCategories: [] }).errors.traineeCategories);
});

test("AC6 two categories differing only in case are both rejected", () => {
  const result = validate({ traineeCategories: ["Trainee", "trainee"] });
  assert.ok(result.errors.traineeCategoryRows?.[0]);
  assert.ok(result.errors.traineeCategoryRows?.[1]);
});

test("two different category names are both accepted", () => {
  const result = validate({ traineeCategories: ["Trainee", "Apprentice"] });
  assert.equal(result.errors.traineeCategoryRows, undefined);
});

test("a category longer than 100 characters is rejected", () => {
  const result = validate({ traineeCategories: ["A".repeat(101)] });
  assert.ok(result.errors.traineeCategoryRows?.[0]);
});

// --- AC2 / AC3 / AC4: the 22 fixed items ---------------------------------------

test("AC2 every unanswered item is reported", () => {
  const result = validate({ items: {} });
  for (const key of PAYROLL_FIXED_ITEM_KEYS) {
    assert.ok(result.errors.items?.[key], `expected an error on ${key}`);
  }
});

test("AC1 answering No to one item does not affect another item's validation", () => {
  const items = allAnsweredNo();
  items["ATTENDANCE_BONUS"] = { isApplicable: false, amount: "" };
  const result = validate({ items });
  assert.equal(result.errors.items?.["THIRD_YEAR_ALLOWANCE"], undefined);
});

test("AC3 Yes with an empty amount blocks Save", () => {
  const items = allAnsweredNo();
  items["BONUS"] = { isApplicable: true, amount: "" };
  const result = validate({ items });
  assert.ok(result.errors.items?.["BONUS"]);
});

test("AC3 Yes with a valid amount is accepted", () => {
  const items = allAnsweredNo();
  items["BONUS"] = { isApplicable: true, amount: "500" };
  const result = validate({ items });
  assert.equal(result.errors.items?.["BONUS"], undefined);
});

test("Yes with a negative amount is rejected", () => {
  const items = allAnsweredNo();
  items["BONUS"] = { isApplicable: true, amount: "-5" };
  const result = validate({ items });
  assert.ok(result.errors.items?.["BONUS"]);
});

test("AC4 No ignores a stray amount value", () => {
  const items = allAnsweredNo();
  items["BONUS"] = { isApplicable: false, amount: "500" };
  const result = validate({ items });
  assert.equal(result.errors.items?.["BONUS"], undefined);
});

// --- "Other" rows (reused from commercial-details-validation.ts) --------------

test("a fully empty Other row is ignored", () => {
  const result = validate({ otherItems: [{ label: "", amount: "", itemType: "" }] });
  assert.equal(result.errors.otherItems, undefined);
});

test("a label with no amount blocks Save", () => {
  const result = validate({
    otherItems: [{ label: "Extra Bonus", amount: "", itemType: "ALLOWANCE" }],
  });
  assert.ok(result.errors.otherItems?.[0]?.amount);
});

test("two Other rows with the same label are both rejected", () => {
  const result = validate({
    otherItems: [
      { label: "Extra", amount: "100", itemType: "ALLOWANCE" },
      { label: "extra", amount: "200", itemType: "DEDUCTION" },
    ],
  });
  assert.ok(result.errors.otherItems?.[0]?.label);
  assert.ok(result.errors.otherItems?.[1]?.label);
});
