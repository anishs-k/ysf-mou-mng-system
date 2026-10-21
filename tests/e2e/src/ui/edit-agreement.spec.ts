/**
 * Purpose: UI tests for SPEC-10's Edit Agreement flow - the reason gate
 * (no field editable before a reason, proof required for one reason) and a
 * full edit-review-apply round trip. Fixture data is inserted directly via
 * `pg` (mirrors `upload-mou.spec.ts`) since only the plant/scheme/payroll
 * shape matters, not a real wizard submission.
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
  readonly plantName: string;
}

/** Inserts a company, one plant, one MOU and a minimal payroll config (one trainee category). */
async function insertEditableMou(): Promise<Fixture> {
  const db = pool();
  try {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const companyName = `Edit Test Co ${suffix}`;
    const plantName = `Edit Plant ${suffix}`;
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
      [`EDIT-26-${suffix}`, companyName, `27AAAAA${suffix}A1Z5`, zoneId, `edit${suffix}@example.com`, creatorId],
    );
    const companyId = companyRows[0]?.id;
    if (companyId === undefined) {
      throw new Error("Failed to insert fixture company");
    }

    const { rows: plantRows } = await db.query<{ id: string }>(
      `INSERT INTO company_plant (company_id, plant_name) VALUES ($1, $2) RETURNING id`,
      [companyId, plantName],
    );
    const plantId = plantRows[0]?.id;

    const { rows: mouRows } = await db.query<{ id: string }>(
      `INSERT INTO mou (company_id, company_plant_id, scheme, mou_start_date, tenure_value, tenure_unit, attendance_cycle, stipend_date)
       VALUES ($1, $2, 'WILP', '2026-01-01', 12, 'MONTHS', 'Monthly', 5) RETURNING id`,
      [companyId, plantId],
    );
    const mouId = mouRows[0]?.id;

    const { rows: configRows } = await db.query<{ id: string }>(
      `INSERT INTO payroll_config (mou_id) VALUES ($1) RETURNING id`,
      [mouId],
    );
    const configId = configRows[0]?.id;
    await db.query(`INSERT INTO trainee_category (payroll_config_id, category_name) VALUES ($1, 'Category A')`, [configId]);

    if (zoneId === undefined) {
      throw new Error("No zone available for the fixture");
    }
    return { zoneId, companyId, plantName };
  } finally {
    await db.end();
  }
}

async function goToEditAgreement(page: import("@playwright/test").Page) {
  await signIn(page, accountFor("ADMIN"));
  await page.goto("/agreements/edit");
  await expect(page.getByRole("heading", { name: "Edit Agreement" })).toBeVisible();
}

async function selectMou(page: import("@playwright/test").Page, fixture: Fixture) {
  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await page.getByLabel("Company", { exact: true }).selectOption(fixture.companyId);
  await page.getByLabel("Company Plant").selectOption({ label: fixture.plantName });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Why are you editing this agreement?" })).toBeVisible();
}

test("AC1 no field is editable before a reason is selected", async ({ page }) => {
  const fixture = await insertEditableMou();
  await goToEditAgreement(page);
  await selectMou(page, fixture);

  await expect(page.getByLabel("MOU Start Date")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();
});

test("AC2 Communication from HR keeps Continue disabled until a proof file is chosen", async ({ page }) => {
  const fixture = await insertEditableMou();
  await goToEditAgreement(page);
  await selectMou(page, fixture);

  await page.getByLabel("Reason").selectOption({ label: "Communication from HR" });
  await expect(page.getByRole("button", { name: "Continue" })).toBeDisabled();

  await page.getByLabel("Proof").setInputFiles({
    name: "proof.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%proof\n"),
  });
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
});

test("AC5 Addendum in Agreement unlocks the form with no upload", async ({ page }) => {
  const fixture = await insertEditableMou();
  await goToEditAgreement(page);
  await selectMou(page, fixture);

  await page.getByLabel("Reason").selectOption({ label: "Addendum in Agreement" });
  await expect(page.getByRole("button", { name: "Continue" })).toBeEnabled();
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByLabel("MOU Start Date")).toBeVisible();
});

test("a full edit changes the tenure, review shows the diff, and Apply bumps the version", async ({ page }) => {
  const fixture = await insertEditableMou();
  await goToEditAgreement(page);
  await selectMou(page, fixture);

  await page.getByLabel("Reason").selectOption({ label: "Addendum in Agreement" });
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByLabel("MOU Start Date")).toBeVisible();

  await page.getByLabel("Tenure").fill("24");
  await page.getByRole("button", { name: "Review changes" }).click();

  await expect(page.getByRole("heading", { name: "Review Changes" })).toBeVisible();
  await expect(page.getByText("Tenure")).toBeVisible();
  await expect(page.getByText("12 MONTHS")).toBeVisible();
  await expect(page.getByText("24 MONTHS")).toBeVisible();

  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByRole("heading", { name: "Edit Applied" })).toBeVisible();
  await expect(page.getByText("version 2", { exact: false })).toBeVisible();
});

test("a DATA_ENTRY user who navigates directly to /agreements/edit sees Not available", async ({ page }) => {
  await signIn(page, accountFor("DATA_ENTRY"));
  await page.goto("/agreements/edit");

  await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
});
