/**
 * Purpose: The three SPEC-09 endpoints for attaching an MOU PDF outside the
 * wizard - list documents already on an MOU, upload a new one, and download
 * any one of them. Reuses the exact validation and storage routine SPEC-05
 * built for the wizard's own upload (`validatePdfBuffer`, `scanForViruses`),
 * per SPEC-09 section 3's "implemented once and called from both places".
 * Unlike the wizard, which promotes a single draft temp file, uploading here
 * always adds a new row (section 3.1) - the most recently uploaded document
 * is what SPEC-07's commercial page shows as current, but earlier ones stay
 * downloadable. An upload may also carry optional documentDate / validUntil /
 * referenceNumber form fields, captured by the Upload MoU screen.
 */

import { desc, eq } from "drizzle-orm";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { promises as fs } from "node:fs";
import multer from "multer";
import type { Pool } from "pg";

import {
  requireAuth,
  requireRole,
  requireSession,
} from "../auth/middleware.ts";
import { emptyList, notFoundError, requireInScope } from "../auth/zone-scope.ts";
import type { Database } from "../db/client.ts";
import { mou, mouDocument, user } from "../db/schema.ts";
import { readFileOrThrowMissing } from "../upload/file-errors.ts";
import {
  mouDocumentAbsolutePath,
  scanForViruses,
  validatePdfBuffer,
  writeMouDocument,
} from "../upload/mou-document-storage.ts";
import { asRecord, isIsoDate, isUuid } from "./request-parse.ts";

/** SPEC-09 section 3: the same 10 MB cap as the wizard's upload. */
const MAX_MOU_DOCUMENT_BYTES = 10 * 1024 * 1024;

const MAX_REFERENCE_NUMBER_LENGTH = 100;

interface DocumentMetadata {
  readonly documentDate: string | null;
  readonly validUntil: string | null;
  readonly referenceNumber: string | null;
}

/** Reads the optional multipart text fields; a blank field means "not given". */
function readDocumentMetadata(
  body: unknown,
): { metadata: DocumentMetadata } | { error: string } {
  const fields = asRecord(body);
  const text = (name: string): string | null => {
    const value = fields[name];
    const trimmed = typeof value === "string" ? value.trim() : "";
    return trimmed === "" ? null : trimmed;
  };
  const documentDate = text("documentDate");
  const validUntil = text("validUntil");
  const referenceNumber = text("referenceNumber");

  if (documentDate !== null && !isIsoDate(documentDate)) {
    return { error: "documentDate must be a YYYY-MM-DD date" };
  }
  if (validUntil !== null && !isIsoDate(validUntil)) {
    return { error: "validUntil must be a YYYY-MM-DD date" };
  }
  if (documentDate !== null && validUntil !== null && validUntil < documentDate) {
    return { error: "validUntil must not be before documentDate" };
  }
  if (
    referenceNumber !== null &&
    referenceNumber.length > MAX_REFERENCE_NUMBER_LENGTH
  ) {
    return {
      error: `referenceNumber must be at most ${MAX_REFERENCE_NUMBER_LENGTH} characters`,
    };
  }
  return { metadata: { documentDate, validUntil, referenceNumber } };
}

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MOU_DOCUMENT_BYTES },
});

export function createMouDocumentsRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);
  const requireAuthoring = requireRole("ADMIN", "DATA_ENTRY");

  /** GET /api/mous/:mouId/documents — SPEC-09 section 3.1, newest first. */
  router.get(
    "/mous/:mouId/documents",
    requireAuthSession,
    requireInScope(pool, "mou", "mouId", emptyList),
    async (request: Request, response: Response) => {
      const mouId = String(request.params["mouId"] ?? "");
      if (!isUuid(mouId)) {
        response.status(400).json({ error: "mouId must be a UUID" });
        return;
      }

      const rows = await db
        .select({
          id: mouDocument.id,
          originalFilename: mouDocument.originalFilename,
          fileSizeBytes: mouDocument.fileSizeBytes,
          uploadedAt: mouDocument.uploadedAt,
          uploadedByUsername: user.username,
          documentDate: mouDocument.documentDate,
          validUntil: mouDocument.validUntil,
          referenceNumber: mouDocument.referenceNumber,
        })
        .from(mouDocument)
        .innerJoin(user, eq(user.id, mouDocument.uploadedBy))
        .where(eq(mouDocument.mouId, mouId))
        .orderBy(desc(mouDocument.uploadedAt));

      response.json(rows);
    },
  );

  /** POST /api/mous/:mouId/document — SPEC-09 section 4; ADMIN/DATA_ENTRY only (AC10). */
  router.post(
    "/mous/:mouId/document",
    requireAuthSession,
    requireAuthoring,
    // Before the upload is parsed, so no file from another zone's request is read.
    requireInScope(pool, "mou", "mouId", notFoundError("MOU not found")),
    (request: Request, response: Response, next: NextFunction) => {
      documentUpload.single("file")(request, response, (error: unknown) => {
        if (error === undefined || error === null) {
          next();
          return;
        }
        const isSizeError =
          error instanceof multer.MulterError &&
          error.code === "LIMIT_FILE_SIZE";
        response.status(422).json({
          error: isSizeError
            ? "The file must be 10 MB or smaller"
            : "Upload failed",
        });
      });
    },
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      const mouId = String(request.params["mouId"] ?? "");
      if (!isUuid(mouId)) {
        response.status(400).json({ error: "mouId must be a UUID" });
        return;
      }

      const mouRows = await db
        .select({ id: mou.id })
        .from(mou)
        .where(eq(mou.id, mouId));
      if (mouRows[0] === undefined) {
        response.status(404).json({ error: "MOU not found" });
        return;
      }

      const file = request.file;
      if (file === undefined) {
        response.status(422).json({ error: "file is required" });
        return;
      }

      // Checked before anything is written, so a bad field leaves no file behind.
      const parsedMetadata = readDocumentMetadata(request.body);
      if ("error" in parsedMetadata) {
        response.status(422).json({ error: parsedMetadata.error });
        return;
      }
      const { metadata } = parsedMetadata;

      // AC5: the mimetype is the browser's own claim, checked first only to
      // fail fast; the %PDF header on the actual bytes is what a renamed
      // .docx cannot fake.
      const validation = validatePdfBuffer(file.buffer, file.mimetype);
      if (!validation.valid) {
        response.status(422).json({ error: validation.reason });
        return;
      }

      const { id, relativePath } = await writeMouDocument(mouId, file.buffer);
      const scan = await scanForViruses(mouDocumentAbsolutePath(relativePath));
      if (!scan.clean) {
        await fs.rm(mouDocumentAbsolutePath(relativePath), { force: true });
        response.status(422).json({ error: scan.reason });
        return;
      }

      const originalFilename = file.originalname.slice(0, 255);
      await db.insert(mouDocument).values({
        id,
        mouId,
        filePath: relativePath,
        originalFilename,
        fileSizeBytes: file.size,
        uploadedBy: auth.userId,
        ...metadata,
      });

      response
        .status(201)
        .json({ id, originalFilename, fileSizeBytes: file.size, ...metadata });
    },
  );

  /** GET /api/documents/:documentId — SPEC-09 section 4; any authenticated role (AC9/AC10). */
  router.get(
    "/documents/:documentId",
    requireAuthSession,
    requireInScope(pool, "document", "documentId", notFoundError("Document not found")),
    async (request: Request, response: Response) => {
      const documentId = String(request.params["documentId"] ?? "");
      if (!isUuid(documentId)) {
        response.status(400).json({ error: "documentId must be a UUID" });
        return;
      }

      const rows = await db
        .select({
          filePath: mouDocument.filePath,
          originalFilename: mouDocument.originalFilename,
        })
        .from(mouDocument)
        .where(eq(mouDocument.id, documentId));
      const row = rows[0];
      if (row === undefined) {
        response.status(404).json({ error: "Document not found" });
        return;
      }

      // A genuinely absent file is a 404; any other read failure (permissions,
      // disk fault) propagates as a 500 rather than masquerading as "missing".
      const buffer = await readFileOrThrowMissing(
        mouDocumentAbsolutePath(row.filePath),
      );
      if (buffer === undefined) {
        response.status(404).json({ error: "Document file missing" });
        return;
      }

      response.setHeader("Content-Type", "application/pdf");
      response.setHeader(
        "Content-Disposition",
        `inline; filename="${row.originalFilename}"`,
      );
      response.send(buffer);
    },
  );

  return router;
}
