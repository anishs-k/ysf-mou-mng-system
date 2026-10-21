/**
 * Purpose: The SPEC-22 files - the Excel and PDF templates and the reader for an
 * uploaded sheet - all driven by @mou/domain's BULK_COMPANY_COLUMNS (D136). The
 * Excel template carries dropdowns fed from a hidden "Lists" sheet (the Zone list
 * is the uploader's zones). D159: the PDF is the blank Add New Company form to fill
 * by hand - the same fields in the record PDF's YSF layout (pdf-layout.ts), with
 * 5-row tables for the charges and trainee categories. The reader turns each
 * non-blank row into text cells keyed by column, matching headers by text, and
 * refuses a file that is not the template with a message a user can act on.
 * D161: every template header must appear once (extra blank / unknown columns are
 * ignored), a renamed sheet is found by its headers, and cells are read as trimmed
 * text - links by their text, formulas by result - so space-only rows are skipped.
 * D162: sortBulkUploadFiles splits one upload into the sheet and its MoU PDFs.
 * D165: readMouPdfForm reads a filled fillable form back into its field values.
 */

import {
  BULK_COMPANY_COLUMNS,
  BULK_COMPANY_SHEET,
  BULK_INSTRUCTIONS,
  BULK_LIST_OPTIONS,
  BULK_MAX_ROWS,
  BULK_SECTIONS,
  bulkRequiredLabel,
  matchBulkHeaders,
} from "@mou/domain";
import {
  COMMERCIAL_BASIS_OPTIONS,
  COMMERCIAL_PERIOD_OPTIONS,
  bulkFormFieldNames,
  chargeFormField,
  traineeFormField,
} from "@mou/domain";
import type { BulkColumn, BulkListName, BulkSection, BulkZone } from "@mou/domain";
import ExcelJS from "exceljs";
import { PDFDocument as PdfLibDocument, PDFDropdown, PDFTextField } from "pdf-lib";
import PDFDocument from "pdfkit";

import {
  BAND_HEIGHT,
  BOTTOM_MARGIN,
  MARGIN,
  blankFieldGrid,
  blankTable,
  blankTableHeight,
  drawBrandBand,
  drawFooters,
  dashedDropBox,
  drawRunningHeader,
  ensureSpace,
  sectionHeading,
  smallPrint,
  subHeading,
} from "./pdf-layout.ts";
import type { BlankField, FormFieldSpec } from "./pdf-layout.ts";
import { validatePdfBuffer } from "../upload/mou-document-storage.ts";

/** Rows of the template that get dropdowns - the data row limit (D140). */
const TEMPLATE_DATA_ROWS = BULK_MAX_ROWS;
const HEADER_FILL = "FF0D2E5A";
const REQUIRED_FILL = "FFB91C1C";

/** The dropdown labels for a list column; Zone uses the uploader's zone names. */
function listLabels(list: BulkListName, zones: readonly BulkZone[]): readonly string[] {
  return list === "zone" ? zones.map((zone) => zone.name) : BULK_LIST_OPTIONS[list].map((option) => option.label);
}

export async function buildBulkTemplateWorkbook(zones: readonly BulkZone[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(BULK_COMPANY_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  const instructions = workbook.addWorksheet("Instructions");
  const lists = workbook.addWorksheet("Lists", { state: "hidden" });

  sheet.columns = BULK_COMPANY_COLUMNS.map((column) => ({
    header: column.header,
    key: column.key,
    width: Math.max(14, column.header.length + 4),
    // Text format keeps GST numbers, phone numbers and amounts exactly as typed;
    // the start date stays General so Excel accepts a real date there.
    style: column.key === "mouStartDate" ? {} : { numFmt: "@" },
  }));
  const header = sheet.getRow(1);
  BULK_COMPANY_COLUMNS.forEach((column, index) => {
    const cell = header.getCell(index + 1);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: column.required ? REQUIRED_FILL : HEADER_FILL } };
    cell.note = `${column.section} · ${bulkRequiredLabel(column)}. ${column.format}`;
  });

  // One Lists column per distinct list, referenced by every data row's dropdown.
  const listColumns = new Map<BulkListName, string>();
  for (const column of BULK_COMPANY_COLUMNS) {
    if (column.list === undefined || listColumns.has(column.list)) continue;
    const labels = listLabels(column.list, zones);
    if (labels.length === 0) continue;
    const listColumn = lists.getColumn(listColumns.size + 1);
    labels.forEach((label, index) => {
      lists.getCell(index + 1, listColumns.size + 1).value = label;
    });
    listColumns.set(column.list, `Lists!$${listColumn.letter}$1:$${listColumn.letter}$${labels.length}`);
  }
  BULK_COMPANY_COLUMNS.forEach((column, index) => {
    const formula = column.list === undefined ? undefined : listColumns.get(column.list);
    if (formula === undefined) return;
    for (let row = 2; row <= TEMPLATE_DATA_ROWS + 1; row += 1) {
      sheet.getCell(row, index + 1).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: [formula],
        showErrorMessage: true,
        errorTitle: column.header,
        error: "Choose a value from the list",
      };
    }
  });

  instructions.columns = [
    { header: "How to fill the Companies sheet", key: "text", width: 24 },
    { key: "column", width: 34 },
    { key: "required", width: 12 },
    { key: "accepted", width: 90 },
  ];
  instructions.getRow(1).font = { bold: true };
  BULK_INSTRUCTIONS.forEach((line, index) => instructions.addRow({ text: `${index + 1}. ${line}` }));
  instructions.addRow({});
  instructions.addRow({ text: "Red headers are required (Imp / Yes); blue headers are optional (No). Hover a header for its format." });

  // D154: the same columns grouped by the wizard's cards, as the PDF prints them.
  instructions.addRow({});
  const tableHeader = instructions.addRow(["Section", "Column", "Required", "Accepted values / format"]);
  tableHeader.font = { bold: true };
  for (const section of BULK_SECTIONS) {
    for (const column of BULK_COMPANY_COLUMNS.filter((entry) => entry.section === section)) {
      instructions.addRow([section, column.header, bulkRequiredLabel(column), acceptedText(column, zones)]);
    }
  }

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

const PDF_TITLE = "Add New Company";
/** D159: the blank rows the form gives each repeating list. */
const BLANK_ROWS = 5;
/** D160: the attach / staple box - roughly a folded page's worth of room. */
const UPLOAD_BOX_HEIGHT = 170;
/** Keys printed full width: addresses and emails need the room. */
const WIDE_FIELDS = new Set(["addressLine1", "addressLine2", "hrEmail", "financeEmail", "purchaseEmail"]);

/** What a column accepts, with the list values spelled out (D140). */
function acceptedText(column: BulkColumn, zones: readonly BulkZone[]): string {
  if (column.list === undefined) return column.format;
  const labels = listLabels(column.list, zones);
  return labels.length === 0 ? column.format : `${column.format}: ${labels.join(", ")}`;
}

/** A column's interactive field, named by its key: a dropdown when it has a list, else text. */
function formFieldFor(column: BulkColumn, zones: readonly BulkZone[]): FormFieldSpec {
  const options = column.list === undefined ? [] : listLabels(column.list, zones);
  return options.length === 0 ? { name: column.key } : { name: column.key, options };
}

/** A section's single fields as blank cells - list fields name their choices under the line. */
function blankFields(section: BulkSection, zones: readonly BulkZone[]): BlankField[] {
  return BULK_COMPANY_COLUMNS.filter((column) => column.section === section && !column.key.startsWith("charge:") && column.key !== "traineeCategories").map(
    (column) => ({
      label: column.header,
      required: column.required,
      hint: column.list === undefined ? column.format : listLabels(column.list, zones).join(" / "),
      wide: WIDE_FIELDS.has(column.key),
      // D165: typed in a PDF viewer; a list column is a dropdown of the same choices.
      formField: formFieldFor(column, zones),
    }),
  );
}

const CHARGE_COLUMNS = [
  { header: "#", share: 0.06 },
  { header: "Charge Name", share: 0.34 },
  { header: "Amount (Rs.)", share: 0.18 },
  { header: "Period", share: 0.18 },
  { header: "Basis", share: 0.24 },
] as const;
const TRAINEE_COLUMNS = [
  { header: "#", share: 0.06 },
  { header: "Trainee Category", share: 0.4 },
  { header: "Qualification", share: 0.32 },
  { header: "Stipend Rate (Rs.)", share: 0.22 },
] as const;

const optionLabels = (options: readonly { readonly label: string }[]): string => options.map((option) => option.label).join(" / ");

export interface BulkTemplatePdfOptions {
  /** The YSF logo PNG; a drawn "YSF" mark stands in when it is absent. */
  readonly logo?: Buffer | undefined;
  /** Tests turn compression off to read the text back. */
  readonly compress?: boolean;
}

/**
 * D159: the blank Add New Company form, in the record PDF's look - the YSF band,
 * then the four sections: labelled blank cells two to a row for the single fields,
 * and numbered 5-row tables for Commercial as per MoU (Charge Name | Amount |
 * Period | Basis, the 9 core charges named under it) and the trainee categories.
 * PF, ESI and TDS are server defaults (D148) and are not on the form. D160: it
 * ends with an Upload MoU PDF section - a dashed box to attach the signed MoU to.
 * D165: every cell and table row is also an interactive field named after its
 * column, so the form can be typed in a PDF viewer and uploaded on its own.
 */
export async function buildBulkTemplatePdf(zones: readonly BulkZone[], options: BulkTemplatePdfOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margins: { top: MARGIN, left: MARGIN, right: MARGIN, bottom: BOTTOM_MARGIN },
      bufferPages: true,
      compress: options.compress ?? true,
      info: { Title: PDF_TITLE, Author: "YSF MoU Management System" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.on("pageAdded", () => drawRunningHeader(doc, PDF_TITLE, "Company onboarding form"));
    doc.initForm();

    drawBrandBand(doc, options.logo, {
      title: PDF_TITLE,
      lines: ["Company onboarding form - fill in one form per company.", "Fields marked * are required."],
      reserveRight: 0,
    });
    doc.x = MARGIN;
    doc.y = BAND_HEIGHT + 24;

    sectionHeading(doc, "Basic Information & Address");
    blankFieldGrid(doc, blankFields("Basic Information & Address", zones));

    sectionHeading(doc, "Contact Information");
    blankFieldGrid(doc, blankFields("Contact Information", zones));

    sectionHeading(doc, "Commercial Details");
    blankFieldGrid(doc, blankFields("Commercial Details", zones));
    const charges = BULK_COMPANY_COLUMNS.filter((column) => column.key.startsWith("charge:")).map((column) => column.header);
    const chargeNotes = [
      `Charge Name: ${charges.join(", ")}.`,
      `Period: ${optionLabels(COMMERCIAL_PERIOD_OPTIONS)}.   Basis: ${optionLabels(COMMERCIAL_BASIS_OPTIONS)}.`,
    ];
    ensureSpace(doc, 14 + 30 + blankTableHeight(doc, CHARGE_COLUMNS, BLANK_ROWS));
    subHeading(doc, "Commercial as per MoU");
    chargeNotes.forEach((line) => smallPrint(doc, line));
    const chargeOptions = [charges, COMMERCIAL_PERIOD_OPTIONS.map((option) => option.label), COMMERCIAL_BASIS_OPTIONS.map((option) => option.label)];
    blankTable(doc, CHARGE_COLUMNS, BLANK_ROWS, undefined, (row, column) => {
      if (column === 1) return { name: chargeFormField(row, "Name"), options: chargeOptions[0] };
      if (column === 2) return { name: chargeFormField(row, "Amount") };
      if (column === 3) return { name: chargeFormField(row, "Period"), options: chargeOptions[1] };
      if (column === 4) return { name: chargeFormField(row, "Basis"), options: chargeOptions[2] };
      return undefined;
    });

    // The heading travels with its whole table.
    sectionHeading(doc, "Payroll Details", 14 + blankTableHeight(doc, TRAINEE_COLUMNS, BLANK_ROWS));
    subHeading(doc, "Trainee Categories *");
    const traineeParts = [undefined, "Name", "Qualification", "StipendRate"] as const;
    blankTable(doc, TRAINEE_COLUMNS, BLANK_ROWS, undefined, (row, column) => {
      const part = traineeParts[column];
      return part === undefined ? undefined : { name: traineeFormField(row, part) };
    });

    // D160: the wizard's Upload MoU PDF area, as a box to attach the signed copy to.
    sectionHeading(doc, "Upload MoU PDF", UPLOAD_BOX_HEIGHT);
    dashedDropBox(doc, "Attach / Staple MoU PDF Document Here", UPLOAD_BOX_HEIGHT);

    drawFooters(doc);
    doc.end();
  });
}

/** A cell's raw text: dates as ISO, rich text joined, formulas by result, a link by its (possibly rich) text. */
function rawCellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part: { readonly text?: unknown }) => rawCellText(part.text)).join("");
    }
    if ("result" in value) return rawCellText(value.result);
    // A typed email Excel turned into a link; its text may itself be rich text (D161).
    if ("text" in value) return rawCellText(value.text);
    // A formula error such as #N/A, or anything else unreadable, counts as blank.
    return "";
  }
  return String(value);
}

/** D161: the text the user sees, trimmed - so a cell of spaces is blank and a row of them is skipped. */
function cellText(value: ExcelJS.CellValue): string {
  return rawCellText(value).trim();
}

function headerTexts(sheet: ExcelJS.Worksheet): string[] {
  const headerRow = sheet.getRow(1);
  return Array.from({ length: headerRow.cellCount }, (_, index) => cellText(headerRow.getCell(index + 1).value));
}

/**
 * D161: the "Companies" sheet, or - when it was renamed - the first sheet whose
 * header row holds every template header.
 */
function findTemplateSheet(workbook: ExcelJS.Workbook): ExcelJS.Worksheet | undefined {
  return (
    workbook.getWorksheet(BULK_COMPANY_SHEET) ??
    workbook.worksheets.find((sheet) => matchBulkHeaders(headerTexts(sheet)).missing.length === 0)
  );
}

export interface BulkSheetRow {
  /** The Excel row number, as the user sees it. */
  readonly row: number;
  /** Text cells keyed by BULK_COMPANY_COLUMNS key; a column the sheet lacks is "". */
  readonly cells: Readonly<Record<string, string>>;
}

export type BulkSheetRead = { readonly ok: true; readonly rows: readonly BulkSheetRow[] } | { readonly ok: false; readonly error: string };

const USE_TEMPLATE = "Use the downloaded template.";

export async function readBulkSheet(buffer: Buffer): Promise<BulkSheetRead> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return { ok: false, error: `The file could not be read as an Excel (.xlsx) workbook. ${USE_TEMPLATE}` };
  }
  const sheet = findTemplateSheet(workbook);
  if (sheet === undefined) {
    return { ok: false, error: `The file has no "${BULK_COMPANY_SHEET}" sheet and no sheet with the template's header row. ${USE_TEMPLATE}` };
  }

  const { indexByKey, missing, duplicated } = matchBulkHeaders(headerTexts(sheet));
  if (missing.length > 0) {
    return { ok: false, error: `Missing column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. ${USE_TEMPLATE}` };
  }
  if (duplicated.length > 0) {
    return { ok: false, error: `Column appears more than once: ${duplicated.join(", ")}. ${USE_TEMPLATE}` };
  }

  const rows: BulkSheetRow[] = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cells: Record<string, string> = {};
    for (const column of BULK_COMPANY_COLUMNS) {
      const index = indexByKey.get(column.key);
      cells[column.key] = index === undefined ? "" : cellText(row.getCell(index + 1).value);
    }
    if (Object.values(cells).every((value) => value === "")) continue;
    if (rows.length === BULK_MAX_ROWS) {
      return { ok: false, error: `The sheet has more than ${BULK_MAX_ROWS} company rows. Split it into several files.` };
    }
    rows.push({ row: rowNumber, cells });
  }
  if (rows.length === 0) {
    return { ok: false, error: "The sheet has no company rows." };
  }
  return { ok: true, rows };
}

// --- D162: the files of one bulk upload --------------------------------------------------

/** D140: the Excel file is at most 5 MB. */
export const MAX_BULK_SHEET_BYTES = 5 * 1024 * 1024;
/** D162: MoU PDFs one upload may carry - each is held in memory until the import ends. */
export const BULK_MAX_MOU_PDFS = 50;

/** The part of a multer file the sorting needs. */
export interface UploadedFile {
  readonly originalname: string;
  readonly mimetype: string;
  readonly buffer: Buffer;
  readonly size: number;
}

export type SortedBulkUpload<F extends UploadedFile> =
  /** `sheet` is undefined for PDFs alone (D164) - they go to existing companies. */
  | { readonly ok: true; readonly sheet: F | undefined; readonly pdfs: readonly F[] }
  | { readonly ok: false; readonly errors: readonly string[] };

const extensionOf = (name: string): string => name.toLowerCase().slice(name.lastIndexOf("."));

/**
 * D162: one upload is at most one .xlsx (the filled template) plus any number of MoU
 * PDFs up to the cap; D164: either may come alone. Every problem is listed at once. A PDF is judged by its
 * `%PDF` header, as Upload MoU judges it; browsers that send it as octet-stream
 * are not refused for their label. An old .xls gets a "save as .xlsx" message.
 */
export function sortBulkUploadFiles<F extends UploadedFile>(files: readonly F[]): SortedBulkUpload<F> {
  const sheets: F[] = [];
  const pdfs: F[] = [];
  const errors: string[] = [];
  for (const file of files) {
    const extension = extensionOf(file.originalname);
    if (extension === ".xlsx") {
      sheets.push(file);
    } else if (extension === ".xls") {
      errors.push(`${file.originalname} is an old Excel (.xls) file. Save it as Excel Workbook (.xlsx) and upload again.`);
    } else if (extension === ".pdf") {
      if (validatePdfBuffer(file.buffer, "application/pdf").valid) pdfs.push(file);
      else errors.push(`${file.originalname}: not a valid PDF file.`);
    } else {
      errors.push(`${file.originalname}: only the Excel template (.xlsx) and MoU PDFs (.pdf) can be uploaded.`);
    }
  }
  const sheet = sheets[0];
  if (sheets.length > 1) {
    errors.unshift(`Upload one Excel file at a time (got ${sheets.map((file) => file.originalname).join(", ")}).`);
  } else if (sheet !== undefined && sheet.size > MAX_BULK_SHEET_BYTES) {
    errors.push("The Excel file must be 5 MB or smaller.");
  }
  if (pdfs.length > BULK_MAX_MOU_PDFS) errors.push(`Upload at most ${BULK_MAX_MOU_PDFS} MoU PDFs at a time.`);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, sheet, pdfs };
}

// --- D165: reading a filled fillable form ------------------------------------------------

/**
 * The field values of a filled Add New Company form (bulkFormFieldNames), or
 * undefined when the PDF is not one - no form, no GST Number field, or unreadable.
 * Text fields give their text and dropdowns their choice; blanks are "".
 */
export async function readMouPdfForm(buffer: Buffer): Promise<Record<string, string> | undefined> {
  let form;
  try {
    form = (await PdfLibDocument.load(buffer, { ignoreEncryption: true, updateMetadata: false })).getForm();
  } catch {
    return undefined;
  }
  const known = new Set(bulkFormFieldNames());
  const values: Record<string, string> = {};
  for (const field of form.getFields()) {
    const name = field.getName();
    if (!known.has(name)) continue;
    if (field instanceof PDFTextField) values[name] = (field.getText() ?? "").trim();
    else if (field instanceof PDFDropdown) values[name] = (field.getSelected()[0] ?? "").trim();
  }
  return "gstNumber" in values ? values : undefined;
}
