/**
 * Purpose: Shared helpers for the specs that prove the Figma-clone screens are wired
 * to the API: signing in through the clone's login card, and inserting fixture
 * companies / MoUs / alerts straight into the database with `pg` (the current
 * SPEC-16 schema: `sector` on company, `generated_code` on mou). Not a spec -
 * Playwright only collects `*.spec.ts`.
 */

import { PAYROLL_ITEMS } from "@mou/domain";
import type { UserRole } from "@mou/domain";
import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { Pool } from "pg";

import { E2E_PASSWORD, accountFor } from "./accounts";

export const API_URL = "http://localhost:3001";

export function pool(): Pool {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL must be set - see environment.sh");
  }
  return new Pool({ connectionString });
}

/** Signs in through the Figma login card and waits for the Dashboard. */
export async function signInAs(page: Page, role: UserRole): Promise<string> {
  const { username } = accountFor(role);
  await page.goto("/login");
  await page.getByPlaceholder("e.g., branch_xyz01").fill(username);
  await page.getByPlaceholder("Enter your password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  return username;
}

export function uniqueSuffix(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export interface ZoneFixture {
  readonly zoneId: string;
  readonly zoneName: string;
}

/** A fresh zone, so a test can count its rows without other data interfering. */
export async function insertZone(label: string): Promise<ZoneFixture> {
  const db = pool();
  try {
    const suffix = uniqueSuffix();
    const zoneName = `${label} ${suffix}`;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO zone (code, name) VALUES ($1, $2) RETURNING id`,
      [`Z${suffix}`, zoneName],
    );
    const zoneId = rows[0]?.id;
    if (zoneId === undefined) throw new Error("Failed to insert fixture zone");
    return { zoneId, zoneName };
  } finally {
    await db.end();
  }
}

export interface MouFixture {
  readonly zoneId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly plantId: string;
  readonly plantName: string;
  readonly mouId: string;
  readonly generatedCode: string;
  readonly hrContactName: string;
  readonly hrContactNumber: string;
}

export interface MouFixtureOptions {
  /** Defaults to the first zone in the table. */
  readonly zoneId?: string;
  readonly companyName?: string;
  /** Days from business_today() to the MoU's end date; 200 when omitted. */
  readonly daysToEnd?: number;
  readonly scheme?: string;
  /** Adds payroll_config, one trainee category and a "No" answer for every fixed payroll item. */
  readonly withPayroll?: boolean;
}

/** Inserts a company (or reuses `companyName`'s new row), one plant and one MoU. */
export async function insertCompanyWithMou(options: MouFixtureOptions = {}): Promise<MouFixture> {
  const db = pool();
  try {
    const suffix = uniqueSuffix();
    const companyName = options.companyName ?? `E2E Co ${suffix}`;
    const plantName = `E2E Plant ${suffix}`;
    const hrContactName = `HR Person ${suffix}`;
    const hrContactNumber = `98${suffix}01`;
    const zoneId =
      options.zoneId ?? (await db.query<{ id: string }>(`SELECT id FROM zone ORDER BY name LIMIT 1`)).rows[0]?.id;
    const creatorId = (await db.query<{ id: string }>(`SELECT id FROM "user" LIMIT 1`)).rows[0]?.id;
    if (zoneId === undefined || creatorId === undefined) throw new Error("No zone or user to attach the fixture to");

    const { rows: companyRows } = await db.query<{ id: string }>(
      `INSERT INTO company (
         company_name, company_type, sector, registration_type, tan_number, gst_number,
         zone_id, address_line_1, city, pin_code, state, district,
         hr_contact_name, finance_head_contact_name, contact_type,
         hr_contact_number, finance_head_contact_number, official_email, created_by
       ) VALUES ($1, 'PRIVATE_SECTOR', 'OTHER', 'COMPANY', 'TANP12345C', $2,
         $3, '1 Test Road', 'Pune', '411001', 'Maharashtra', 'Pune',
         $4, 'Finance Name', 'MOBILE', $5, '9876543211', $6, $7)
       RETURNING id`,
      [companyName, `27AA${suffix}A1Z5`, zoneId, hrContactName, hrContactNumber, `e2e${suffix}@example.com`, creatorId],
    );
    const companyId = companyRows[0]?.id;
    if (companyId === undefined) throw new Error("Failed to insert fixture company");

    const { rows: plantRows } = await db.query<{ id: string }>(
      `INSERT INTO company_plant (company_id, plant_name) VALUES ($1, $2) RETURNING id`,
      [companyId, plantName],
    );
    const plantId = plantRows[0]?.id;
    if (plantId === undefined) throw new Error("Failed to insert fixture plant");

    // A one-month MoU ending `daysToEnd` days from the business date.
    const daysToEnd = options.daysToEnd ?? 200;
    const { rows: startRows } = await db.query<{ start_date: string }>(
      `SELECT (business_today() + ($1 * INTERVAL '1 day') + INTERVAL '1 day' - INTERVAL '1 month')::date::text AS start_date`,
      [daysToEnd],
    );
    const generatedCode = `E2E-${suffix}`;
    const { rows: mouRows } = await db.query<{ id: string }>(
      `INSERT INTO mou (generated_code, company_id, company_plant_id, scheme, mou_start_date, tenure_value, tenure_unit, attendance_cycle, stipend_date)
       VALUES ($1, $2, $3, $4, $5, 1, 'MONTHS', 'Monthly', 5) RETURNING id`,
      [generatedCode, companyId, plantId, options.scheme ?? "WILP", startRows[0]?.start_date],
    );
    const mouId = mouRows[0]?.id;
    if (mouId === undefined) throw new Error("Failed to insert fixture MoU");

    if (options.withPayroll === true) {
      const { rows: configRows } = await db.query<{ id: string }>(
        `INSERT INTO payroll_config (mou_id) VALUES ($1) RETURNING id`,
        [mouId],
      );
      const configId = configRows[0]?.id;
      await db.query(`INSERT INTO trainee_category (payroll_config_id, category_name) VALUES ($1, 'Category A')`, [configId]);
      for (const item of PAYROLL_ITEMS) {
        if (item.itemType === null) continue;
        await db.query(
          `INSERT INTO payroll_item (payroll_config_id, item_key, is_applicable, item_type) VALUES ($1, $2, false, $3)`,
          [configId, item.key, item.itemType],
        );
      }
    }

    return { zoneId, companyId, companyName, plantId, plantName, mouId, generatedCode, hrContactName, hrContactNumber };
  } finally {
    await db.end();
  }
}

/** A company with no MoU at all - the zone drill-down must still list it. */
export async function insertCompanyWithoutMou(zoneId: string): Promise<{ companyId: string; companyName: string }> {
  const db = pool();
  try {
    const suffix = uniqueSuffix();
    const companyName = `E2E Empty Co ${suffix}`;
    const creatorId = (await db.query<{ id: string }>(`SELECT id FROM "user" LIMIT 1`)).rows[0]?.id;
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO company (
         company_name, company_type, sector, registration_type, tan_number, gst_number,
         zone_id, address_line_1, city, pin_code, state, district,
         hr_contact_name, finance_head_contact_name, contact_type,
         hr_contact_number, finance_head_contact_number, official_email, created_by
       ) VALUES ($1, 'PRIVATE_SECTOR', 'OTHER', 'COMPANY', 'TANP12345C', $2,
         $3, '1 Test Road', 'Pune', '411001', 'Maharashtra', 'Pune',
         'HR Name', 'Finance Name', 'MOBILE', '9876543210', '9876543211', $4, $5)
       RETURNING id`,
      [companyName, `27AB${suffix}A1Z5`, zoneId, `e2e-empty${suffix}@example.com`, creatorId],
    );
    const companyId = rows[0]?.id;
    if (companyId === undefined) throw new Error("Failed to insert fixture company");
    return { companyId, companyName };
  } finally {
    await db.end();
  }
}

export async function insertAlert(mouId: string, thresholdDays: number): Promise<string> {
  const db = pool();
  try {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO mou_alert (mou_id, threshold_days, triggered_on) VALUES ($1, $2, business_today()) RETURNING id`,
      [mouId, thresholdDays],
    );
    const alertId = rows[0]?.id;
    if (alertId === undefined) throw new Error("Failed to insert fixture alert");
    return alertId;
  } finally {
    await db.end();
  }
}

/** The minimal valid PDF the upload endpoint accepts (it checks the %PDF header). */
export const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Count 0/Kids[]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
);
