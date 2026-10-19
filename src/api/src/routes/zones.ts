/**
 * Purpose: Serves the zone lookups of SPEC-01 section 7 - the active zone list that
 * populates the Zone dropdown, and the active companies of a zone that the Existing
 * Company and Upload MOU flows pick from. Both filter on is_active (D12), so a
 * deactivated record disappears from the lists while remaining reachable by id;
 * history and exports therefore never break. Ordering is applied here so the UI
 * never sorts reference data itself. SPEC-19: both need a session, and a zonal
 * user sees only their assigned zones (SPEC-21: one or several) and their companies.
 */

import { and, asc, eq, inArray } from "drizzle-orm";
import { Router } from "express";
import type { Pool } from "pg";

import { requireSession } from "../auth/middleware.ts";
import { zoneAllowed, zoneScopeOf } from "../auth/zone-scope.ts";
import type { Database } from "../db/client.ts";
import { company, zone } from "../db/schema.ts";
import { UUID_PATTERN } from "./request-parse.ts";

export function createZonesRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);

  router.get("/zones", requireAuthSession, async (request, response) => {
    const scope = zoneScopeOf(request);
    const zones = await db
      .select({ id: zone.id, code: zone.code, name: zone.name })
      .from(zone)
      .where(and(eq(zone.isActive, true), scope === null ? undefined : inArray(zone.id, [...scope])))
      .orderBy(asc(zone.name));

    response.json(zones);
  });

  router.get("/zones/:zoneId/companies", requireAuthSession, async (request, response) => {
    const zoneId = String(request.params["zoneId"] ?? "");
    if (!UUID_PATTERN.test(zoneId)) {
      response.status(400).json({ error: "zoneId must be a UUID" });
      return;
    }
    // Another zone answers like a zone with no companies (SPEC-19 section 4.1).
    if (!zoneAllowed(zoneScopeOf(request), zoneId)) {
      response.json([]);
      return;
    }

    // SPEC-16 D109: a company no longer holds a generated code - the code belongs
    // to each MOU - so this company-scoped list returns only what it can honestly
    // report. Consumers render the plain company name.
    const companies = await db
      .select({
        id: company.id,
        name: company.companyName,
      })
      .from(company)
      .where(and(eq(company.zoneId, zoneId), eq(company.isActive, true)))
      .orderBy(asc(company.companyName));

    response.json(companies);
  });

  return router;
}
