/**
 * Purpose: Serves the zone lookups of SPEC-01 section 7 - the active zone list that
 * populates the Zone dropdown, and the active companies of a zone that the Existing
 * Company and Upload MOU flows pick from. Both filter on is_active (D12), so a
 * deactivated record disappears from the lists while remaining reachable by id;
 * history and exports therefore never break. Ordering is applied here so the UI
 * never sorts reference data itself.
 */

import { and, asc, eq } from "drizzle-orm";
import { Router } from "express";

import type { Database } from "../db/client.ts";
import { company, zone } from "../db/schema.ts";
import { UUID_PATTERN } from "./request-parse.ts";

export function createZonesRouter(db: Database): Router {
  const router = Router();

  router.get("/zones", async (_request, response) => {
    const zones = await db
      .select({ id: zone.id, code: zone.code, name: zone.name })
      .from(zone)
      .where(eq(zone.isActive, true))
      .orderBy(asc(zone.name));

    response.json(zones);
  });

  router.get("/zones/:zoneId/companies", async (request, response) => {
    const { zoneId = "" } = request.params;
    if (!UUID_PATTERN.test(zoneId)) {
      response.status(400).json({ error: "zoneId must be a UUID" });
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
