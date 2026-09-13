/**
 * Purpose: The three SPEC-09 endpoints for attaching an MOU PDF outside the
 * wizard - list documents already on an MOU, upload a new one, and download
 * any one of them. Reuses the exact validation and storage routine SPEC-05
 * built for the wizard's own upload (`validatePdfBuffer`, `scanForViruses`),
 * per SPEC-09 section 3's "implemented once and called from both places".
 * Unlike the wizard, which promotes a single draft temp file, uploading here
 * always adds a new row (section 3.1) - the most recently uploaded document
 * is what SPEC-07's commercial page shows as current, but earlier ones stay
 * downloadable.
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
import type { Database } from "../db/client.ts";
import { mou, mouDocument, user } from "../db/schema.ts";
import { readFileOrThrowMissing } from "../upload/file-errors.ts";
import {
  mouDocumentAbsolutePath,
  scanForViruses,
  validatePdfBuffer,
  writeMouDocument,
} from "../upload/mou-document-storage.ts";
import { isUuid } from "./request-parse.ts";

/** SPEC-09 section 3: the same 10 MB cap as the wizard's upload. */
const MAX_MOU_DOCUMENT_BYTES = 10 * 1024 * 1024;

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
      });

      response
        .status(201)
        .json({ id, originalFilename, fileSizeBytes: file.size });
    },
  );

  /** GET /api/documents/:documentId — SPEC-09 section 4; any authenticated role (AC9/AC10). */
  router.get(
    "/documents/:documentId",
    requireAuthSession,
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
