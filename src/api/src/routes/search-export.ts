/**
 * Purpose: SPEC-13's Search and the two Export endpoints, plus the job
 * status/download pair Export shares. Every export is generated through a
 * job row (never streamed directly from the GET that requests it): under
 * the 5,000-company threshold (section 5) it is generated synchronously and
 * the job is inserted already `ready`; over it, the job starts `pending` and
 * a fire-and-forget generation finishes it later. Every route is open to any
 * authenticated role; nothing here writes to a record table.
 */

import { MOU_STATUSES, SCHEMES } from "@mou/domain";
import { eq } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import { promises as fs } from "node:fs";
import type { Pool } from "pg";

import { requireAuth, requireSession } from "../auth/middleware.ts";
import type { Database } from "../db/client.ts";
import { buildAllZonesPdfBuffer, buildCompanyPdfBuffer, buildExportWorkbook } from "../db/export-builder.ts";
import type { SearchFilters } from "../db/search.ts";
import { searchMous } from "../db/search.ts";
import { exportJob } from "../db/schema.ts";
import { exportFileAbsolutePath, writeExportFile } from "../upload/export-storage.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEARCH_PAGE_SIZE = 25;
const EXPORT_SYNC_COMPANY_THRESHOLD = 5000;
const EXPORT_EXPIRY_HOURS = 24;

function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

function isSearchBy(value: string): value is "company" | "plant" | "scheme" {
  return value === "company" || value === "plant" || value === "scheme";
}

/** Shared by /search and both /export routes - `by`/`q` are required for /search, optional for export ("no search active" exports everything). */
function readFilters(request: Request, requireQuery: boolean): { filters: SearchFilters; error?: string } {
  const byRaw = request.query["by"];
  const qRaw = request.query["q"];
  const zoneIdRaw = request.query["zoneId"];
  const statusRaw = request.query["status"];

  if (byRaw === undefined) {
    if (requireQuery) {
      return { filters: {}, error: "by is required" };
    }
  } else if (typeof byRaw !== "string" || !isSearchBy(byRaw)) {
    return { filters: {}, error: "by must be company, plant or scheme" };
  }

  let q: string | undefined;
  if (byRaw !== undefined) {
    if (typeof qRaw !== "string" || qRaw.trim() === "") {
      return { filters: {}, error: "q is required" };
    }
    q = qRaw.trim();
    if (byRaw === "scheme") {
      if (!(SCHEMES as readonly string[]).includes(q)) {
        return { filters: {}, error: "q must be a valid scheme" };
      }
    } else if (q.length < 2) {
      return { filters: {}, error: "Enter at least 2 characters" };
    }
  }

  if (zoneIdRaw !== undefined && (typeof zoneIdRaw !== "string" || !isUuid(zoneIdRaw))) {
    return { filters: {}, error: "zoneId must be a UUID" };
  }
  if (statusRaw !== undefined && (typeof statusRaw !== "string" || !(MOU_STATUSES as readonly string[]).includes(statusRaw))) {
    return { filters: {}, error: "status must be a recognised value" };
  }

  return {
    filters: {
      by: byRaw as "company" | "plant" | "scheme" | undefined,
      q,
      zoneId: zoneIdRaw as string | undefined,
      status: statusRaw as string | undefined,
    },
  };
}

export function createSearchExportRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);

  /** GET /api/search — SPEC-13 section 2. */
  router.get("/search", requireAuthSession, async (request: Request, response: Response) => {
    const { filters, error } = readFilters(request, true);
    if (error !== undefined) {
      response.status(422).json({ error });
      return;
    }

    const pageRaw = request.query["page"];
    const page = typeof pageRaw === "string" && pageRaw !== "" ? Number(pageRaw) : 1;
    if (!Number.isInteger(page) || page < 1) {
      response.status(400).json({ error: "page must be a positive integer" });
      return;
    }

    const { rows, total } = await searchMous(pool, filters, {
      limit: SEARCH_PAGE_SIZE,
      offset: (page - 1) * SEARCH_PAGE_SIZE,
    });
    response.json({ rows, total, page, pageSize: SEARCH_PAGE_SIZE });
  });

  /** GET /api/export/excel?by=&q=&zoneId=&status= — SPEC-13 section 3. */
  router.get("/export/excel", requireAuthSession, async (request: Request, response: Response) => {
    const auth = requireAuth(request);
    const { filters, error } = readFilters(request, false);
    if (error !== undefined) {
      response.status(422).json({ error });
      return;
    }

    const { rows: mous } = await searchMous(pool, filters);
    const companyCount = new Set(mous.map((row) => row.companyId)).size;

    const expiresAt = new Date(Date.now() + EXPORT_EXPIRY_HOURS * 60 * 60 * 1000);
    const jobRows = await db
      .insert(exportJob)
      .values({ kind: "excel", status: "pending", createdBy: auth.userId, expiresAt })
      .returning({ id: exportJob.id });
    const jobId = jobRows[0]?.id;
    if (jobId === undefined) {
      response.status(500).json({ error: "Failed to create export job" });
      return;
    }

    const generate = async (): Promise<void> => {
      try {
        const workbook = await buildExportWorkbook(db, pool, filters);
        const buffer = await workbook.xlsx.writeBuffer();
        const relativePath = await writeExportFile(jobId, "xlsx", Buffer.from(buffer));
        await db.update(exportJob).set({ status: "ready", filePath: relativePath }).where(eq(exportJob.id, jobId));
      } catch (generationError) {
        console.error("Excel export failed:", generationError);
        await db.update(exportJob).set({ status: "failed" }).where(eq(exportJob.id, jobId));
      }
    };

    // Section 5: only an export over the threshold is generated in the background.
    if (companyCount <= EXPORT_SYNC_COMPANY_THRESHOLD) {
      await generate();
    } else {
      void generate();
    }

    const jobStatusRows = await db.select({ status: exportJob.status }).from(exportJob).where(eq(exportJob.id, jobId));
    response.status(202).json({ jobId, status: jobStatusRows[0]?.status ?? "pending" });
  });

  /** GET /api/export/pdf?scope=all_zones|company&companyId=&plantId= — SPEC-13 section 4. */
  router.get("/export/pdf", requireAuthSession, async (request: Request, response: Response) => {
    const auth = requireAuth(request);
    const scope = request.query["scope"];
    if (scope !== "all_zones" && scope !== "company") {
      response.status(400).json({ error: "scope must be all_zones or company" });
      return;
    }

    let companyId: string | undefined;
    let plantId: string | undefined;
    if (scope === "company") {
      const companyIdRaw = request.query["companyId"];
      const plantIdRaw = request.query["plantId"];
      if (typeof companyIdRaw !== "string" || !isUuid(companyIdRaw) || typeof plantIdRaw !== "string" || !isUuid(plantIdRaw)) {
        response.status(400).json({ error: "companyId and plantId are required for the company scope" });
        return;
      }
      companyId = companyIdRaw;
      plantId = plantIdRaw;
    }

    const expiresAt = new Date(Date.now() + EXPORT_EXPIRY_HOURS * 60 * 60 * 1000);
    const jobRows = await db
      .insert(exportJob)
      .values({ kind: "pdf", status: "pending", createdBy: auth.userId, expiresAt })
      .returning({ id: exportJob.id });
    const jobId = jobRows[0]?.id;
    if (jobId === undefined) {
      response.status(500).json({ error: "Failed to create export job" });
      return;
    }

    try {
      // Both PDF documents are small (a summary, or one company's record) —
      // unlike Excel, there is no large-scope case that needs a background path.
      const buffer =
        scope === "all_zones"
          ? await buildAllZonesPdfBuffer(pool, auth.username)
          : await buildCompanyPdfBuffer(db, pool, companyId as string, plantId as string, auth.username);
      if (buffer === undefined) {
        await db.update(exportJob).set({ status: "failed" }).where(eq(exportJob.id, jobId));
        response.status(404).json({ error: "Company not found" });
        return;
      }
      const relativePath = await writeExportFile(jobId, "pdf", buffer);
      await db.update(exportJob).set({ status: "ready", filePath: relativePath }).where(eq(exportJob.id, jobId));
      response.status(202).json({ jobId, status: "ready" });
    } catch (error) {
      console.error("PDF export failed:", error);
      await db.update(exportJob).set({ status: "failed" }).where(eq(exportJob.id, jobId));
      response.status(500).json({ error: "Export failed" });
    }
  });

  /** GET /api/export/jobs/:jobId — status + download link once ready. */
  router.get("/export/jobs/:jobId", requireAuthSession, async (request: Request, response: Response) => {
    const jobId = String(request.params["jobId"] ?? "");
    if (!isUuid(jobId)) {
      response.status(400).json({ error: "jobId must be a UUID" });
      return;
    }
    const rows = await db.select({ id: exportJob.id, kind: exportJob.kind, status: exportJob.status }).from(exportJob).where(eq(exportJob.id, jobId));
    const row = rows[0];
    if (row === undefined) {
      response.status(404).json({ error: "Export job not found" });
      return;
    }
    response.json({
      jobId: row.id,
      kind: row.kind,
      status: row.status,
      downloadUrl: row.status === "ready" ? `/api/export/jobs/${row.id}/download` : undefined,
    });
  });

  /** GET /api/export/jobs/:jobId/download — 401 unauthenticated (AC13), the only place a file's bytes are served. */
  router.get("/export/jobs/:jobId/download", requireAuthSession, async (request: Request, response: Response) => {
    const jobId = String(request.params["jobId"] ?? "");
    if (!isUuid(jobId)) {
      response.status(400).json({ error: "jobId must be a UUID" });
      return;
    }
    const rows = await db
      .select({ kind: exportJob.kind, status: exportJob.status, filePath: exportJob.filePath })
      .from(exportJob)
      .where(eq(exportJob.id, jobId));
    const row = rows[0];
    if (row === undefined || row.status !== "ready" || row.filePath === null) {
      response.status(404).json({ error: "Export not ready" });
      return;
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(exportFileAbsolutePath(row.filePath));
    } catch {
      response.status(404).json({ error: "Export file missing" });
      return;
    }

    const isExcel = row.kind === "excel";
    response.setHeader(
      "Content-Type",
      isExcel ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
    );
    response.setHeader("Content-Disposition", `attachment; filename="export.${isExcel ? "xlsx" : "pdf"}"`);
    response.send(buffer);
  });

  return router;
}
