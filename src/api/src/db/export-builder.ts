/**
 * Purpose: Generates the two SPEC-13 export documents from the same query
 * layer Search uses (`db/search.ts`), plus SPEC-07's `mou-view.ts` and
 * SPEC-12's `zone-dashboard.ts` - nothing here re-derives a status, a
 * charge, or a payroll item; it only assembles what those modules already
 * compute into a workbook or a PDF.
 */

import {
  COMMERCIAL_FIXED_ITEM_KEYS,
  COMMERCIAL_ITEM_BY_KEY,
  MOU_STATUS_LABELS,
} from "@mou/domain";
import { and, eq, inArray } from "drizzle-orm";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { Pool } from "pg";

import type { ZoneScope } from "../auth/zone-scope.ts";
import type { Database } from "./client.ts";
import { fetchCompanyMous, fetchCompanyOverview, fetchMouCommercialDetail, fetchMouPayrollDetail } from "./mou-view.ts";
import { company, companyPlant } from "./schema.ts";
import type { SearchFilters, SearchRow } from "./search.ts";
import { searchMous } from "./search.ts";
import { fetchSchemeMatrix, fetchZoneSummary } from "./zone-dashboard.ts";

function amountCell(value: string | null): number | null {
  return value === null || value.trim() === "" ? null : Number(value);
}

function dateCell(sheet: ExcelJS.Worksheet, row: ExcelJS.Row, key: string, value: string): void {
  const cell = row.getCell(key);
  cell.value = new Date(`${value}T00:00:00Z`);
  cell.numFmt = "dd-mm-yyyy";
}

interface CompanyExportRow {
  readonly id: string;
  readonly companyName: string;
  readonly companyType: string;
  readonly registrationType: string;
  readonly tanNumber: string;
  readonly gstNumber: string;
  readonly zoneId: string;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string;
  readonly pinCode: string;
  readonly state: string;
  readonly district: string;
  readonly hrContactName: string;
  readonly hrContactNumber: string;
  readonly financeHeadContactName: string;
  readonly financeHeadContactNumber: string;
  readonly officialEmail: string;
  readonly plantNames: string;
}

async function fetchCompaniesWithPlants(db: Database, companyIds: readonly string[]): Promise<CompanyExportRow[]> {
  if (companyIds.length === 0) {
    return [];
  }
  const companies = await db.select().from(company).where(inArray(company.id, [...companyIds]));
  const plants = await db
    .select({ companyId: companyPlant.companyId, plantName: companyPlant.plantName })
    .from(companyPlant)
    .where(and(inArray(companyPlant.companyId, [...companyIds]), eq(companyPlant.isActive, true)));

  const plantsByCompany = new Map<string, string[]>();
  for (const plant of plants) {
    const list = plantsByCompany.get(plant.companyId) ?? [];
    list.push(plant.plantName);
    plantsByCompany.set(plant.companyId, list);
  }

  return companies.map((c) => ({
    id: c.id,
    companyName: c.companyName,
    companyType: c.companyType,
    registrationType: c.registrationType,
    tanNumber: c.tanNumber,
    gstNumber: c.gstNumber,
    zoneId: c.zoneId,
    addressLine1: c.addressLine1,
    addressLine2: c.addressLine2,
    city: c.city,
    pinCode: c.pinCode,
    state: c.state,
    district: c.district,
    hrContactName: c.hrContactName,
    hrContactNumber: c.hrContactNumber,
    financeHeadContactName: c.financeHeadContactName,
    financeHeadContactNumber: c.financeHeadContactNumber,
    officialEmail: c.officialEmail,
    plantNames: (plantsByCompany.get(c.id) ?? []).join(", "),
  }));
}

/** SPEC-13 section 3: the four-sheet workbook, scoped to whatever Search's filters select. */
export async function buildExportWorkbook(
  db: Database,
  pool: Pool,
  scope: ZoneScope,
  filters: SearchFilters,
): Promise<ExcelJS.Workbook> {
  const { rows: mous } = await searchMous(pool, scope, filters);
  const companyIds = [...new Set(mous.map((row) => row.companyId))];
  const companies = await fetchCompaniesWithPlants(db, companyIds);

  const workbook = new ExcelJS.Workbook();

  const companiesSheet = workbook.addWorksheet("Companies");
  companiesSheet.columns = [
    { header: "Company Name", key: "companyName", width: 30 },
    { header: "Company Type", key: "companyType", width: 16 },
    { header: "Registration Type", key: "registrationType", width: 16 },
    { header: "TAN", key: "tanNumber", width: 12 },
    { header: "GST", key: "gstNumber", width: 16 },
    { header: "Plant(s)", key: "plantNames", width: 24 },
    { header: "Address Line 1", key: "addressLine1", width: 24 },
    { header: "Address Line 2", key: "addressLine2", width: 20 },
    { header: "City", key: "city", width: 14 },
    { header: "PIN Code", key: "pinCode", width: 10 },
    { header: "State", key: "state", width: 16 },
    { header: "District", key: "district", width: 16 },
    { header: "HR Contact Name", key: "hrContactName", width: 20 },
    { header: "HR Contact Number", key: "hrContactNumber", width: 16 },
    { header: "Finance Head Contact Name", key: "financeHeadContactName", width: 24 },
    { header: "Finance Head Contact Number", key: "financeHeadContactNumber", width: 16 },
    { header: "Official Email", key: "officialEmail", width: 26 },
  ];
  companiesSheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const c of companies) {
    companiesSheet.addRow(c);
  }

  const mousSheet = workbook.addWorksheet("MOUs");
  mousSheet.columns = [
    { header: "MOU Code", key: "generatedCode", width: 16 },
    { header: "Plant", key: "plantName", width: 18 },
    { header: "Scheme", key: "scheme", width: 14 },
    { header: "MOU Start Date", key: "mouStartDate", width: 14 },
    { header: "Tenure Value", key: "tenureValue", width: 12 },
    { header: "Tenure Unit", key: "tenureUnit", width: 12 },
    { header: "End Date", key: "endDate", width: 14 },
    { header: "Status", key: "status", width: 10 },
    { header: "Attendance Cycle", key: "attendanceCycle", width: 16 },
    { header: "Stipend Date", key: "stipendDate", width: 12 },
  ];
  mousSheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const m of mous) {
    const row = mousSheet.addRow({
      generatedCode: m.generatedCode,
      plantName: m.plantName ?? "",
      scheme: m.scheme,
      tenureValue: m.tenureValue,
      tenureUnit: m.tenureUnit,
      status: MOU_STATUS_LABELS[m.status as keyof typeof MOU_STATUS_LABELS] ?? m.status,
      attendanceCycle: m.attendanceCycle,
      stipendDate: m.stipendDate,
    });
    dateCell(mousSheet, row, "mouStartDate", m.mouStartDate);
    dateCell(mousSheet, row, "endDate", m.endDate);
  }

  const commercialDetails = await Promise.all(mous.map((m) => fetchMouCommercialDetail(db, pool, m.mouId)));
  const detailByMouId = new Map(
    commercialDetails.filter((d): d is NonNullable<typeof d> => d !== undefined).map((d) => [d.mouId, d]),
  );
  const maxOtherItems = Math.max(0, ...[...detailByMouId.values()].map((d) => d.otherItems.length));

  const commercialSheet = workbook.addWorksheet("Commercial");
  const commercialColumns: Partial<ExcelJS.Column>[] = [
    { header: "MOU Code", key: "generatedCode", width: 16 },
    { header: "Plant", key: "plantName", width: 18 },
    { header: "Scheme", key: "scheme", width: 14 },
    ...COMMERCIAL_FIXED_ITEM_KEYS.map((key) => ({ header: COMMERCIAL_ITEM_BY_KEY[key].label, key, width: 18 })),
  ];
  for (let i = 0; i < maxOtherItems; i++) {
    commercialColumns.push(
      { header: `Other ${i + 1} Label`, key: `other${i}Label`, width: 16 },
      { header: `Other ${i + 1} Amount`, key: `other${i}Amount`, width: 14 },
      { header: `Other ${i + 1} Type`, key: `other${i}Type`, width: 12 },
    );
  }
  commercialSheet.columns = commercialColumns;
  commercialSheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const m of mous) {
    const detail = detailByMouId.get(m.mouId);
    if (detail === undefined) {
      continue;
    }
    const values: Record<string, unknown> = { generatedCode: m.generatedCode, plantName: m.plantName ?? "", scheme: m.scheme };
    for (const charge of detail.charges) {
      values[charge.itemKey] = amountCell(charge.amount);
    }
    detail.otherItems.forEach((other, index) => {
      values[`other${index}Label`] = other.label;
      values[`other${index}Amount`] = amountCell(other.amount);
      values[`other${index}Type`] = other.itemType;
    });
    commercialSheet.addRow(values);
  }

  const payrollSheet = workbook.addWorksheet("Payroll");
  payrollSheet.columns = [
    { header: "MOU Code", key: "generatedCode", width: 16 },
    { header: "Scheme", key: "scheme", width: 14 },
    { header: "Trainee Categories", key: "traineeCategories", width: 30 },
    { header: "Item Label", key: "itemLabel", width: 24 },
    { header: "Item Type", key: "itemType", width: 12 },
    { header: "Amount", key: "amount", width: 14 },
  ];
  payrollSheet.views = [{ state: "frozen", ySplit: 1 }];
  for (const m of mous) {
    const payroll = await fetchMouPayrollDetail(db, m.mouId);
    if (payroll === undefined) {
      continue;
    }
    const traineeCategories = payroll.traineeCategories.join(", ");
    const taggedItems = [
      ...payroll.allowances.map((item) => ({ ...item, itemType: "ALLOWANCE" })),
      ...payroll.deductions.map((item) => ({ ...item, itemType: "DEDUCTION" })),
    ];
    for (const item of taggedItems) {
      payrollSheet.addRow({
        generatedCode: m.generatedCode,
        scheme: payroll.scheme,
        traineeCategories,
        itemLabel: item.label,
        itemType: item.itemType,
        amount: amountCell(item.amount),
      });
    }
  }

  return workbook;
}

const PDF_MARGIN = 50;

/** SPEC-13 section 4.2: the zone summary followed by a company listing grouped by zone. */
export async function buildAllZonesPdfBuffer(pool: Pool, scope: ZoneScope, generatedByUsername: string): Promise<Buffer> {
  const [summary, matrix] = await Promise.all([fetchZoneSummary(pool, {}, scope), fetchSchemeMatrix(pool, {}, scope)]);
  const { rows: mous } = await searchMous(pool, scope, {});
  const mousByZone = new Map<string, SearchRow[]>();
  for (const m of mous) {
    const list = mousByZone.get(m.zoneId) ?? [];
    list.push(m);
    mousByZone.set(m.zoneId, list);
  }

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PDF_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text("Zone Wise Summary", { underline: true });
    doc.fontSize(10).text(`Generated ${new Date().toISOString()} by ${generatedByUsername}`);
    doc.moveDown();

    for (const zone of summary) {
      doc.fontSize(13).text(zone.zoneName, { underline: true });
      doc.fontSize(10).text(
        `Companies: ${zone.companies}  Plants: ${zone.plants}  MOUs: ${zone.mous}  Active: ${zone.active}  Expired: ${zone.expired}  New: ${zone.new}  Expiring<=90d: ${zone.expiringSoon}`,
      );
      doc.moveDown(0.5);
    }

    doc.addPage();
    doc.fontSize(14).text("Scheme Matrix", { underline: true });
    doc.fontSize(10);
    for (const row of matrix.rows) {
      const cells = matrix.schemes.map((s) => `${s}: ${row.counts[s] ?? 0}`).join("  ");
      doc.text(`${row.zoneName} — ${cells}  Total: ${row.rowTotal}`);
    }

    for (const zone of summary) {
      const zoneMous = mousByZone.get(zone.zoneId) ?? [];
      if (zoneMous.length === 0) {
        continue;
      }
      doc.addPage();
      doc.fontSize(14).text(`${zone.zoneName} — Companies`, { underline: true });
      doc.fontSize(10);
      for (const m of zoneMous) {
        doc.text(
          `${m.generatedCode}  ${m.companyName}  ${m.plantName ?? "—"}  ${m.scheme}  ${m.mouStartDate} → ${m.endDate}  ${MOU_STATUS_LABELS[m.status as keyof typeof MOU_STATUS_LABELS] ?? m.status}`,
        );
      }
    }

    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(8).text(`Page ${i + 1} of ${range.count}`, PDF_MARGIN, doc.page.height - PDF_MARGIN / 2, {
        align: "center",
      });
    }

    doc.end();
  });
}

/** SPEC-13 section 4.3: the complete record for one company + plant, including payroll (unlike SPEC-07's Print). */
export async function buildCompanyPdfBuffer(
  db: Database,
  pool: Pool,
  companyId: string,
  plantId: string,
  generatedByUsername: string,
): Promise<Buffer | undefined> {
  const overview = await fetchCompanyOverview(db, companyId);
  if (overview === undefined) {
    return undefined;
  }
  const mouOptions = await fetchCompanyMous(db, companyId, plantId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: PDF_MARGIN, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.fontSize(18).text(overview.companyName, { underline: true });
    doc.fontSize(10).text(`Generated ${new Date().toISOString()} by ${generatedByUsername}`);
    doc.moveDown(0.5);
    doc.fontSize(11);
    // SPEC-16 D109: the generated code belongs to the MOU, so it is printed per
    // scheme below rather than once for the company.
    doc.text(`GST Number: ${overview.gstNumber}`);
    doc.text(`HR Contact: ${overview.hrContactName} (${overview.hrContactNumber})`);
    doc.text(`Finance Head: ${overview.financeHeadContactName} (${overview.financeHeadContactNumber})`);

    void (async () => {
      for (const option of mouOptions) {
        const commercial = await fetchMouCommercialDetail(db, pool, option.mouId);
        const payroll = await fetchMouPayrollDetail(db, option.mouId);
        if (commercial === undefined) {
          continue;
        }

        doc.moveDown().fontSize(14).text(`Scheme: ${commercial.scheme}`, { underline: true });
        doc.fontSize(11);
        doc.text(`MOU Start Date: ${commercial.mouStartDate}`);
        doc.text(`Tenure: ${commercial.tenureValue} ${commercial.tenureUnit}`);
        doc.text(`End Date: ${commercial.endDate}`);
        doc.text(`Status: ${MOU_STATUS_LABELS[commercial.status]}`);

        doc.moveDown(0.5).fontSize(12).text("Charges", { underline: true });
        doc.fontSize(10);
        for (const charge of commercial.charges) {
          doc.text(`${charge.label}: ${charge.amount ?? "—"}`, { align: "left" });
        }
        for (const other of commercial.otherItems) {
          doc.text(`${other.label} (${other.itemType}): ${other.amount}`);
        }

        if (payroll !== undefined) {
          doc.moveDown(0.5).fontSize(12).text("Trainee Categories", { underline: true });
          doc.fontSize(10).text(payroll.traineeCategories.join(", ") || "—");

          doc.moveDown(0.5).fontSize(12).text("Allowances", { underline: true });
          doc.fontSize(10);
          for (const item of payroll.allowances) {
            doc.text(`${item.label}: ${item.amount}`);
          }

          doc.moveDown(0.5).fontSize(12).text("Deductions", { underline: true });
          doc.fontSize(10);
          for (const item of payroll.deductions) {
            doc.text(`${item.label}: ${item.amount}`);
          }
        }
      }

      const range = doc.bufferedPageRange();
      for (let i = 0; i < range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).text(`Page ${i + 1} of ${range.count}`, PDF_MARGIN, doc.page.height - PDF_MARGIN / 2, {
          align: "center",
        });
      }
      doc.end();
    })();
  });
}
