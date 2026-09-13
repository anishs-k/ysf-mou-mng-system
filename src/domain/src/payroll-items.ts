/**
 * Purpose: The fixed catalogue of payroll items from SPEC-16 section 2.6, which
 * replaced SPEC-01 section 4's 22-item list under decision D105. It is the source
 * of truth for the item_key CHECK constraint on payroll_item (section 5.8), for the
 * partial unique index that permits exactly one row per fixed key per payroll
 * config, and for the display order the UI must not hardcode.
 *
 * The catalogue holds 23 fixed keys - 8 allowances followed by 15 deductions - plus
 * one shared OTHER key, so 24 entries in all. v2's design showed 25 checkbox labels,
 * but two of them ("Other Allowance" and "Other Deduction") both map onto the single
 * OTHER key: the box the user ticks preselects that row's item_type. Keeping one
 * OTHER key is what preserves the existing
 * `(item_key = 'OTHER') = (custom_label IS NOT NULL)` CHECK and the "Other rows
 * repeat freely" behaviour of the partial unique index.
 *
 * INSURANCE is the only key that carries the insurance sub-model of D108, so its key
 * is exported for the schema's CHECK constraint to reference.
 */

import type { ItemType } from "./enums.ts";

const OTHER_ITEM_KEY = "OTHER";

/** The one key allowed to carry insurance_type and its two amounts (D108). */
export const INSURANCE_ITEM_KEY = "INSURANCE";

export const PAYROLL_ITEM_KEYS = [
  "ATTENDANCE_BONUS",
  "ACCOMMODATION_ALLOWANCE",
  "CONVEYANCE",
  "HRA",
  "BONUS",
  "NIGHT_SHIFT_ALLOWANCE",
  "EDUCATION_ALLOWANCE",
  "INSURANCE",
  "ADMISSION_DEDUCTION",
  "ADVANCE",
  "CANTEEN_DEDUCTION",
  "COUPON_AMOUNT",
  "COURSE_REGISTRATION_FEE",
  "DOCUMENT_FEE",
  "EDUCATION_FEE",
  "EXAM_FEE",
  "INSURANCE_DEDUCTION",
  "JOINING_FEE_DEDUCTION",
  "LEFT_DEDUCTION",
  "SHOES_DEDUCTION",
  "SKILL_DIPLOMA_FEES",
  "TRANSPORTATION_DEDUCTION",
  "UNIFORM_DEDUCTION",
  "OTHER",
] as const;

export type PayrollItemKey = (typeof PAYROLL_ITEM_KEYS)[number];

export type FixedPayrollItemKey = Exclude<PayrollItemKey, typeof OTHER_ITEM_KEY>;

export interface PayrollItemDefinition {
  readonly key: PayrollItemKey;
  readonly label: string;
  /** The section 2.6 item type, or null for "Other" where the user selects one. */
  readonly itemType: ItemType | null;
  /** The `#` column of section 2.6 - served to the UI so it never hardcodes order. */
  readonly displayOrder: number;
}

export const PAYROLL_ITEMS: readonly PayrollItemDefinition[] = [
  { key: "ATTENDANCE_BONUS", label: "Attendance Bonus", itemType: "ALLOWANCE", displayOrder: 1 },
  {
    key: "ACCOMMODATION_ALLOWANCE",
    label: "Accommodation Allowance",
    itemType: "ALLOWANCE",
    displayOrder: 2,
  },
  { key: "CONVEYANCE", label: "Conveyance", itemType: "ALLOWANCE", displayOrder: 3 },
  { key: "HRA", label: "HRA", itemType: "ALLOWANCE", displayOrder: 4 },
  { key: "BONUS", label: "Bonus", itemType: "ALLOWANCE", displayOrder: 5 },
  {
    key: "NIGHT_SHIFT_ALLOWANCE",
    label: "Night Shift Allowance",
    itemType: "ALLOWANCE",
    displayOrder: 6,
  },
  {
    key: "EDUCATION_ALLOWANCE",
    label: "Education Allowance",
    itemType: "ALLOWANCE",
    displayOrder: 7,
  },
  { key: "INSURANCE", label: "Insurance", itemType: "ALLOWANCE", displayOrder: 8 },
  {
    key: "ADMISSION_DEDUCTION",
    label: "Admission Deduction",
    itemType: "DEDUCTION",
    displayOrder: 9,
  },
  { key: "ADVANCE", label: "Advance", itemType: "DEDUCTION", displayOrder: 10 },
  { key: "CANTEEN_DEDUCTION", label: "Canteen Deduction", itemType: "DEDUCTION", displayOrder: 11 },
  { key: "COUPON_AMOUNT", label: "Coupon Amount", itemType: "DEDUCTION", displayOrder: 12 },
  {
    key: "COURSE_REGISTRATION_FEE",
    label: "Course Registration Fee",
    itemType: "DEDUCTION",
    displayOrder: 13,
  },
  { key: "DOCUMENT_FEE", label: "Document Fee", itemType: "DEDUCTION", displayOrder: 14 },
  { key: "EDUCATION_FEE", label: "Education Fee", itemType: "DEDUCTION", displayOrder: 15 },
  { key: "EXAM_FEE", label: "Exam Fee", itemType: "DEDUCTION", displayOrder: 16 },
  { key: "INSURANCE_DEDUCTION", label: "Insurance Deduction", itemType: "DEDUCTION", displayOrder: 17 },
  {
    key: "JOINING_FEE_DEDUCTION",
    label: "Joining Fee Deduction",
    itemType: "DEDUCTION",
    displayOrder: 18,
  },
  { key: "LEFT_DEDUCTION", label: "Left Deduction", itemType: "DEDUCTION", displayOrder: 19 },
  { key: "SHOES_DEDUCTION", label: "Shoes Deduction", itemType: "DEDUCTION", displayOrder: 20 },
  {
    key: "SKILL_DIPLOMA_FEES",
    label: "Skill Diploma Fees",
    itemType: "DEDUCTION",
    displayOrder: 21,
  },
  {
    key: "TRANSPORTATION_DEDUCTION",
    label: "Transportation Deduction",
    itemType: "DEDUCTION",
    displayOrder: 22,
  },
  { key: "UNIFORM_DEDUCTION", label: "Uniform Deduction", itemType: "DEDUCTION", displayOrder: 23 },
  { key: "OTHER", label: "Other", itemType: null, displayOrder: 24 },
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
