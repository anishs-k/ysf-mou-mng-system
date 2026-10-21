/**
 * Purpose: UI tests proving the Figma-clone Add New Company wizard saves a real
 * company + MoU through the draft API (POST /api/companies/draft, the draft PDF
 * upload, POST /api/companies) and shows the generated code the database holds,
 * that missing required fields block "Save & Continue", and that a VIEWER is refused.
 */

import { formatMoUDisplayCode } from "@mou/domain";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { API_URL, MINIMAL_PDF, signInAs, uniqueSuffix } from "./figma-fixtures";

const NEXT = { name: /Save & Continue/ } as const;

/** A GST / TAN pair no earlier run has used: digits of the suffix mapped onto letters. */
function uniqueTaxIds(suffix: string): { gst: string; tan: string } {
  const letters = [...suffix].map((digit) => String.fromCharCode(65 + Number(digit))).join("");
  return {
    gst: `27${letters.slice(0, 5)}${suffix.slice(2, 6)}F1Z5`,
    tan: `PUNE${suffix.slice(0, 5)}A`,
  };
}

async function fillCompanyDetails(page: Page, companyName: string, suffix: string): Promise<void> {
  const { gst, tan } = uniqueTaxIds(suffix);
  await page.getByLabel("Scheme").selectOption("WILP");
  await page.getByLabel("Zone").selectOption({ index: 1 });
  await page.getByLabel("Sector").selectOption("MANUFACTURING");
  await page.getByLabel("Company Name").fill(companyName);
  await page.getByLabel("Company Type").selectOption("PRIVATE_SECTOR");
  await page.getByLabel("Plant / Location").fill(`Pune Plant ${suffix}`);
  await page.getByLabel("Registration Type").selectOption("COMPANY");
  await page.getByLabel("GST Number").fill(gst);
  await page.getByLabel("TAN Number").fill(tan);

  await page.getByLabel("Address Line 1").fill("1 Test Road");
  await page.getByLabel("City").fill("Pune");
  await page.getByLabel("District").fill("Pune");
  await page.getByLabel("PIN Code").fill("411001");
  await page.getByLabel("State").fill("Maharashtra");

  // D155 / D156: no Contact Type; separate HR and Finance emails, each confirmed.
  await page.getByLabel("HR Contact Name").fill("Priya Sharma");
  await page.getByLabel("Finance Head Name").fill("Amit Verma");
  await page.getByLabel("HR Contact Number").fill(`98765${suffix.slice(0, 5)}`);
  await page.getByLabel("Finance Head Contact").fill(`97654${suffix.slice(0, 5)}`);
  await page.getByLabel(/^HR Email ID/).fill(`hr${suffix}@example.com`);
  await page.getByLabel(/^Confirm HR Email ID/).fill(`hr${suffix}@example.com`);
  await page.getByLabel(/^Finance Email ID/).fill(`finance${suffix}@example.com`);
  await page.getByLabel(/^Confirm Finance Email ID/).fill(`finance${suffix}@example.com`);
}

async function fillCommercialDetails(page: Page): Promise<void> {
  await page.getByLabel("MoU Start Date").fill(new Date().toISOString().slice(0, 10));
  // D157: the tenure is entered in months, with no unit to choose.
  await page.getByLabel(/MoU Tenure \(Months\)/).fill("12");
  await expect(page.getByTestId("mou-end-date")).not.toHaveText("Auto-calculated");

  await page.locator('input[type="file"]').setInputFiles({
    name: "signed-mou.pdf",
    mimeType: "application/pdf",
    buffer: MINIMAL_PDF,
  });
  await expect(page.getByText("signed-mou.pdf")).toBeVisible();

  await page.getByLabel("Attendance Cycle").selectOption({ index: 1 });
  await page.getByLabel("Stipend Date").fill("5");

  await page.getByLabel("Charge head 1").selectOption("ADMIN_CHARGES");
  await page.getByLabel("Charge amount 1").fill("1500");
  await page.getByLabel("Charge frequency 1").selectOption("MONTHLY");
  await page.getByLabel("Charge basis 1").selectOption("PER_TRAINEE_PER_MONTH");
}

async function fillPayroll(page: Page): Promise<void> {
  await page.getByLabel("Trainee Category").first().fill("ITI Graduate");
  await page.getByLabel("Qualification").first().fill("ITI");
  await page.getByLabel(/Stipend Rate/).first().fill("12000");
  // D158: the Payroll step asks only for trainee categories - no payroll items.
}

test("filling every step and saving creates the company with the code the API reports", async ({ page }) => {
  const suffix = uniqueSuffix();
  const companyName = `E2E Wizard Co ${suffix}`;
  await signInAs(page, "DATA_ENTRY");
  await page.goto("/companies/new");
  // A draft left by an earlier run is offered first; start clean.
  const discard = page.getByRole("button", { name: "Discard" });
  if (await discard.isVisible().catch(() => false)) await discard.click();

  await fillCompanyDetails(page, companyName, suffix);
  await page.getByRole("button", NEXT).click();

  await expect(page.getByText("Agreement Details")).toBeVisible();
  await fillCommercialDetails(page);
  await page.getByRole("button", NEXT).click();

  await expect(page.getByLabel("Trainee Category").first()).toBeVisible();
  await expect(page.getByText("Fixed Payroll Items")).toHaveCount(0);
  await expect(page.getByText("Other Payroll Items")).toHaveCount(0);
  await fillPayroll(page);
  await page.getByRole("button", NEXT).click();

  await expect(page.getByText("Review — Company Details")).toBeVisible();
  await expect(page.getByText(companyName)).toBeVisible();
  await expect(page.getByText("signed-mou.pdf")).toBeVisible();
  await page.getByRole("button", { name: /Generate Code & Save/ }).click();

  await expect(page.getByRole("heading", { name: "Company Registered!" })).toBeVisible();

  const response = await page.request.get(
    `${API_URL}/api/search?by=company&q=${encodeURIComponent(companyName)}`,
  );
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { rows: readonly { companyName: string; generatedCode: string }[] };
  const saved = body.rows.find((row) => row.companyName === companyName);
  expect(saved).toBeDefined();
  expect(saved?.generatedCode).toMatch(/^MOU-WILP-\d{4}-\d{4}$/);
  await expect(page.getByTestId("generated-code")).toHaveText(formatMoUDisplayCode(saved?.generatedCode ?? ""));
});

test("Save & Continue on a blank Company Details step shows the required-field messages", async ({ page }) => {
  await signInAs(page, "DATA_ENTRY");
  await page.goto("/companies/new");
  const discard = page.getByRole("button", { name: "Discard" });
  if (await discard.isVisible().catch(() => false)) await discard.click();

  await page.getByRole("button", NEXT).click();

  await expect(page.getByRole("alert")).toContainText("Fix the highlighted fields");
  await expect(page.getByText("Choose a scheme")).toBeVisible();
  await expect(page.getByText("Choose a zone")).toBeVisible();
  await expect(page.getByText("Required").first()).toBeVisible();
  // Still on step 1.
  await expect(page.getByText("Basic Information")).toBeVisible();
  await expect(page.getByText("Agreement Details")).toHaveCount(0);
});

test("a VIEWER opening /companies/new sees Not available", async ({ page }) => {
  await signInAs(page, "VIEWER");
  await page.goto("/companies/new");
  await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
  await expect(page.getByText("Basic Information")).toHaveCount(0);
});
