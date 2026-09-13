/**
 * Purpose: The one deliberately unauthenticated endpoint in the whole API -
 * reverses ADR D88 at explicit user request, so the Login page's stat tiles
 * can show real figures instead of static marketing copy. Every other route
 * in this app requires a session (SPEC-02); this route exists specifically
 * because a login screen cannot have one yet, and the four counts it returns
 * are coarse, whole-portal aggregates with no per-record detail - see
 * `db/public-stats.ts`'s own note on why that distinction matters.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import type { Pool } from "pg";

import { fetchPublicStats } from "../db/public-stats.ts";

export function createPublicStatsRouter(pool: Pool): Router {
  const router = Router();

  /** GET /api/public/stats — no session required; see this file's own Purpose comment. */
  router.get("/public/stats", async (_request: Request, response: Response) => {
    const stats = await fetchPublicStats(pool);
    // Short, public cache: this is the one response in the app safe to cache
    // at a shared/CDN layer, and doing so is what keeps an unauthenticated
    // endpoint cheap to serve under repeated hits from the login page.
    response.setHeader("Cache-Control", "public, max-age=30");
    response.json(stats);
  });

  return router;
}
