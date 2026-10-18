/**
 * Purpose: UI tests proving the Figma-clone Export screen counts matching MoUs
 * with GET /api/search (zone / scheme / company / status / start-date filters),
 * downloads the filtered selection and the report cards through the server export
 * jobs (Excel, Expiry = status EXPIRING, all-zones PDF), and shows the bulk ZIP
 * card as not available rather than faking it.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { API_URL, insertCompanyWithMou, insertZone, signInAs } from "./figma-fixtures";

async function apiTotal(page: Page, query: string): Promise<number> {
  const response = await page.request.get(`${API_URL}/api/search${query}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { total: number }).total;
}

function matchCount(page: Page) {
  return page.getByText(/records match current filters$/);
}

function card(page: Page, title: string) {
  return page.locator(".glass-card").filter({ has: page.getByRole("heading", { name: title }) });
}

test("the live count comes from GET /api/search", async ({ page }) => {
  await signInAs(page, "VIEWER");
  const all = await apiTotal(page, "?pageSize=1");
  const expiring = await apiTotal(page, "?status=EXPIRING&pageSize=1");

  await page.goto("/export");
  await expect(page.getByRole("heading", { name: "Export Data" })).toBeVisible();
  await expect(matchCount(page)).toHaveText(`${all} records match current filters`);

  await page.getByLabel("Status").selectOption("EXPIRING");
  await expect(matchCount(page)).toHaveText(`${expiring} records match current filters`);
});

test("zone, scheme, company and date filters narrow the count", async ({ page }) => {
  const zone = await insertZone("E2E Export");
  const fixture = await insertCompanyWithMou({ zoneId: zone.zoneId, scheme: "FLEXI" });
  await insertCompanyWithMou({ zoneId: zone.zoneId, scheme: "NAPS", daysToEnd: 400 });

  await signInAs(page, "VIEWER");
  await page.goto("/export");
  await page.getByLabel("Zone").selectOption(zone.zoneId);
  await expect(matchCount(page)).toHaveText("2 records match current filters");

  await page.getByLabel("Scheme").selectOption("FLEXI");
  await expect(matchCount(page)).toHaveText("1 records match current filters");
  await page.getByLabel("Scheme").selectOption("");

  await page.getByLabel("Company").fill(fixture.companyName);
  await expect(matchCount(page)).toHaveText("1 records match current filters");
  await page.getByLabel("Company").fill("");

  const start = (
    (await (await page.request.get(`${API_URL}/api/search?zoneId=${zone.zoneId}&scheme=FLEXI`)).json()) as {
      rows: { mouStartDate: string }[];
    }
  ).rows[0]?.mouStartDate;
  await page.getByLabel("From Date").fill(start ?? "");
  await page.getByLabel("To Date").fill(start ?? "");
  const expected = await apiTotal(page, `?zoneId=${zone.zoneId}&startFrom=${start}&startTo=${start}&pageSize=1`);
  await expect(matchCount(page)).toHaveText(`${expected} records match current filters`);
});

test("Export Filtered Data downloads the server workbook for the filters", async ({ page }) => {
  const zone = await insertZone("E2E Export Download");
  await insertCompanyWithMou({ zoneId: zone.zoneId });

  await signInAs(page, "VIEWER");
  await page.goto("/export");
  await page.getByLabel("Zone").selectOption(zone.zoneId);
  await expect(matchCount(page)).toHaveText("1 records match current filters");

  const exportRequest = page.waitForRequest((request) => request.url().includes("/api/export/excel"));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Filtered Data" }).click();
  expect((await exportRequest).url()).toContain(`zoneId=${zone.zoneId}`);
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
});

test("the report cards download the summary, expiry and PDF reports", async ({ page }) => {
  await signInAs(page, "VIEWER");
  await page.goto("/export");

  const summaryRequest = page.waitForRequest((request) => request.url().includes("/api/export/excel"));
  let download = page.waitForEvent("download");
  await card(page, "MoU Summary Report").getByRole("button", { name: "Download" }).click();
  expect((await summaryRequest).url()).not.toContain("status=");
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);

  const expiryRequest = page.waitForRequest((request) => request.url().includes("/api/export/excel"));
  download = page.waitForEvent("download");
  await card(page, "Expiry Report").getByRole("button", { name: "Download" }).click();
  expect((await expiryRequest).url()).toContain("status=EXPIRING");
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);

  download = page.waitForEvent("download");
  await card(page, "PDF Report").getByRole("button", { name: "Download" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.pdf$/);
});

test("the bulk ZIP card is shown as not available", async ({ page }) => {
  await signInAs(page, "VIEWER");
  await page.goto("/export");
  const zip = card(page, "MoU Documents Bulk");
  await expect(zip).toContainText("Not available yet");
  await expect(zip.getByRole("button")).toBeDisabled();
});
