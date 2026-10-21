/**
 * Purpose: What a stored payroll answer means to a reader, by the item's value
 * kind (SPEC-23 §2, D143). It holds the percentage rule PF / ESI answers must
 * pass, and the one formatter the web app, the Excel export and both PDFs use,
 * so a PF of 12 can never read as "₹ 12" on one surface and "12%" on another.
 */

import type { PayrollValueKind } from "./payroll-items.ts";

/** SPEC-23 §2.3: 0 to 100 with at most 2 decimals; "100.5" fails the range check below. */
const PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;
const MAX_PERCENT = 100;

/** Shown for an applicable amount the record does not actually hold. */
const MISSING_VALUE = "—";
/** SPEC-23 D144: a statutory item an MOU saved before SPEC-23 has no answer for. */
const NOT_RECORDED = "Not recorded";

/** An empty string is not validated here - the caller decides whether blank is allowed. */
export function validatePercentString(value: string): string | undefined {
  if (!PERCENT_PATTERN.test(value) || Number(value) > MAX_PERCENT) {
    return "Enter a percentage from 0 to 100 with at most 2 decimal places";
  }
  return undefined;
}

/** The two TDS options (D143): is_applicable true / false. */
export function payrollStatusLabel(isApplicable: boolean): string {
  return isApplicable ? "As applicable" : "Not applicable";
}

/** "12.00" -> "12%", "7.50" -> "7.5%". Only a well-formed number is trimmed. */
export function formatPercent(value: string): string {
  const trimmed = /^\d+\.\d+$/.test(value) ? value.replace(/\.?0+$/, "") : value;
  return `${trimmed}%`;
}

/**
 * The SPEC-23 §2.4 display text of one payroll answer. `isApplicable` null means
 * no answer is stored at all (D144). `currency` lets a PDF written in a standard
 * font, which has no ₹ glyph, print "Rs." instead.
 */
export function formatPayrollValue(
  valueKind: PayrollValueKind,
  amount: string | null,
  isApplicable: boolean | null,
  currency = "₹",
): string {
  if (isApplicable === null) return NOT_RECORDED;
  if (valueKind === "STATUS" || !isApplicable) return payrollStatusLabel(isApplicable);
  if (amount === null || amount.trim() === "") return MISSING_VALUE;
  return valueKind === "PERCENT" ? formatPercent(amount) : `${currency} ${amount}/mo`;
}

/** A wizard / snapshot answer; isApplicable undefined means not yet answered. */
export interface PayrollAnswerLike {
  readonly isApplicable: boolean | undefined;
  readonly amount: string;
}

/**
 * The compact Yes / No text the history views and the version compare show:
 * "Yes (1500)", "Yes (12%)", "No" - and TDS by its status. An unanswered TDS
 * (an MOU saved before SPEC-23, D144) reads "—" rather than a status it never had.
 */
export function payrollAnswerText(valueKind: PayrollValueKind, answer: PayrollAnswerLike | undefined): string {
  if (valueKind === "STATUS") {
    return answer?.isApplicable === undefined ? MISSING_VALUE : payrollStatusLabel(answer.isApplicable);
  }
  if (answer?.isApplicable !== true) return "No";
  const amount = answer.amount.trim();
  if (amount === "") return `Yes (${MISSING_VALUE})`;
  return `Yes (${valueKind === "PERCENT" ? formatPercent(amount) : amount})`;
}
