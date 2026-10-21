/**
 * Purpose: UI tests for SPEC-11's Agreement History screen. Fixture data is a
 * company+plant+MOU inserted directly via `pg` (mirrors `edit-agreement.spec.ts`),
 * with a real history row produced by driving SPEC-10's own edit-request/apply
 * endpoints through Playwright's `request` fixture - not `pg` - so the row's
 * shape is whatever SPEC-10 actually writes, not a hand-built approximation.
 */

import { expect, test } from "@playwright/test";
import type { APIRequestContext } from "@playwright/test";
import { Pool } from "pg";

import { accountFor, E2E_PASSWORD } from "./accounts";
import { signIn } from "./sign-in";

const API_URL = "http://localhost:3001";

function pool(): Pool {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL must be set - see environment.sh");
  }
  return new Pool({ connectionString });
}

interface Fixture {
  readonly mouId: string;
  readonly companyId: string;
  readonly zoneId: string;
}

async function insertMouWithPayroll(): Promise<Fixture> {
  const db = pool();
  try {
    const suffix = String(Math.floor(1000 + Math.random() * 9000));
    const companyName = `History Test Co ${suffix}`;
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
      [`HIST-26-${suffix}`, companyName, `27AAAAA${suffix}A1Z5`, zoneId, `hist${suffix}@example.com`, creatorId],
    );
    const companyId = companyRows[0]?.id;
    if (companyId === undefined) {
      throw new Error("Failed to insert fixture company");
    }

    const { rows: plantRows } = await db.query<{ id: string }>(
      `INSERT INTO company_plant (company_id, plant_name) VALUES ($1, 'History Plant') RETURNING id`,
      [companyId],
    );
    const plantId = plantRows[0]?.id;

    const { rows: mouRows } = await db.query<{ id: string }>(
      `INSERT INTO mou (company_id, company_plant_id, scheme, mou_start_date, tenure_value, tenure_unit, attendance_cycle, stipend_date)
       VALUES ($1, $2, 'WILP', '2026-01-01', 12, 'MONTHS', 'Monthly', 5) RETURNING id`,
      [companyId, plantId],
    );
    const mouId = mouRows[0]?.id;
    if (mouId === undefined) {
      throw new Error("Failed to insert fixture MOU");
    }

    const { rows: configRows } = await db.query<{ id: string }>(
      `INSERT INTO payroll_config (mou_id) VALUES ($1) RETURNING id`,
      [mouId],
    );
    const configId = configRows[0]?.id;
    await db.query(`INSERT INTO trainee_category (payroll_config_id, category_name) VALUES ($1, 'Category A')`, [configId]);

    if (zoneId === undefined) {
      throw new Error("No zone available for the fixture");
    }
    return { mouId, companyId, zoneId };
  } finally {
    await db.end();
  }
}

async function applyOneEdit(request: APIRequestContext, mouId: string, newTenureValue: string): Promise<void> {
  const admin = accountFor("ADMIN");
  await request.post(`${API_URL}/api/auth/login`, { data: { username: admin.username, password: E2E_PASSWORD } });

  const editResponse = await request.post(`${API_URL}/api/mous/${mouId}/edit-request`, {
    multipart: { reason: "ADDENDUM_IN_AGREEMENT" },
  });
  const { token, version, commercial, payroll } = (await editResponse.json()) as {
    token: string;
    version: number;
    commercial: Record<string, unknown>;
    payroll: Record<string, unknown>;
  };

  const applyResponse = await request.put(`${API_URL}/api/mous/${mouId}`, {
    data: { token, version, commercial: { ...commercial, tenureValue: newTenureValue }, payroll },
  });
  if (!applyResponse.ok()) {
    throw new Error(`apply failed: ${applyResponse.status()} ${await applyResponse.text()}`);
  }
}

test("AC8 an MOU with no edits shows the empty state", async ({ page }) => {
  const fixture = await insertMouWithPayroll();
  await signIn(page, accountFor("VIEWER"));
  await page.goto(`/agreements/history?mouId=${fixture.mouId}`);

  await expect(page.getByText("No amendments recorded for this agreement.")).toBeVisible();
});

test("AC1/AC4 an edited MOU shows a history row, and opening it renders the pre-edit values", async ({ page, request }) => {
  const fixture = await insertMouWithPayroll();
  await applyOneEdit(request, fixture.mouId, "24");

  await signIn(page, accountFor("VIEWER"));
  await page.goto(`/agreements/history?mouId=${fixture.mouId}`);

  await expect(page.getByRole("cell", { name: "Addendum in Agreement" })).toBeVisible();
  await page.getByRole("row", { name: /Addendum in Agreement/ }).getByRole("button", { name: "View" }).click();

  await expect(page.getByText("12 MONTHS")).toBeVisible();
});

test("AC6/AC7 comparing the history row with Current shows only the tenure changed", async ({ page, request }) => {
  const fixture = await insertMouWithPayroll();
  await applyOneEdit(request, fixture.mouId, "24");

  await signIn(page, accountFor("VIEWER"));
  await page.goto(`/agreements/history?mouId=${fixture.mouId}`);

  await page.getByRole("button", { name: "Compare" }).click();
  await expect(page.getByText("Tenure")).toBeVisible();
  await expect(page.getByText("12 MONTHS")).toBeVisible();
  await expect(page.getByText("24 MONTHS")).toBeVisible();
});

test("the Existing Company commercial page links to Agreement History with the MOU pre-selected", async ({ page }) => {
  const fixture = await insertMouWithPayroll();

  await signIn(page, accountFor("VIEWER"));
  await page.goto("/companies");
  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await page.getByLabel("Company Name").selectOption(fixture.companyId);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();

  // D93's persistent Sidebar also links "Agreement History" - scope to the
  // routed page content so this matches the Existing Company page's own link.
  await page.locator("main").getByRole("link", { name: "Agreement History" }).click();
  await expect(page.getByRole("heading", { name: "Agreement History" })).toBeVisible();
  await expect(page.getByText("No amendments recorded for this agreement.")).toBeVisible();
});
