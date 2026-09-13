/**
 * Purpose: SPEC-08's three alert endpoints - the filtered list, the dashboard
 * badge count, and acknowledge. The list and the badge are deliberately
 * different queries even though both read from `mou`: the badge is a live
 * count "not a count of mou_alert rows" (section 5), so a newly created MOU
 * already inside the 90-day window appears immediately without waiting for
 * the nightly job, while the list reads the rows the job raised.
 */

import { MOU_STATUS_LABELS } from "@mou/domain";
import type { MouStatus } from "@mou/domain";
import { Router } from "express";
import type { Request, Response } from "express";
import type { Pool } from "pg";

import { requireAuth, requireRole, requireSession } from "../auth/middleware.ts";
import { businessToday } from "../db/mou-view.ts";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_THRESHOLDS = ["30", "60", "90"] as const;

function deriveMouStatus(daysRemaining: number, mouStartDate: string, today: string): MouStatus {
  if (mouStartDate > today) {
    return "NEW";
  }
  return daysRemaining < 0 ? "EXPIRED" : "ACTIVE";
}

export function createAlertsRouter(pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);

  /** GET /api/alerts/expiring — SPEC-08 section 4. */
  router.get("/alerts/expiring", requireAuthSession, async (request: Request, response: Response) => {
    const daysParam = request.query["days"];
    if (
      daysParam !== undefined &&
      daysParam !== "all" &&
      !(VALID_THRESHOLDS as readonly string[]).includes(String(daysParam))
    ) {
      response.status(400).json({ error: "days must be 30, 60, 90 or all" });
      return;
    }
    const zoneId = request.query["zoneId"];
    if (zoneId !== undefined && (typeof zoneId !== "string" || !UUID_PATTERN.test(zoneId))) {
      response.status(400).json({ error: "zoneId must be a UUID" });
      return;
    }
    const scheme = request.query["scheme"];
    const acknowledgedParam = String(request.query["acknowledged"] ?? "false");

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (daysParam !== undefined && daysParam !== "all") {
      params.push(Number(daysParam));
      conditions.push(`a.threshold_days = $${params.length}`);
    }
    if (zoneId !== undefined) {
      params.push(zoneId);
      conditions.push(`c.zone_id = $${params.length}`);
    }
    if (scheme !== undefined) {
      params.push(String(scheme));
      conditions.push(`m.scheme = $${params.length}`);
    }
    if (acknowledgedParam === "true") {
      conditions.push("a.acknowledged_at IS NOT NULL");
    } else if (acknowledgedParam === "false") {
      conditions.push("a.acknowledged_at IS NULL");
    }
    // acknowledgedParam === "all": no filter on acknowledged_at.

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const { rows } = await pool.query(
      `SELECT a.id, a.threshold_days, a.triggered_on, a.acknowledged_at, a.acknowledged_by,
              c.id AS company_id, c.company_name, m.generated_code, z.name AS zone_name, z.id AS zone_id,
              p.plant_name, m.scheme, m.mou_start_date::text AS mou_start_date, m.end_date::text AS end_date,
              (m.end_date - business_today()) AS days_remaining
         FROM mou_alert a
         JOIN mou m ON m.id = a.mou_id
         JOIN company c ON c.id = m.company_id
         JOIN zone z ON z.id = c.zone_id
         LEFT JOIN company_plant p ON p.id = m.company_plant_id
         ${where}
        ORDER BY a.triggered_on DESC`,
      params,
    );

    const today = await businessToday(pool);
    const alerts = rows.map((row) => ({
      alertId: row.id as string,
      companyId: row.company_id as string,
      companyName: row.company_name as string,
      generatedCode: row.generated_code as string,
      zoneId: row.zone_id as string,
      zoneName: row.zone_name as string,
      plantName: (row.plant_name as string | null) ?? "—",
      scheme: row.scheme as string,
      mouStartDate: row.mou_start_date as string,
      endDate: row.end_date as string,
      daysRemaining: Number(row.days_remaining),
      thresholdDays: row.threshold_days as number,
      status: MOU_STATUS_LABELS[
        deriveMouStatus(Number(row.days_remaining), row.mou_start_date as string, today)
      ],
      acknowledgedAt: row.acknowledged_at as string | null,
    }));

    response.json(alerts);
  });

  /** GET /api/alerts/count — SPEC-08 section 5: a live count, not mou_alert rows. */
  router.get("/alerts/count", requireAuthSession, async (_request: Request, response: Response) => {
    const { rows } = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
         FROM mou
        WHERE is_active = true
          AND end_date BETWEEN business_today() AND (business_today() + 90)`,
    );
    response.json({ count: Number(rows[0]?.count ?? "0") });
  });

  /** POST /api/alerts/:alertId/acknowledge — ADMIN or DATA_ENTRY only. */
  router.post(
    "/alerts/:alertId/acknowledge",
    requireAuthSession,
    requireRole("ADMIN", "DATA_ENTRY"),
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      const alertId = String(request.params["alertId"] ?? "");
      if (!UUID_PATTERN.test(alertId)) {
        response.status(400).json({ error: "alertId must be a UUID" });
        return;
      }
      const result = await pool.query(
        `UPDATE mou_alert SET acknowledged_at = now(), acknowledged_by = $1
          WHERE id = $2 RETURNING id`,
        [auth.userId, alertId],
      );
      if (result.rowCount === 0) {
        response.status(404).json({ error: "Alert not found" });
        return;
      }
      response.status(204).send();
    },
  );

  return router;
}
