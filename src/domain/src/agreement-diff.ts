/**
 * Purpose: The field-by-field comparison SPEC-11 section 2.4 needs between
 * two agreement snapshots (a past `agreement_history` row, or the current
 * live state) - every field is returned with a `changed` flag rather than
 * only the changed ones, so a caller can implement AC6's "hidden by default,
 * toggle to show all" without a second code path. Pure and I/O-free like
 * every other layer-0 module, so the same function can run in the browser
 * (a future compare-screen preview) and on the server (the compare
 * endpoint) without disagreeing on what counts as a change.
 */

import { COMMERCIAL_FIXED_ITEM_KEYS, COMMERCIAL_ITEM_BY_KEY } from "./commercial-items.ts";
import type { CommercialDetails } from "./commercial-details-validation.ts";
import { PAYROLL_FIXED_ITEM_KEYS, PAYROLL_ITEM_BY_KEY } from "./payroll-items.ts";
import type { PayrollDetails } from "./payroll-details-validation.ts";
import { payrollAnswerText } from "./payroll-value.ts";

export interface AgreementSnapshot {
  readonly commercial: CommercialDetails;
  readonly payroll: PayrollDetails;
}

export interface DiffRow {
  readonly field: string;
  readonly oldValue: string;
  readonly newValue: string;
  readonly changed: boolean;
}

function amountText(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? "—" : trimmed;
}

function otherItemsText(items: readonly { label: string; amount: string; itemType: string }[]): string {
  if (items.length === 0) {
    return "—";
  }
  return [...items]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((row) => `${row.label} (${row.itemType}): ${row.amount}`)
    .join("; ");
}

function row(field: string, oldValue: string, newValue: string): DiffRow {
  return { field, oldValue, newValue, changed: oldValue !== newValue };
}

/** Every field of both snapshots, each row flagged `changed` - AC6/AC7. */
export function computeAgreementDiff(before: AgreementSnapshot, after: AgreementSnapshot): DiffRow[] {
  const rows: DiffRow[] = [];

  rows.push(row("MOU Start Date", before.commercial.mouStartDate, after.commercial.mouStartDate));
  rows.push(
    row(
      "Tenure",
      `${before.commercial.tenureValue} ${before.commercial.tenureUnit}`,
      `${after.commercial.tenureValue} ${after.commercial.tenureUnit}`,
    ),
  );
  rows.push(row("Attendance Cycle", before.commercial.attendanceCycle, after.commercial.attendanceCycle));
  rows.push(row("Stipend Date", before.commercial.stipendDate, after.commercial.stipendDate));

  for (const key of COMMERCIAL_FIXED_ITEM_KEYS) {
    rows.push(
      row(
        COMMERCIAL_ITEM_BY_KEY[key].label,
        amountText(before.commercial.charges[key]),
        amountText(after.commercial.charges[key]),
      ),
    );
  }
  rows.push(row("Other Charges", otherItemsText(before.commercial.otherItems), otherItemsText(after.commercial.otherItems)));

  rows.push(
    row(
      "Trainee Categories",
      [...before.payroll.traineeCategories].sort().join(", ") || "—",
      [...after.payroll.traineeCategories].sort().join(", ") || "—",
    ),
  );

  for (const key of PAYROLL_FIXED_ITEM_KEYS) {
    const { label, valueKind } = PAYROLL_ITEM_BY_KEY[key];
    rows.push(row(label, payrollAnswerText(valueKind, before.payroll.items[key]), payrollAnswerText(valueKind, after.payroll.items[key])));
  }
  rows.push(row("Other Payroll Items", otherItemsText(before.payroll.otherItems), otherItemsText(after.payroll.otherItems)));

  return rows;
}
