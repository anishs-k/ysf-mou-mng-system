/**
 * Purpose: SPEC-14 §5 - the two new read-only endpoints the Figma dashboard
 * design needs (KPI tiles + recent activity feed) and nothing else in the
 * app already computes. Both routes are open to any authenticated role,
 * same as the existing zone-dashboard endpoints (D88 - no public/
 * unauthenticated stats route).
 */

import { Router } from "express";
import type { Request, Response } from "express";
import type { Pool } from "pg";

import { requireSession } from "../auth/middleware.ts";
import { zoneScopeOf } from "../auth/zone-scope.ts";
import { fetchDashboardSummary, fetchRecentActivity } from "../db/dashboard-summary.ts";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

function readLimit(request: Request): number {
  const raw = request.query["limit"];
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

export function createDashboardSummaryRouter(pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);

  /** GET /api/dashboard/summary — SPEC-14 D84/D85. */
  router.get("/dashboard/summary", requireAuthSession, async (request: Request, response: Response) => {
    const summary = await fetchDashboardSummary(pool, zoneScopeOf(request));
    response.json(summary);
  });

  /** GET /api/dashboard/recent-activity?limit= — SPEC-14 D86. */
  router.get("/dashboard/recent-activity", requireAuthSession, async (request: Request, response: Response) => {
    const limit = readLimit(request);
    const rows = await fetchRecentActivity(pool, limit, zoneScopeOf(request));
    response.json(rows);
  });

  return router;
}
