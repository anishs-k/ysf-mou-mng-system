/**
 * Purpose: Defines the Money type used wherever an amount crosses a boundary in
 * SPEC-01 section 6.4. Amounts are NUMERIC(12,2) in Postgres and a plain string in
 * TypeScript - never a number - so a float can never damage a rupee value. The
 * branded type turns an accidental Number() conversion into a compile error, which
 * is what decision D10 requires. No spec performs arithmetic on money, so no
 * decimal library is introduced; SPEC-13 is the single place a numeric conversion
 * happens, at the point of writing an Excel cell.
 */

export type Money = string & { readonly __money: unique symbol };

/** NUMERIC(12,2) allows 10 integer digits, but SPEC-05 section 3 caps every
 * charge amount at 9,999,999.99 (7 integer digits) — a stricter business rule
 * the column alone cannot enforce, since Postgres would silently round a
 * third decimal place rather than reject it. */
const AMOUNT_PATTERN = /^\d{1,7}(\.\d{1,2})?$/;

/**
 * Shared by every optional-amount field across the wizard (SPEC-05 charges,
 * later SPEC-06 payroll items, SPEC-09) so "non-negative, at most 2 decimal
 * places, at most 9,999,999.99" is one rule instead of one per caller. An
 * empty string is not validated here — "blank is fine" is a per-field
 * decision the caller makes before calling this.
 */
export function validateAmountString(value: string): string | undefined {
  if (!AMOUNT_PATTERN.test(value)) {
    return "Enter a non-negative amount with at most 2 decimal places, up to 9,999,999.99";
  }
  return undefined;
}
