/**
 * Purpose: The three SPEC-23 §3.2 endpoints for company-level documents (GST and
 * Registration certificates): list a company's documents, upload a new one
 * (ADMIN / DATA_ENTRY), and download one. Modeled on SPEC-09's mou-documents.ts -
 * the same 10 MB cap, virus-scan hook, zone scope and append-only rows - except
 * that a certificate may be a PDF, JPEG or PNG, proved by its first bytes.
 */

import { COMPANY_DOCUMENT_TYPES } from "@mou/domain";
import type { CompanyDocumentType } from "@mou/domain";
import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import multer from "multer";
import type { Pool } from "pg";

import { requireAuth, requireRole, requireSession } from "../auth/middleware.ts";
import { emptyList, notFoundError, requireInScope } from "../auth/zone-scope.ts";
import type { Database } from "../db/client.ts";
import { company, companyDocument, user } from "../db/schema.ts";
import {
  companyDocumentAbsolutePath,
  companyDocumentRelativePath,
  detectCompanyDocumentFile,
  writeCompanyDocument,
} from "../upload/company-document-storage.ts";
import { readFileOrThrowMissing } from "../upload/file-errors.ts";
import { scanForViruses } from "../upload/mou-document-storage.ts";
import { asRecord, isUuid } from "./request-parse.ts";

/** SPEC-23 §3.2: the same cap as an MoU PDF (SPEC-09 section 3). */
const MAX_COMPANY_DOCUMENT_BYTES = 10 * 1024 * 1024;

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COMPANY_DOCUMENT_BYTES },
});

function isCompanyDocumentType(value: unknown): value is CompanyDocumentType {
  return typeof value === "string" && (COMPANY_DOCUMENT_TYPES as readonly string[]).includes(value);
}

/** multer's own failures become a 422 the screen can show, as in SPEC-09. */
function receiveFile(request: Request, response: Response, next: NextFunction): void {
  documentUpload.single("file")(request, response, (error: unknown) => {
    if (error === undefined || error === null) {
      next();
      return;
    }
    const isSizeError = error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE";
    response.status(422).json({ error: isSizeError ? "The file must be 10 MB or smaller" : "Upload failed" });
  });
}

export function createCompanyDocumentsRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);
  const requireAuthoring = requireRole("ADMIN", "DATA_ENTRY");

  /** GET /api/companies/:id/documents — newest first. */
  router.get(
    "/companies/:id/documents",
    requireAuthSession,
    requireInScope(pool, "company", "id", emptyList),
    async (request: Request, response: Response) => {
      const companyId = String(request.params["id"] ?? "");
      if (!isUuid(companyId)) {
        response.status(400).json({ error: "id must be a UUID" });
        return;
      }
      const rows = await db
        .select({
          id: companyDocument.id,
          documentType: companyDocument.documentType,
          originalFilename: companyDocument.originalFilename,
          mimeType: companyDocument.mimeType,
          fileSizeBytes: companyDocument.fileSizeBytes,
          uploadedAt: companyDocument.uploadedAt,
          uploadedByUsername: user.username,
        })
        .from(companyDocument)
        .innerJoin(user, eq(user.id, companyDocument.uploadedBy))
        .where(eq(companyDocument.companyId, companyId))
        .orderBy(desc(companyDocument.uploadedAt));
      response.json(rows);
    },
  );

  /** POST /api/companies/:id/documents — multipart `file` + `documentType`; ADMIN / DATA_ENTRY. */
  router.post(
    "/companies/:id/documents",
    requireAuthSession,
    requireAuthoring,
    // Before the upload is parsed, so no file from another zone's request is read.
    requireInScope(pool, "company", "id", notFoundError("Company not found")),
    receiveFile,
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      const companyId = String(request.params["id"] ?? "");
      if (!isUuid(companyId)) {
        response.status(400).json({ error: "id must be a UUID" });
        return;
      }
      const companyRows = await db
        .select({ id: company.id })
        .from(company)
        .where(and(eq(company.id, companyId), eq(company.isActive, true)));
      if (companyRows[0] === undefined) {
        response.status(404).json({ error: "Company not found" });
        return;
      }

      const documentType = asRecord(request.body)["documentType"];
      if (!isCompanyDocumentType(documentType)) {
        response.status(422).json({ error: "Choose the document type: GST Certificate or Registration Certificate" });
        return;
      }
      const file = request.file;
      if (file === undefined) {
        response.status(422).json({ error: "file is required" });
        return;
      }
      const detected = detectCompanyDocumentFile(file.buffer);
      if (detected === undefined) {
        response.status(422).json({ error: "The file must be a PDF, JPG or PNG" });
        return;
      }

      const id = randomUUID();
      const relativePath = companyDocumentRelativePath(companyId, id, detected.extension);
      await writeCompanyDocument(relativePath, file.buffer);
      const scan = await scanForViruses(companyDocumentAbsolutePath(relativePath));
      if (!scan.clean) {
        await fs.rm(companyDocumentAbsolutePath(relativePath), { force: true });
        response.status(422).json({ error: scan.reason });
        return;
      }

      const created = {
        id,
        companyId,
        documentType,
        filePath: relativePath,
        originalFilename: file.originalname.slice(0, 255),
        mimeType: detected.mimeType,
        fileSizeBytes: file.size,
        uploadedBy: auth.userId,
      };
      await db.insert(companyDocument).values(created);
      response.status(201).json({
        id,
        documentType,
        originalFilename: created.originalFilename,
        mimeType: created.mimeType,
        fileSizeBytes: created.fileSizeBytes,
      });
    },
  );

  /** GET /api/company-documents/:documentId — streamed inline with the type its bytes proved. */
  router.get(
    "/company-documents/:documentId",
    requireAuthSession,
    requireInScope(pool, "companyDocument", "documentId", notFoundError("Document not found")),
    async (request: Request, response: Response) => {
      const documentId = String(request.params["documentId"] ?? "");
      if (!isUuid(documentId)) {
        response.status(400).json({ error: "documentId must be a UUID" });
        return;
      }
      const rows = await db
        .select({
          filePath: companyDocument.filePath,
          originalFilename: companyDocument.originalFilename,
          mimeType: companyDocument.mimeType,
        })
        .from(companyDocument)
        .where(eq(companyDocument.id, documentId));
      const row = rows[0];
      if (row === undefined) {
        response.status(404).json({ error: "Document not found" });
        return;
      }

      // A genuinely absent file is a 404; any other read failure propagates as a 500.
      const buffer = await readFileOrThrowMissing(companyDocumentAbsolutePath(row.filePath));
      if (buffer === undefined) {
        response.status(404).json({ error: "Document file missing" });
        return;
      }
      response.setHeader("Content-Type", row.mimeType);
      // RFC 5987 form, so a quote or non-ASCII character in the name cannot break the header.
      response.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(row.originalFilename)}`);
      response.send(buffer);
    },
  );

  return router;
}
