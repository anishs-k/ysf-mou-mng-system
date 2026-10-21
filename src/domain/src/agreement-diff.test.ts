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
      items: { ESI: { isApplicable: true, amount: "0.75" } },
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

test("every fixed commercial charge and payroll item appears exactly once", () => {
  // Total row count is fixed: 4 MOU scalars + 9 charges (D153) + 1 "Other
  // Charges" + trainee categories + 3 payroll items (PF, ESI, TDS - D158) + 1
  // "Other Payroll Items" (kept so older history entries still read). A commercial charge and a payroll item can legitimately share a
  // display label (e.g. "Document Fee" exists in both catalogues) since the
  // real UI renders the two sections separately, so uniqueness is checked
  // per section rather than across the whole flat list.
  const snapshot = baseSnapshot();
  const rows = computeAgreementDiff(snapshot, snapshot);
  assert.equal(rows.length, 4 + 10 + 1 + 4);

  const commercialFields = rows.slice(0, 4 + 10).map((r) => r.field);
  assert.equal(new Set(commercialFields).size, commercialFields.length);

  const payrollFields = rows.slice(4 + 10 + 1).map((r) => r.field);
  assert.equal(new Set(payrollFields).size, payrollFields.length);
});

test("SPEC-23 a PF percentage is reported with a % sign", () => {
  const before = baseSnapshot();
  const after = {
    ...before,
    payroll: { ...before.payroll, items: { ...before.payroll.items, PF: { isApplicable: true, amount: "12.00" } } },
  };
  const pfRow = computeAgreementDiff(before, after).find((r) => r.field === "Provident Fund (PF)");
  assert.equal(pfRow?.changed, true);
  assert.equal(pfRow?.oldValue, "No");
  assert.equal(pfRow?.newValue, "Yes (12%)");
});

test("SPEC-23 TDS is reported by its status, never as Yes / No", () => {
  const before = baseSnapshot();
  const notApplicable = { ...before, payroll: { ...before.payroll, items: { ...before.payroll.items, TDS: { isApplicable: false, amount: "" } } } };
  const asApplicable = { ...before, payroll: { ...before.payroll, items: { ...before.payroll.items, TDS: { isApplicable: true, amount: "" } } } };
  const tdsRow = computeAgreementDiff(notApplicable, asApplicable).find((r) => r.field === "TDS");
  assert.equal(tdsRow?.oldValue, "Not applicable");
  assert.equal(tdsRow?.newValue, "As applicable");
});

test("SPEC-23 an old snapshot without TDS reads as unanswered, not as Not applicable", () => {
  const before = baseSnapshot();
  const after = { ...before, payroll: { ...before.payroll, items: { ...before.payroll.items, TDS: { isApplicable: true, amount: "" } } } };
  const tdsRow = computeAgreementDiff(before, after).find((r) => r.field === "TDS");
  assert.equal(tdsRow?.oldValue, "—");
});
