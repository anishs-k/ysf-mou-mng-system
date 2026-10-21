/**
 * Purpose: Writes one onboarded company - company, plant, MOU, commercial items,
 * payroll config, trainee categories and payroll items - inside a caller's
 * transaction. Lifted out of the SPEC-03 final-save route so SPEC-22's bulk upload
 * writes exactly the same rows the wizard does. The input must already have passed
 * the three @mou/domain page validators; item types come from the catalogues, never
 * from the input. The MOU PDF is the caller's concern (the wizard promotes one, a
 * bulk row has none - D138).
 */

import {
  COMMERCIAL_FIXED_ITEM_KEYS,
  COMMERCIAL_ITEM_BY_KEY,
  PAYROLL_FIXED_ITEM_KEYS,
  PAYROLL_ITEM_BY_KEY,
  withStatutoryDefaults,
} from "@mou/domain";
import type { CommercialDetails, CompanyDetails, PayrollDetails } from "@mou/domain";
import type { Pool } from "pg";

import type { Database } from "./client.ts";
import { allocateCompanyCode } from "./company-code-repository.ts";
import {
  commercialItem,
  company,
  companyPlant,
  mou,
  payrollConfig,
  payrollItem,
  traineeCategory,
} from "./schema.ts";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** One validated company: Page 1 plus the step-1 extras, and Pages 2 and 3. */
export interface NewCompanyMou {
  readonly company: CompanyDetails;
  readonly sector: string;
  readonly purchaseName: string;
  readonly purchaseNumber: string;
  readonly purchaseEmail: string;
  readonly commercial: CommercialDetails;
  readonly payroll: PayrollDetails;
}

export interface CreatedCompanyMou {
  readonly companyId: string;
  readonly mouId: string;
  readonly generatedCode: string;
}

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected the statement to return a row");
  }
  return row;
}

/** An optional text field: trimmed, and blank stored as NULL. */
function blankToNull(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

const text = (value: string): string => value.trim();
const optional = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

export async function insertCompanyWithMou(
  tx: Transaction,
  pool: Pool,
  input: NewCompanyMou,
  createdBy: string,
): Promise<CreatedCompanyMou> {
  const details = input.company;
  const { commercial, payroll } = input;

  // Allocate the MOU code outside the long transaction (D7), then use it.
  // SPEC-16 D109: the sequence is per scheme per year, not per zone per year,
  // because the code identifies the MOU rather than the company.
  const year = new Date().getFullYear();
  const generatedCode = await allocateCompanyCode(pool, payroll.scheme, year);

  // 1. Insert company. It no longer carries a generated code (D109); it does
  // carry the sector (D107) and the optional purchase contact (D110).
  const companyRow = await tx
    .insert(company)
    .values({
      // Name, zone and plant are written as given - exactly what the wizard's save did.
      companyName: details.companyName,
      companyType: text(details.companyType),
      // Phase B adds the SPEC-16 required-field rule for sector; until then a
      // draft without one falls back to OTHER, matching the migration's backfill.
      sector: text(input.sector) === "" ? "OTHER" : text(input.sector),
      registrationType: text(details.registrationType),
      tanNumber: text(details.tanNumber),
      gstNumber: text(details.gstNumber),
      zoneId: details.zoneId,
      addressLine1: text(details.addressLine1),
      addressLine2: optional(details.addressLine2),
      city: text(details.city),
      pinCode: text(details.pinCode),
      state: text(details.state),
      district: text(details.district),
      hrContactName: text(details.hrContactName),
      financeHeadContactName: text(details.financeHeadContactName),
      // D156: Contact Type is no longer asked; NULL unless a caller still sends one.
      contactType: optional(details.contactType),
      hrContactNumber: text(details.hrContactNumber),
      financeHeadContactNumber: text(details.financeHeadContactNumber),
      hrEmail: text(details.hrEmail),
      financeEmail: text(details.financeEmail),
      purchaseName: optional(input.purchaseName),
      purchaseNumber: optional(input.purchaseNumber),
      purchaseEmail: optional(input.purchaseEmail),
      createdBy,
    })
    .returning({ id: company.id });

  const companyId = firstRow(companyRow).id;

  // 2. Insert plant.
  const plantRow = await tx
    .insert(companyPlant)
    .values({ companyId, plantName: details.plantName })
    .returning({ id: companyPlant.id });
  const plantId = firstRow(plantRow).id;

  // 3. Insert MOU. Page 2 and Page 3 have already been validated, so every
  // field read here is known-good.
  const mouRow = await tx
    .insert(mou)
    .values({
      generatedCode,
      companyId,
      companyPlantId: plantId,
      scheme: payroll.scheme,
      mouStartDate: commercial.mouStartDate,
      tenureValue: Number(commercial.tenureValue),
      tenureUnit: commercial.tenureUnit,
      attendanceCycle: commercial.attendanceCycle,
      stipendDate: Number(commercial.stipendDate),
    })
    .returning({ id: mou.id });
  const mouId = firstRow(mouRow).id;

  // 4. Insert commercial items — one row per entered charge (a blank
  // fixed charge gets no row at all; SPEC-05 section 2.2), derived here
  // rather than trusting a client-supplied item list, so itemType for a
  // fixed key always matches the SPEC-01 catalogue.
  const commercialItemRows: (typeof commercialItem.$inferInsert)[] = [];
  for (const key of COMMERCIAL_FIXED_ITEM_KEYS) {
    const raw = (commercial.charges[key] ?? "").trim();
    if (raw === "") {
      continue;
    }
    commercialItemRows.push({
      mouId,
      itemKey: key,
      amount: raw,
      itemType: COMMERCIAL_ITEM_BY_KEY[key].itemType ?? "DEDUCTION",
      period: blankToNull(commercial.chargeMeta?.[key]?.period),
      basis: blankToNull(commercial.chargeMeta?.[key]?.basis),
    });
  }
  for (const row of commercial.otherItems) {
    const label = row.label.trim();
    const amount = row.amount.trim();
    const itemType = row.itemType.trim();
    if (label === "" && amount === "" && itemType === "") {
      // AC7: a fully empty Other row is ignored, nothing to persist.
      continue;
    }
    commercialItemRows.push({
      mouId,
      itemKey: "OTHER",
      customLabel: label,
      amount,
      itemType,
    });
  }
  if (commercialItemRows.length > 0) {
    await tx.insert(commercialItem).values(commercialItemRows);
  }

  // 5. Insert payroll config.
  const configRow = await tx
    .insert(payrollConfig)
    .values({ mouId })
    .returning({ id: payrollConfig.id });
  const configId = firstRow(configRow).id;

  // 6. Insert trainee categories - already validated (AC5/AC6: at least one,
  // unique case-insensitively), each with its optional details matched by name.
  const detailByName = new Map(
    (payroll.traineeCategoryDetails ?? []).map((detail) => [
      detail.categoryName.trim().toLowerCase(),
      detail,
    ]),
  );
  await tx.insert(traineeCategory).values(
    payroll.traineeCategories.map((categoryName) => {
      const detail = detailByName.get(categoryName.trim().toLowerCase());
      return {
        payrollConfigId: configId,
        categoryName: categoryName.trim(),
        qualification: blankToNull(detail?.qualification),
        stipendRate: blankToNull(detail?.stipendRate),
      };
    }),
  );

  // 7. Insert payroll items - exactly one row per fixed key, always
  // (SPEC-06 section 3.3), unlike commercial_item's blank-means-no-row
  // (SPEC-05 D31): every one of the 22 items has already been confirmed
  // Yes or No by validatePayrollDetails, and itemType is taken from the
  // catalogue rather than trusted from the client. Plus one row per
  // non-blank Other row.
  const payrollItemRows: (typeof payrollItem.$inferInsert)[] = [];
  // SPEC-23 D148: every company is created with PF / ESI / TDS, defaulted when not given.
  const items = withStatutoryDefaults(payroll.items);
  for (const key of PAYROLL_FIXED_ITEM_KEYS) {
    const answer = items[key];
    const isApplicable = answer?.isApplicable ?? false;
    const { itemType, valueKind } = PAYROLL_ITEM_BY_KEY[key];
    payrollItemRows.push({
      payrollConfigId: configId,
      itemKey: key,
      isApplicable,
      // SPEC-23 D143: a status item (TDS) never carries an amount, Yes or No.
      amount: isApplicable && valueKind !== "STATUS" ? answer?.amount.trim() : undefined,
      itemType: itemType ?? "ALLOWANCE",
    });
  }
  for (const row of payroll.otherItems) {
    const label = row.label.trim();
    const amount = row.amount.trim();
    const itemType = row.itemType.trim();
    if (label === "" && amount === "" && itemType === "") {
      // A fully empty Other row is ignored, nothing to persist.
      continue;
    }
    payrollItemRows.push({
      payrollConfigId: configId,
      itemKey: "OTHER",
      customLabel: label,
      isApplicable: true,
      amount,
      itemType,
    });
  }
  await tx.insert(payrollItem).values(payrollItemRows);

  return { companyId, mouId, generatedCode };
}
