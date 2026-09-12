/**
 * Purpose: Unit tests for SPEC-11's `computeAgreementDiff` - AC6 (only
 * changed fields matter by default, but every field is returned so the
 * caller can implement the "show all" toggle) and AC7 (comparing against a
 * freshly-fetched current state is the same function, no special case).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeAgreementDiff } from "./agreement-diff.ts";
import type { AgreementSnapshot } from "./agreement-diff.ts";

function baseSnapshot(): AgreementSnapshot {
  return {
    commercial: {
      mouStartDate: "2026-01-01",
      tenureValue: "12",
      tenureUnit: "MONTHS",
      attendanceCycle: "Monthly",
      stipendDate: "5",
      charges: { ADMIN_CHARGES: "100.00" },
      otherItems: [],
      hasMouDocument: true,
    },
    payroll: {
      scheme: "WILP",
      traineeCategories: ["Category A"],
      items: { BONUS: { isApplicable: true, amount: "500.00" } },
      otherItems: [],
    },
  };
}

test("AC6 an unchanged snapshot produces only changed:false rows", () => {
  const snapshot = baseSnapshot();
  const rows = computeAgreementDiff(snapshot, snapshot);
  assert.ok(rows.every((r) => !r.changed));
});

test("AC6 a changed tenure is reported as one changed row, other rows stay unchanged", () => {
  const before = baseSnapshot();
  const after = { ...before, commercial: { ...before.commercial, tenureValue: "24" } };
  const rows = computeAgreementDiff(before, after);
  const tenureRow = rows.find((r) => r.field === "Tenure");
  assert.equal(tenureRow?.changed, true);
  assert.equal(tenureRow?.oldValue, "12 MONTHS");
  assert.equal(tenureRow?.newValue, "24 MONTHS");
  assert.equal(rows.filter((r) => r.changed).length, 1);
});

test("a charge that goes from blank to an amount is reported as changed with a '—' old value", () => {
  const before = baseSnapshot();
  const after = { ...before, commercial: { ...before.commercial, charges: { ...before.commercial.charges, INSURANCE: "50" } } };
  const rows = computeAgreementDiff(before, after);
  const insuranceRow = rows.find((r) => r.field === "Insurance");
  assert.equal(insuranceRow?.changed, true);
  assert.equal(insuranceRow?.oldValue, "—");
  assert.equal(insuranceRow?.newValue, "50");
});

test("a payroll item flipped from No to Yes is reported with its amount", () => {
  const before = baseSnapshot();
  const after = {
    ...before,
    payroll: { ...before.payroll, items: { ...before.payroll.items, ARREARS: { isApplicable: true, amount: "200" } } },
  };
  const rows = computeAgreementDiff(before, after);
  const arrearsRow = rows.find((r) => r.field === "Arrears");
  assert.equal(arrearsRow?.changed, true);
  assert.equal(arrearsRow?.oldValue, "No");
  assert.equal(arrearsRow?.newValue, "Yes (200)");
});

test("every fixed commercial charge and payroll item appears exactly once", () => {
  // Total row count is fixed: 4 MOU scalars + 16 charges + 1 "Other
  // Charges" + trainee categories + 22 payroll items + 1 "Other Payroll
  // Items". A commercial charge and a payroll item can legitimately share a
  // display label (e.g. "Document Fee" exists in both catalogues) since the
  // real UI renders the two sections separately, so uniqueness is checked
  // per section rather than across the whole flat list.
  const snapshot = baseSnapshot();
  const rows = computeAgreementDiff(snapshot, snapshot);
  assert.equal(rows.length, 4 + 17 + 1 + 23);

  const commercialFields = rows.slice(0, 4 + 17).map((r) => r.field);
  assert.equal(new Set(commercialFields).size, commercialFields.length);

  const payrollFields = rows.slice(4 + 17 + 1).map((r) => r.field);
  assert.equal(new Set(payrollFields).size, payrollFields.length);
});
