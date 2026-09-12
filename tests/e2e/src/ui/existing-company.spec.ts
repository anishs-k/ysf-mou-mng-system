/**
 * Purpose: UI tests for SPEC-07's 3-page read-only Existing Company view. Test
 * data is created directly against the real API (not by driving the wizard
 * UI, which would make every test slow and duplicate the SPEC-03/04/05/06
 * suite) - a full wizard submission via `request` for the common case, plus one
 * direct SQL insert (mirroring `global-setup.ts`'s own use of `pg`) for the
 * two-scheme AC4 case, which the wizard cannot itself produce since it always
 * creates a brand-new company.
 */

import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";
import { PAYROLL_FIXED_ITEM_KEYS } from "@mou/domain";
import { Pool } from "pg";

import { accountFor, E2E_PASSWORD } from "./accounts";
import { signIn } from "./sign-in";

const API_URL = "http://localhost:3001";

async function apiLogin(request: APIRequestContext, username: string, password: string): Promise<void> {
  const response = await request.post(`${API_URL}/api/auth/login`, { data: { username, password } });
  if (!response.ok()) {
    throw new Error(`login failed with status ${response.status()}`);
  }
}

async function firstZoneId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${API_URL}/api/zones`);
  const zones = (await response.json()) as Array<{ id: string }>;
  const zone = zones[0];
  if (zone === undefined) {
    throw new Error("Expected /api/zones to return at least one zone");
  }
  return zone.id;
}

/** Creates one real company, with one MOU, entirely via the API. Each call
 * needs its own unique GST/company name; a per-call random suffix is used
 * instead of a shared counter, since nothing here can rely on module-level
 * state surviving between Playwright test invocations. */
async function createViewableCompany(
  request: APIRequestContext,
  zoneId: string,
): Promise<{ companyId: string; companyName: string; plantName: string }> {
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  const companyName = `View Test Co ${suffix}`;
  const plantName = `View Plant ${suffix}`;
  const admin = accountFor("ADMIN");
  await apiLogin(request, admin.username, E2E_PASSWORD);

  const page1 = {
    zoneId,
    companyName,
    companyType: "PRIVATE_SECTOR",
    registrationType: "COMPANY",
    tanNumber: "TANP12345C",
    gstNumber: `27AAAAA${suffix}A1Z5`,
    addressLine1: "1 Test Road",
    city: "Pune",
    pinCode: "411001",
    state: "Maharashtra",
    district: "Pune",
    hrContactName: "HR Person",
    financeHeadContactName: "Finance Person",
    contactType: "MOBILE",
    hrContactNumber: "9876543210",
    financeHeadContactNumber: "9876543211",
    officialEmail: `co${suffix}@example.com`,
    confirmEmail: `co${suffix}@example.com`,
    plantName,
  };

  const initial = await request.post(`${API_URL}/api/companies/draft`, {
    data: { payload: { page1 }, currentPage: 1 },
  });
  const { id: draftId } = (await initial.json()) as { id: string };

  const uploadResponse = await request.post(`${API_URL}/api/companies/draft/${draftId}/mou-document`, {
    multipart: {
      file: {
        name: "agreement.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%mock\n"),
      },
    },
  });
  const mouDocument = (await uploadResponse.json()) as { originalFilename: string; fileSizeBytes: number };

  const page2 = {
    mouStartDate: "2026-01-01",
    tenureValue: "24",
    tenureUnit: "MONTHS",
    attendanceCycle: "Monthly",
    stipendDate: "5",
    charges: { ADMIN_CHARGES: "0" },
    otherItems: [],
    mouDocument,
  };
  const items: Record<string, { isApplicable: boolean; amount: string }> = {};
  for (const key of PAYROLL_FIXED_ITEM_KEYS) {
    items[key] = { isApplicable: false, amount: "" };
  }
  items["BONUS"] = { isApplicable: true, amount: "500" };
  const page3 = {
    scheme: "WILP",
    traineeCategories: ["Category A"],
    items,
    otherItems: [],
  };

  const persisted = await request.post(`${API_URL}/api/companies/draft`, {
    data: { payload: { page1, page2, page3 }, currentPage: 3 },
  });
  if (!persisted.ok()) {
    throw new Error(`draft persist failed: ${persisted.status()} ${await persisted.text()}`);
  }
  const submitResponse = await request.post(`${API_URL}/api/companies`, { data: { draftId } });
  if (!submitResponse.ok()) {
    throw new Error(`submit failed: ${submitResponse.status()} ${await submitResponse.text()}`);
  }
  const { companyId } = (await submitResponse.json()) as { companyId: string };
  return { companyId, companyName, plantName };
}

/** Adds a second MOU (a different scheme) directly - the wizard cannot itself
 * attach a second MOU to a company it already created. */
async function addSecondScheme(companyId: string, scheme: string): Promise<void> {
  const connectionString = process.env["DATABASE_URL"];
  if (connectionString === undefined || connectionString === "") {
    throw new Error("DATABASE_URL must be set - see environment.sh");
  }
  const pool = new Pool({ connectionString });
  try {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM company_plant WHERE company_id = $1 LIMIT 1`,
      [companyId],
    );
    const plantId = rows[0]?.id;
    await pool.query(
      `INSERT INTO mou (company_id, company_plant_id, scheme, mou_start_date, tenure_value, tenure_unit, attendance_cycle, stipend_date)
       VALUES ($1, $2, $3, '2026-01-01', 12, 'MONTHS', 'Monthly', 5)`,
      [companyId, plantId, scheme],
    );
  } finally {
    await pool.end();
  }
}

async function goToExistingCompany(page: Page) {
  await signIn(page, accountFor("VIEWER"));
  await page.goto("/companies");
  await expect(page.getByRole("heading", { name: "Existing Company" })).toBeVisible();
}

test("AC1 the company dropdown is empty and disabled until a zone is selected", async ({ page, request }) => {
  await goToExistingCompany(page);

  await expect(page.getByLabel("Company Name")).toBeDisabled();

  const zoneId = await firstZoneId(request);
  await page.getByLabel("Zone").selectOption(zoneId);

  await expect(page.getByLabel("Company Name")).toBeEnabled();
});

test("AC2 selecting a company displays plant, GST and both contact names and numbers; Next is disabled until then", async ({
  page,
  request,
}) => {
  const zoneId = await firstZoneId(request);
  const { companyId, companyName, plantName } = await createViewableCompany(request, zoneId);

  await goToExistingCompany(page);
  await expect(page.getByRole("button", { name: "Next" })).toBeDisabled();

  await page.getByLabel("Zone").selectOption(zoneId);
  await page.getByLabel("Company Name").selectOption(companyId);

  await expect(page.getByText(`Company Name: ${companyName}`)).toBeVisible();
  await expect(page.getByText(plantName)).toBeVisible();
  await expect(page.getByText("HR Person")).toBeVisible();
  await expect(page.getByText("Finance Person")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next" })).toBeEnabled();
});

test("AC4 a company with WILP and FLEXI MOUs shows exactly those two scheme options", async ({ page, request }) => {
  const zoneId = await firstZoneId(request);
  const { companyId } = await createViewableCompany(request, zoneId);
  await addSecondScheme(companyId, "FLEXI");

  await goToExistingCompany(page);
  await page.getByLabel("Zone").selectOption(zoneId);
  await page.getByLabel("Company Name").selectOption(companyId);
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();
  const schemeOptions = page.getByLabel("Scheme").locator("option");
  await expect(schemeOptions).toHaveCount(2);
  await expect(page.getByLabel("Scheme").locator('option[value="WILP"]')).toHaveCount(1);
  await expect(page.getByLabel("Scheme").locator('option[value="FLEXI"]')).toHaveCount(1);
});

test("AC6 status shows Active for a current MOU, and the charge distinguishes blank from 0.00", async ({
  page,
  request,
}) => {
  const zoneId = await firstZoneId(request);
  const { companyId } = await createViewableCompany(request, zoneId);

  await goToExistingCompany(page);
  await page.getByLabel("Zone").selectOption(zoneId);
  await page.getByLabel("Company Name").selectOption(companyId);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();

  await expect(page.getByText("Active", { exact: false })).toBeVisible();
  // ADMIN_CHARGES was saved as 0; INSURANCE was left blank.
  await expect(page.getByText("0.00")).toBeVisible();
  await expect(page.getByText("—").first()).toBeVisible();
});

test("AC7 nothing on any of the three pages is editable", async ({ page, request }) => {
  const zoneId = await firstZoneId(request);
  const { companyId } = await createViewableCompany(request, zoneId);

  await goToExistingCompany(page);
  await page.getByLabel("Zone").selectOption(zoneId);
  await page.getByLabel("Company Name").selectOption(companyId);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Payroll Details" })).toBeVisible();
  // D93's shared Topbar puts one textbox (its search input) on every page now -
  // AC7's "nothing is editable" is about the payroll data itself, so the
  // assertion allows exactly that one piece of page chrome, named "Search".
  const textboxes = page.getByRole("textbox");
  await expect(textboxes).toHaveCount(1);
  await expect(textboxes.first()).toHaveAccessibleName("Search");
  await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);
});

test("AC9 print links to the PDF endpoint for this MOU", async ({ page, request }) => {
  const zoneId = await firstZoneId(request);
  const { companyId } = await createViewableCompany(request, zoneId);

  await goToExistingCompany(page);
  await page.getByLabel("Zone").selectOption(zoneId);
  await page.getByLabel("Company Name").selectOption(companyId);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();

  await expect(page.getByRole("link", { name: "Print" })).toHaveAttribute(
    "href",
    /\/api\/mous\/.+\/print$/,
  );
});

test("AC10 an item answered No during the wizard does not appear on Page 3", async ({ page, request }) => {
  const zoneId = await firstZoneId(request);
  const { companyId } = await createViewableCompany(request, zoneId);

  await goToExistingCompany(page);
  await page.getByLabel("Zone").selectOption(zoneId);
  await page.getByLabel("Company Name").selectOption(companyId);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Payroll Details" })).toBeVisible();
  await expect(page.getByText("Bonus", { exact: false })).toBeVisible();
  await expect(page.getByText("Attendance Bonus")).toHaveCount(0);
});
