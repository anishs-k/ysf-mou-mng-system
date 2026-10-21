/**
 * Purpose: Unit tests for the SPEC-06 Page 3 payroll-detail rules. Written
 * before the implementation, per the working rules, and follow SPEC-06 section
 * 7's acceptance criteria.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { PAYROLL_FIXED_ITEM_KEYS } from "./payroll-items.ts";
import { STATUTORY_DEFAULTS, validatePayrollDetails, withStatutoryDefaults } from "./payroll-details-validation.ts";
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
  items["ESI"] = { isApplicable: false, amount: "" };
  const result = validate({ items });
  assert.equal(result.errors.items?.["THIRD_YEAR_ALLOWANCE"], undefined);
});

test("AC3 Yes with an empty amount blocks Save", () => {
  const items = allAnsweredNo();
  items["PF"] = { isApplicable: true, amount: "" };
  const result = validate({ items });
  assert.ok(result.errors.items?.["PF"]);
});

test("AC3 Yes with a valid amount is accepted", () => {
  const items = allAnsweredNo();
  items["PF"] = { isApplicable: true, amount: "12" };
  const result = validate({ items });
  assert.equal(result.errors.items?.["PF"], undefined);
});

test("Yes with a negative amount is rejected", () => {
  const items = allAnsweredNo();
  items["PF"] = { isApplicable: true, amount: "-5" };
  const result = validate({ items });
  assert.ok(result.errors.items?.["PF"]);
});

test("AC4 No ignores a stray amount value", () => {
  const items = allAnsweredNo();
  items["PF"] = { isApplicable: false, amount: "500" };
  const result = validate({ items });
  assert.equal(result.errors.items?.["PF"], undefined);
});

// --- "Other" rows (reused from commercial-details-validation.ts) --------------

test("a fully empty Other row is ignored", () => {
  const result = validate({ otherItems: [{ label: "", amount: "", itemType: "" }] });
  assert.equal(result.errors.otherItems, undefined);
});

test("D158 any filled Other payroll row is refused - custom payroll items are no longer recorded", () => {
  const result = validate({
    otherItems: [{ label: "Extra Bonus", amount: "100", itemType: "ALLOWANCE" }],
  });
  assert.equal(result.errors.otherItems?.[0]?.label, "Other payroll items are no longer recorded");
});

// --- Optional per-category details (qualification, stipend rate) ------------------

test("a record without traineeCategoryDetails stays valid (backward compatible)", () => {
  assert.deepEqual(validate({ traineeCategoryDetails: undefined }).errors, {});
});

test("details for an existing category with a qualification and stipend rate are accepted", () => {
  const result = validate({
    traineeCategoryDetails: [{ categoryName: "category a", qualification: "ITI", stipendRate: "12000.50" }],
  });
  assert.deepEqual(result.errors, {});
});

test("blank qualification and stipend rate are treated as not given", () => {
  const result = validate({
    traineeCategoryDetails: [{ categoryName: "Category A", qualification: "", stipendRate: "" }],
  });
  assert.deepEqual(result.errors, {});
});

test("a malformed stipend rate is rejected with the shared money rule", () => {
  const result = validate({
    traineeCategoryDetails: [{ categoryName: "Category A", stipendRate: "12.345" }],
  });
  assert.ok(result.errors.traineeCategoryDetails?.[0]?.stipendRate);
});

test("a qualification longer than 150 characters is rejected", () => {
  const result = validate({
    traineeCategoryDetails: [{ categoryName: "Category A", qualification: "x".repeat(151) }],
  });
  assert.ok(result.errors.traineeCategoryDetails?.[0]?.qualification);
});

test("details naming a category that is not in traineeCategories are rejected", () => {
  const result = validate({
    traineeCategoryDetails: [{ categoryName: "Category Z", qualification: "ITI" }],
  });
  assert.ok(result.errors.traineeCategoryDetails?.[0]?.categoryName);
});

// --- SPEC-23: PF / ESI percentages and the TDS status ---------------------------

function withItem(key: string, answer: PayrollItemAnswer) {
  return validate({ items: { ...allAnsweredNo(), [key]: answer } });
}

test("SPEC-23 PF and ESI accept a percentage from 0 to 100 with up to 2 decimals", () => {
  for (const amount of ["0", "12", "0.75", "100", "100.00"]) {
    assert.equal(withItem("PF", { isApplicable: true, amount }).errors.items, undefined, `PF ${amount}`);
    assert.equal(withItem("ESI", { isApplicable: true, amount }).errors.items, undefined, `ESI ${amount}`);
  }
});

test("SPEC-23 AC2 a percentage above 100 is rejected", () => {
  assert.ok(withItem("PF", { isApplicable: true, amount: "100.01" }).errors.items?.["PF"]);
  assert.ok(withItem("ESI", { isApplicable: true, amount: "250" }).errors.items?.["ESI"]);
});

test("SPEC-23 a malformed percentage is rejected", () => {
  for (const amount of ["12%", "-1", "1.234", "abc"]) {
    assert.ok(withItem("PF", { isApplicable: true, amount }).errors.items?.["PF"], amount);
  }
});

test("SPEC-23 PF answered Yes without a percentage is required", () => {
  assert.equal(withItem("PF", { isApplicable: true, amount: "" }).errors.items?.["PF"], "Required");
});

test("SPEC-23 TDS As applicable needs no amount", () => {
  assert.equal(withItem("TDS", { isApplicable: true, amount: "" }).errors.items, undefined);
});

test("SPEC-23 TDS Not applicable is a valid answer", () => {
  assert.equal(withItem("TDS", { isApplicable: false, amount: "" }).errors.items, undefined);
});

test("SPEC-23 AC6 an unanswered PF, ESI or TDS is still an error", () => {
  const items: Record<string, PayrollItemAnswer> = allAnsweredNo();
  delete items["PF"];
  delete items["ESI"];
  delete items["TDS"];
  const errors = validate({ items }).errors.items ?? {};
  assert.deepEqual(Object.keys(errors).sort(), ["ESI", "PF", "TDS"]);
});

// --- SPEC-23 D148: statutory defaults ------------------------------------------------

test("D148 the defaults are PF 12%, ESI 0.75% and TDS As applicable", () => {
  assert.deepEqual(STATUTORY_DEFAULTS, {
    PF: { isApplicable: true, amount: "12.00" },
    ESI: { isApplicable: true, amount: "0.75" },
    TDS: { isApplicable: true, amount: "" },
  });
});

test("D148 missing PF, ESI and TDS answers are filled with the defaults", () => {
  const items: Record<string, PayrollItemAnswer> = allAnsweredNo();
  delete items["PF"];
  delete items["ESI"];
  delete items["TDS"];
  const filled = withStatutoryDefaults(items);
  assert.deepEqual(filled["PF"], { isApplicable: true, amount: "12.00" });
  assert.deepEqual(filled["ESI"], { isApplicable: true, amount: "0.75" });
  assert.deepEqual(filled["TDS"], { isApplicable: true, amount: "" });
  assert.deepEqual(validate({ items: filled }).errors, {});
});

test("D148 an unanswered statutory item (isApplicable undefined) is defaulted too", () => {
  const filled = withStatutoryDefaults({ PF: { isApplicable: undefined, amount: "" } });
  assert.deepEqual(filled["PF"], { isApplicable: true, amount: "12.00" });
});

test("D148 an explicit answer is never overwritten, No included", () => {
  const filled = withStatutoryDefaults({
    PF: { isApplicable: true, amount: "10" },
    ESI: { isApplicable: false, amount: "" },
    TDS: { isApplicable: false, amount: "" },
  });
  assert.deepEqual(filled["PF"], { isApplicable: true, amount: "10" });
  assert.deepEqual(filled["ESI"], { isApplicable: false, amount: "" });
  assert.deepEqual(filled["TDS"], { isApplicable: false, amount: "" });
});

test("D148 other items are left exactly as given, and the input is not mutated", () => {
  const items = { HRA: { isApplicable: undefined, amount: "" } };
  const filled = withStatutoryDefaults(items);
  assert.deepEqual(filled["HRA"], { isApplicable: undefined, amount: "" });
  assert.equal("PF" in items, false);
});
