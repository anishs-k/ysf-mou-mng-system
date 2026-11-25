/**
 * Purpose: The fixed catalogue of commercial charge items from SPEC-01 section 3 -
 * the 16 fixed charges plus the repeatable "Other" row. It is the source of truth
 * for the item_key CHECK constraint on commercial_item (section 5.5), for the
 * partial unique index that permits exactly one row per fixed key, and for the
 * display order the UI must not hardcode. Section 3 fixes the item type for every
 * key except "Other", where the user chooses, so itemType is null only there.
 * D153 keeps only the 9 core charges (Admin ... One Time Registration Fees): the 7
 * payroll-style deductions were never used and migration 0017 drops them.
 * SPEC-31 adds the three YSI fees the client MoU sheet tracks as their own columns
 * (Examination, Employability Skill Test, MSBTE Affiliation).
 */

import type { ItemType } from "./enums.ts";

const OTHER_ITEM_KEY = "OTHER";

export const COMMERCIAL_ITEM_KEYS = [
  "ADMIN_CHARGES",
  "INSURANCE",
  "SHOES_AND_UNIFORM",
  "SUPERVISOR_CHARGES",
  "SOURCING_CHARGES",
  "EDUCATION_CHARGES",
  "TRAINING_CHARGES",
  "ASSESSMENT_CHARGES",
  "ONE_TIME_REGISTRATION_FEES",
  "EXAMINATION_FEES",
  "EMPLOYABILITY_TEST_FEES",
  "MSBTE_AFFILIATION_FEES",
  "OTHER",
] as const;

export type CommercialItemKey = (typeof COMMERCIAL_ITEM_KEYS)[number];

export type FixedCommercialItemKey = Exclude<CommercialItemKey, typeof OTHER_ITEM_KEY>;

export interface CommercialItemDefinition {
  readonly key: CommercialItemKey;
  readonly label: string;
  /** The section 3 item type, or null for "Other" where the user selects one. */
  readonly itemType: ItemType | null;
  /** The `#` column of section 3 - served to the UI so it never hardcodes order. */
  readonly displayOrder: number;
}

export const COMMERCIAL_ITEMS: readonly CommercialItemDefinition[] = [
  { key: "ADMIN_CHARGES", label: "Admin Charges", itemType: "DEDUCTION", displayOrder: 1 },
  { key: "INSURANCE", label: "Insurance", itemType: "DEDUCTION", displayOrder: 2 },
  { key: "SHOES_AND_UNIFORM", label: "Shoes and Uniform", itemType: "DEDUCTION", displayOrder: 3 },
  { key: "SUPERVISOR_CHARGES", label: "Supervisor Charges", itemType: "DEDUCTION", displayOrder: 4 },
  { key: "SOURCING_CHARGES", label: "Sourcing Charges", itemType: "DEDUCTION", displayOrder: 5 },
  // SPEC-35: labels follow the client sheet; the old ones are in COMMERCIAL_ITEM_LEGACY_LABELS.
  { key: "EDUCATION_CHARGES", label: "Education Fees", itemType: "DEDUCTION", displayOrder: 6 },
  { key: "TRAINING_CHARGES", label: "Training Charges", itemType: "DEDUCTION", displayOrder: 7 },
  { key: "ASSESSMENT_CHARGES", label: "Assessment Charges", itemType: "DEDUCTION", displayOrder: 8 },
  {
    key: "ONE_TIME_REGISTRATION_FEES",
    label: "Course Registration Fees",
    itemType: "DEDUCTION",
    displayOrder: 9,
  },
  { key: "EXAMINATION_FEES", label: "Examination Fees", itemType: "DEDUCTION", displayOrder: 10 },
  { key: "EMPLOYABILITY_TEST_FEES", label: "Employability Skill Test Fees", itemType: "DEDUCTION", displayOrder: 11 },
  { key: "MSBTE_AFFILIATION_FEES", label: "MSBTE Affiliation Fees", itemType: "DEDUCTION", displayOrder: 12 },
  { key: "OTHER", label: "Other", itemType: null, displayOrder: 13 },
];

export const COMMERCIAL_ITEM_BY_KEY: Readonly<
  Record<CommercialItemKey, CommercialItemDefinition>
> = Object.fromEntries(
  COMMERCIAL_ITEMS.map((item) => [item.key, item]),
) as Readonly<Record<CommercialItemKey, CommercialItemDefinition>>;

/**
 * The keys the partial unique index constrains: exactly one row per fixed key per
 * MOU, while "Other" rows repeat freely.
 */
export const COMMERCIAL_FIXED_ITEM_KEYS: readonly FixedCommercialItemKey[] =
  COMMERCIAL_ITEM_KEYS.filter((key): key is FixedCommercialItemKey => key !== OTHER_ITEM_KEY);

/**
 * SPEC-35: names a fee went by before it took the client sheet's name. A bulk
 * sheet or PDF form filled with an older template still matches by these.
 */
export const COMMERCIAL_ITEM_LEGACY_LABELS: Readonly<Partial<Record<CommercialItemKey, readonly string[]>>> = {
  EDUCATION_CHARGES: ["Education Charges"],
  ONE_TIME_REGISTRATION_FEES: ["One Time Registration Fees"],
};
