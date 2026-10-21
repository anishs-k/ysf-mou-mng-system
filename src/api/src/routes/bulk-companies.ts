/**
 * Purpose: The two SPEC-22 bulk company endpoints. GET /companies/bulk/template
 * serves the Excel or PDF template built for the uploader's own zones; POST
 * /companies/bulk takes the filled .xlsx (memory-buffered, 5 MB cap, D140) and,
 * since D162, the rows' MoU PDFs in the same request (10 MB each, at most 50) -
 * or, since D164, PDFs alone, attached to the existing companies they name (D165:
 * a filled fillable form creates its company when it does not exist yet) -
 * reads them, and imports every row or none (D139), answering 400 for files that
 * are not the template, 422 with row / column / file errors, or 201 with each new
 * MoU code. Authoring roles only (SPEC-02 §3.3), checked before files are buffered.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { Pool } from "pg";

import { requireAuth, requireRole, requireSession } from "../auth/middleware.ts";
import { zoneScopeOf } from "../auth/zone-scope.ts";
import {
  BULK_MAX_MOU_PDFS,
  buildBulkTemplatePdf,
  buildBulkTemplateWorkbook,
  readBulkSheet,
  readMouPdfForm,
  sortBulkUploadFiles,
} from "../db/bulk-company-files.ts";
import { loadYsfLogo } from "../db/pdf-layout.ts";
import { importBulkCompanies, importMouPdfs } from "../db/bulk-company-import.ts";
import type { Database } from "../db/client.ts";
import { zone } from "../db/schema.ts";
import { describeUniqueConflict } from "./companies.ts";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** D162: a MoU PDF may be as large as Upload MoU allows (SPEC-09); the sheet keeps its own 5 MB cap. */
const MAX_UPLOAD_FILE_BYTES = 10 * 1024 * 1024;
/** The sheet, the PDFs, and one more so an over-the-cap upload is reported rather than cut short. */
const MAX_UPLOAD_FILES = BULK_MAX_MOU_PDFS + 2;

const bulkUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_FILE_BYTES, files: MAX_UPLOAD_FILES } });

/** `file` (the original single-sheet field) and `files` (D162: the sheet with its PDFs) are both accepted. */
function receiveFiles(request: Request, response: Response, next: NextFunction): void {
  bulkUpload.fields([
    { name: "file", maxCount: 1 },
    { name: "files", maxCount: MAX_UPLOAD_FILES },
  ])(request, response, (error: unknown) => {
    if (error === undefined || error === null) {
      next();
      return;
    }
    const code = typeof error === "object" ? (error as { code?: string }).code : undefined;
    const message =
      code === "LIMIT_FILE_SIZE"
        ? "Each file must be 10 MB or smaller (the Excel file 5 MB)"
        : code === "LIMIT_FILE_COUNT" || code === "LIMIT_UNEXPECTED_FILE"
          ? `Upload one Excel file and at most ${BULK_MAX_MOU_PDFS} MoU PDFs at a time`
          : "The files could not be received. Please try again";
    response.status(400).json({ error: message });
  });
}

function uploadedFiles(request: Request): Express.Multer.File[] {
  const fields = (request.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;
  return [...(fields["file"] ?? []), ...(fields["files"] ?? [])];
}

export function createBulkCompaniesRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const requireAuthoring = [requireSession(pool), requireRole("ADMIN", "DATA_ENTRY")];

  /** GET /api/companies/bulk/template?format=xlsx|pdf */
  router.get("/companies/bulk/template", ...requireAuthoring, async (request: Request, response: Response) => {
    const format = String(request.query["format"] ?? "xlsx");
    if (format !== "xlsx" && format !== "pdf") {
      response.status(400).json({ error: "format must be xlsx or pdf" });
      return;
    }
    // The Zone dropdown offers only the zones this user may onboard into (SPEC-19 section 4.4).
    const scope = zoneScopeOf(request);
    const zones = await db
      .select({ id: zone.id, code: zone.code, name: zone.name })
      .from(zone)
      .where(and(eq(zone.isActive, true), scope === null ? undefined : inArray(zone.id, [...scope])))
      .orderBy(asc(zone.name));

    const isPdf = format === "pdf";
    const buffer = isPdf ? await buildBulkTemplatePdf(zones, { logo: await loadYsfLogo() }) : await buildBulkTemplateWorkbook(zones);
    response.setHeader("Content-Type", isPdf ? "application/pdf" : XLSX_MIME);
    response.setHeader("Content-Disposition", `attachment; filename="company-bulk-template.${format}"`);
    response.send(buffer);
  });

  /** POST /api/companies/bulk — multipart `files` (or `file`): the filled Excel template plus any MoU PDFs. */
  router.post("/companies/bulk", ...requireAuthoring, receiveFiles, async (request: Request, response: Response) => {
    const auth = requireAuth(request);
    const files = uploadedFiles(request);
    if (files.length === 0) {
      response.status(400).json({ error: "Choose the filled Excel template and / or MoU PDFs to upload" });
      return;
    }
    const sorted = sortBulkUploadFiles(files);
    if (!sorted.ok) {
      response.status(400).json({ error: sorted.errors.length === 1 ? sorted.errors[0] : "Some files cannot be uploaded", fileErrors: sorted.errors });
      return;
    }

    if (sorted.sheet === undefined) {
      // D164 / D165: PDFs alone - attached to the existing company their GST names, or,
      // for a filled fillable form whose company does not exist yet, creating it.
      try {
        const pdfs = await Promise.all(
          sorted.pdfs.map(async (pdf) => {
            const form = await readMouPdfForm(pdf.buffer);
            return form === undefined ? pdf : { ...pdf, form };
          }),
        );
        const result = await importMouPdfs(db, pool, {
          pdfs,
          scope: zoneScopeOf(request),
          uploadedBy: auth.userId,
          today: new Date().toISOString().slice(0, 10),
        });
        if (!result.ok) {
          const files = new Set(result.fileErrors.map((message) => message.split(":")[0])).size;
          response.status(422).json({
            error: `${files} file${files === 1 ? " has" : "s have"} errors. Nothing was saved.`,
            rowErrors: [],
            fileErrors: result.fileErrors,
          });
          return;
        }
        response.status(201).json({ created: result.created, attached: result.attached });
      } catch (error) {
        console.error("Bulk MoU PDF upload failed:", error);
        response.status(500).json({ error: "The server could not save the PDFs - the error has been logged. Nothing was saved." });
      }
      return;
    }

    const sheet = await readBulkSheet(sorted.sheet.buffer);
    if (!sheet.ok) {
      response.status(400).json({ error: sheet.error });
      return;
    }

    try {
      const result = await importBulkCompanies(db, pool, {
        rows: sheet.rows,
        scope: zoneScopeOf(request),
        createdBy: auth.userId,
        today: new Date().toISOString().slice(0, 10),
        pdfs: sorted.pdfs,
      });
      if (!result.ok) {
        const rowCount = new Set(result.rowErrors.map((error) => error.row)).size;
        const problems = [
          rowCount > 0 ? `${rowCount} row${rowCount === 1 ? " has" : "s have"} errors` : "",
          result.fileErrors.length > 0 ? `${result.fileErrors.length} file${result.fileErrors.length === 1 ? " has" : "s have"} errors` : "",
        ].filter((part) => part !== "");
        response.status(422).json({
          error: `${problems.join(" and ")}. Nothing was saved.`,
          rowErrors: result.rowErrors,
          fileErrors: result.fileErrors,
        });
        return;
      }
      response.status(201).json({ created: result.created });
    } catch (error) {
      // Two uploads racing past the clash checks meet the database constraint instead.
      const conflictMessage = describeUniqueConflict(error);
      if (conflictMessage !== undefined) {
        response.status(409).json({ error: `${conflictMessage}. Nothing was saved.` });
        return;
      }
      console.error("Bulk company upload failed:", error);
      response.status(500).json({ error: "The server could not save the companies - the error has been logged. Nothing was saved." });
    }
  });

  return router;
}
