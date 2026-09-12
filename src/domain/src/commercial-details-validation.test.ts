/**
 * Purpose: Unit tests for the SPEC-05 Page 2 commercial-detail rules. Written
 * before the implementation, per the working rules, and follow SPEC-05 section 6's
 * acceptance criteria. `TODAY` stands in for the caller-supplied current date so
 * the backdate-warning tests are not tied to when the suite happens to run.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { validateCommercialDetails } from "./commercial-details-validation.ts";
import type { CommercialDetails } from "./commercial-details-validation.ts";

const TODAY = "2026-09-12";

const VALID: CommercialDetails = {
  mouStartDate: "2026-01-01",
  tenureValue: "24",
  tenureUnit: "MONTHS",
  attendanceCycle: "Monthly",
  stipendDate: "5",
  charges: {},
  otherItems: [],
  hasMouDocument: true,
};

function validate(overrides: Partial<CommercialDetails> = {}) {
  return validateCommercialDetails({ ...VALID, ...overrides }, TODAY);
}

test("a complete valid record produces neither errors nor warnings", () => {
  const result = validate();
  assert.deepEqual(result.errors, {});
  assert.deepEqual(result.warnings, {});
});

// --- MOU Start Date / backdate warning ----------------------------------------

test("a missing start date is required", () => {
  assert.ok(validate({ mouStartDate: "" }).errors.mouStartDate);
});

test("a malformed start date is rejected", () => {
  assert.ok(validate({ mouStartDate: "2026-13-40" }).errors.mouStartDate);
});

test("a start date backdated more than 365 days warns but does not block", () => {
  const result = validate({ mouStartDate: "2025-01-01" });
  assert.equal(result.errors.mouStartDate, undefined);
  assert.ok(result.warnings.mouStartDate);
});

test("a start date backdated 365 days or fewer does not warn", () => {
  const result = validate({ mouStartDate: "2025-09-13" });
  assert.equal(result.warnings.mouStartDate, undefined);
});

// --- AC4-adjacent: tenure range -------------------------------------------------

test("120 months is accepted, 121 is rejected", () => {
  assert.equal(validate({ tenureValue: "120", tenureUnit: "MONTHS" }).errors.tenureValue, undefined);
  assert.ok(validate({ tenureValue: "121", tenureUnit: "MONTHS" }).errors.tenureValue);
});

test("10 years is accepted, 11 is rejected", () => {
  assert.equal(validate({ tenureValue: "10", tenureUnit: "YEARS" }).errors.tenureValue, undefined);
  assert.ok(validate({ tenureValue: "11", tenureUnit: "YEARS" }).errors.tenureValue);
});

test("a zero or negative tenure value is rejected", () => {
  assert.ok(validate({ tenureValue: "0" }).errors.tenureValue);
  assert.ok(validate({ tenureValue: "-5" }).errors.tenureValue);
});

test("a fractional tenure value is rejected", () => {
  assert.ok(validate({ tenureValue: "1.5" }).errors.tenureValue);
});

test("an unknown tenure unit is rejected", () => {
  assert.ok(validate({ tenureUnit: "WEEKS" }).errors.tenureUnit);
});

// --- AC4: Stipend Date ----------------------------------------------------------

test("stipend date 31 is accepted", () => {
  assert.equal(validate({ stipendDate: "31" }).errors.stipendDate, undefined);
});

test("stipend date 0 is rejected", () => {
  assert.ok(validate({ stipendDate: "0" }).errors.stipendDate);
});

test("stipend date 32 is rejected", () => {
  assert.ok(validate({ stipendDate: "32" }).errors.stipendDate);
});

// --- AC5: charge amounts ---------------------------------------------------------

test("a blank charge is accepted (not applicable)", () => {
  assert.equal(validate({ charges: { ADMIN_CHARGES: "" } }).errors.charges, undefined);
});

test("a valid charge amount is accepted", () => {
  assert.equal(validate({ charges: { ADMIN_CHARGES: "1200.50" } }).errors.charges, undefined);
});

test("a negative charge amount is rejected", () => {
  assert.ok(validate({ charges: { ADMIN_CHARGES: "-5" } }).errors.charges?.["ADMIN_CHARGES"]);
});

test("a charge amount with 3 decimal places is rejected", () => {
  assert.ok(validate({ charges: { INSURANCE: "12.345" } }).errors.charges?.["INSURANCE"]);
});

// --- AC7 / AC8: Other rows --------------------------------------------------------

test("a fully empty Other row is ignored", () => {
  const result = validate({ otherItems: [{ label: "", amount: "", itemType: "" }] });
  assert.equal(result.errors.otherItems, undefined);
});

test("AC7 a label with no amount blocks Next", () => {
  const result = validate({
    otherItems: [{ label: "Bonus", amount: "", itemType: "ALLOWANCE" }],
  });
  assert.ok(result.errors.otherItems?.[0]?.amount);
});

test("a fully filled Other row is accepted", () => {
  const result = validate({
    otherItems: [{ label: "Bonus", amount: "500", itemType: "ALLOWANCE" }],
  });
  assert.equal(result.errors.otherItems, undefined);
});

test("AC8 two rows with the same label (case-insensitive) are both rejected", () => {
  const result = validate({
    otherItems: [
      { label: "Bonus", amount: "500", itemType: "ALLOWANCE" },
      { label: "bonus", amount: "300", itemType: "DEDUCTION" },
    ],
  });
  assert.ok(result.errors.otherItems?.[0]?.label);
  assert.ok(result.errors.otherItems?.[1]?.label);
});

test("two different labels are both accepted", () => {
  const result = validate({
    otherItems: [
      { label: "Bonus", amount: "500", itemType: "ALLOWANCE" },
      { label: "Fine", amount: "300", itemType: "DEDUCTION" },
    ],
  });
  assert.equal(result.errors.otherItems, undefined);
});

// --- AC9: MOU PDF ------------------------------------------------------------------

test("AC9 no MOU PDF blocks Next", () => {
  assert.ok(validate({ hasMouDocument: false }).errors.mouDocument);
});

test("a present MOU PDF passes", () => {
  assert.equal(validate({ hasMouDocument: true }).errors.mouDocument, undefined);
});
