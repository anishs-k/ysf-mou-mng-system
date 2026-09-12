/**
 * Purpose: SPEC-08's daily expiry-alert job. Raises one mou_alert row per
 * (MOU, threshold) the very day days_remaining first equals 90, 60 or 30 -
 * section 2's "exact match" rule. Because an exact-day match can be missed
 * entirely if the job does not run for a day, the job records its own last
 * successful run in scheduled_job_state and, on the next run, evaluates every
 * calendar day it missed in one set-based query per threshold rather than
 * looping day by day. `ON CONFLICT DO NOTHING` on (mou_id, threshold_days) is
 * what makes running the job twice in one day, or catching up three missed
 * days at once, produce exactly the same rows either way (AC2/AC3).
 */

import type { Pool } from "pg";

const THRESHOLDS = [90, 60, 30] as const;
const JOB_NAME = "mou-expiry-alerts";

export async function runExpiryAlertJob(pool: Pool): Promise<void> {
  // today is business_today() (Asia/Kolkata, SPEC-01 section 6.2); sinceDate
  // is the day after the job's last recorded run, or today itself on the very
  // first run ever - a fresh install must not flood the list with every
  // threshold every pre-existing MOU already crossed in the past.
  const { rows } = await pool.query<{ today: string; since_date: string }>(
    `SELECT business_today()::text AS today,
            COALESCE(
              (SELECT last_run_date + INTERVAL '1 day' FROM scheduled_job_state WHERE job_name = $1),
              business_today()
            )::text AS since_date`,
    [JOB_NAME],
  );
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected a row computing today and since_date");
  }
  const { today, since_date: sinceDate } = row;

  for (const threshold of THRESHOLDS) {
    // An MOU crosses this threshold on the day (end_date - threshold). Only
    // is_active MOUs count (SPEC-08 section 2: "Only is_current = true MOUs
    // are considered" - is_active is this schema's equivalent, D4).
    await pool.query(
      `INSERT INTO mou_alert (mou_id, threshold_days, triggered_on)
       SELECT id, $1::smallint, (end_date - ($1::int * INTERVAL '1 day'))::date
       FROM mou
       WHERE is_active = true
         AND (end_date - ($1::int * INTERVAL '1 day'))::date BETWEEN $2 AND $3
       ON CONFLICT (mou_id, threshold_days) DO NOTHING`,
      [threshold, sinceDate, today],
    );
  }

  await pool.query(
    `INSERT INTO scheduled_job_state (job_name, last_run_date) VALUES ($1, $2)
     ON CONFLICT (job_name) DO UPDATE SET last_run_date = EXCLUDED.last_run_date`,
    [JOB_NAME, today],
  );
}
