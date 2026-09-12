/**
 * Purpose: UI tests for SPEC-09's standalone Upload MOU PDF flow - the
 * cascading Zone/Company/Plant/Scheme selectors and the scheme step's
 * auto-hide/auto-require rule (section 2.1). Fixture data is inserted
 * directly via `pg` (mirrors `alerts.spec.ts`) since only the plant/scheme
 * shape matters here, not a real wizard submission.
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
  readonly plantName: string;
}

/** Inserts a company, one plant and `schemeCount` MOUs on that plant. */
async function insertCompanyWithSchemes(schemeCount: 1 | 2): Promise<Fixture> {
  const db = pool();
  try {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const companyName = `Upload Test Co ${suffix}`;
    const plantName = `Upload Plant ${suffix}`;
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
      [`UPLOAD-26-${suffix}`, companyName, `27AAAAA${suffix}A1Z5`, zoneId, `upload${suffix}@example.com`, creatorId],
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

    const schemes = schemeCount === 1 ? ["WILP"] : ["WILP", "FLEXI"];
    for (const scheme of schemes) {
      await db.query(
        `INSERT INTO mou (company_id, company_plant_id, scheme, mou_start_date, tenure_value, tenure_unit, attendance_cycle, stipend_date)
         VALUES ($1, $2, $3, '2026-01-01', 12, 'MONTHS', 'Monthly', 5)`,
        [companyId, plantId, scheme],
      );
    }

    if (zoneId === undefined) {
      throw new Error("No zone available for the fixture");
    }
    return { zoneId, companyId, companyName, plantName };
  } finally {
    await db.end();
  }
}

async function goToUploadMou(page: import("@playwright/test").Page) {
  await signIn(page, accountFor("ADMIN"));
  await page.goto("/upload-mou");
  await expect(page.getByRole("heading", { name: "Upload MOU PDF" })).toBeVisible();
}

test("AC1 the company dropdown stays empty and disabled until a zone is chosen", async ({ page }) => {
  await goToUploadMou(page);

  await expect(page.getByLabel("Company", { exact: true })).toBeDisabled();
  const fixture = await insertCompanyWithSchemes(1);
  await page.getByLabel("Zone").selectOption(fixture.zoneId);

  await expect(page.getByLabel("Company", { exact: true })).toBeEnabled();
  await expect(page.getByLabel("Company Plant")).toBeDisabled();
});

test("AC2 changing the zone clears the company, plant and scheme selections", async ({ page }) => {
  const fixture = await insertCompanyWithSchemes(2);
  await goToUploadMou(page);

  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await page.getByLabel("Company", { exact: true }).selectOption(fixture.companyId);
  await page.getByLabel("Company Plant").selectOption({ label: fixture.plantName });
  await expect(page.getByLabel("Scheme")).toBeVisible();

  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await expect(page.getByLabel("Company", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Company Plant")).toBeDisabled();
  await expect(page.getByLabel("Scheme")).toHaveCount(0);
});

test("AC3 a plant with exactly one MOU skips the scheme step and enables upload directly", async ({ page }) => {
  const fixture = await insertCompanyWithSchemes(1);
  await goToUploadMou(page);

  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await page.getByLabel("Company", { exact: true }).selectOption(fixture.companyId);
  await page.getByLabel("Company Plant").selectOption({ label: fixture.plantName });

  await expect(page.getByLabel("Scheme")).toHaveCount(0);
  await expect(page.getByLabel("Upload PDF")).toBeEnabled();
});

test("AC4 a plant with two schemes requires an explicit choice before upload is enabled", async ({ page }) => {
  const fixture = await insertCompanyWithSchemes(2);
  await goToUploadMou(page);

  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await page.getByLabel("Company", { exact: true }).selectOption(fixture.companyId);
  await page.getByLabel("Company Plant").selectOption({ label: fixture.plantName });

  await expect(page.getByLabel("Scheme")).toBeVisible();
  await expect(page.getByLabel("Upload PDF")).toBeDisabled();

  await page.getByLabel("Scheme").selectOption({ label: "FLEXI" });
  await expect(page.getByLabel("Upload PDF")).toBeEnabled();
});

test("AC5 a .docx renamed to .pdf is rejected", async ({ page }) => {
  const fixture = await insertCompanyWithSchemes(1);
  await goToUploadMou(page);

  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await page.getByLabel("Company", { exact: true }).selectOption(fixture.companyId);
  await page.getByLabel("Company Plant").selectOption({ label: fixture.plantName });

  await page.getByLabel("Upload PDF").setInputFiles({
    name: "renamed.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("this is not a real pdf"),
  });

  await expect(page.getByText("The file is not a valid PDF")).toBeVisible();
});

test("AC7 a successful upload adds a row and a second upload leaves the first in place", async ({ page }) => {
  const fixture = await insertCompanyWithSchemes(1);
  await goToUploadMou(page);

  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await page.getByLabel("Company", { exact: true }).selectOption(fixture.companyId);
  await page.getByLabel("Company Plant").selectOption({ label: fixture.plantName });

  await page.getByLabel("Upload PDF").setInputFiles({
    name: "first.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%first\n"),
  });
  await expect(page.getByText("first.pdf")).toBeVisible();

  await page.getByLabel("Upload PDF").setInputFiles({
    name: "second.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%second\n"),
  });
  await expect(page.getByText("second.pdf")).toBeVisible();
  await expect(page.getByText("first.pdf")).toBeVisible();
});

test("a VIEWER who navigates directly to /upload-mou sees Not available", async ({ page }) => {
  await signIn(page, accountFor("VIEWER"));
  await page.goto("/upload-mou");

  await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
});
