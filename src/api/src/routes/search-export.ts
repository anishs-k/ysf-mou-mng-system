/**
 * Purpose: SPEC-13's Search and the two Export endpoints, plus the job
 * status/download pair Export shares. Every export is generated through a
 * job row (never streamed directly from the GET that requests it): under
 * the 5,000-company threshold (section 5) it is generated synchronously and
 * the job is inserted already `ready`; over it, the job starts `pending` and
 * a fire-and-forget generation finishes it later. Every route is open to any
 * authenticated role; nothing here writes to a record table. SPEC-19: every query
 * runs under the caller's zone scope, and a job is visible only to its creator (D120).
 */

import { MOU_STATUSES, SCHEMES } from "@mou/domain";
import { and, eq } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import type { Pool } from "pg";

import { requireAuth, requireSession } from "../auth/middleware.ts";
import { recordInScope, zoneScopeOf } from "../auth/zone-scope.ts";
import type { Database } from "../db/client.ts";
import {
  buildAllZonesPdfBuffer,
  buildCompanyPdfBuffer,
  buildExportWorkbook,
} from "../db/export-builder.ts";
import type { SearchFilters, SearchStatusFilter } from "../db/search.ts";
import { searchMous } from "../db/search.ts";
import { exportJob } from "../db/schema.ts";
import {
  exportFileAbsolutePath,
  writeExportFile,
} from "../upload/export-storage.ts";
import { readFileOrThrowMissing } from "../upload/file-errors.ts";
import { isIsoDate, isUuid } from "./request-parse.ts";

const SEARCH_PAGE_SIZE = 25;
const SEARCH_MAX_PAGE_SIZE = 100;
const EXPORT_SYNC_COMPANY_THRESHOLD = 5000;
const EXPORT_EXPIRY_HOURS = 24;

function isSearchBy(value: string): value is "company" | "plant" | "scheme" {
  return value === "company" || value === "plant" || value === "scheme";
}

const STATUS_FILTERS: readonly string[] = [...MOU_STATUSES, "EXPIRING"];

type QueryParams = Readonly<Record<string, unknown>>;

/**
 * Shared by /search and /export/excel so what Search selects is what Export
 * writes out (SPEC-13 section 5). Every parameter is optional - no filters
 * selects every active MoU - but `by` still requires a valid `q`.
 */
export function parseSearchFilters(query: QueryParams): {
  filters: SearchFilters;
  error?: string;
} {
  const byRaw = query["by"];
  const qRaw = query["q"];
  const zoneIdRaw = query["zoneId"];
  const statusRaw = query["status"];
  const schemeRaw = query["scheme"];
  const startFromRaw = query["startFrom"];
  const startToRaw = query["startTo"];

  if (byRaw !== undefined && (typeof byRaw !== "string" || !isSearchBy(byRaw))) {
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
  } else if (qRaw !== undefined) {
    return { filters: {}, error: "by is required when q is given" };
  }

  if (
    zoneIdRaw !== undefined &&
    (typeof zoneIdRaw !== "string" || !isUuid(zoneIdRaw))
  ) {
    return { filters: {}, error: "zoneId must be a UUID" };
  }
  if (
    statusRaw !== undefined &&
    (typeof statusRaw !== "string" || !STATUS_FILTERS.includes(statusRaw))
  ) {
    return { filters: {}, error: "status must be a recognised value" };
  }
  if (
    schemeRaw !== undefined &&
    (typeof schemeRaw !== "string" ||
      !(SCHEMES as readonly string[]).includes(schemeRaw))
  ) {
    return { filters: {}, error: "scheme must be a valid scheme" };
  }
  for (const [name, raw] of [
    ["startFrom", startFromRaw],
    ["startTo", startToRaw],
  ] as const) {
    if (raw !== undefined && (typeof raw !== "string" || !isIsoDate(raw))) {
      return { filters: {}, error: `${name} must be a YYYY-MM-DD date` };
    }
  }
  if (
    typeof startFromRaw === "string" &&
    typeof startToRaw === "string" &&
    startFromRaw > startToRaw
  ) {
    return { filters: {}, error: "startFrom must not be after startTo" };
  }

  // Only defined keys are set, so an empty query yields exactly {}.
  const filters: {
    -readonly [K in keyof SearchFilters]: SearchFilters[K];
  } = {};
  if (byRaw !== undefined) {
    filters.by = byRaw;
    filters.q = q;
  }
  if (zoneIdRaw !== undefined) {
    filters.zoneId = zoneIdRaw as string;
  }
  if (statusRaw !== undefined) {
    filters.status = statusRaw as SearchStatusFilter;
  }
  if (schemeRaw !== undefined) {
    filters.scheme = schemeRaw as string;
  }
  if (startFromRaw !== undefined) {
    filters.startFrom = startFromRaw as string;
  }
  if (startToRaw !== undefined) {
    filters.startTo = startToRaw as string;
  }
  return { filters };
}

/** /search paging: `page` from 1, `pageSize` 1-100 (default 25). */
export function parseSearchPaging(
  query: QueryParams,
): { page: number; pageSize: number } | { error: string } {
  const readPositive = (raw: unknown, fallback: number): number =>
    typeof raw === "string" && raw !== "" ? Number(raw) : fallback;

  const page = readPositive(query["page"], 1);
  if (!Number.isInteger(page) || page < 1) {
    return { error: "page must be a positive integer" };
  }
  const pageSize = readPositive(query["pageSize"], SEARCH_PAGE_SIZE);
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > SEARCH_MAX_PAGE_SIZE
  ) {
    return {
      error: `pageSize must be an integer from 1 to ${SEARCH_MAX_PAGE_SIZE}`,
    };
  }
  return { page, pageSize };
}

export function createSearchExportRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);

  /**
   * GET /api/search?by=&q=&scheme=&zoneId=&status=&startFrom=&startTo=&page=&pageSize=
   * — SPEC-13 section 2. With no filters it lists every active MoU.
   */
  router.get(
    "/search",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const { filters, error } = parseSearchFilters(request.query);
      if (error !== undefined) {
        response.status(422).json({ error });
        return;
      }

      const paging = parseSearchPaging(request.query);
      if ("error" in paging) {
        response.status(400).json({ error: paging.error });
        return;
      }
      const { page, pageSize } = paging;

      const { rows, total } = await searchMous(pool, zoneScopeOf(request), filters, {
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      response.json({ rows, total, page, pageSize });
    },
  );

  /**
   * GET /api/export/excel — SPEC-13 section 3, same filters as /search.
   * The Expiry Report is this export with status=EXPIRING.
   */
  router.get(
    "/export/excel",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      const { filters, error } = parseSearchFilters(request.query);
      if (error !== undefined) {
        response.status(422).json({ error });
        return;
      }

      const scope = zoneScopeOf(request);
      const { rows: mous } = await searchMous(pool, scope, filters);
      const companyCount = new Set(mous.map((row) => row.companyId)).size;

      const expiresAt = new Date(
        Date.now() + EXPORT_EXPIRY_HOURS * 60 * 60 * 1000,
      );
      const jobRows = await db
        .insert(exportJob)
        .values({
          kind: "excel",
          status: "pending",
          createdBy: auth.userId,
          expiresAt,
        })
        .returning({ id: exportJob.id });
      const jobId = jobRows[0]?.id;
      if (jobId === undefined) {
        response.status(500).json({ error: "Failed to create export job" });
        return;
      }

      const generate = async (): Promise<void> => {
        try {
          const workbook = await buildExportWorkbook(db, pool, scope, filters);
          const buffer = await workbook.xlsx.writeBuffer();
          const relativePath = await writeExportFile(
            jobId,
            "xlsx",
            Buffer.from(buffer),
          );
          await db
            .update(exportJob)
            .set({ status: "ready", filePath: relativePath })
            .where(eq(exportJob.id, jobId));
        } catch (generationError) {
          console.error("Excel export failed:", generationError);
          await db
            .update(exportJob)
            .set({ status: "failed" })
            .where(eq(exportJob.id, jobId));
        }
      };

      // Section 5: only an export over the threshold is generated in the background.
      if (companyCount <= EXPORT_SYNC_COMPANY_THRESHOLD) {
        await generate();
      } else {
        void generate();
      }

      const jobStatusRows = await db
        .select({ status: exportJob.status })
        .from(exportJob)
        .where(eq(exportJob.id, jobId));
      response
        .status(202)
        .json({ jobId, status: jobStatusRows[0]?.status ?? "pending" });
    },
  );

  /** GET /api/export/pdf?scope=all_zones|company&companyId=&plantId= — SPEC-13 section 4. */
  router.get(
    "/export/pdf",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      const scope = request.query["scope"];
      if (scope !== "all_zones" && scope !== "company") {
        response
          .status(400)
          .json({ error: "scope must be all_zones or company" });
        return;
      }

      let companyId: string | undefined;
      let plantId: string | undefined;
      if (scope === "company") {
        const companyIdRaw = request.query["companyId"];
        const plantIdRaw = request.query["plantId"];
        if (
          typeof companyIdRaw !== "string" ||
          !isUuid(companyIdRaw) ||
          typeof plantIdRaw !== "string" ||
          !isUuid(plantIdRaw)
        ) {
          response
            .status(400)
            .json({
              error: "companyId and plantId are required for the company scope",
            });
          return;
        }
        companyId = companyIdRaw;
        plantId = plantIdRaw;
        // Another zone's company is refused exactly like an unknown one.
        if (!(await recordInScope(pool, zoneScopeOf(request), "company", companyId))) {
          response.status(404).json({ error: "Company not found" });
          return;
        }
      }

      const expiresAt = new Date(
        Date.now() + EXPORT_EXPIRY_HOURS * 60 * 60 * 1000,
      );
      const jobRows = await db
        .insert(exportJob)
        .values({
          kind: "pdf",
          status: "pending",
          createdBy: auth.userId,
          expiresAt,
        })
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
            ? await buildAllZonesPdfBuffer(pool, zoneScopeOf(request), auth.username)
            : await buildCompanyPdfBuffer(
                db,
                pool,
                companyId as string,
                plantId as string,
                auth.username,
              );
        if (buffer === undefined) {
          await db
            .update(exportJob)
            .set({ status: "failed" })
            .where(eq(exportJob.id, jobId));
          response.status(404).json({ error: "Company not found" });
          return;
        }
        const relativePath = await writeExportFile(jobId, "pdf", buffer);
        await db
          .update(exportJob)
          .set({ status: "ready", filePath: relativePath })
          .where(eq(exportJob.id, jobId));
        response.status(202).json({ jobId, status: "ready" });
      } catch (error) {
        console.error("PDF export failed:", error);
        await db
          .update(exportJob)
          .set({ status: "failed" })
          .where(eq(exportJob.id, jobId));
        response.status(500).json({ error: "Export failed" });
      }
    },
  );

  /** GET /api/export/jobs/:jobId — status + download link once ready. */
  router.get(
    "/export/jobs/:jobId",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const jobId = String(request.params["jobId"] ?? "");
      if (!isUuid(jobId)) {
        response.status(400).json({ error: "jobId must be a UUID" });
        return;
      }
      const rows = await db
        .select({
          id: exportJob.id,
          kind: exportJob.kind,
          status: exportJob.status,
        })
        .from(exportJob)
        .where(and(eq(exportJob.id, jobId), eq(exportJob.createdBy, requireAuth(request).userId)));
      const row = rows[0];
      if (row === undefined) {
        response.status(404).json({ error: "Export job not found" });
        return;
      }
      response.json({
        jobId: row.id,
        kind: row.kind,
        status: row.status,
        downloadUrl:
          row.status === "ready"
            ? `/api/export/jobs/${row.id}/download`
            : undefined,
      });
    },
  );

  /** GET /api/export/jobs/:jobId/download — 401 unauthenticated (AC13), the only place a file's bytes are served. */
  router.get(
    "/export/jobs/:jobId/download",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const jobId = String(request.params["jobId"] ?? "");
      if (!isUuid(jobId)) {
        response.status(400).json({ error: "jobId must be a UUID" });
        return;
      }
      const rows = await db
        .select({
          kind: exportJob.kind,
          status: exportJob.status,
          filePath: exportJob.filePath,
        })
        .from(exportJob)
        .where(and(eq(exportJob.id, jobId), eq(exportJob.createdBy, requireAuth(request).userId)));
      const row = rows[0];
      if (
        row === undefined ||
        row.status !== "ready" ||
        row.filePath === null
      ) {
        response.status(404).json({ error: "Export not ready" });
        return;
      }

      // A genuinely absent file is a 404; any other read failure (permissions,
      // disk fault) propagates as a 500 rather than masquerading as "missing".
      const buffer = await readFileOrThrowMissing(
        exportFileAbsolutePath(row.filePath),
      );
      if (buffer === undefined) {
        response.status(404).json({ error: "Export file missing" });
        return;
      }

      const isExcel = row.kind === "excel";
      response.setHeader(
        "Content-Type",
        isExcel
          ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          : "application/pdf",
      );
      response.setHeader(
        "Content-Disposition",
        `attachment; filename="export.${isExcel ? "xlsx" : "pdf"}"`,
      );
      response.send(buffer);
    },
  );

  return router;
}
