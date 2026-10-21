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
 *
 * SPEC-23 (D142, D143) appends PF, ESI and TDS - 26 fixed keys, 27 entries - and
 * gives every item a value kind: what its stored answer means. PF and ESI hold a
 * percentage in `amount`, TDS holds only its Yes / No (As / Not applicable), and
 * every other item a rupee amount. The kind belongs to the item, so it lives here
 * rather than in a column, and the percent / status key lists feed the schema CHECKs.
 *
 * D151 removes the 10 demo deductions (Advance, Canteen, Course Registration Fee,
 * Document Fee, Exam Fee, Insurance Deduction, Left, Shoes, Transportation, Uniform):
 * 16 fixed keys, 17 entries. Migration 0016 deletes their rows.
 *
 * D158 removes the remaining 13 allowance / deduction items, and with INSURANCE the
 * D108 insurance sub-model: payroll is now only PF, ESI and TDS, which the server
 * fills with their defaults. OTHER stays as a key so the database CHECKs keep their
 * shape, but no screen or upload writes an Other payroll row any more.
 */

import type { ItemType } from "./enums.ts";

const OTHER_ITEM_KEY = "OTHER";

export const PAYROLL_ITEM_KEYS = [
  "PF",
  "ESI",
  "TDS",
  "OTHER",
] as const;

export type PayrollItemKey = (typeof PAYROLL_ITEM_KEYS)[number];

export type FixedPayrollItemKey = Exclude<PayrollItemKey, typeof OTHER_ITEM_KEY>;

/** What a stored answer means (D143): rupees, a percentage of the stipend, or a status only. */
export type PayrollValueKind = "AMOUNT" | "PERCENT" | "STATUS";

/** SPEC-23 D142: PF and ESI are a percentage of the stipend, stored in `amount`. */
export const PERCENT_ITEM_KEYS = ["PF", "ESI"] as const satisfies readonly PayrollItemKey[];

/** SPEC-23 D143: TDS is As applicable / Not applicable only - `amount` stays NULL. */
export const STATUS_ITEM_KEYS = ["TDS"] as const satisfies readonly PayrollItemKey[];

/** SPEC-23 D144: the statutory deductions every payroll view lists, answered or not. */
export const STATUTORY_ITEM_KEYS = [...PERCENT_ITEM_KEYS, ...STATUS_ITEM_KEYS] as const;

export interface PayrollItemDefinition {
  readonly key: PayrollItemKey;
  readonly label: string;
  readonly valueKind: PayrollValueKind;
  /** The section 2.6 item type, or null for "Other" where the user selects one. */
  readonly itemType: ItemType | null;
  /** The `#` column of section 2.6 - served to the UI so it never hardcodes order. */
  readonly displayOrder: number;
}

const CATALOGUE: readonly Omit<PayrollItemDefinition, "valueKind">[] = [
  { key: "PF", label: "Provident Fund (PF)", itemType: "DEDUCTION", displayOrder: 1 },
  { key: "ESI", label: "ESI", itemType: "DEDUCTION", displayOrder: 2 },
  { key: "TDS", label: "TDS", itemType: "DEDUCTION", displayOrder: 3 },
  { key: "OTHER", label: "Other", itemType: null, displayOrder: 4 },
];

function valueKindOf(key: PayrollItemKey): PayrollValueKind {
  if ((PERCENT_ITEM_KEYS as readonly string[]).includes(key)) return "PERCENT";
  if ((STATUS_ITEM_KEYS as readonly string[]).includes(key)) return "STATUS";
  return "AMOUNT";
}

export const PAYROLL_ITEMS: readonly PayrollItemDefinition[] = CATALOGUE.map((item) => ({
  ...item,
  valueKind: valueKindOf(item.key),
}));

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
