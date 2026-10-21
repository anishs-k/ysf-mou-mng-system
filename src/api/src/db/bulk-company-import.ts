/**
 * Purpose: SPEC-22's all-or-nothing import (D139). Every sheet row is checked
 * before anything is written - the wizard's domain rules (readBulkRow), the
 * uploader's zone scope, duplicates inside the file, and the two database
 * clashes validate-page1 checks (GST already registered; the same company + plant
 * in the zone), each looked up once for the whole file. Only a clean file is
 * written, all rows in one transaction through the wizard's own company writer.
 * D162: MoU PDFs sent with the sheet are matched to rows by GST Number first and
 * stored as each new MOU's document in the same transaction; a failure removes
 * the files already written, so nothing is left half-saved. D164 / D165: PDFs
 * uploaded on their own (importMouPdfs) go to the existing company their GST names,
 * or - when it does not exist and the PDF is a filled fillable form - create it
 * from the form's fields, checked by the same rules as an Excel row.
 */

import {
  bulkColumnHeader,
  findBulkZone,
  findInFileDuplicates,
  formFieldsToBulkRow,
  gstFromPdfName,
  matchBulkMouPdfs,
  readBulkRow,
} from "@mou/domain";
import type { BulkCompanyRow, BulkRowError, ChargeMeta } from "@mou/domain";
import { eq } from "drizzle-orm";
import { promises as fs } from "node:fs";
import type { Pool } from "pg";

import { OUT_OF_ZONE_MESSAGE, zoneAllowed } from "../auth/zone-scope.ts";
import type { ZoneScope } from "../auth/zone-scope.ts";
import { mouDocumentAbsolutePath, scanForViruses, writeMouDocument } from "../upload/mou-document-storage.ts";
import type { BulkSheetRow } from "./bulk-company-files.ts";
import type { Database } from "./client.ts";
import { insertCompanyWithMou } from "./company-writer.ts";
import type { Transaction } from "./company-writer.ts";
import { mouDocument, zone } from "./schema.ts";

export interface BulkCreatedCompany {
  readonly row: number;
  readonly companyId: string;
  readonly companyName: string;
  readonly generatedCode: string;
  /** D162: the MoU PDF stored with this row, or null when none was sent. */
  readonly mouPdf: string | null;
}

/** D162: a MoU PDF of the upload - already checked to be a real PDF. */
export interface BulkMouPdf {
  readonly originalname: string;
  readonly buffer: Buffer;
  readonly size: number;
}

export type BulkImportResult =
  | { readonly ok: true; readonly created: readonly BulkCreatedCompany[] }
  | { readonly ok: false; readonly rowErrors: readonly BulkRowError[]; readonly fileErrors: readonly string[] };

/** Raised inside the transaction when a stored PDF fails the virus scan, so every row rolls back. */
class InfectedPdfError extends Error {}

interface ValidRow {
  readonly row: number;
  readonly value: BulkCompanyRow;
}

const lower = (value: string): string => value.trim().toLowerCase();

/** The same two clashes validate-page1 reports, for every row in two queries. */
async function databaseClashes(pool: Pool, rows: readonly ValidRow[]): Promise<BulkRowError[]> {
  const gsts = rows.map(({ value }) => value.company.gstNumber.trim());
  const names = [...new Set(rows.map(({ value }) => lower(value.company.companyName)))];
  const [registered, plants] = await Promise.all([
    pool.query<{ gst_number: string }>(`SELECT gst_number FROM company WHERE gst_number = ANY($1::text[])`, [gsts]),
    pool.query<{ zone_id: string; company_name: string; plant_name: string }>(
      `SELECT c.zone_id, lower(c.company_name) AS company_name, lower(p.plant_name) AS plant_name
         FROM company c JOIN company_plant p ON p.company_id = c.id
        WHERE lower(c.company_name) = ANY($1::text[])`,
      [names],
    ),
  ]);
  const registeredGsts = new Set(registered.rows.map((found) => found.gst_number));
  const existing = new Set(plants.rows.map((found) => [found.zone_id, found.company_name, found.plant_name].join("|")));

  const clashes: BulkRowError[] = [];
  for (const { row, value } of rows) {
    if (registeredGsts.has(value.company.gstNumber.trim())) {
      clashes.push({ row, column: bulkColumnHeader("gstNumber"), message: "This GST number is already registered" });
    }
    if (existing.has([value.company.zoneId, lower(value.company.companyName), lower(value.company.plantName)].join("|"))) {
      clashes.push({ row, column: bulkColumnHeader("companyName"), message: "A company with this name and plant already exists in this zone" });
    }
  }
  return clashes;
}

/**
 * Stores one MoU PDF as `mouId`'s document - the storage and virus scan of Upload
 * MoU (SPEC-09) - inside the caller's transaction. Each written path is recorded in
 * `written` first, so the caller can remove the files if the transaction fails.
 */
async function storeMouPdf(tx: Transaction, pdf: BulkMouPdf, mouId: string, uploadedBy: string, written: string[]): Promise<void> {
  const { id, relativePath } = await writeMouDocument(mouId, pdf.buffer);
  written.push(relativePath);
  const scan = await scanForViruses(mouDocumentAbsolutePath(relativePath));
  if (!scan.clean) throw new InfectedPdfError(`${pdf.originalname}: ${scan.reason ?? "failed a virus scan"}`);
  await tx.insert(mouDocument).values({
    id,
    mouId,
    filePath: relativePath,
    originalFilename: pdf.originalname.slice(0, 255),
    fileSizeBytes: pdf.size,
    uploadedBy,
  });
}

async function removeWritten(written: readonly string[]): Promise<void> {
  await Promise.all(written.map((relativePath) => fs.rm(mouDocumentAbsolutePath(relativePath), { force: true })));
}

/** A sheet row - or a filled PDF form read as one (D165), which also carries charge period / basis. */
interface CompanyRowInput {
  readonly row: number;
  readonly cells: Readonly<Record<string, string>>;
  readonly chargeMeta?: Readonly<Record<string, ChargeMeta>>;
}

/**
 * Every check a new company row gets before anything is written: the wizard's
 * domain rules, the uploader's zone scope, duplicates among the rows, and the two
 * database clashes. Shared by the Excel import and the PDF-form import.
 */
async function validateCompanyRows(
  db: Database,
  pool: Pool,
  rows: readonly CompanyRowInput[],
  scope: ZoneScope,
  today: string,
): Promise<{ readonly valid: readonly ValidRow[]; readonly rowErrors: readonly BulkRowError[] }> {
  // Every active zone, so a zone outside the uploader's scope gets SPEC-19's
  // message rather than "not in the list".
  const zones = await db.select({ id: zone.id, code: zone.code, name: zone.name }).from(zone).where(eq(zone.isActive, true));
  const rowErrors: BulkRowError[] = [];
  const valid: ValidRow[] = [];
  for (const { row, cells, chargeMeta } of rows) {
    const result = readBulkRow(cells, zones, today, chargeMeta === undefined ? {} : { chargeMeta });
    const named = findBulkZone(cells["zoneId"] ?? "", zones);
    const outOfScope = named !== undefined && !zoneAllowed(scope, named.id);
    if (outOfScope) {
      rowErrors.push({ row, column: bulkColumnHeader("zoneId"), message: OUT_OF_ZONE_MESSAGE });
    }
    rowErrors.push(...result.errors.map((error) => ({ row, ...error })));
    if (result.value !== undefined && !outOfScope) {
      valid.push({ row, value: result.value });
    }
  }
  rowErrors.push(...findInFileDuplicates(valid));
  if (valid.length > 0) {
    rowErrors.push(...(await databaseClashes(pool, valid)));
  }
  return { valid, rowErrors };
}

export async function importBulkCompanies(
  db: Database,
  pool: Pool,
  input: {
    readonly rows: readonly BulkSheetRow[];
    readonly scope: ZoneScope;
    readonly createdBy: string;
    readonly today: string;
    readonly pdfs?: readonly BulkMouPdf[];
  },
): Promise<BulkImportResult> {
  const pdfs = input.pdfs ?? [];
  const checked = await validateCompanyRows(db, pool, input.rows, input.scope, input.today);
  const valid = checked.valid;
  const rowErrors = [...checked.rowErrors];
  const pdfMatch = matchBulkMouPdfs(
    pdfs.map((pdf) => pdf.originalname),
    input.rows.map(({ row, cells }) => ({ row, gstNumber: cells["gstNumber"] ?? "" })),
  );
  rowErrors.push(...pdfMatch.rowErrors);
  if (rowErrors.length > 0 || pdfMatch.fileErrors.length > 0) {
    return { ok: false, rowErrors: [...rowErrors].sort((a, b) => a.row - b.row), fileErrors: pdfMatch.fileErrors };
  }

  const written: string[] = [];
  try {
    const created = await db.transaction(async (tx) => {
      const saved: BulkCreatedCompany[] = [];
      for (const { row, value } of valid) {
        const { companyId, mouId, generatedCode } = await insertCompanyWithMou(tx, pool, value, input.createdBy);
        const pdfIndex = pdfMatch.byRow.get(row);
        const pdf = pdfIndex === undefined ? undefined : pdfs[pdfIndex];
        if (pdf !== undefined) await storeMouPdf(tx, pdf, mouId, input.createdBy, written);
        saved.push({ row, companyId, companyName: value.company.companyName, generatedCode, mouPdf: pdf?.originalname ?? null });
      }
      return saved;
    });
    return { ok: true, created };
  } catch (error) {
    await removeWritten(written);
    if (error instanceof InfectedPdfError) return { ok: false, rowErrors: [], fileErrors: [error.message] };
    throw error;
  }
}

// --- D164: PDFs on their own, for companies that already exist ----------------------------

export interface BulkAttachedPdf {
  readonly fileName: string;
  readonly companyName: string;
  readonly generatedCode: string;
}

interface AttachTarget {
  readonly companyName: string;
  readonly zoneId: string;
  /** The newest active MoU with no MoU PDF yet, or undefined when every one has one. */
  readonly mouId: string | undefined;
  readonly generatedCode: string | undefined;
}

/** For each GST, its active company and that company's newest active MoU without a PDF - two queries. */
async function attachTargets(pool: Pool, gstNumbers: readonly string[]): Promise<Map<string, AttachTarget>> {
  const companies = await pool.query<{ id: string; gst: string; company_name: string; zone_id: string }>(
    `SELECT id, upper(gst_number) AS gst, company_name, zone_id FROM company WHERE is_active AND upper(gst_number) = ANY($1)`,
    [gstNumbers],
  );
  const mous = await pool.query<{ company_id: string; id: string; generated_code: string }>(
    `SELECT DISTINCT ON (m.company_id) m.company_id, m.id, m.generated_code
       FROM mou m
      WHERE m.is_active AND m.company_id = ANY($1)
        AND NOT EXISTS (SELECT 1 FROM mou_document d WHERE d.mou_id = m.id)
      ORDER BY m.company_id, m.created_at DESC`,
    [companies.rows.map((row) => row.id)],
  );
  const mouByCompany = new Map(mous.rows.map((row) => [row.company_id, row]));
  return new Map(
    companies.rows.map((row) => [
      row.gst,
      {
        companyName: row.company_name,
        zoneId: row.zone_id,
        mouId: mouByCompany.get(row.id)?.id,
        generatedCode: mouByCompany.get(row.id)?.generated_code,
      },
    ]),
  );
}

/** D165: a MoU PDF of a PDF-only upload, with its form fields when it is a filled fillable form. */
export interface BulkUploadedPdf extends BulkMouPdf {
  readonly form?: Readonly<Record<string, string>>;
}

export type BulkPdfImportResult =
  | { readonly ok: true; readonly created: readonly BulkCreatedCompany[]; readonly attached: readonly BulkAttachedPdf[] }
  | { readonly ok: false; readonly fileErrors: readonly string[] };

/**
 * D164 / D165: PDFs uploaded without the sheet. A PDF's GST Number comes from its
 * form's GST field when it is a filled fillable form, else from the start of its file
 * name. When that company exists, the PDF becomes its newest active MoU without a
 * MoU PDF; when it does not and the PDF is a filled form, the company and its MoU
 * are created from the form (the Excel row's rules) and the PDF attached to it.
 * Every file is checked first and any problem saves nothing.
 */
export async function importMouPdfs(
  db: Database,
  pool: Pool,
  input: { readonly pdfs: readonly BulkUploadedPdf[]; readonly scope: ZoneScope; readonly uploadedBy: string; readonly today: string },
): Promise<BulkPdfImportResult> {
  const fileErrors: string[] = [];
  const byGst = new Map<string, BulkUploadedPdf[]>();
  for (const pdf of input.pdfs) {
    const formGst = (pdf.form?.["gstNumber"] ?? "").trim().toUpperCase();
    const gst = formGst !== "" ? formGst : gstFromPdfName(pdf.originalname);
    if (gst === undefined) {
      fileErrors.push(
        pdf.form === undefined
          ? `${pdf.originalname}: the file name must start with the company's GST Number, e.g. 27AAKCS4821M1Z3.pdf - or upload the filled fillable PDF form.`
          : `${pdf.originalname}: GST Number - Required.`,
      );
    } else {
      byGst.set(gst, [...(byGst.get(gst) ?? []), pdf]);
    }
  }

  const targets = await attachTargets(pool, [...byGst.keys()]);
  const toAttach: { pdf: BulkUploadedPdf; mouId: string; companyName: string; generatedCode: string }[] = [];
  const toCreate: { pdf: BulkUploadedPdf; row: number; cells: Readonly<Record<string, string>>; chargeMeta: Readonly<Record<string, ChargeMeta>> }[] = [];
  for (const [gst, pdfs] of byGst) {
    const [pdf] = pdfs;
    if (pdf === undefined) continue;
    const target = targets.get(gst);
    if (pdfs.length > 1) {
      fileErrors.push(`More than one PDF names GST Number ${gst}: ${pdfs.map((entry) => entry.originalname).join(", ")}.`);
    } else if (target !== undefined) {
      if (!zoneAllowed(input.scope, target.zoneId)) {
        fileErrors.push(`${pdf.originalname}: ${target.companyName} is not in your assigned zones.`);
      } else if (target.mouId === undefined || target.generatedCode === undefined) {
        fileErrors.push(`${pdf.originalname}: every MoU of ${target.companyName} already has a MoU PDF - use Upload MoU to add another.`);
      } else {
        toAttach.push({ pdf, mouId: target.mouId, companyName: target.companyName, generatedCode: target.generatedCode });
      }
    } else if (pdf.form === undefined) {
      fileErrors.push(
        `${pdf.originalname}: no company has GST Number ${gst}. Upload its Excel row first, or the company's filled fillable PDF form (this PDF has no form fields).`,
      );
    } else {
      const formRow = formFieldsToBulkRow(pdf.form);
      fileErrors.push(...formRow.errors.map((error) => `${pdf.originalname}: ${error.column} - ${error.message}`));
      toCreate.push({ pdf, row: toCreate.length + 1, cells: formRow.cells, chargeMeta: formRow.chargeMeta });
    }
  }

  // New companies from filled forms: exactly the checks an Excel row gets.
  const checked = await validateCompanyRows(db, pool, toCreate, input.scope, input.today);
  const fileOfRow = new Map(toCreate.map((entry) => [entry.row, entry.pdf.originalname]));
  fileErrors.push(...checked.rowErrors.map((error) => `${fileOfRow.get(error.row) ?? "PDF"}: ${error.column} - ${error.message}`));
  if (fileErrors.length > 0) return { ok: false, fileErrors };

  const written: string[] = [];
  try {
    const created = await db.transaction(async (tx) => {
      const saved: BulkCreatedCompany[] = [];
      for (const { row, value } of checked.valid) {
        const pdf = toCreate.find((entry) => entry.row === row)?.pdf;
        if (pdf === undefined) continue;
        const { companyId, mouId, generatedCode } = await insertCompanyWithMou(tx, pool, value, input.uploadedBy);
        await storeMouPdf(tx, pdf, mouId, input.uploadedBy, written);
        // Row 0: the company came from a PDF form, not a sheet row.
        saved.push({ row: 0, companyId, companyName: value.company.companyName, generatedCode, mouPdf: pdf.originalname });
      }
      for (const { pdf, mouId } of toAttach) await storeMouPdf(tx, pdf, mouId, input.uploadedBy, written);
      return saved;
    });
    const order = new Map(input.pdfs.map((pdf, index) => [pdf.originalname, index]));
    const byUploadOrder = <T>(name: (entry: T) => string) => (a: T, b: T) => (order.get(name(a)) ?? 0) - (order.get(name(b)) ?? 0);
    return {
      ok: true,
      created: [...created].sort(byUploadOrder((entry: BulkCreatedCompany) => entry.mouPdf ?? "")),
      attached: [...toAttach]
        .sort(byUploadOrder((entry: (typeof toAttach)[number]) => entry.pdf.originalname))
        .map(({ pdf, companyName, generatedCode }) => ({ fileName: pdf.originalname, companyName, generatedCode })),
    };
  } catch (error) {
    await removeWritten(written);
    if (error instanceof InfectedPdfError) return { ok: false, fileErrors: [error.message] };
    throw error;
  }
}
