/**
 * Purpose: UI tests for SPEC-13's Search, Export Excel and Export PDF
 * screens. Fixture data is inserted directly via `pg` (mirrors
 * `zone-dashboard.spec.ts`), since only the company/plant/MOU shape matters.
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
  readonly zoneId: string;
  readonly companyId: string;
  readonly companyName: string;
}

async function insertSearchableCompany(): Promise<Fixture> {
  const db = pool();
  try {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const companyName = `Search Test Co ${suffix}`;
    const { rows: zoneRows } = await db.query<{ id: string }>(`SELECT id FROM zone LIMIT 1`);
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
      [`SRCH-26-${suffix}`, companyName, `27AAAAA${suffix}A1Z5`, zoneId, `search${suffix}@example.com`, creatorId],
    );
    const companyId = companyRows[0]?.id;
    const { rows: plantRows } = await db.query<{ id: string }>(
      `INSERT INTO company_plant (company_id, plant_name) VALUES ($1, 'Search Plant') RETURNING id`,
      [companyId],
    );
    const plantId = plantRows[0]?.id;
    await db.query(
      `INSERT INTO mou (company_id, company_plant_id, scheme, mou_start_date, tenure_value, tenure_unit, attendance_cycle, stipend_date)
       VALUES ($1, $2, 'WILP', '2026-01-01', 12, 'MONTHS', 'Monthly', 5)`,
      [companyId, plantId],
    );

    if (zoneId === undefined || companyId === undefined) {
      throw new Error("Failed to insert fixture zone/company");
    }
    return { zoneId, companyId, companyName };
  } finally {
    await db.end();
  }
}

test("AC3 a single-character query shows the minimum-length hint instead of searching", async ({ page }) => {
  await signIn(page, accountFor("VIEWER"));
  await page.goto("/search");
  await expect(page.getByRole("heading", { name: "Search" })).toBeVisible();

  await page.getByLabel("Query").fill("a");
  await expect(page.getByText("Enter at least 2 characters to search.")).toBeVisible();
});

test("searching by Company finds the fixture and links to the Existing Company view", async ({ page }) => {
  const fixture = await insertSearchableCompany();

  await signIn(page, accountFor("VIEWER"));
  await page.goto("/search");
  await page.getByLabel("Query").fill(fixture.companyName);

  const link = page.getByRole("link", { name: fixture.companyName });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole("heading", { name: "Existing Company" })).toBeVisible();
});

test("a query with no matches shows the no-records message", async ({ page }) => {
  await signIn(page, accountFor("VIEWER"));
  await page.goto("/search");
  await page.getByLabel("Query").fill("zzz-no-such-company-zzz");

  await expect(page.getByText("No records found for", { exact: false })).toBeVisible();
});

test("Export Excel with no filter starts a job and offers a download once ready", async ({ page }) => {
  await signIn(page, accountFor("VIEWER"));
  await page.goto("/export/excel");
  await expect(page.getByRole("heading", { name: "Export Excel" })).toBeVisible();

  await page.getByRole("button", { name: "Start Export" }).click();
  await expect(page.getByRole("link", { name: "Download workbook" })).toBeVisible();
});

test("Export PDF with scope All Zones is enabled immediately and produces a download", async ({ page }) => {
  await signIn(page, accountFor("VIEWER"));
  await page.goto("/export/pdf");
  await expect(page.getByRole("heading", { name: "Export PDF" })).toBeVisible();

  await expect(page.getByRole("button", { name: "Export" })).toBeEnabled();
  await page.getByRole("button", { name: "Export" }).click();
  await expect(page.getByRole("link", { name: "Download PDF" })).toBeVisible();
});

test("AC10 Export PDF with the company scope stays disabled until zone, company and plant are all chosen", async ({
  page,
}) => {
  const fixture = await insertSearchableCompany();

  await signIn(page, accountFor("VIEWER"));
  await page.goto("/export/pdf");
  await page.getByLabel("Scope").selectOption({ label: "Company / Company's Plant" });
  await expect(page.getByRole("button", { name: "Export" })).toBeDisabled();

  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await page.getByLabel("Company", { exact: true }).selectOption(fixture.companyId);
  await expect(page.getByRole("button", { name: "Export" })).toBeDisabled();

  await page.getByLabel("Company Plant").selectOption({ label: "Search Plant" });
  await expect(page.getByRole("button", { name: "Export" })).toBeEnabled();
});
