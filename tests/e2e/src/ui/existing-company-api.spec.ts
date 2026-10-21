/**
 * Purpose: UI tests proving the Figma-clone Existing Companies screen lists MoUs
 * from GET /api/search (server-side company / zone / scheme / status filters, a
 * pager over `total`), and that the record view reads the company overview,
 * commercial, payroll, agreements and documents endpoints. Also covers Export
 * PDF, Upload MoU (hidden for VIEWER) and the ?zoneId=&companyId= deep link.
 */

import { COMPANY_TYPE_LABELS, REGISTRATION_TYPE_LABELS } from "@mou/domain";
import type { CompanyType, RegistrationType } from "@mou/domain";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { API_URL, MINIMAL_PDF, insertCompanyWithMou, insertZone, signInAs } from "./figma-fixtures";

interface SearchResponse {
  readonly rows: readonly { readonly generatedCode: string }[];
  readonly total: number;
  readonly pageSize: number;
}

async function apiSearch(page: Page, query: string): Promise<SearchResponse> {
  const response = await page.request.get(`${API_URL}/api/search${query}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as SearchResponse;
}

function recordCount(page: Page) {
  return page.getByText(/records found$/);
}

function rowFor(page: Page, code: string) {
  return page.locator("table tbody tr").filter({ hasText: code });
}

test("the list and its count come from GET /api/search, with a pager", async ({ page }) => {
  await signInAs(page, "VIEWER");
  const all = await apiSearch(page, "");

  await page.goto("/companies");
  await expect(page.getByRole("heading", { name: "Existing Companies" })).toBeVisible();
  await expect(recordCount(page)).toHaveText(`${all.total} records found`);
  await expect(page.locator("table tbody tr")).toHaveCount(Math.min(all.total, all.pageSize));

  const pages = Math.max(1, Math.ceil(all.total / all.pageSize));
  await expect(page.getByText(`Page 1 of ${pages}`)).toBeVisible();
  if (pages > 1) {
    await page.getByRole("button", { name: "Next" }).click();
    await expect(page.getByText(`Page 2 of ${pages}`)).toBeVisible();
  }

  // The prototype's hard-coded rows are gone.
  await expect(page.getByText("Amber Enterprises India Limited, Supa")).toHaveCount(0);
});

test("the search box queries by company name", async ({ page }) => {
  const fixture = await insertCompanyWithMou();
  await signInAs(page, "VIEWER");
  const expected = await apiSearch(page, `?by=company&q=${encodeURIComponent(fixture.companyName)}`);

  await page.goto("/companies");
  await page.getByPlaceholder(/Search by company name/).fill(fixture.companyName);
  await expect(recordCount(page)).toHaveText(`${expected.total} records found`);
  await expect(rowFor(page, fixture.generatedCode)).toHaveCount(1);
});

test("zone, scheme and status filters are applied by the API", async ({ page }) => {
  const zone = await insertZone("E2E Existing");
  const fixture = await insertCompanyWithMou({ zoneId: zone.zoneId, scheme: "MSBTE", daysToEnd: 20 });
  await insertCompanyWithMou({ zoneId: zone.zoneId, scheme: "NAPS", daysToEnd: 200 });

  await signInAs(page, "VIEWER");
  await page.goto("/companies");
  await page.getByLabel("Zone").selectOption(zone.zoneId);
  await expect(recordCount(page)).toHaveText("2 records found");

  await page.getByLabel("Scheme").selectOption("MSBTE");
  await expect(recordCount(page)).toHaveText("1 records found");
  await expect(rowFor(page, fixture.generatedCode)).toContainText("Expiring");

  await page.getByLabel("Scheme").selectOption("");
  await page.getByLabel("Status").selectOption("EXPIRING");
  const expiring = await apiSearch(page, `?zoneId=${zone.zoneId}&status=EXPIRING`);
  await expect(recordCount(page)).toHaveText(`${expiring.total} records found`);
  expect(expiring.total).toBe(1);

  // The prototype's "Pending" status is not a real MoU status.
  await expect(page.getByLabel("Status").locator("option", { hasText: "Pending" })).toHaveCount(0);
});

test("the record view reads overview, commercial, payroll, history and documents from the API", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ withPayroll: true });
  await signInAs(page, "ADMIN");

  const upload = await page.request.post(`${API_URL}/api/mous/${fixture.mouId}/document`, {
    multipart: { file: { name: "signed-mou.pdf", mimeType: "application/pdf", buffer: MINIMAL_PDF } },
  });
  expect(upload.ok()).toBe(true);
  const overview = (await (await page.request.get(`${API_URL}/api/companies/${fixture.companyId}/overview`)).json()) as {
    companyType: CompanyType;
    registrationType: RegistrationType;
    tanNumber: string;
    gstNumber: string;
    zoneName: string;
    hrEmail: string;
    financeEmail: string;
    city: string;
  };

  await page.goto("/companies");
  await page.getByPlaceholder(/Search by company name/).fill(fixture.companyName);
  await rowFor(page, fixture.generatedCode).getByRole("button", { name: "View" }).click();

  await expect(page.getByRole("heading", { name: fixture.companyName })).toBeVisible();
  const main = page.locator("main");
  for (const text of [
    COMPANY_TYPE_LABELS[overview.companyType],
    REGISTRATION_TYPE_LABELS[overview.registrationType],
    overview.tanNumber,
    overview.gstNumber,
    overview.zoneName,
    overview.hrEmail,
    overview.financeEmail,
    overview.city,
    fixture.hrContactName,
    fixture.plantName,
  ]) {
    await expect(main).toContainText(text);
  }

  await page.getByRole("button", { name: "Commercial" }).click();
  await expect(main).toContainText("1 Months");
  await expect(main).toContainText("Monthly");
  await expect(main).toContainText("5th of every month");

  await page.getByRole("button", { name: "Payroll" }).click();
  await expect(main).toContainText("Category A");

  await page.getByRole("button", { name: "History" }).click();
  await expect(main.locator("table tbody tr").filter({ hasText: fixture.generatedCode })).toHaveCount(1);

  await page.getByRole("button", { name: "Documents" }).click();
  await expect(main).toContainText("signed-mou.pdf");
  await expect(main).toContainText("Uploaded");
  const download = main.getByRole("link", { name: "Download signed-mou.pdf" });
  await expect(download).toHaveAttribute("href", /\/api\/documents\//);
});

test("Export PDF opens the MoU print, and Upload MoU hands the MoU to Upload", async ({ page }) => {
  const fixture = await insertCompanyWithMou();
  await signInAs(page, "DATA_ENTRY");
  await page.goto(`/companies?zoneId=${fixture.zoneId}&companyId=${fixture.companyId}`);
  await expect(page.getByRole("heading", { name: fixture.companyName })).toBeVisible();

  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Export PDF" }).click();
  expect((await popup).url()).toContain(`/api/mous/${fixture.mouId}/print`);

  await page.getByRole("button", { name: "Upload MoU" }).click();
  await expect(page).toHaveURL(new RegExp(`/upload-mou\\?mouId=${fixture.mouId}`));
});

test("VIEWER does not see Upload MoU on the deep-linked record", async ({ page }) => {
  const fixture = await insertCompanyWithMou();
  await signInAs(page, "VIEWER");
  await page.goto(`/companies?zoneId=${fixture.zoneId}&companyId=${fixture.companyId}`);
  await expect(page.getByRole("heading", { name: fixture.companyName })).toBeVisible();
  await expect(page.getByText(fixture.generatedCode).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload MoU" })).toHaveCount(0);
});
