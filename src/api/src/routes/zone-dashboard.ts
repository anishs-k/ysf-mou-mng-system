/**
 * Purpose: SPEC-12's two read-only endpoints - the zone summary + scheme
 * matrix, and the drill-down list behind a click on either table. Every
 * route is a GET open to any authenticated role (section 4); nothing here
 * writes (AC10).
 */

import { MOU_STATUSES, SCHEMES } from "@mou/domain";
import { Router } from "express";
import type { Request, Response } from "express";
import type { Pool } from "pg";

import { requireSession } from "../auth/middleware.ts";
import type { Database } from "../db/client.ts";
import { businessToday } from "../db/mou-view.ts";
import {
  fetchSchemeMatrix,
  fetchZoneDrillDown,
  fetchZoneSummary,
} from "../db/zone-dashboard.ts";
import { isUuid } from "./request-parse.ts";

function readFilters(
  request: Request,
): { scheme?: string; status?: string } | undefined {
  const schemeRaw = request.query["scheme"];
  const statusRaw = request.query["status"];
  const scheme =
    typeof schemeRaw === "string" && schemeRaw !== "" ? schemeRaw : undefined;
  const status =
    typeof statusRaw === "string" && statusRaw !== "" ? statusRaw : undefined;

  if (
    scheme !== undefined &&
    !(SCHEMES as readonly string[]).includes(scheme)
  ) {
    return undefined;
  }
  if (
    status !== undefined &&
    !(MOU_STATUSES as readonly string[]).includes(status)
  ) {
    return undefined;
  }
  return { scheme, status };
}

export function createZoneDashboardRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);

  /** GET /api/dashboard/zone-wise?scheme=&status= — SPEC-12 sections 2.1/2.2. */
  router.get(
    "/dashboard/zone-wise",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const filters = readFilters(request);
      if (filters === undefined) {
        response
          .status(400)
          .json({ error: "scheme/status must be a recognised value" });
        return;
      }

      const [summary, matrix] = await Promise.all([
        fetchZoneSummary(pool, filters),
        fetchSchemeMatrix(pool, filters),
      ]);

      const totals = summary.reduce(
        (acc, row) => ({
          companies: acc.companies + row.companies,
          plants: acc.plants + row.plants,
          mous: acc.mous + row.mous,
          active: acc.active + row.active,
          expired: acc.expired + row.expired,
          new: acc.new + row.new,
          expiringSoon: acc.expiringSoon + row.expiringSoon,
        }),
        {
          companies: 0,
          plants: 0,
          mous: 0,
          active: 0,
          expired: 0,
          new: 0,
          expiringSoon: 0,
        },
      );

      response.json({ zones: summary, totals, matrix });
    },
  );

  /** GET /api/dashboard/zone-wise/:zoneId/companies?scheme=&status= — SPEC-12 section 2.4. */
  router.get(
    "/dashboard/zone-wise/:zoneId/companies",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const zoneId = String(request.params["zoneId"] ?? "");
      if (!isUuid(zoneId)) {
        response.status(400).json({ error: "zoneId must be a UUID" });
        return;
      }
      const filters = readFilters(request);
      if (filters === undefined) {
        response
          .status(400)
          .json({ error: "scheme/status must be a recognised value" });
        return;
      }

      const today = await businessToday(pool);
      const rows = await fetchZoneDrillDown(db, today, zoneId, filters);
      response.json(rows);
    },
  );

  return router;
}
