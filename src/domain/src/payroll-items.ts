/**
 * Purpose: The fixed catalogue of payroll items from SPEC-01 section 4 - the 22
 * fixed items plus the repeatable "Other" row. It is the source of truth for the
 * item_key CHECK constraint on payroll_item (section 5.8), for the partial unique
 * index that permits exactly one row per fixed key per payroll config, and for the
 * display order the UI must not hardcode. Section 4 classifies everything as an
 * allowance except Document Fee and Registration Fee, which are amounts recovered
 * from the trainee, so those two are deductions; itemType is null only for
 * "Other", where the user chooses.
 */

import type { ItemType } from "./enums.ts";

const OTHER_ITEM_KEY = "OTHER";

export const PAYROLL_ITEM_KEYS = [
  "ATTENDANCE_BONUS",
  "FIRST_YEAR_ALLOWANCE",
  "SECOND_YEAR_ALLOWANCE",
  "THIRD_YEAR_ALLOWANCE",
  "ACCOMMODATION_ALLOWANCE",
  "ARREARS",
  "BONUS",
  "CANTEEN_ALLOWANCE",
  "CONVEYANCE",
  "DOCUMENT_FEE",
  "EDUCATION_ALLOWANCE",
  "EX_GRATIA",
  "FOUNDRY_ALLOWANCE",
  "LEAVE_ENCASHMENT",
  "LEAVE_WITH_WAGES",
  "NIGHT_SHIFT_ALLOWANCE",
  "REIMBURSEMENT_OF_EDUCATION_CHARGES",
  "SPECIAL_ALLOWANCE",
  "REGISTRATION_FEE",
  "TRAVELLING_ALLOWANCE",
  "UNIFORM_REFUND",
  "WASHING_ALLOWANCE",
  "OTHER",
] as const;

export type PayrollItemKey = (typeof PAYROLL_ITEM_KEYS)[number];

export type FixedPayrollItemKey = Exclude<PayrollItemKey, typeof OTHER_ITEM_KEY>;

export interface PayrollItemDefinition {
  readonly key: PayrollItemKey;
  readonly label: string;
  /** The section 4 item type, or null for "Other" where the user selects one. */
  readonly itemType: ItemType | null;
  /** The `#` column of section 4 - served to the UI so it never hardcodes order. */
  readonly displayOrder: number;
}

export const PAYROLL_ITEMS: readonly PayrollItemDefinition[] = [
  { key: "ATTENDANCE_BONUS", label: "Attendance Bonus", itemType: "ALLOWANCE", displayOrder: 1 },
  { key: "FIRST_YEAR_ALLOWANCE", label: "1st Year Allowance", itemType: "ALLOWANCE", displayOrder: 2 },
  { key: "SECOND_YEAR_ALLOWANCE", label: "2nd Year Allowance", itemType: "ALLOWANCE", displayOrder: 3 },
  { key: "THIRD_YEAR_ALLOWANCE", label: "3rd Year Allowance", itemType: "ALLOWANCE", displayOrder: 4 },
  {
    key: "ACCOMMODATION_ALLOWANCE",
    label: "Accommodation Allowance",
    itemType: "ALLOWANCE",
    displayOrder: 5,
  },
  { key: "ARREARS", label: "Arrears", itemType: "ALLOWANCE", displayOrder: 6 },
  { key: "BONUS", label: "Bonus", itemType: "ALLOWANCE", displayOrder: 7 },
  { key: "CANTEEN_ALLOWANCE", label: "Canteen Allowance", itemType: "ALLOWANCE", displayOrder: 8 },
  { key: "CONVEYANCE", label: "Conveyance", itemType: "ALLOWANCE", displayOrder: 9 },
  { key: "DOCUMENT_FEE", label: "Document Fee", itemType: "DEDUCTION", displayOrder: 10 },
  { key: "EDUCATION_ALLOWANCE", label: "Education Allowance", itemType: "ALLOWANCE", displayOrder: 11 },
  { key: "EX_GRATIA", label: "Ex-Gratia", itemType: "ALLOWANCE", displayOrder: 12 },
  { key: "FOUNDRY_ALLOWANCE", label: "Foundry Allowance", itemType: "ALLOWANCE", displayOrder: 13 },
  { key: "LEAVE_ENCASHMENT", label: "Leave Encashment", itemType: "ALLOWANCE", displayOrder: 14 },
  { key: "LEAVE_WITH_WAGES", label: "Leave With Wages", itemType: "ALLOWANCE", displayOrder: 15 },
  {
    key: "NIGHT_SHIFT_ALLOWANCE",
    label: "Night Shift Allowance",
    itemType: "ALLOWANCE",
    displayOrder: 16,
  },
  {
    key: "REIMBURSEMENT_OF_EDUCATION_CHARGES",
    label: "Reimbursement of Education Charges",
    itemType: "ALLOWANCE",
    displayOrder: 17,
  },
  { key: "SPECIAL_ALLOWANCE", label: "Special Allowance", itemType: "ALLOWANCE", displayOrder: 18 },
  { key: "REGISTRATION_FEE", label: "Registration Fee", itemType: "DEDUCTION", displayOrder: 19 },
  {
    key: "TRAVELLING_ALLOWANCE",
    label: "Travelling Allowance",
    itemType: "ALLOWANCE",
    displayOrder: 20,
  },
  { key: "UNIFORM_REFUND", label: "Uniform Refund", itemType: "ALLOWANCE", displayOrder: 21 },
  { key: "WASHING_ALLOWANCE", label: "Washing Allowance", itemType: "ALLOWANCE", displayOrder: 22 },
  { key: "OTHER", label: "Other", itemType: null, displayOrder: 23 },
];

export const PAYROLL_ITEM_BY_KEY: Readonly<Record<PayrollItemKey, PayrollItemDefinition>> =
  Object.fromEntries(PAYROLL_ITEMS.map((item) => [item.key, item])) as Readonly<
    Record<PayrollItemKey, PayrollItemDefinition>
  >;

/**
 * The keys the partial unique index constrains: exactly one row per fixed key per
 * payroll config, while "Other" rows repeat freely.
 */
export const PAYROLL_FIXED_ITEM_KEYS: readonly FixedPayrollItemKey[] = PAYROLL_ITEM_KEYS.filter(
  (key): key is FixedPayrollItemKey => key !== OTHER_ITEM_KEY,
);
