/**
 * Purpose: The "Only MoU" Excel export - the MoUs in the client's own MOU TEMPLATE
 * layout instead of the four-sheet Full Details workbook. A YSF and / or a YSI
 * sheet - only those with MoUs in the export (SPEC-34: the scheme decides), one row per MoU, the
 * sheet's columns in its order, YSI with its five extra fees. Pure over the
 * records the record PDF already loads (loadCompanyRecords), so it is unit-tested
 * without a database.
 */

import {
  INVOICE_MATCH_LABELS,
  MAIL_CONFIRMATION_LABELS,
  MOU_SIGN_STATUS_LABELS,
  MOU_STATUS_LABELS,
  ORGANISATIONS,
  organisationOfScheme,
  SCHEME_LABELS,
} from "@mou/domain";
import type { Organisation } from "@mou/domain";
import ExcelJS from "exceljs";

import type { CompanyRecord } from "./company-record-pdf.ts";
import { styleHeaderRow } from "./excel-style.ts";

type Cell = string | number | Date | null;

interface MouColumn {
  readonly header: string;
  readonly width: number;
  readonly value: (record: CompanyRecord, index: number) => Cell;
}

function code(labels: Readonly<Record<string, string>>, value: string | null): string {
  return value === null || value === "" ? "" : (labels[value] ?? value);
}

function amountOf(record: CompanyRecord, itemKey: string): number | null {
  const amount = record.commercial.charges.find((charge) => charge.itemKey === itemKey)?.amount ?? null;
  return amount === null ? null : Number(amount);
}

function isoDate(value: string | null): Date | null {
  return value === null || value === "" ? null : new Date(`${value}T00:00:00Z`);
}

const fee = (header: string, itemKey: string): MouColumn => ({ header, width: 14, value: (record) => amountOf(record, itemKey) });

const LEFT_TRAINEE: MouColumn = {
  header: "Left Trainee",
  width: 22,
  value: (record) => {
    const amount = record.payroll?.leftTraineeAmount ?? null;
    const note = record.payroll?.leftTraineeNote ?? null;
    if (amount === null) return note ?? "";
    return note === null || note === "" ? amount : `${amount} (${note})`;
  },
};

const LEADING: readonly MouColumn[] = [
  { header: "Sr. No.", width: 7, value: (_record, index) => index + 1 },
  { header: "MoU Code", width: 20, value: (record) => record.commercial.generatedCode },
  { header: "Company Name (GST)", width: 40, value: (record) => `${record.overview.companyName} (${record.overview.gstNumber})` },
  { header: "Zonal Manager", width: 18, value: (record) => record.overview.zonalManager ?? "" },
  { header: "Division", width: 14, value: (record) => record.overview.zoneName },
  { header: "TYPE", width: 9, value: (record) => code(SCHEME_LABELS, record.commercial.scheme) },
  { header: "MoU Status", width: 12, value: (record) => code(MOU_SIGN_STATUS_LABELS, record.commercial.signStatus) },
  { header: "Mail Confirmation", width: 11, value: (record) => code(MAIL_CONFIRMATION_LABELS, record.commercial.mailConfirmation) },
  { header: "Match with Invoice", width: 11, value: (record) => code(INVOICE_MATCH_LABELS, record.commercial.invoiceMatch) },
  { header: "Payment Term", width: 30, value: (record) => record.commercial.paymentTerm ?? "" },
  { header: "Stipend Date", width: 9, value: (record) => record.commercial.stipendDate },
  fee("Admin", "ADMIN_CHARGES"),
  fee("Supervisor", "SUPERVISOR_CHARGES"),
  fee("Insurance", "INSURANCE"),
  fee("Shoes & Uniform", "SHOES_AND_UNIFORM"),
  fee("Sourcing", "SOURCING_CHARGES"),
  fee("Education / Training", "TRAINING_CHARGES"),
];

const TRAILING: readonly MouColumn[] = [
  fee("Assessment", "ASSESSMENT_CHARGES"),
  {
    header: "Other Charges",
    width: 26,
    value: (record) => record.commercial.otherItems.map((item) => `${item.label}: ${item.amount}`).join("; "),
  },
  { header: "MoU Date", width: 12, value: (record) => isoDate(record.commercial.mouStartDate) },
  { header: "Validity", width: 12, value: (record) => isoDate(record.commercial.endDate) },
  { header: "Status", width: 10, value: (record) => code(MOU_STATUS_LABELS, record.commercial.status) },
  { header: "Remark", width: 30, value: (record) => record.commercial.remark ?? "" },
  { header: "Invoice Remark", width: 30, value: (record) => record.commercial.invoiceRemark ?? "" },
];

/** The client sheet's columns per organisation: YSI adds its five fees around Left Trainee. */
const COLUMNS: Readonly<Record<Organisation, readonly MouColumn[]>> = {
  YSF: [...LEADING, LEFT_TRAINEE, ...TRAILING],
  YSI: [
    ...LEADING,
    fee("Education Fees", "EDUCATION_CHARGES"),
    LEFT_TRAINEE,
    fee("Course Registration Fees", "ONE_TIME_REGISTRATION_FEES"),
    fee("Examination Fees", "EXAMINATION_FEES"),
    fee("Employability Skill Test Fees", "EMPLOYABILITY_TEST_FEES"),
    fee("MSBTE Affiliation Fees", "MSBTE_AFFILIATION_FEES"),
    ...TRAILING,
  ],
};

export const MOU_SHEET_HEADERS: Readonly<Record<Organisation, readonly string[]>> = {
  YSF: COLUMNS.YSF.map((column) => column.header),
  YSI: COLUMNS.YSI.map((column) => column.header),
};

const DATE_HEADERS = new Set(["MoU Date", "Validity"]);

/**
 * One sheet per organisation that has MoUs in the export (a YSI MoU gives only the
 * YSI sheet). With nothing to export, both empty sheets still show the layout.
 */
export function buildMouSheetWorkbook(records: readonly CompanyRecord[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  const present = ORGANISATIONS.filter((organisation) =>
    records.some((record) => organisationOfScheme(record.commercial.scheme) === organisation),
  );
  for (const organisation of present.length === 0 ? ORGANISATIONS : present) {
    const columns = COLUMNS[organisation];
    const sheet = workbook.addWorksheet(organisation);
    sheet.columns = columns.map((column) => ({ header: column.header, width: column.width }));
    styleHeaderRow(sheet);
    const mine = records.filter((record) => organisationOfScheme(record.commercial.scheme) === organisation);
    mine.forEach((record, index) => {
      const row = sheet.addRow(columns.map((column) => column.value(record, index)));
      columns.forEach((column, position) => {
        if (DATE_HEADERS.has(column.header)) row.getCell(position + 1).numFmt = "dd-mm-yyyy";
      });
    });
  }
  return workbook;
}
