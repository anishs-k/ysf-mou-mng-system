/**
 * Purpose: The read-only query assembly SPEC-07's three view pages need -
 * company overview, the schemes a company+plant actually has an MOU for, and
 * one MOU's commercial and payroll detail. Built once here so SPEC-11 (history,
 * same shape from a JSON snapshot) and SPEC-13 (export row assembly) reuse it
 * rather than re-deriving the same joins. MOU status is always computed from
 * `business_today()` (SPEC-01 section 6.2) - it is never read from a stored
 * column, so a query result can never go stale relative to the calendar.
 * SPEC-24: each view has a batch form that loads any number of records in a
 * fixed handful of queries; the one-record functions are its one-id case.
 */

import {
  COMMERCIAL_FIXED_ITEM_KEYS,
  COMMERCIAL_ITEM_BY_KEY,
  deriveStatus,
  PAYROLL_ITEM_BY_KEY,
  STATUTORY_ITEM_KEYS,
} from "@mou/domain";
import type { MouStatus, PayrollValueKind } from "@mou/domain";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
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

/** Groups rows into lists keyed by `keyOf`, keeping each list in the rows' order. */
function groupBy<T>(rows: readonly T[], keyOf: (row: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [row]);
    else group.push(row);
  }
  return groups;
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
  /** D156: null for companies saved after Contact Type stopped being asked. */
  readonly contactType: string | null;
  readonly hrContactName: string;
  readonly hrContactNumber: string;
  readonly financeHeadContactName: string;
  readonly financeHeadContactNumber: string;
  readonly hrEmail: string;
  readonly financeEmail: string;
  readonly purchaseName: string | null;
  readonly purchaseNumber: string | null;
  readonly purchaseEmail: string | null;
  readonly plants: readonly { readonly id: string; readonly plantName: string }[];
}

/**
 * SPEC-07 Page 1 for many companies at once (SPEC-24): two queries whatever the
 * count. Keyed by company id; an unknown or inactive company has no entry.
 */
export async function fetchCompanyOverviews(
  db: Database,
  companyIds: readonly string[],
): Promise<Map<string, CompanyOverview>> {
  if (companyIds.length === 0) return new Map();
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
      hrEmail: company.hrEmail,
      financeEmail: company.financeEmail,
      purchaseName: company.purchaseName,
      purchaseNumber: company.purchaseNumber,
      purchaseEmail: company.purchaseEmail,
    })
    .from(company)
    .innerJoin(zone, eq(zone.id, company.zoneId))
    .where(and(inArray(company.id, [...companyIds]), eq(company.isActive, true)));

  const plants = await db
    .select({ companyId: companyPlant.companyId, id: companyPlant.id, plantName: companyPlant.plantName })
    .from(companyPlant)
    .where(and(inArray(companyPlant.companyId, [...companyIds]), eq(companyPlant.isActive, true)))
    .orderBy(asc(companyPlant.plantName));
  const plantsByCompany = groupBy(plants, (plant) => plant.companyId);

  return new Map(
    rows.map((row) => [
      row.id,
      { ...row, plants: (plantsByCompany.get(row.id) ?? []).map(({ id, plantName }) => ({ id, plantName })) },
    ]),
  );
}

/** SPEC-07 Page 1: the full SPEC-04 company record (identity, address, contacts), its zone name, and every active plant. */
export async function fetchCompanyOverview(
  db: Database,
  companyId: string,
): Promise<CompanyOverview | undefined> {
  return (await fetchCompanyOverviews(db, [companyId])).get(companyId);
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
 * Every MoU each company has ever held - active and inactive (superseded) - newest
 * start date first, for many companies at once (SPEC-24). Keyed by company id; an
 * unknown or inactive company has no entry, an active one with no MoU an empty list.
 */
export async function fetchCompaniesAgreements(
  db: Database,
  companyIds: readonly string[],
  today: string,
): Promise<Map<string, CompanyAgreementRow[]>> {
  if (companyIds.length === 0) return new Map();
  const activeRows = await db
    .select({ id: company.id })
    .from(company)
    .where(and(inArray(company.id, [...companyIds]), eq(company.isActive, true)));
  const activeIds = activeRows.map((row) => row.id);
  if (activeIds.length === 0) return new Map();

  const rows = await db
    .select({
      companyId: mou.companyId,
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
    .where(inArray(mou.companyId, activeIds))
    .orderBy(desc(mou.mouStartDate), asc(mou.scheme));
  const byCompany = groupBy(rows, (row) => row.companyId);

  // end_date is a generated column, so it is never null for a stored row.
  return new Map(
    activeIds.map((companyId) => [
      companyId,
      (byCompany.get(companyId) ?? []).map((row) => {
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
      }),
    ]),
  );
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
  return (await fetchCompaniesAgreements(db, [companyId], await businessToday(pool))).get(companyId);
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

interface CommercialItemDbRow {
  readonly itemKey: string;
  readonly customLabel: string | null;
  readonly amount: string | null;
  readonly itemType: string;
  readonly period: string | null;
  readonly basis: string | null;
}

/** Every fixed charge in catalogue order (amount null when not entered), then the "Other" rows. */
function chargesOf(itemRows: readonly CommercialItemDbRow[]): Pick<MouCommercialDetail, "charges" | "otherItems"> {
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
  return { charges, otherItems };
}

/**
 * SPEC-07 Page 2 for many MOUs at once (SPEC-24): three queries whatever the count.
 * Keyed by MOU id; an unknown or inactive MOU has no entry.
 */
export async function fetchMouCommercialDetails(
  db: Database,
  mouIds: readonly string[],
  today: string,
): Promise<Map<string, MouCommercialDetail>> {
  if (mouIds.length === 0) return new Map();
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
    .where(and(inArray(mou.id, [...mouIds]), eq(mou.isActive, true)));
  const ids = mouRows.map((row) => row.id);
  if (ids.length === 0) return new Map();

  const itemRows = await db
    .select({
      mouId: commercialItem.mouId,
      itemKey: commercialItem.itemKey,
      customLabel: commercialItem.customLabel,
      amount: commercialItem.amount,
      itemType: commercialItem.itemType,
      period: commercialItem.period,
      basis: commercialItem.basis,
    })
    .from(commercialItem)
    .where(inArray(commercialItem.mouId, ids));
  const itemsByMou = groupBy(itemRows, (row) => row.mouId);

  // Newest first, so each MOU's first row is its current document (SPEC-09 section 3.1).
  const documentRows = await db
    .select({ mouId: mouDocument.mouId, id: mouDocument.id, originalFilename: mouDocument.originalFilename, uploadedAt: mouDocument.uploadedAt })
    .from(mouDocument)
    .where(inArray(mouDocument.mouId, ids))
    .orderBy(desc(mouDocument.uploadedAt));
  const documentsByMou = groupBy(documentRows, (row) => row.mouId);

  const details = new Map<string, MouCommercialDetail>();
  for (const mouRow of mouRows) {
    if (mouRow.endDate === null) continue;
    const latest = documentsByMou.get(mouRow.id)?.[0];
    details.set(mouRow.id, {
      mouId: mouRow.id,
      generatedCode: mouRow.generatedCode,
      companyId: mouRow.companyId,
      companyPlantId: mouRow.companyPlantId,
      scheme: mouRow.scheme,
      mouStartDate: mouRow.mouStartDate,
      tenureValue: mouRow.tenureValue,
      tenureUnit: mouRow.tenureUnit,
      endDate: mouRow.endDate,
      status: deriveStatus(mouRow.mouStartDate, mouRow.endDate, today),
      attendanceCycle: mouRow.attendanceCycle,
      stipendDate: mouRow.stipendDate,
      ...chargesOf(itemsByMou.get(mouRow.id) ?? []),
      document: latest === undefined ? undefined : { id: latest.id, originalFilename: latest.originalFilename, uploadedAt: latest.uploadedAt },
    });
  }
  return details;
}

/** SPEC-07 Page 2: one MOU's commercial detail, entirely view-only. */
export async function fetchMouCommercialDetail(
  db: Database,
  pool: Pool,
  mouId: string,
): Promise<MouCommercialDetail | undefined> {
  return (await fetchMouCommercialDetails(db, [mouId], await businessToday(pool))).get(mouId);
}

/**
 * SPEC-23 §2.4: `valueKind` says how to read `amount` - rupees, a percentage, or
 * (STATUS, i.e. TDS) nothing, in which case `amount` is null and `isApplicable`
 * is the answer. The statutory items (PF, ESI, TDS) are always listed (D144):
 * isApplicable false when answered No, null when the MOU holds no answer at all.
 * Every other item is listed only when applicable.
 */
export interface MouPayrollItemRow {
  readonly itemKey: string;
  readonly label: string;
  readonly valueKind: PayrollValueKind;
  readonly amount: string | null;
  readonly isApplicable: boolean | null;
}

export interface MouPayrollDetail {
  readonly scheme: string;
  readonly traineeCategories: readonly string[];
  readonly allowances: readonly MouPayrollItemRow[];
  readonly deductions: readonly MouPayrollItemRow[];
}

interface PayrollItemDbRow {
  readonly itemKey: string;
  readonly customLabel: string | null;
  readonly amount: string | null;
  readonly itemType: string;
  readonly isApplicable: boolean | null;
}

const PAYROLL_BY_KEY = PAYROLL_ITEM_BY_KEY as Readonly<Record<string, (typeof PAYROLL_ITEM_BY_KEY)[keyof typeof PAYROLL_ITEM_BY_KEY]>>;

function toPayrollRow(row: PayrollItemDbRow): MouPayrollItemRow {
  const valueKind = PAYROLL_BY_KEY[row.itemKey]?.valueKind ?? "AMOUNT";
  const hasAmount = valueKind !== "STATUS" && row.isApplicable === true;
  return {
    itemKey: row.itemKey,
    label: row.itemKey === "OTHER" ? (row.customLabel ?? "") : (PAYROLL_BY_KEY[row.itemKey]?.label ?? row.itemKey),
    valueKind,
    amount: hasAmount ? (row.amount ?? "0") : null,
    isApplicable: row.isApplicable,
  };
}

/** One config's listed rows (the applicable items plus every statutory item) as allowances and deductions. */
function payrollItemsOf(itemRows: readonly PayrollItemDbRow[]): Pick<MouPayrollDetail, "allowances" | "deductions"> {
  // D144: a statutory item with no stored row is still listed, as not recorded.
  const storedKeys = new Set(itemRows.map((row) => row.itemKey));
  const notRecorded: PayrollItemDbRow[] = STATUTORY_ITEM_KEYS.filter((key) => !storedKeys.has(key)).map((key) => ({
    itemKey: key,
    customLabel: null,
    amount: null,
    itemType: "DEDUCTION",
    isApplicable: null,
  }));
  const displayOrder = (itemKey: string): number => PAYROLL_BY_KEY[itemKey]?.displayOrder ?? Number.MAX_SAFE_INTEGER;
  const sorted = [...itemRows, ...notRecorded].sort((a, b) => displayOrder(a.itemKey) - displayOrder(b.itemKey));
  return {
    allowances: sorted.filter((row) => row.itemType === "ALLOWANCE").map(toPayrollRow),
    deductions: sorted.filter((row) => row.itemType === "DEDUCTION").map(toPayrollRow),
  };
}

async function payrollRowsOf(db: Database, configIds: readonly string[]) {
  return Promise.all([
    db
      .select({ payrollConfigId: traineeCategory.payrollConfigId, categoryName: traineeCategory.categoryName })
      .from(traineeCategory)
      .where(inArray(traineeCategory.payrollConfigId, [...configIds]))
      .orderBy(asc(traineeCategory.categoryName)),
    db
      .select({
        payrollConfigId: payrollItem.payrollConfigId,
        itemKey: payrollItem.itemKey,
        customLabel: payrollItem.customLabel,
        amount: payrollItem.amount,
        itemType: payrollItem.itemType,
        isApplicable: payrollItem.isApplicable,
      })
      .from(payrollItem)
      // A statutory item is listed either way, since "Not applicable" is itself the answer.
      .where(
        and(
          inArray(payrollItem.payrollConfigId, [...configIds]),
          or(eq(payrollItem.isApplicable, true), inArray(payrollItem.itemKey, [...STATUTORY_ITEM_KEYS])),
        ),
      ),
  ]);
}

/**
 * SPEC-07 Page 3 for many MOUs at once (SPEC-24): four queries whatever the count.
 * Keyed by MOU id; an unknown or inactive MOU has no entry, one without a payroll
 * config an empty detail.
 */
export async function fetchMouPayrollDetails(db: Database, mouIds: readonly string[]): Promise<Map<string, MouPayrollDetail>> {
  if (mouIds.length === 0) return new Map();
  const mouRows = await db
    .select({ id: mou.id, scheme: mou.scheme })
    .from(mou)
    .where(and(inArray(mou.id, [...mouIds]), eq(mou.isActive, true)));
  if (mouRows.length === 0) return new Map();

  const configRows = await db
    .select({ id: payrollConfig.id, mouId: payrollConfig.mouId })
    .from(payrollConfig)
    .where(inArray(payrollConfig.mouId, mouRows.map((row) => row.id)));
  const [categoryRows, itemRows] = configRows.length === 0 ? [[], []] : await payrollRowsOf(db, configRows.map((row) => row.id));
  const configByMou = new Map(configRows.map((row) => [row.mouId, row.id]));
  const categoriesByConfig = groupBy(categoryRows, (row) => row.payrollConfigId);
  const itemsByConfig = groupBy(itemRows, (row) => row.payrollConfigId);

  return new Map(
    mouRows.map((mouRow): [string, MouPayrollDetail] => {
      const configId = configByMou.get(mouRow.id);
      if (configId === undefined) {
        return [mouRow.id, { scheme: mouRow.scheme, traineeCategories: [], allowances: [], deductions: [] }];
      }
      return [
        mouRow.id,
        {
          scheme: mouRow.scheme,
          traineeCategories: (categoriesByConfig.get(configId) ?? []).map((row) => row.categoryName),
          ...payrollItemsOf(itemsByConfig.get(configId) ?? []),
        },
      ];
    }),
  );
}

/** SPEC-07 Page 3: trainee categories and only the applicable payroll items, split by type. */
export async function fetchMouPayrollDetail(db: Database, mouId: string): Promise<MouPayrollDetail | undefined> {
  return (await fetchMouPayrollDetails(db, [mouId])).get(mouId);
}
