/**
 * Purpose: UI tests proving the Figma-clone Agreement History screen lists MoUs
 * from GET /api/search (scheme / zone applied at once, From / To applied by the
 * Filter button, paged over `total`), exports the same selection through the
 * server Excel export, and opens a MoU's version history (GET /api/mous/:id/history)
 * from the eye button or the ?mouId= deep link.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { API_URL, insertCompanyWithMou, insertZone, signInAs } from "./figma-fixtures";

interface SearchResponse {
  readonly rows: readonly { readonly mouStartDate: string }[];
  readonly total: number;
  readonly pageSize: number;
}

async function apiSearch(page: Page, query: string): Promise<SearchResponse> {
  const response = await page.request.get(`${API_URL}/api/search${query}`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as SearchResponse;
}

function rowFor(page: Page, code: string) {
  return page.locator("table tbody tr").filter({ hasText: code });
}

test("the table and its total come from GET /api/search", async ({ page }) => {
  await signInAs(page, "VIEWER");
  const all = await apiSearch(page, "");

  await page.goto("/agreements/history");
  await expect(page.getByRole("heading", { name: "Agreement History" })).toBeVisible();
  await expect(page.locator("table tbody tr")).toHaveCount(Math.min(all.total, all.pageSize));
  await expect(page.getByText(`Page 1 of ${Math.max(1, Math.ceil(all.total / all.pageSize))}`)).toBeVisible();
  await expect(page.getByText(new RegExp(`of ${all.total} agreements`))).toBeVisible();

  // The prototype's six hand-written agreements are gone.
  await expect(page.getByText("MoU-NAPS-2025-0101")).toHaveCount(0);
});

test("scheme and zone apply at once; From / To apply on Filter", async ({ page }) => {
  const zone = await insertZone("E2E History");
  const wilp = await insertCompanyWithMou({ zoneId: zone.zoneId, scheme: "WILP" });
  const naps = await insertCompanyWithMou({ zoneId: zone.zoneId, scheme: "NAPS", daysToEnd: 400 });

  await signInAs(page, "VIEWER");
  await page.goto("/agreements/history");
  await page.getByLabel("Zone").selectOption(zone.zoneId);
  await expect(page.locator("table tbody tr")).toHaveCount(2);

  await page.getByLabel("Scheme").selectOption("WILP");
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(rowFor(page, wilp.generatedCode)).toHaveCount(1);
  await page.getByLabel("Scheme").selectOption("");
  await expect(page.locator("table tbody tr")).toHaveCount(2);

  // The NAPS fixture starts later; a range around the WILP start keeps only it.
  const wilpRow = (await apiSearch(page, `?zoneId=${zone.zoneId}&scheme=WILP`)).rows[0];
  const start = wilpRow?.mouStartDate ?? "";
  await page.getByLabel("From date").fill(start);
  await page.getByLabel("To date").fill(start);
  // Dates alone change nothing until Filter is pressed.
  await expect(page.locator("table tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "Filter" }).click();
  const expected = await apiSearch(page, `?zoneId=${zone.zoneId}&startFrom=${start}&startTo=${start}`);
  await expect(page.locator("table tbody tr")).toHaveCount(expected.total);
  await expect(rowFor(page, naps.generatedCode)).toHaveCount(0);
});

test("Export Excel downloads the server workbook for the current filters", async ({ page }) => {
  const zone = await insertZone("E2E History Export");
  await insertCompanyWithMou({ zoneId: zone.zoneId });

  await signInAs(page, "VIEWER");
  await page.goto("/agreements/history");
  await page.getByLabel("Zone").selectOption(zone.zoneId);
  await expect(page.locator("table tbody tr")).toHaveCount(1);

  const exportRequest = page.waitForRequest((request) => request.url().includes("/api/export/excel"));
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Excel" }).click();
  expect((await exportRequest).url()).toContain(`zoneId=${zone.zoneId}`);
  expect((await download).suggestedFilename()).toMatch(/\.xlsx$/);
});

test("the eye button opens the MoU's version history", async ({ page }) => {
  const zone = await insertZone("E2E History Versions");
  const fixture = await insertCompanyWithMou({ zoneId: zone.zoneId });

  await signInAs(page, "VIEWER");
  await page.goto("/agreements/history");
  await page.getByLabel("Zone").selectOption(zone.zoneId);
  await rowFor(page, fixture.generatedCode).getByRole("button", { name: `View ${fixture.generatedCode}` }).click();

  const dialog = page.getByRole("dialog", { name: /Version history/ });
  await expect(dialog).toContainText(fixture.generatedCode);
  await expect(dialog).toContainText("No amendments recorded");

  await dialog.getByRole("button", { name: "View Current" }).click();
  await expect(dialog).toContainText("1 Months");
});

test("?mouId= opens that MoU's version history directly", async ({ page }) => {
  const fixture = await insertCompanyWithMou();
  await signInAs(page, "VIEWER");
  const history = (await (await page.request.get(`${API_URL}/api/mous/${fixture.mouId}/history`)).json()) as {
    currentVersion: number;
  };

  await page.goto(`/agreements/history?mouId=${fixture.mouId}`);
  const dialog = page.getByRole("dialog", { name: /Version history/ });
  await expect(dialog).toContainText(fixture.generatedCode);
  await expect(dialog.locator("tbody tr").first()).toContainText(String(history.currentVersion));

  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
