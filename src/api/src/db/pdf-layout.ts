/**
 * Purpose: The YSF look shared by every designed PDF the API renders - the record
 * PDF (SPEC-23 §5, SPEC-24) and the blank Add New Company form (D159) - so they
 * cannot drift apart. Holds the palette, the navy title band with the logo, section
 * bars, zebra tables whose header repeats after a page break, a form's blank
 * labelled cells and numbered empty tables (D165: optionally with interactive
 * fields, so the form can be typed in a PDF viewer), footers and the logo loader.
 */

import { readFile } from "node:fs/promises";

import { isFileNotFoundError } from "../upload/file-errors.ts";

export type Doc = PDFKit.PDFDocument;

export interface PdfColumn {
  readonly header: string;
  /** Share of the content width; a table's shares add up to 1. */
  readonly share: number;
}

// --- Layout constants (points) ------------------------------------------------------

export const MARGIN = 40;
/** The footer sits inside this bottom margin. */
export const BOTTOM_MARGIN = 56;
export const BAND_HEIGHT = 96;
export const CELL_PADDING = 7;
export const NAVY = "#0D2E5A";
export const ORANGE = "#F26522";
export const BORDER = "#C9D3E3";
export const MUTED = "#5A7AA8";
export const TEXT = "#1F2937";
const HEADER_FILL = "#E8EEF7";
const ZEBRA_FILL = "#F7F9FC";
const BAND_SUBTEXT = "#D6E2F3";

// --- Page mechanics -----------------------------------------------------------

export function contentWidth(doc: Doc): number {
  return doc.page.width - MARGIN * 2;
}

function contentBottom(doc: Doc): number {
  return doc.page.height - BOTTOM_MARGIN;
}

/** Starts a new page when `height` more points would not fit; true when it did. */
export function ensureSpace(doc: Doc, height: number): boolean {
  if (doc.y + height <= contentBottom(doc)) return false;
  doc.addPage();
  return true;
}

export function gap(doc: Doc, points: number): void {
  doc.y += points;
}

// --- Building blocks ------------------------------------------------------------

function drawLogo(doc: Doc, logo: Buffer | undefined): void {
  doc.roundedRect(MARGIN, 18, 60, 60, 8).fill("#FFFFFF");
  if (logo !== undefined) {
    doc.image(logo, MARGIN + 5, 23, { fit: [50, 50], align: "center", valign: "center" });
    return;
  }
  doc.font("Helvetica-Bold").fontSize(16).fillColor(NAVY).text("YSF", MARGIN, 40, { width: 60, align: "center", lineBreak: false });
}

export interface BrandBand {
  readonly title: string;
  /** Up to two lines under the title. */
  readonly lines: readonly string[];
  /** Points kept free at the band's right end, e.g. for a status pill. */
  readonly reserveRight: number;
}

/** The navy band across the top of a first page: logo, title and its lines, and an orange rule beneath. */
export function drawBrandBand(doc: Doc, logo: Buffer | undefined, band: BrandBand): void {
  doc.rect(0, 0, doc.page.width, BAND_HEIGHT).fill(NAVY);
  doc.rect(0, BAND_HEIGHT, doc.page.width, 4).fill(ORANGE);
  drawLogo(doc, logo);
  const textX = MARGIN + 76;
  const textWidth = doc.page.width - textX - MARGIN - band.reserveRight;
  doc.font("Helvetica-Bold").fontSize(17).fillColor("#FFFFFF").text(band.title, textX, 24, { width: textWidth, height: 22, ellipsis: true });
  doc.font("Helvetica").fontSize(10).fillColor(BAND_SUBTEXT);
  band.lines.slice(0, 2).forEach((line, index) => doc.text(line, textX, 50 + index * 16, { width: textWidth, lineBreak: false }));
}

/** Pages after the first carry a slim header naming the document, then content starts below it. */
export function drawRunningHeader(doc: Doc, title: string, detail: string): void {
  const width = contentWidth(doc);
  doc.font("Helvetica-Bold").fontSize(8).fillColor(NAVY).text(title, MARGIN, 22, { width: width * 0.7, lineBreak: false, ellipsis: true });
  doc.font("Helvetica").fontSize(8).fillColor(MUTED).text(detail, MARGIN, 22, { width, align: "right", lineBreak: false });
  doc.rect(MARGIN, 36, width, 1.5).fill(ORANGE);
  doc.x = MARGIN;
  doc.y = 50;
}

/** A section's heading bar; kept with at least `keepWith` points of what follows. */
export function sectionHeading(doc: Doc, title: string, keepWith = 70): void {
  const height = 22;
  ensureSpace(doc, height + keepWith);
  const top = doc.y;
  doc.rect(MARGIN, top, contentWidth(doc), height).fill(NAVY);
  doc.rect(MARGIN, top, 4, height).fill(ORANGE);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#FFFFFF").text(title.toUpperCase(), MARGIN + 14, top + 7, { lineBreak: false });
  doc.x = MARGIN;
  doc.y = top + height + 10;
}

export function subHeading(doc: Doc, title: string): void {
  ensureSpace(doc, 50);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(NAVY).text(title, MARGIN, doc.y, { lineBreak: false });
  doc.x = MARGIN;
  doc.y += 14;
}

export function note(doc: Doc, text: string): void {
  ensureSpace(doc, 20);
  doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text(text, MARGIN, doc.y, { lineBreak: false });
  doc.x = MARGIN;
  doc.y += 18;
}

/** `minHeight` keeps a blank row tall enough to write in by hand. */
function rowHeight(doc: Doc, cells: readonly string[], widths: readonly number[], bold: boolean, minHeight = 0): number {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 8 : 9);
  const textHeight = Math.max(...cells.map((cell, index) => doc.heightOfString(cell, { width: (widths[index] ?? 0) - CELL_PADDING * 2 })));
  return Math.max(textHeight + CELL_PADDING * 2, minHeight);
}

function drawRow(doc: Doc, cells: readonly string[], widths: readonly number[], style: "header" | "even" | "odd", minHeight = 0): void {
  const bold = style === "header";
  const height = rowHeight(doc, cells, widths, bold, minHeight);
  const top = doc.y;
  let x = MARGIN;
  cells.forEach((cell, index) => {
    const width = widths[index] ?? 0;
    if (style !== "odd") doc.rect(x, top, width, height).fill(style === "header" ? HEADER_FILL : ZEBRA_FILL);
    doc.lineWidth(0.5).rect(x, top, width, height).stroke(BORDER);
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 8 : 9).fillColor(bold ? NAVY : TEXT);
    doc.text(cell, x + CELL_PADDING, top + CELL_PADDING, { width: width - CELL_PADDING * 2 });
    x += width;
  });
  doc.x = MARGIN;
  doc.y = top + height;
}

/** A bordered table; when a row would cross the page foot, the header row repeats on the next page. */
export function table(doc: Doc, columns: readonly PdfColumn[], rows: readonly (readonly string[])[]): void {
  const widths = columns.map((column) => column.share * contentWidth(doc));
  const headers = columns.map((column) => column.header);
  const headerHeight = rowHeight(doc, headers, widths, true);
  ensureSpace(doc, headerHeight + rowHeight(doc, rows[0] ?? headers, widths, false));
  drawRow(doc, headers, widths, "header");
  rows.forEach((cells, index) => {
    if (ensureSpace(doc, rowHeight(doc, cells, widths, false))) drawRow(doc, headers, widths, "header");
    drawRow(doc, cells, widths, index % 2 === 0 ? "odd" : "even");
  });
  gap(doc, 12);
}

// --- Blank forms (D159) ------------------------------------------------------------

/** Height of the writing space under a blank field's label. */
const WRITE_SPACE = 20;

/**
 * D165: an interactive field laid over a blank cell, so the form can be typed in a
 * PDF viewer and read back. With `options` it is a dropdown ("" first = not chosen).
 */
export interface FormFieldSpec {
  readonly name: string;
  readonly options?: readonly string[];
}

/** Draws the field over `x, y, width, height`; the document must have had initForm(). */
function drawFormField(doc: Doc, spec: FormFieldSpec, x: number, y: number, width: number, height: number): void {
  doc.font("Helvetica").fontSize(9);
  if (spec.options === undefined) doc.formText(spec.name, x, y, width, height, {});
  else doc.formCombo(spec.name, x, y, width, height, { select: ["", ...spec.options] });
}

/** One labelled blank cell of a hand-filled form. */
export interface BlankField {
  readonly label: string;
  readonly required: boolean;
  /** A short line of help printed small under the writing space, e.g. the allowed values. */
  readonly hint?: string;
  /** Spans both columns of the grid. */
  readonly wide?: boolean;
  /** D165: the interactive field over the writing line, when the form is fillable. */
  readonly formField?: FormFieldSpec;
}

function blankLabel(field: BlankField): string {
  return `${field.label.toUpperCase()}${field.required ? " *" : ""}`;
}

function blankCellHeight(doc: Doc, field: BlankField, width: number): number {
  const textWidth = width - CELL_PADDING * 2;
  doc.font("Helvetica-Bold").fontSize(7);
  let height = doc.heightOfString(blankLabel(field), { width: textWidth }) + WRITE_SPACE;
  if (field.hint !== undefined) {
    doc.font("Helvetica").fontSize(6.5);
    height += doc.heightOfString(field.hint, { width: textWidth }) + 2;
  }
  return height + CELL_PADDING * 2;
}

function drawBlankCell(doc: Doc, field: BlankField, x: number, y: number, width: number, height: number): void {
  const textWidth = width - CELL_PADDING * 2;
  doc.lineWidth(0.5).rect(x, y, width, height).stroke(BORDER);
  doc.font("Helvetica-Bold").fontSize(7).fillColor(MUTED).text(blankLabel(field), x + CELL_PADDING, y + CELL_PADDING, { width: textWidth });
  // The writing line sits at the foot of the writing space.
  const lineY = doc.y + WRITE_SPACE - 4;
  doc.lineWidth(0.4).moveTo(x + CELL_PADDING, lineY).lineTo(x + width - CELL_PADDING, lineY).dash(1.5, { space: 2 }).stroke(BORDER).undash();
  if (field.formField !== undefined) drawFormField(doc, field.formField, x + CELL_PADDING, lineY - 15, textWidth, 14);
  if (field.hint !== undefined) {
    doc.font("Helvetica").fontSize(6.5).fillColor(MUTED).text(field.hint, x + CELL_PADDING, lineY + 3, { width: textWidth });
  }
}

/** Labelled blank cells two to a row (a wide field takes the whole row) - the record PDF's grid, left empty. */
export function blankFieldGrid(doc: Doc, fields: readonly BlankField[]): void {
  const half = contentWidth(doc) / 2;
  const rows: BlankField[][] = [];
  for (const field of fields) {
    const last = rows.at(-1);
    if (field.wide === true || last === undefined || last.length === 2 || last[0]?.wide === true) rows.push([field]);
    else last.push(field);
  }
  for (const row of rows) {
    const width = row[0]?.wide === true ? contentWidth(doc) : half;
    const height = Math.max(...row.map((field) => blankCellHeight(doc, field, width)));
    ensureSpace(doc, height);
    const top = doc.y;
    row.forEach((field, index) => drawBlankCell(doc, field, MARGIN + index * half, top, width, height));
    doc.x = MARGIN;
    doc.y = top + height;
  }
  gap(doc, 12);
}

/** The height a blankTable of these columns and rows takes, for keeping it whole with its heading. */
export function blankTableHeight(doc: Doc, columns: readonly PdfColumn[], rowCount: number, rowMinHeight = 26): number {
  const widths = columns.map((column) => column.share * contentWidth(doc));
  return rowHeight(doc, columns.map((column) => column.header), widths, true) + rowCount * rowMinHeight;
}

/** Small muted wrapping text - a form's note on what a table accepts. */
export function smallPrint(doc: Doc, text: string): void {
  doc.font("Helvetica").fontSize(7.5);
  const height = doc.heightOfString(text, { width: contentWidth(doc) });
  ensureSpace(doc, height + 4);
  doc.fillColor(MUTED).text(text, MARGIN, doc.y, { width: contentWidth(doc) });
  doc.x = MARGIN;
  doc.y += 4;
}

/**
 * A table of `rowCount` empty, numbered rows to fill in by hand. It moves to a new
 * page whole when it fits one; a longer one repeats its header after the break.
 */
export function blankTable(
  doc: Doc,
  columns: readonly PdfColumn[],
  rowCount: number,
  rowMinHeight = 26,
  /** D165: the interactive field of a row's column (1-based row), when the form is fillable. */
  formFieldAt?: (row: number, column: number) => FormFieldSpec | undefined,
): void {
  const widths = columns.map((column) => column.share * contentWidth(doc));
  const headers = columns.map((column) => column.header);
  ensureSpace(doc, Math.min(blankTableHeight(doc, columns, rowCount, rowMinHeight), doc.page.height - BOTTOM_MARGIN - 50));
  drawRow(doc, headers, widths, "header");
  for (let index = 0; index < rowCount; index += 1) {
    const cells = headers.map((_, column) => (column === 0 ? String(index + 1) : ""));
    if (ensureSpace(doc, rowMinHeight)) drawRow(doc, headers, widths, "header");
    const top = doc.y;
    drawRow(doc, cells, widths, index % 2 === 0 ? "odd" : "even", rowMinHeight);
    let x = MARGIN;
    widths.forEach((width, column) => {
      const spec = formFieldAt?.(index + 1, column);
      if (spec !== undefined) drawFormField(doc, spec, x + 3, top + 4, width - 6, rowMinHeight - 8);
      x += width;
    });
  }
  gap(doc, 12);
}

/**
 * D160: a large dashed box with a centred caption - the paper stand-in for the
 * wizard's drag-and-drop upload area. Kept whole on one page.
 */
export function dashedDropBox(doc: Doc, caption: string, height = 150): void {
  ensureSpace(doc, height);
  const top = doc.y;
  const width = contentWidth(doc);
  doc.roundedRect(MARGIN, top, width, height, 10).fill(ZEBRA_FILL);
  doc.lineWidth(1.2).roundedRect(MARGIN, top, width, height, 10).dash(6, { space: 4 }).stroke(MUTED).undash();
  doc.font("Helvetica-Bold").fontSize(12).fillColor(NAVY).text(caption, MARGIN, top + height / 2 - 6, { width, align: "center", lineBreak: false });
  doc.x = MARGIN;
  doc.y = top + height;
  gap(doc, 12);
}

/** Drawn last, over every buffered page. The footer sits inside the bottom margin, so it is zeroed first (else pdfkit adds a page). */
export function drawFooters(doc: Doc): void {
  const range = doc.bufferedPageRange();
  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 34;
    doc.lineWidth(0.5).moveTo(MARGIN, y - 8).lineTo(doc.page.width - MARGIN, y - 8).stroke(BORDER);
    doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
    doc.text("YSF MoU Management System · Confidential", MARGIN, y, { lineBreak: false });
    doc.text(`Page ${index + 1} of ${range.count}`, MARGIN, y, { width: contentWidth(doc), align: "right", lineBreak: false });
  }
}

// --- Logo loading ----------------------------------------------------------------

/** Resolved from this module, so it works from src/ and dist/ alike (as db/migrate.ts's drizzle folder). */
const LOGO_URL = new URL("../../assets/logo-ysf.png", import.meta.url);

/** The YSF logo, or undefined when the file is not deployed - the PDF then draws its "YSF" mark. */
export async function loadYsfLogo(): Promise<Buffer | undefined> {
  try {
    return await readFile(LOGO_URL);
  } catch (error) {
    if (isFileNotFoundError(error)) return undefined;
    throw error;
  }
}
