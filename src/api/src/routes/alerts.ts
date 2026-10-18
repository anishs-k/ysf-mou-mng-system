/**
 * Purpose: SPEC-08's alert endpoints - the filtered list, the dashboard
 * badge count, and two ways to acknowledge. Both the list and the badge are
 * driven live by `mou.end_date` (today .. today + window), not by the rows the
 * nightly job raised: the job only inserts on the exact 90/60/30-day day, so a
 * list built from `mou_alert` alone missed MoUs already inside the window.
 * The list LEFT JOINs each MoU's latest `mou_alert` row purely for its
 * acknowledgement, and an MoU with no row yet is acknowledged by creating one.
 */

import { MOU_STATUS_LABELS } from "@mou/domain";
import type { MouStatus } from "@mou/domain";
import { Router } from "express";
import type { Request, Response } from "express";
import type { Pool } from "pg";

import {
  requireAuth,
  requireRole,
  requireSession,
} from "../auth/middleware.ts";
import { notFoundError, requireInScope, zoneScopeOf } from "../auth/zone-scope.ts";
import { businessToday } from "../db/mou-view.ts";
import { UUID_PATTERN } from "./request-parse.ts";

const VALID_THRESHOLDS = ["30", "60", "90"] as const;

/** The widest window (and days=all); also the badge's and the Dashboard KPI's. */
const MAX_WINDOW_DAYS = 90;

/** Which of the 30/60/90 bands a days-remaining value (0..90) falls in. */
function thresholdBand(daysRemaining: number): 30 | 60 | 90 {
  if (daysRemaining <= 30) {
    return 30;
  }
  return daysRemaining <= 60 ? 60 : 90;
}

function deriveMouStatus(
  daysRemaining: number,
  mouStartDate: string,
  today: string,
): MouStatus {
  if (mouStartDate > today) {
    return "NEW";
  }
  return daysRemaining < 0 ? "EXPIRED" : "ACTIVE";
}

export function createAlertsRouter(pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);

  /** GET /api/alerts/expiring — SPEC-08 section 4. */
  router.get(
    "/alerts/expiring",
    requireAuthSession,
    async (request: Request, response: Response) => {
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
      if (
        zoneId !== undefined &&
        (typeof zoneId !== "string" || !UUID_PATTERN.test(zoneId))
      ) {
        response.status(400).json({ error: "zoneId must be a UUID" });
        return;
      }
      const scheme = request.query["scheme"];
      const acknowledgedParam = String(
        request.query["acknowledged"] ?? "false",
      );

      const windowDays =
        daysParam === undefined || daysParam === "all"
          ? MAX_WINDOW_DAYS
          : Number(daysParam);
      const params: unknown[] = [windowDays];
      const conditions: string[] = [
        "m.is_active",
        "m.end_date BETWEEN t.d AND t.d + $1::int",
      ];

      if (zoneId !== undefined) {
        params.push(zoneId);
        conditions.push(`c.zone_id = $${params.length}`);
      }
      // SPEC-19: ANDed with any zoneId filter, so naming another zone matches nothing.
      const scope = zoneScopeOf(request);
      if (scope !== null) {
        params.push(scope);
        conditions.push(`c.zone_id = $${params.length}`);
      }
      if (scheme !== undefined) {
        params.push(String(scheme));
        conditions.push(`m.scheme = $${params.length}`);
      }
      // An MoU with no alert row yet counts as unacknowledged (la.* is NULL).
      if (acknowledgedParam === "true") {
        conditions.push("la.acknowledged_at IS NOT NULL");
      } else if (acknowledgedParam === "false") {
        conditions.push("la.acknowledged_at IS NULL");
      }
      // acknowledgedParam === "all": no filter on acknowledged_at.

      // One row per MoU: the lateral join picks its latest alert - the lowest
      // threshold reached - whose acknowledgement is the one that counts.
      const { rows } = await pool.query(
        `WITH t AS (SELECT business_today() AS d)
         SELECT m.id AS mou_id, la.id AS alert_id, la.acknowledged_at,
              c.id AS company_id, c.company_name, m.generated_code, z.name AS zone_name, z.id AS zone_id,
              p.plant_name, m.scheme, m.mou_start_date::text AS mou_start_date, m.end_date::text AS end_date,
              (m.end_date - t.d) AS days_remaining
         FROM mou m
         CROSS JOIN t
         JOIN company c ON c.id = m.company_id AND c.is_active
         JOIN zone z ON z.id = c.zone_id
         LEFT JOIN company_plant p ON p.id = m.company_plant_id
         LEFT JOIN LATERAL (
           SELECT a.id, a.acknowledged_at
             FROM mou_alert a
            WHERE a.mou_id = m.id
            ORDER BY a.threshold_days ASC, a.triggered_on DESC
            LIMIT 1
         ) la ON true
        WHERE ${conditions.join(" AND ")}
        ORDER BY days_remaining, c.company_name, m.scheme`,
        params,
      );

      const today = await businessToday(pool);
      const alerts = rows.map((row) => ({
        mouId: row.mou_id as string,
        alertId: row.alert_id as string | null,
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
        thresholdDays: thresholdBand(Number(row.days_remaining)),
        status:
          MOU_STATUS_LABELS[
            deriveMouStatus(
              Number(row.days_remaining),
              row.mou_start_date as string,
              today,
            )
          ],
        acknowledgedAt: row.acknowledged_at as string | null,
      }));

      response.json(alerts);
    },
  );

  /**
   * GET /api/alerts/count — SPEC-08 section 5: a live count over the list's
   * default window, acknowledged or not (the list with acknowledged=all).
   */
  router.get(
    "/alerts/count",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const { rows } = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM mou m
         JOIN company c ON c.id = m.company_id AND c.is_active
        WHERE m.is_active
          AND m.end_date BETWEEN business_today() AND (business_today() + $1::int)
          AND ($2::uuid IS NULL OR c.zone_id = $2)`,
        [MAX_WINDOW_DAYS, zoneScopeOf(request)],
      );
      response.json({ count: Number(rows[0]?.count ?? "0") });
    },
  );

  /** POST /api/alerts/:alertId/acknowledge — ADMIN or DATA_ENTRY only. */
  router.post(
    "/alerts/:alertId/acknowledge",
    requireAuthSession,
    requireRole("ADMIN", "DATA_ENTRY"),
    requireInScope(pool, "alert", "alertId", notFoundError("Alert not found")),
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

  /**
   * POST /api/mous/:mouId/alerts/acknowledge — ADMIN or DATA_ENTRY only.
   * Acknowledges a listed MoU whether or not the job has raised a row for it:
   * upserts the row for the MoU's current 30/60/90 band, so a later job run
   * for that same threshold is a no-op (ON CONFLICT DO NOTHING) and only the
   * next band raises a fresh, unacknowledged alert.
   */
  router.post(
    "/mous/:mouId/alerts/acknowledge",
    requireAuthSession,
    requireRole("ADMIN", "DATA_ENTRY"),
    requireInScope(pool, "mou", "mouId", notFoundError("MOU not found")),
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      const mouId = String(request.params["mouId"] ?? "");
      if (!UUID_PATTERN.test(mouId)) {
        response.status(400).json({ error: "mouId must be a UUID" });
        return;
      }
      const { rows } = await pool.query<{ days_remaining: number }>(
        `SELECT (m.end_date - business_today()) AS days_remaining
           FROM mou m
           JOIN company c ON c.id = m.company_id AND c.is_active
          WHERE m.id = $1 AND m.is_active`,
        [mouId],
      );
      const row = rows[0];
      if (row === undefined) {
        response.status(404).json({ error: "MOU not found" });
        return;
      }
      const daysRemaining = Number(row.days_remaining);
      if (daysRemaining < 0 || daysRemaining > MAX_WINDOW_DAYS) {
        response.status(422).json({
          error: `Only an MoU ending within ${MAX_WINDOW_DAYS} days can be acknowledged`,
        });
        return;
      }
      await pool.query(
        `INSERT INTO mou_alert (mou_id, threshold_days, triggered_on, acknowledged_at, acknowledged_by)
         VALUES ($1, $2, business_today(), now(), $3)
         ON CONFLICT (mou_id, threshold_days)
         DO UPDATE SET acknowledged_at = now(), acknowledged_by = EXCLUDED.acknowledged_by`,
        [mouId, thresholdBand(daysRemaining), auth.userId],
      );
      response.status(204).send();
    },
  );

  return router;
}
