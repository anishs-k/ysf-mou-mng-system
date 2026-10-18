/**
 * Purpose: The read-only query assembly SPEC-07's three view pages need -
 * company overview, the schemes a company+plant actually has an MOU for, and
 * one MOU's commercial and payroll detail. Built once here so SPEC-11 (history,
 * same shape from a JSON snapshot) and SPEC-13 (export row assembly) reuse it
 * rather than re-deriving the same joins. MOU status is always computed from
 * `business_today()` (SPEC-01 section 6.2) - it is never read from a stored
 * column, so a query result can never go stale relative to the calendar.
 */

import {
  COMMERCIAL_FIXED_ITEM_KEYS,
  COMMERCIAL_ITEM_BY_KEY,
  deriveStatus,
  PAYROLL_ITEM_BY_KEY,
} from "@mou/domain";
import type { MouStatus } from "@mou/domain";
import { and, asc, desc, eq } from "drizzle-orm";
import type { Pool } from "pg";

import type { Database } from "./client.ts";
import {
  commercialItem,
  company,
  companyPlant,
  mou,
  mouDocument,
  payrollConfig,
  payrollItem,
  traineeCategory,
  zone,
} from "./schema.ts";

function firstRow<T>(rows: T[]): T | undefined {
  return rows[0];
}

/** The single definition of "today" (SPEC-01 section 6.2) - Asia/Kolkata, from Postgres. */
export async function businessToday(pool: Pool): Promise<string> {
  const { rows } = await pool.query<{ today: string }>("SELECT business_today()::text AS today");
  const row = firstRow(rows);
  if (row === undefined) {
    throw new Error("business_today() returned no row");
  }
  return row.today;
}

export interface CompanyOverview {
  readonly id: string;
  readonly companyName: string;
  readonly companyType: string;
  readonly sector: string;
  readonly registrationType: string;
  readonly tanNumber: string;
  readonly gstNumber: string;
  readonly zoneId: string;
  readonly zoneName: string;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly pinCode: string;
  readonly district: string;
  readonly state: string;
  readonly contactType: string;
  readonly hrContactName: string;
  readonly hrContactNumber: string;
  readonly financeHeadContactName: string;
  readonly financeHeadContactNumber: string;
  readonly officialEmail: string;
  readonly purchaseName: string | null;
  readonly purchaseNumber: string | null;
  readonly purchaseEmail: string | null;
  readonly plants: readonly { readonly id: string; readonly plantName: string }[];
}

/** SPEC-07 Page 1: the full SPEC-04 company record (identity, address, contacts), its zone name, and every active plant. */
export async function fetchCompanyOverview(
  db: Database,
  companyId: string,
): Promise<CompanyOverview | undefined> {
  const rows = await db
    .select({
      id: company.id,
      companyName: company.companyName,
      companyType: company.companyType,
      sector: company.sector,
      registrationType: company.registrationType,
      tanNumber: company.tanNumber,
      gstNumber: company.gstNumber,
      zoneId: company.zoneId,
      zoneName: zone.name,
      addressLine1: company.addressLine1,
      addressLine2: company.addressLine2,
      city: company.city,
      pinCode: company.pinCode,
      district: company.district,
      state: company.state,
      contactType: company.contactType,
      hrContactName: company.hrContactName,
      hrContactNumber: company.hrContactNumber,
      financeHeadContactName: company.financeHeadContactName,
      financeHeadContactNumber: company.financeHeadContactNumber,
      officialEmail: company.officialEmail,
      purchaseName: company.purchaseName,
      purchaseNumber: company.purchaseNumber,
      purchaseEmail: company.purchaseEmail,
    })
    .from(company)
    .innerJoin(zone, eq(zone.id, company.zoneId))
    .where(and(eq(company.id, companyId), eq(company.isActive, true)));

  const row = firstRow(rows);
  if (row === undefined) {
    return undefined;
  }

  const plants = await db
    .select({ id: companyPlant.id, plantName: companyPlant.plantName })
    .from(companyPlant)
    .where(and(eq(companyPlant.companyId, companyId), eq(companyPlant.isActive, true)))
    .orderBy(asc(companyPlant.plantName));

  return { ...row, plants };
}

export interface CompanyAgreementRow {
  readonly mouId: string;
  readonly generatedCode: string;
  readonly scheme: string;
  readonly plantName: string | null;
  readonly mouStartDate: string;
  readonly endDate: string;
  readonly status: MouStatus;
  readonly isActive: boolean;
}

/**
 * Every MoU the company has ever held - active and inactive (superseded) -
 * newest start date first, for the company's agreements list. Undefined when
 * the company itself does not exist or is inactive.
 */
export async function fetchCompanyAgreements(
  db: Database,
  pool: Pool,
  companyId: string,
): Promise<readonly CompanyAgreementRow[] | undefined> {
  const companyRows = await db
    .select({ id: company.id })
    .from(company)
    .where(and(eq(company.id, companyId), eq(company.isActive, true)));
  if (firstRow(companyRows) === undefined) {
    return undefined;
  }

  const rows = await db
    .select({
      mouId: mou.id,
      generatedCode: mou.generatedCode,
      scheme: mou.scheme,
      plantName: companyPlant.plantName,
      mouStartDate: mou.mouStartDate,
      endDate: mou.endDate,
      isActive: mou.isActive,
    })
    .from(mou)
    .leftJoin(companyPlant, eq(companyPlant.id, mou.companyPlantId))
    .where(eq(mou.companyId, companyId))
    .orderBy(desc(mou.mouStartDate), asc(mou.scheme));

  const today = await businessToday(pool);
  // end_date is a generated column, so it is never null for a stored row.
  return rows.map((row) => {
    const endDate = row.endDate ?? row.mouStartDate;
    return {
      mouId: row.mouId,
      generatedCode: row.generatedCode,
      scheme: row.scheme,
      plantName: row.plantName,
      mouStartDate: row.mouStartDate,
      endDate,
      status: deriveStatus(row.mouStartDate, endDate, today),
      isActive: row.isActive,
    };
  });
}

export interface CompanyMouOption {
  readonly mouId: string;
  readonly scheme: string;
  readonly companyPlantId: string | null;
}

/** SPEC-07 section 4.1: only the schemes this company (+ plant) actually has an MOU for. */
export async function fetchCompanyMous(
  db: Database,
  companyId: string,
  plantId?: string,
): Promise<readonly CompanyMouOption[]> {
  const conditions = [eq(mou.companyId, companyId), eq(mou.isActive, true)];
  if (plantId !== undefined) {
    conditions.push(eq(mou.companyPlantId, plantId));
  }
  return db
    .select({ mouId: mou.id, scheme: mou.scheme, companyPlantId: mou.companyPlantId })
    .from(mou)
    .where(and(...conditions))
    .orderBy(asc(mou.scheme));
}

export interface MouChargeRow {
  readonly itemKey: string;
  readonly label: string;
  /** null means "not applicable" (SPEC-07 AC8 - renders as "—", distinct from "0.00"). */
  readonly amount: string | null;
  /** SPEC-16 D108 codes (COMMERCIAL_PERIODS / COMMERCIAL_BASES); null when not recorded. */
  readonly period: string | null;
  readonly basis: string | null;
}

export interface MouOtherItemRow {
  readonly label: string;
  readonly amount: string;
  readonly itemType: string;
}

export interface MouDocumentSummary {
  readonly id: string;
  readonly originalFilename: string;
  readonly uploadedAt: Date;
}

export interface MouCommercialDetail {
  readonly mouId: string;
  /** SPEC-16 D109: the generated code belongs to the MOU, so it is reported here. */
  readonly generatedCode: string;
  readonly companyId: string;
  readonly companyPlantId: string | null;
  readonly scheme: string;
  readonly mouStartDate: string;
  readonly tenureValue: number;
  readonly tenureUnit: string;
  readonly endDate: string;
  readonly status: MouStatus;
  readonly attendanceCycle: string;
  readonly stipendDate: number | null;
  readonly charges: readonly MouChargeRow[];
  readonly otherItems: readonly MouOtherItemRow[];
  /** The most recently uploaded document, per SPEC-09 section 3.1. */
  readonly document: MouDocumentSummary | undefined;
}

/** SPEC-07 Page 2: one MOU's commercial detail, entirely view-only. */
export async function fetchMouCommercialDetail(
  db: Database,
  pool: Pool,
  mouId: string,
): Promise<MouCommercialDetail | undefined> {
  const mouRows = await db
    .select({
      id: mou.id,
      generatedCode: mou.generatedCode,
      companyId: mou.companyId,
      companyPlantId: mou.companyPlantId,
      scheme: mou.scheme,
      mouStartDate: mou.mouStartDate,
      tenureValue: mou.tenureValue,
      tenureUnit: mou.tenureUnit,
      endDate: mou.endDate,
      attendanceCycle: mou.attendanceCycle,
      stipendDate: mou.stipendDate,
    })
    .from(mou)
    .where(and(eq(mou.id, mouId), eq(mou.isActive, true)));

  const mouRow = firstRow(mouRows);
  if (mouRow === undefined || mouRow.endDate === null) {
    return undefined;
  }

  const today = await businessToday(pool);
  const status = deriveStatus(mouRow.mouStartDate, mouRow.endDate, today);

  const itemRows = await db
    .select({
      itemKey: commercialItem.itemKey,
      customLabel: commercialItem.customLabel,
      amount: commercialItem.amount,
      itemType: commercialItem.itemType,
      period: commercialItem.period,
      basis: commercialItem.basis,
    })
    .from(commercialItem)
    .where(eq(commercialItem.mouId, mouId));

  const fixedByKey = new Map(itemRows.filter((row) => row.itemKey !== "OTHER").map((row) => [row.itemKey, row]));
  const charges: MouChargeRow[] = COMMERCIAL_FIXED_ITEM_KEYS.map((key) => ({
    itemKey: key,
    label: COMMERCIAL_ITEM_BY_KEY[key].label,
    amount: fixedByKey.get(key)?.amount ?? null,
    period: fixedByKey.get(key)?.period ?? null,
    basis: fixedByKey.get(key)?.basis ?? null,
  }));
  const otherItems: MouOtherItemRow[] = itemRows
    .filter((row) => row.itemKey === "OTHER")
    .map((row) => ({
      label: row.customLabel ?? "",
      amount: row.amount ?? "0",
      itemType: row.itemType,
    }));

  const documentRows = await db
    .select({ id: mouDocument.id, originalFilename: mouDocument.originalFilename, uploadedAt: mouDocument.uploadedAt })
    .from(mouDocument)
    .where(eq(mouDocument.mouId, mouId))
    .orderBy(desc(mouDocument.uploadedAt))
    .limit(1);

  return {
    mouId: mouRow.id,
    generatedCode: mouRow.generatedCode,
    companyId: mouRow.companyId,
    companyPlantId: mouRow.companyPlantId,
    scheme: mouRow.scheme,
    mouStartDate: mouRow.mouStartDate,
    tenureValue: mouRow.tenureValue,
    tenureUnit: mouRow.tenureUnit,
    endDate: mouRow.endDate,
    status,
    attendanceCycle: mouRow.attendanceCycle,
    stipendDate: mouRow.stipendDate,
    charges,
    otherItems,
    document: firstRow(documentRows),
  };
}

export interface MouPayrollItemRow {
  readonly itemKey: string;
  readonly label: string;
  readonly amount: string;
}

export interface MouPayrollDetail {
  readonly scheme: string;
  readonly traineeCategories: readonly string[];
  readonly allowances: readonly MouPayrollItemRow[];
  readonly deductions: readonly MouPayrollItemRow[];
}

/** SPEC-07 Page 3: trainee categories and only the applicable payroll items, split by type. */
export async function fetchMouPayrollDetail(db: Database, mouId: string): Promise<MouPayrollDetail | undefined> {
  const mouRows = await db.select({ scheme: mou.scheme }).from(mou).where(and(eq(mou.id, mouId), eq(mou.isActive, true)));
  const mouRow = firstRow(mouRows);
  if (mouRow === undefined) {
    return undefined;
  }

  const configRows = await db.select({ id: payrollConfig.id }).from(payrollConfig).where(eq(payrollConfig.mouId, mouId));
  const configRow = firstRow(configRows);
  if (configRow === undefined) {
    return { scheme: mouRow.scheme, traineeCategories: [], allowances: [], deductions: [] };
  }

  const categoryRows = await db
    .select({ categoryName: traineeCategory.categoryName })
    .from(traineeCategory)
    .where(eq(traineeCategory.payrollConfigId, configRow.id))
    .orderBy(asc(traineeCategory.categoryName));

  const itemRows = await db
    .select({
      itemKey: payrollItem.itemKey,
      customLabel: payrollItem.customLabel,
      amount: payrollItem.amount,
      itemType: payrollItem.itemType,
      isApplicable: payrollItem.isApplicable,
    })
    .from(payrollItem)
    .where(and(eq(payrollItem.payrollConfigId, configRow.id), eq(payrollItem.isApplicable, true)));

  const byKey = PAYROLL_ITEM_BY_KEY as Readonly<Record<string, (typeof PAYROLL_ITEM_BY_KEY)[keyof typeof PAYROLL_ITEM_BY_KEY]>>;
  const label = (row: (typeof itemRows)[number]): string =>
    row.itemKey === "OTHER" ? (row.customLabel ?? "") : (byKey[row.itemKey]?.label ?? row.itemKey);
  const displayOrder = (itemKey: string): number => byKey[itemKey]?.displayOrder ?? Number.MAX_SAFE_INTEGER;

  const toRow = (row: (typeof itemRows)[number]): MouPayrollItemRow => ({
    itemKey: row.itemKey,
    label: label(row),
    amount: row.amount ?? "0",
  });

  const sorted = [...itemRows].sort((a, b) => displayOrder(a.itemKey) - displayOrder(b.itemKey));
  const allowances = sorted.filter((row) => row.itemType === "ALLOWANCE").map(toRow);
  const deductions = sorted.filter((row) => row.itemType === "DEDUCTION").map(toRow);

  return {
    scheme: mouRow.scheme,
    traineeCategories: categoryRows.map((row) => row.categoryName),
    allowances,
    deductions,
  };
}
