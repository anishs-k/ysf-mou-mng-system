/**
 * Purpose: UI tests for SPEC-08 - the dashboard badge and the alert list.
 * Fixture data is created directly against the database (mirroring
 * `global-setup.ts`'s and `existing-company.spec.ts`'s own use of `pg`)
 * rather than by running the scheduled job, since the dev server the
 * Playwright suite drives only runs `runExpiryAlertJob` once at startup and
 * then hourly - there is no way, and no need, to trigger it on demand just to
 * test how the list and the badge render already-raised alerts.
 */

import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { accountFor } from "./accounts";
import { signIn } from "./sign-in";

function pool(): Pool {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL must be set - see environment.sh");
  }
  return new Pool({ connectionString });
}

interface Fixture {
  readonly companyId: string;
  readonly companyName: string;
  readonly mouId: string;
}

/** Inserts a company, one plant and one MOU ending `daysFromToday` days out. */
async function insertCompanyWithMou(daysFromToday: number): Promise<Fixture> {
  const db = pool();
  try {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const companyName = `Alert Test Co ${suffix}`;
    const { rows: zoneRows } = await db.query<{ id: string }>(`SELECT id FROM zone LIMIT 1`);
    const zoneId = zoneRows[0]?.id;
    const { rows: userRows } = await db.query<{ id: string }>(`SELECT id FROM "user" LIMIT 1`);
    const creatorId = userRows[0]?.id;

    const { rows: companyRows } = await db.query<{ id: string }>(
      `INSERT INTO company (
         generated_code, company_name, company_type, registration_type, tan_number, gst_number,
         zone_id, address_line_1, city, pin_code, state, district,
         hr_contact_name, finance_head_contact_name, contact_type,
         hr_contact_number, finance_head_contact_number, official_email, created_by
       ) VALUES ($1, $2, 'PRIVATE_SECTOR', 'COMPANY', 'TANP12345C', $3,
         $4, '1 Test Road', 'Pune', '411001', 'Maharashtra', 'Pune',
         'HR Name', 'Finance Name', 'MOBILE', '9876543210', '9876543211', $5, $6)
       RETURNING id`,
      [`ALERT-26-${suffix}`, companyName, `27AAAAA${suffix}A1Z5`, zoneId, `alert${suffix}@example.com`, creatorId],
    );
    const companyId = companyRows[0]?.id;
    if (companyId === undefined) {
      throw new Error("Failed to insert fixture company");
    }

    const { rows: plantRows } = await db.query<{ id: string }>(
      `INSERT INTO company_plant (company_id, plant_name) VALUES ($1, 'Alert Plant') RETURNING id`,
      [companyId],
    );
    const plantId = plantRows[0]?.id;

    const { rows: startRows } = await db.query<{ start_date: string }>(
      `SELECT (business_today() + ($1 * INTERVAL '1 day') + INTERVAL '1 day' - INTERVAL '1 month')::date::text AS start_date`,
      [daysFromToday],
    );
    const startDate = startRows[0]?.start_date;

    const { rows: mouRows } = await db.query<{ id: string }>(
      `INSERT INTO mou (company_id, company_plant_id, scheme, mou_start_date, tenure_value, tenure_unit, attendance_cycle, stipend_date)
       VALUES ($1, $2, 'WILP', $3, 1, 'MONTHS', 'Monthly', 5) RETURNING id`,
      [companyId, plantId, startDate],
    );
    const mouId = mouRows[0]?.id;
    if (mouId === undefined) {
      throw new Error("Failed to insert fixture MOU");
    }

    return { companyId, companyName, mouId };
  } finally {
    await db.end();
  }
}

async function insertAlert(mouId: string, thresholdDays: number): Promise<string> {
  const db = pool();
  try {
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO mou_alert (mou_id, threshold_days, triggered_on) VALUES ($1, $2, business_today()) RETURNING id`,
      [mouId, thresholdDays],
    );
    const alertId = rows[0]?.id;
    if (alertId === undefined) {
      throw new Error("Failed to insert fixture alert");
    }
    return alertId;
  } finally {
    await db.end();
  }
}

test("the dashboard badge shows a count including a newly created MOU inside the 90-day window", async ({
  page,
}) => {
  await insertCompanyWithMou(45);

  await signIn(page, accountFor("VIEWER"));
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  const badge = page
    .locator("li", { hasText: "MOU Expiry Alerts" })
    .locator("span.rounded-full");
  await expect(badge).toBeVisible();
  const count = Number(await badge.innerText());
  expect(count).toBeGreaterThan(0);
});

test("the alert list shows a raised alert with its columns and honours the threshold filter", async ({
  page,
}) => {
  const fixture = await insertCompanyWithMou(30);
  await insertAlert(fixture.mouId, 30);

  await signIn(page, accountFor("VIEWER"));
  await page.goto("/alerts");
  await expect(page.getByRole("heading", { name: "MOU Expiry Alerts" })).toBeVisible();

  await expect(page.getByText(fixture.companyName)).toBeVisible();

  await page.getByLabel("Threshold").selectOption("60");
  await expect(page.getByText(fixture.companyName)).toHaveCount(0);

  await page.getByLabel("Threshold").selectOption("30");
  await expect(page.getByText(fixture.companyName)).toBeVisible();
});

test("AC6 acknowledging an alert removes it from the default list", async ({ page }) => {
  const fixture = await insertCompanyWithMou(60);
  await insertAlert(fixture.mouId, 60);

  await signIn(page, accountFor("ADMIN"));
  await page.goto("/alerts");
  const row = page.getByRole("row", { name: fixture.companyName });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: "Acknowledge" }).click();
  await expect(page.getByText(fixture.companyName)).toHaveCount(0);

  await page.getByLabel("Acknowledged").selectOption("true");
  await expect(page.getByText(fixture.companyName)).toBeVisible();
});

test("a VIEWER does not see an Acknowledge action", async ({ page }) => {
  const fixture = await insertCompanyWithMou(90);
  await insertAlert(fixture.mouId, 90);

  await signIn(page, accountFor("VIEWER"));
  await page.goto("/alerts");
  await expect(page.getByText(fixture.companyName)).toBeVisible();
  await expect(page.getByRole("button", { name: "Acknowledge" })).toHaveCount(0);
});

test("Open navigates to the Existing Company view with the company pre-selected", async ({ page }) => {
  const fixture = await insertCompanyWithMou(90);
  await insertAlert(fixture.mouId, 90);

  await signIn(page, accountFor("VIEWER"));
  await page.goto("/alerts");
  const row = page.getByRole("row", { name: fixture.companyName });
  await row.getByRole("link", { name: "Open" }).click();

  await expect(page.getByRole("heading", { name: "Existing Company" })).toBeVisible();
  await expect(page.getByText(`Company Name: ${fixture.companyName}`)).toBeVisible();
});
