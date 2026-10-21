/**
 * Purpose: UI tests for SPEC-12's Zone Wise Dashboard - the summary table,
 * filters applied consistently to both tables, and drill-down into the
 * Existing Company view. Fixture data is inserted directly via `pg` (mirrors
 * `upload-mou.spec.ts`), since only the zone/company/MOU shape matters.
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
  readonly zoneName: string;
  readonly companyName: string;
}

/** Inserts a fresh zone, one company/plant, and one active WILP MOU. */
async function insertZoneWithMou(): Promise<Fixture> {
  const db = pool();
  try {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const zoneName = `Zone Test ${suffix}`;
    const companyName = `Zone Test Co ${suffix}`;
    const { rows: zoneRows } = await db.query<{ id: string }>(
      `INSERT INTO zone (code, name) VALUES ($1, $2) RETURNING id`,
      [`ZT${suffix}`, zoneName],
    );
    const zoneId = zoneRows[0]?.id;
    const { rows: userRows } = await db.query<{ id: string }>(`SELECT id FROM "user" LIMIT 1`);
    const creatorId = userRows[0]?.id;

    const { rows: companyRows } = await db.query<{ id: string }>(
      `INSERT INTO company (
         generated_code, company_name, company_type, registration_type, tan_number, gst_number,
         zone_id, address_line_1, city, pin_code, state, district,
         hr_contact_name, finance_head_contact_name, contact_type,
         hr_contact_number, finance_head_contact_number, hr_email, finance_email, created_by
       ) VALUES ($1, $2, 'PRIVATE_SECTOR', 'COMPANY', 'TANP12345C', $3,
         $4, '1 Test Road', 'Pune', '411001', 'Maharashtra', 'Pune',
         'HR Name', 'Finance Name', 'MOBILE', '9876543210', '9876543211', $5, $5, $6)
       RETURNING id`,
      [`ZONE-26-${suffix}`, companyName, `27AAAAA${suffix}A1Z5`, zoneId, `zone${suffix}@example.com`, creatorId],
    );
    const companyId = companyRows[0]?.id;
    const { rows: plantRows } = await db.query<{ id: string }>(
      `INSERT INTO company_plant (company_id, plant_name) VALUES ($1, 'Zone Plant') RETURNING id`,
      [companyId],
    );
    const plantId = plantRows[0]?.id;

    // A start date safely in the past and a long tenure, so the MOU is ACTIVE.
    await db.query(
      `INSERT INTO mou (company_id, company_plant_id, scheme, mou_start_date, tenure_value, tenure_unit, attendance_cycle, stipend_date)
       VALUES ($1, $2, 'WILP', (business_today() - INTERVAL '30 days')::date, 12, 'MONTHS', 'Monthly', 5)`,
      [companyId, plantId],
    );

    return { zoneName, companyName };
  } finally {
    await db.end();
  }
}

test("AC1 a zone with zero companies still appears in the summary", async ({ page }) => {
  const db = pool();
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  const zoneName = `Empty Zone ${suffix}`;
  try {
    await db.query(`INSERT INTO zone (code, name) VALUES ($1, $2)`, [`EZ${suffix}`, zoneName]);
  } finally {
    await db.end();
  }

  await signIn(page, accountFor("VIEWER"));
  await page.goto("/zones/overview");
  await expect(page.getByRole("heading", { name: "Zone Wise Dashboard" })).toBeVisible();

  // Both the Summary and Scheme Breakdown tables render a row per zone
  // starting with the zone name, so the locator is scoped to the first
  // table (Summary) to avoid a strict-mode match on both.
  const row = page.locator("table").first().getByRole("row", { name: new RegExp(zoneName) });
  await expect(row).toBeVisible();
  await expect(row.getByRole("cell").nth(1)).toHaveText("0");
});

test("the summary shows the MOU under Active, and drill-down opens the Existing Company view", async ({ page }) => {
  const fixture = await insertZoneWithMou();

  await signIn(page, accountFor("VIEWER"));
  await page.goto("/zones/overview");
  await expect(page.getByRole("heading", { name: "Zone Wise Dashboard" })).toBeVisible();

  // Scoped to the Summary table (the first one) - the Scheme Breakdown
  // table below it also has a row starting with the same zone name.
  const row = page.locator("table").first().getByRole("row", { name: new RegExp(fixture.zoneName) });
  await expect(row).toBeVisible();

  // Numeric buttons in row order: MOUs (0), Active (1), Expired (2), New (3).
  await row.getByRole("button", { name: /^\d+$/ }).nth(1).click(); // the "Active" count
  const drillDownRow = page.getByRole("row", { name: new RegExp(fixture.companyName) });
  await expect(drillDownRow).toBeVisible();

  await drillDownRow.getByRole("link", { name: "Open" }).click();
  await expect(page.getByRole("heading", { name: "Existing Company" })).toBeVisible();
  await expect(page.getByText(`Company Name: ${fixture.companyName}`)).toBeVisible();
});

test("AC7 filtering by a scheme with no matching MOUs shows zero for that zone", async ({ page }) => {
  const fixture = await insertZoneWithMou();

  await signIn(page, accountFor("VIEWER"));
  await page.goto("/zones/overview");
  await expect(page.getByRole("heading", { name: "Zone Wise Dashboard" })).toBeVisible();

  await page.getByLabel("Scheme").selectOption({ label: "FLEXI" });
  const row = page.locator("table").first().getByRole("row", { name: new RegExp(fixture.zoneName) });
  await expect(row.getByRole("button", { name: "0" }).first()).toBeVisible();
});
