/**
 * Purpose: The SPEC-23 §5 record PDF behind the record view's Export PDF button -
 * one MoU's full record (Overview, Commercial, Payroll, History, Documents) as a
 * designed A4 document: a navy header band with the YSF logo, bordered grids and
 * tables whose header row repeats after a page break, and "Page x of y" footers.
 * SPEC-24 renders any number of records into one file, each from a fresh page, and
 * loads them in a fixed number of queries; the one-record functions are that case.
 * The band, tables and footers come from pdf-layout.ts, shared with the bulk template.
 */

import {
  COMMERCIAL_BASIS_LABELS,
  COMMERCIAL_PERIOD_LABELS,
  COMPANY_DOCUMENT_TYPE_LABELS,
  COMPANY_TYPE_LABELS,
  ITEM_TYPE_LABELS,
  REGISTRATION_TYPE_LABELS,
  SCHEME_LABELS,
  SECTOR_LABELS,
  TENURE_UNIT_LABELS,
  displayMouStatus,
  formatPayrollValue,
} from "@mou/domain";
import { desc, inArray } from "drizzle-orm";
import PDFDocument from "pdfkit";
import type { Pool } from "pg";

import type { Database } from "./client.ts";
import {
  businessToday,
  fetchCompaniesAgreements,
  fetchCompanyOverviews,
  fetchMouCommercialDetails,
  fetchMouPayrollDetails,
} from "./mou-view.ts";
import type {
  CompanyAgreementRow,
  CompanyOverview,
  MouCommercialDetail,
  MouPayrollDetail,
  MouPayrollItemRow,
} from "./mou-view.ts";
import {
  BAND_HEIGHT,
  BORDER,
  BOTTOM_MARGIN,
  CELL_PADDING,
  MARGIN,
  MUTED,
  NAVY,
  ORANGE,
  TEXT,
  contentWidth,
  drawBrandBand,
  drawFooters,
  drawRunningHeader,
  ensureSpace,
  gap,
  note,
  sectionHeading,
  subHeading,
  table,
} from "./pdf-layout.ts";
import type { Doc } from "./pdf-layout.ts";
import { companyDocument, mouDocument } from "./schema.ts";

/** One row of the Documents section - an MoU PDF or a company certificate. */
export interface CompanyRecordDocument {
  readonly name: string;
  readonly type: string;
  readonly sizeBytes: number;
  /** ISO timestamp. */
  readonly uploadedAt: string;
}

export interface CompanyRecord {
  readonly overview: CompanyOverview;
  readonly commercial: MouCommercialDetail;
  readonly payroll: MouPayrollDetail | undefined;
  readonly agreements: readonly CompanyAgreementRow[];
  readonly documents: readonly CompanyRecordDocument[];
  /** The business date the displayed statuses are derived against (YYYY-MM-DD). */
  readonly today: string;
  readonly generatedBy: string;
}

export interface RenderOptions {
  /** The YSF logo PNG; a drawn "YSF" mark stands in when it is absent. */
  readonly logo?: Buffer | undefined;
  /** Tests turn compression off to read the text back. */
  readonly compress?: boolean;
}

// --- Record-only constants (A4 portrait; the shared layout is pdf-layout.ts) -----

/** pdfkit's standard Helvetica has no ₹ glyph. */
const CURRENCY = "Rs.";
const DASH = "—";
const STATUS_COLOURS: Readonly<Record<string, string>> = {
  Active: "#39B54A",
  Expiring: ORANGE,
  Expired: "#B91C1C",
  New: "#1B5FAE",
};

// --- Value formatting -----------------------------------------------------------

function labelOf(labels: Readonly<Record<string, string>>, code: string | null): string {
  if (code === null || code === "") return DASH;
  return labels[code] ?? code;
}

function joinPresent(parts: readonly (string | null)[], separator: string): string {
  const present = parts.filter((part): part is string => part !== null && part.trim() !== "");
  return present.length === 0 ? DASH : present.join(separator);
}

/** "2026-12-31" -> "31 Dec 2026", never shifted by the time zone. */
function calendarDate(isoDate: string | null): string {
  if (isoDate === null || isoDate === "") return DASH;
  const [year = 0, month = 1, day = 1] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** An upload timestamp as its Asia/Kolkata calendar date (SPEC-01's business clock). */
function uploadDate(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function stipendDay(day: number | null): string {
  if (day === null) return DASH;
  const teen = day % 100 >= 11 && day % 100 <= 13;
  const suffix = teen ? "th" : (["th", "st", "nd", "rd"][day % 10] ?? "th");
  return `${day}${suffix} of every month`;
}

function payrollValue(item: MouPayrollItemRow): string {
  return formatPayrollValue(item.valueKind, item.amount, item.isApplicable, CURRENCY);
}

// --- Building blocks ------------------------------------------------------------

function drawStatusPill(doc: Doc, status: string): void {
  const width = 92;
  const x = doc.page.width - MARGIN - width;
  doc.roundedRect(x, 32, width, 22, 11).fill(STATUS_COLOURS[status] ?? MUTED);
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF").text(status.toUpperCase(), x, 39, { width, align: "center", lineBreak: false });
}

function drawHeaderBand(doc: Doc, record: CompanyRecord, logo: Buffer | undefined): void {
  const { overview, commercial } = record;
  drawBrandBand(doc, logo, {
    title: overview.companyName,
    lines: [`${overview.zoneName} Zone · ${commercial.generatedCode}`, `Scheme: ${labelOf(SCHEME_LABELS, commercial.scheme)}`],
    reserveRight: 104,
  });
  drawStatusPill(doc, displayMouStatus(commercial.status, commercial.endDate, record.today));
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(
    `MoU Record · Generated ${calendarDate(record.today)} by ${record.generatedBy}`,
    MARGIN,
    BAND_HEIGHT + 14,
    { width: contentWidth(doc), lineBreak: false },
  );
  doc.x = MARGIN;
  doc.y = BAND_HEIGHT + 34;
}

interface LabelledValue {
  readonly label: string;
  readonly value: string;
}

function gridCellHeight(doc: Doc, item: LabelledValue, width: number): number {
  doc.font("Helvetica-Bold").fontSize(7);
  const labelHeight = doc.heightOfString(item.label.toUpperCase(), { width });
  doc.font("Helvetica").fontSize(9.5);
  return labelHeight + 3 + doc.heightOfString(item.value, { width }) + CELL_PADDING * 2;
}

function drawGridCell(doc: Doc, item: LabelledValue, x: number, y: number, width: number, height: number): void {
  doc.lineWidth(0.5).rect(x, y, width, height).stroke(BORDER);
  const textWidth = width - CELL_PADDING * 2;
  doc.font("Helvetica-Bold").fontSize(7).fillColor(MUTED).text(item.label.toUpperCase(), x + CELL_PADDING, y + CELL_PADDING, { width: textWidth });
  doc.font("Helvetica").fontSize(9.5).fillColor(TEXT).text(item.value, x + CELL_PADDING, doc.y + 3, { width: textWidth });
}

/** Label / value pairs in a bordered two-column grid. */
function keyValueGrid(doc: Doc, items: readonly LabelledValue[]): void {
  const cellWidth = contentWidth(doc) / 2;
  for (let index = 0; index < items.length; index += 2) {
    const pair = items.slice(index, index + 2);
    const height = Math.max(...pair.map((item) => gridCellHeight(doc, item, cellWidth - CELL_PADDING * 2)));
    ensureSpace(doc, height);
    const top = doc.y;
    pair.forEach((item, column) => drawGridCell(doc, item, MARGIN + column * cellWidth, top, cellWidth, height));
    doc.x = MARGIN;
    doc.y = top + height;
  }
  gap(doc, 12);
}

// --- The five sections ------------------------------------------------------------

function overviewItems(record: CompanyRecord): readonly LabelledValue[] {
  const { overview, commercial } = record;
  const plant = overview.plants.find((candidate) => candidate.id === commercial.companyPlantId);
  return [
    { label: "Company Type", value: labelOf(COMPANY_TYPE_LABELS, overview.companyType) },
    { label: "Sector", value: labelOf(SECTOR_LABELS, overview.sector) },
    { label: "Registration", value: labelOf(REGISTRATION_TYPE_LABELS, overview.registrationType) },
    { label: "GST Number", value: overview.gstNumber },
    { label: "TAN Number", value: overview.tanNumber },
    { label: "Zone", value: overview.zoneName },
    { label: "Plant", value: plant?.plantName ?? joinPresent(overview.plants.map((candidate) => candidate.plantName), ", ") },
    { label: "HR Contact", value: joinPresent([overview.hrContactName, overview.hrContactNumber], " · ") },
    { label: "Finance Head", value: joinPresent([overview.financeHeadContactName, overview.financeHeadContactNumber], " · ") },
    { label: "HR Email", value: overview.hrEmail },
    { label: "Finance Email", value: overview.financeEmail },
    { label: "Purchase Contact", value: joinPresent([overview.purchaseName, overview.purchaseNumber, overview.purchaseEmail], " · ") },
    {
      label: "Address",
      value: joinPresent([overview.addressLine1, overview.addressLine2, overview.city, overview.district, `${overview.state} - ${overview.pinCode}`], ", "),
    },
    { label: "MoU Code", value: commercial.generatedCode },
    { label: "Expires", value: calendarDate(commercial.endDate) },
  ];
}

function commercialSection(doc: Doc, commercial: MouCommercialDetail): void {
  sectionHeading(doc, "Commercial");
  keyValueGrid(doc, [
    { label: "Scheme", value: labelOf(SCHEME_LABELS, commercial.scheme) },
    { label: "MoU Start", value: calendarDate(commercial.mouStartDate) },
    { label: "Tenure", value: `${commercial.tenureValue} ${labelOf(TENURE_UNIT_LABELS, commercial.tenureUnit)}` },
    { label: "MoU End", value: calendarDate(commercial.endDate) },
    { label: "Attendance Cycle", value: commercial.attendanceCycle },
    { label: "Stipend Date", value: stipendDay(commercial.stipendDate) },
  ]);
  const rows = [
    ...commercial.charges
      .filter((charge) => charge.amount !== null)
      .map((charge) => [charge.label, `${CURRENCY} ${charge.amount ?? ""}`, labelOf(COMMERCIAL_PERIOD_LABELS, charge.period), labelOf(COMMERCIAL_BASIS_LABELS, charge.basis)]),
    ...commercial.otherItems.map((item) => [`${item.label} (${labelOf(ITEM_TYPE_LABELS, item.itemType)})`, `${CURRENCY} ${item.amount}`, DASH, DASH]),
  ];
  subHeading(doc, "Charges");
  if (rows.length === 0) {
    note(doc, "No charges recorded.");
    return;
  }
  table(doc, [{ header: "Charge", share: 0.34 }, { header: "Amount", share: 0.22 }, { header: "Period", share: 0.2 }, { header: "Basis", share: 0.24 }], rows);
}

function payrollTable(doc: Doc, title: string, items: readonly MouPayrollItemRow[]): void {
  subHeading(doc, title);
  if (items.length === 0) {
    note(doc, "None recorded.");
    return;
  }
  table(doc, [{ header: "Item", share: 0.6 }, { header: "Value", share: 0.4 }], items.map((item) => [item.label, payrollValue(item)]));
}

function payrollSection(doc: Doc, payroll: MouPayrollDetail | undefined): void {
  sectionHeading(doc, "Payroll");
  if (payroll === undefined) {
    note(doc, "No payroll configuration recorded.");
    return;
  }
  payrollTable(doc, "Allowances", payroll.allowances);
  payrollTable(doc, "Deductions", payroll.deductions);
  subHeading(doc, "Trainee Categories");
  if (payroll.traineeCategories.length === 0) {
    note(doc, "None recorded.");
    return;
  }
  keyValueGrid(doc, [{ label: "Categories", value: payroll.traineeCategories.join(", ") }]);
}

/** An empty section is only its heading and a one-line note, so it needs far less room kept below. */
const EMPTY_SECTION_KEEP = 24;

function historySection(doc: Doc, record: CompanyRecord): void {
  sectionHeading(doc, "History", record.agreements.length === 0 ? EMPTY_SECTION_KEEP : undefined);
  if (record.agreements.length === 0) {
    note(doc, "No agreements recorded.");
    return;
  }
  table(
    doc,
    [{ header: "MoU Code", share: 0.25 }, { header: "Plant", share: 0.2 }, { header: "Start", share: 0.14 }, { header: "End", share: 0.14 }, { header: "Scheme", share: 0.12 }, { header: "Status", share: 0.15 }],
    record.agreements.map((row) => [
      row.generatedCode,
      row.plantName ?? DASH,
      calendarDate(row.mouStartDate),
      calendarDate(row.endDate),
      labelOf(SCHEME_LABELS, row.scheme),
      displayMouStatus(row.status, row.endDate, record.today),
    ]),
  );
}

function documentsSection(doc: Doc, documents: readonly CompanyRecordDocument[]): void {
  sectionHeading(doc, "Documents", documents.length === 0 ? EMPTY_SECTION_KEEP : undefined);
  if (documents.length === 0) {
    note(doc, "No documents uploaded.");
    return;
  }
  table(
    doc,
    [{ header: "Document", share: 0.4 }, { header: "Type", share: 0.24 }, { header: "Size", share: 0.14 }, { header: "Uploaded", share: 0.22 }],
    documents.map((document) => [document.name, document.type, fileSize(document.sizeBytes), uploadDate(document.uploadedAt)]),
  );
}

/** One record from the current page: header band, then the five sections. */
function drawRecord(doc: Doc, record: CompanyRecord, logo: Buffer | undefined): void {
  drawHeaderBand(doc, record, logo);
  sectionHeading(doc, "Overview");
  keyValueGrid(doc, overviewItems(record));
  commercialSection(doc, record.commercial);
  payrollSection(doc, record.payroll);
  historySection(doc, record);
  documentsSection(doc, record.documents);
}

function documentTitle(records: readonly CompanyRecord[]): string {
  const [only] = records;
  return records.length === 1 && only !== undefined
    ? `${only.overview.companyName} - ${only.commercial.generatedCode}`
    : `MoU Records (${records.length})`;
}

/**
 * SPEC-24: every record in one PDF, each starting on a fresh page with its own
 * header band; pages a record runs onto carry that record's running header, and
 * "Page x of y" counts across the whole file. Refuses an empty list.
 */
export function renderCompanyRecordsPdf(records: readonly CompanyRecord[], options: RenderOptions = {}): Promise<Buffer> {
  if (records.length === 0) {
    return Promise.reject(new RangeError("renderCompanyRecordsPdf needs at least one record"));
  }
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: BOTTOM_MARGIN },
      bufferPages: true,
      compress: options.compress ?? true,
      info: { Title: documentTitle(records), Author: "YSF MoU Management System" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // The page a record starts on gets its header band instead of a running header.
    let current: CompanyRecord | undefined;
    doc.on("pageAdded", () => {
      if (current !== undefined) drawRunningHeader(doc, current.overview.companyName, current.commercial.generatedCode);
    });
    records.forEach((record, index) => {
      if (index > 0) {
        current = undefined;
        doc.addPage();
      }
      current = record;
      drawRecord(doc, record, options.logo);
    });
    drawFooters(doc);
    doc.end();
  });
}

/** The one-record case of renderCompanyRecordsPdf - the record view's Export PDF (SPEC-23 §5). */
export function renderCompanyRecordPdf(record: CompanyRecord, options: RenderOptions = {}): Promise<Buffer> {
  return renderCompanyRecordsPdf([record], options);
}

// --- Data loading ----------------------------------------------------------------

/** Each MoU's documents and each company's certificates, newest first, in two queries. */
async function loadDocuments(
  db: Database,
  mouIds: readonly string[],
  companyIds: readonly string[],
): Promise<{ byMou: Map<string, CompanyRecordDocument[]>; byCompany: Map<string, CompanyRecordDocument[]> }> {
  const [mouDocuments, companyDocuments] = await Promise.all([
    db
      .select({ mouId: mouDocument.mouId, name: mouDocument.originalFilename, sizeBytes: mouDocument.fileSizeBytes, uploadedAt: mouDocument.uploadedAt })
      .from(mouDocument)
      .where(inArray(mouDocument.mouId, [...mouIds]))
      .orderBy(desc(mouDocument.uploadedAt)),
    db
      .select({
        companyId: companyDocument.companyId,
        name: companyDocument.originalFilename,
        documentType: companyDocument.documentType,
        sizeBytes: companyDocument.fileSizeBytes,
        uploadedAt: companyDocument.uploadedAt,
      })
      .from(companyDocument)
      .where(inArray(companyDocument.companyId, [...companyIds]))
      .orderBy(desc(companyDocument.uploadedAt)),
  ]);
  const byMou = new Map<string, CompanyRecordDocument[]>();
  for (const row of mouDocuments) {
    const list = byMou.get(row.mouId) ?? [];
    list.push({ name: row.name, type: "MoU Document", sizeBytes: row.sizeBytes, uploadedAt: row.uploadedAt.toISOString() });
    byMou.set(row.mouId, list);
  }
  const byCompany = new Map<string, CompanyRecordDocument[]>();
  for (const row of companyDocuments) {
    const list = byCompany.get(row.companyId) ?? [];
    list.push({
      name: row.name,
      type: labelOf(COMPANY_DOCUMENT_TYPE_LABELS, row.documentType),
      sizeBytes: row.sizeBytes,
      uploadedAt: row.uploadedAt.toISOString(),
    });
    byCompany.set(row.companyId, list);
  }
  return { byMou, byCompany };
}

/**
 * SPEC-24: everything the record PDF shows for many active MoUs, in the order
 * asked, in a fixed number of queries whatever the count. An unknown or inactive
 * MoU (or one whose company is inactive) is left out.
 */
export async function loadCompanyRecords(
  db: Database,
  pool: Pool,
  mouIds: readonly string[],
  generatedBy: string,
): Promise<CompanyRecord[]> {
  if (mouIds.length === 0) return [];
  const today = await businessToday(pool);
  const commercials = await fetchMouCommercialDetails(db, mouIds, today);
  const foundMouIds = [...commercials.keys()];
  const companyIds = [...new Set([...commercials.values()].map((detail) => detail.companyId))];
  const [overviews, payrolls, agreements, documents] = await Promise.all([
    fetchCompanyOverviews(db, companyIds),
    fetchMouPayrollDetails(db, foundMouIds),
    fetchCompaniesAgreements(db, companyIds, today),
    foundMouIds.length === 0 ? { byMou: new Map(), byCompany: new Map() } : loadDocuments(db, foundMouIds, companyIds),
  ]);
  return mouIds.flatMap((mouId) => {
    const commercial = commercials.get(mouId);
    const overview = commercial === undefined ? undefined : overviews.get(commercial.companyId);
    if (commercial === undefined || overview === undefined) return [];
    return [
      {
        overview,
        commercial,
        payroll: payrolls.get(mouId),
        agreements: agreements.get(commercial.companyId) ?? [],
        documents: [...(documents.byMou.get(mouId) ?? []), ...(documents.byCompany.get(commercial.companyId) ?? [])],
        today,
        generatedBy,
      },
    ];
  });
}

/** Everything the record PDF shows for one active MoU; undefined when the MoU or its company is not found. */
export async function loadCompanyRecord(db: Database, pool: Pool, mouId: string, generatedBy: string): Promise<CompanyRecord | undefined> {
  return (await loadCompanyRecords(db, pool, [mouId], generatedBy))[0];
}
