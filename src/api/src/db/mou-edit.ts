/**
 * Purpose: The read (current editable state) and write (derive rows, diff,
 * snapshot) halves of SPEC-10's edit flow, kept out of routes/edit-agreement.ts
 * so that file stays about HTTP concerns. `fetchEditablePayload` returns the
 * exact `CommercialDetails`/`PayrollDetails` shapes `@mou/domain`'s
 * `validateCommercialDetails`/`validatePayrollDetails` already validate for
 * SPEC-05/06, so section 4's "exactly the rule set from SPEC-05/06, the same
 * code path" is true by construction - the edit route re-runs the identical
 * functions the wizard's final save does, not a second copy.
 *
 * Unlike SPEC-07's read-only view (which shows only *applicable* payroll
 * items), editing needs every fixed item back, including a No one, because the
 * user must be able to flip it to Yes. A fixed item with no row at all comes back
 * unanswered rather than silently No - except PF, ESI and TDS, which an MOU saved
 * before SPEC-23 lacks: they come back as the statutory defaults (D148).
 */

import {
  COMMERCIAL_FIXED_ITEM_KEYS,
  COMMERCIAL_ITEM_BY_KEY,
  PAYROLL_FIXED_ITEM_KEYS,
  PAYROLL_ITEM_BY_KEY,
  withStatutoryDefaults,
} from "@mou/domain";
import type { CommercialDetails, OtherChargeRow, PayrollDetails, PayrollItemAnswer } from "@mou/domain";
import { asc, eq } from "drizzle-orm";

import type { Database } from "./client.ts";
import { commercialItem, mou, payrollConfig, payrollItem, traineeCategory } from "./schema.ts";

function firstRow<T>(rows: T[]): T | undefined {
  return rows[0];
}

export interface EditableMouPayload {
  readonly version: number;
  readonly scheme: string;
  readonly commercial: CommercialDetails;
  readonly payroll: PayrollDetails;
}

/** SPEC-10 section 7: the payload a PUT edits, in exactly the shape SPEC-05/06's own validators expect. */
export async function fetchEditablePayload(db: Database, mouId: string): Promise<EditableMouPayload | undefined> {
  const mouRows = await db
    .select({
      scheme: mou.scheme,
      mouStartDate: mou.mouStartDate,
      tenureValue: mou.tenureValue,
      tenureUnit: mou.tenureUnit,
      attendanceCycle: mou.attendanceCycle,
      stipendDate: mou.stipendDate,
      version: mou.version,
    })
    .from(mou)
    .where(eq(mou.id, mouId));
  const mouRow = firstRow(mouRows);
  if (mouRow === undefined) {
    return undefined;
  }

  const commercialRows = await db
    .select({
      itemKey: commercialItem.itemKey,
      customLabel: commercialItem.customLabel,
      amount: commercialItem.amount,
      itemType: commercialItem.itemType,
    })
    .from(commercialItem)
    .where(eq(commercialItem.mouId, mouId));

  const chargesByKey = new Map(commercialRows.filter((row) => row.itemKey !== "OTHER").map((row) => [row.itemKey, row]));
  const charges: Record<string, string> = {};
  for (const key of COMMERCIAL_FIXED_ITEM_KEYS) {
    const row = chargesByKey.get(key);
    if (row?.amount !== undefined && row.amount !== null) {
      charges[key] = row.amount;
    }
  }
  const commercialOtherItems: OtherChargeRow[] = commercialRows
    .filter((row) => row.itemKey === "OTHER")
    .map((row) => ({ label: row.customLabel ?? "", amount: row.amount ?? "", itemType: row.itemType }));

  const configRows = await db.select({ id: payrollConfig.id }).from(payrollConfig).where(eq(payrollConfig.mouId, mouId));
  const configId = firstRow(configRows)?.id;

  const traineeCategories: string[] = [];
  const items: Record<string, PayrollItemAnswer> = {};
  const payrollOtherItems: OtherChargeRow[] = [];

  if (configId !== undefined) {
    const categoryRows = await db
      .select({ categoryName: traineeCategory.categoryName })
      .from(traineeCategory)
      .where(eq(traineeCategory.payrollConfigId, configId))
      .orderBy(asc(traineeCategory.categoryName));
    traineeCategories.push(...categoryRows.map((row) => row.categoryName));

    const itemRows = await db
      .select({
        itemKey: payrollItem.itemKey,
        customLabel: payrollItem.customLabel,
        isApplicable: payrollItem.isApplicable,
        amount: payrollItem.amount,
        itemType: payrollItem.itemType,
      })
      .from(payrollItem)
      .where(eq(payrollItem.payrollConfigId, configId));

    const fixedByKey = new Map(itemRows.filter((row) => row.itemKey !== "OTHER").map((row) => [row.itemKey, row]));
    for (const key of PAYROLL_FIXED_ITEM_KEYS) {
      const row = fixedByKey.get(key);
      items[key] = { isApplicable: row?.isApplicable, amount: row?.amount ?? "" };
    }
    for (const row of itemRows) {
      if (row.itemKey === "OTHER") {
        payrollOtherItems.push({ label: row.customLabel ?? "", amount: row.amount ?? "", itemType: row.itemType });
      }
    }
  }

  return {
    version: mouRow.version,
    scheme: mouRow.scheme,
    commercial: {
      mouStartDate: mouRow.mouStartDate,
      tenureValue: String(mouRow.tenureValue),
      tenureUnit: mouRow.tenureUnit,
      attendanceCycle: mouRow.attendanceCycle,
      stipendDate: mouRow.stipendDate === null ? "" : String(mouRow.stipendDate),
      charges,
      otherItems: commercialOtherItems,
      // An MOU that already exists always has its signed document on file
      // (SPEC-05 made that a precondition of the original save); editing
      // commercial terms never re-asks for it.
      hasMouDocument: true,
    },
    payroll: {
      scheme: mouRow.scheme,
      traineeCategories,
      items: withStatutoryDefaults(items),
      otherItems: payrollOtherItems,
    },
  };
}

export interface DerivedItemRow {
  readonly itemKey: string;
  readonly customLabel: string | null;
  readonly amount: string | null;
  readonly itemType: string;
}

/** Mirrors routes/companies.ts's final-save derivation exactly (D31: blank fixed charge = no row). */
export function deriveCommercialItemRows(
  charges: Readonly<Record<string, string>>,
  otherItems: readonly OtherChargeRow[],
): DerivedItemRow[] {
  const rows: DerivedItemRow[] = [];
  for (const key of COMMERCIAL_FIXED_ITEM_KEYS) {
    const raw = (charges[key] ?? "").trim();
    if (raw === "") {
      continue;
    }
    rows.push({
      itemKey: key,
      customLabel: null,
      amount: Number(raw).toFixed(2),
      itemType: COMMERCIAL_ITEM_BY_KEY[key].itemType ?? "DEDUCTION",
    });
  }
  for (const row of otherItems) {
    const label = row.label.trim();
    const amount = row.amount.trim();
    const itemType = row.itemType.trim();
    if (label === "" && amount === "" && itemType === "") {
      continue;
    }
    rows.push({ itemKey: "OTHER", customLabel: label, amount: Number(amount).toFixed(2), itemType });
  }
  return rows;
}

export interface DerivedPayrollItemRow extends DerivedItemRow {
  readonly isApplicable: boolean;
}

/** Mirrors routes/companies.ts's final-save derivation exactly (D31 inverse: every fixed key always gets a row). */
export function derivePayrollItemRows(
  items: Readonly<Record<string, PayrollItemAnswer>>,
  otherItems: readonly OtherChargeRow[],
): DerivedPayrollItemRow[] {
  const rows: DerivedPayrollItemRow[] = [];
  for (const key of PAYROLL_FIXED_ITEM_KEYS) {
    const answer = items[key];
    const isApplicable = answer?.isApplicable ?? false;
    const { itemType, valueKind } = PAYROLL_ITEM_BY_KEY[key];
    rows.push({
      itemKey: key,
      customLabel: null,
      isApplicable,
      // SPEC-23 D143: a status item (TDS) never carries an amount, Yes or No.
      amount: isApplicable && valueKind !== "STATUS" ? Number((answer?.amount ?? "0").trim()).toFixed(2) : null,
      itemType: itemType ?? "ALLOWANCE",
    });
  }
  for (const row of otherItems) {
    const label = row.label.trim();
    const amount = row.amount.trim();
    const itemType = row.itemType.trim();
    if (label === "" && amount === "" && itemType === "") {
      continue;
    }
    rows.push({ itemKey: "OTHER", customLabel: label, isApplicable: true, amount: Number(amount).toFixed(2), itemType });
  }
  return rows;
}

function sortKey(row: DerivedItemRow): string {
  return `${row.itemKey}::${row.customLabel ?? ""}`;
}

/** Order-independent structural equality, used for SPEC-10 AC12 ("no changes to apply"). */
export function sameDerivedRows(a: readonly DerivedItemRow[], b: readonly DerivedItemRow[]): boolean {
  const left = [...a].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  const right = [...b].sort((x, y) => sortKey(x).localeCompare(sortKey(y)));
  return JSON.stringify(left) === JSON.stringify(right);
}

/** Order-independent, trimmed comparison for the trainee category list. */
export function sameTraineeCategories(a: readonly string[], b: readonly string[]): boolean {
  const left = a.map((c) => c.trim()).sort();
  const right = b.map((c) => c.trim()).sort();
  return JSON.stringify(left) === JSON.stringify(right);
}
