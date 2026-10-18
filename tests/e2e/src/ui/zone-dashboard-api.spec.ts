/**
 * Purpose: UI tests proving the Figma-clone Zone Dashboard reads GET
 * /api/dashboard/zone-wise for its cards and merges GET /api/zones/:id/companies
 * with the zone drill-down for its table, so every company appears once - even
 * one with no MoU. A fresh fixture zone keeps the expected rows exact.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { API_URL, insertCompanyWithMou, insertCompanyWithoutMou, insertZone, signInAs } from "./figma-fixtures";

interface ZoneSummaryRow {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly companies: number;
  readonly active: number;
  readonly expired: number;
  readonly expiringSoon: number;
}

function calendarDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Cards are buttons, whose children are presentational to ARIA, so they carry their zone id. */
function zoneCard(page: Page, zoneId: string) {
  return page.locator(`[data-zone-id="${zoneId}"]`);
}

test("zone cards show the API's per-zone figures", async ({ page }) => {
  const zone = await insertZone("Zone Cards");
  await insertCompanyWithMou({ zoneId: zone.zoneId, daysToEnd: 200 });
  await insertCompanyWithMou({ zoneId: zone.zoneId, daysToEnd: 10 });

  await signInAs(page, "VIEWER");
  const response = await page.request.get(`${API_URL}/api/dashboard/zone-wise`);
  expect(response.ok()).toBe(true);
  const { zones } = (await response.json()) as { zones: readonly ZoneSummaryRow[] };

  await page.goto("/zones/overview");
  await expect(page.getByRole("heading", { name: "Zone Dashboard" })).toBeVisible();

  for (const summary of zones) {
    const card = zoneCard(page, summary.zoneId);
    await expect(card).toContainText(summary.zoneName);
    await expect(card).toContainText(`${summary.companies} companies`);
    await expect(card.getByTestId("count-active")).toHaveText(String(summary.active));
    await expect(card.getByTestId("count-expiring")).toHaveText(String(summary.expiringSoon));
    await expect(card.getByTestId("count-expired")).toHaveText(String(summary.expired));
  }

  const fixture = zones.find((row) => row.zoneId === zone.zoneId);
  expect(fixture?.companies).toBe(2);
});

test("the drill-down lists every company of the zone once, sorted, with formatted MoU fields", async ({ page }) => {
  const zone = await insertZone("Zone Drill");
  const active = await insertCompanyWithMou({ zoneId: zone.zoneId, companyName: `B Active ${zone.zoneName}`, daysToEnd: 200 });
  const expiring = await insertCompanyWithMou({ zoneId: zone.zoneId, companyName: `A Expiring ${zone.zoneName}`, daysToEnd: 10 });
  const empty = await insertCompanyWithoutMou(zone.zoneId);

  await signInAs(page, "VIEWER");
  const drill = await page.request.get(`${API_URL}/api/dashboard/zone-wise/${zone.zoneId}/companies`);
  const drillRows = (await drill.json()) as readonly { companyId: string; endDate: string }[];
  const expiringEnd = drillRows.find((row) => row.companyId === expiring.companyId)?.endDate ?? "";

  await page.goto("/zones/overview");
  await zoneCard(page, zone.zoneId).click();

  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(3);
  // Sorted by company name: "A Expiring…", "B Active…", "E2E Empty Co…".
  await expect(rows.nth(0)).toContainText(expiring.companyName);
  await expect(rows.nth(1)).toContainText(active.companyName);
  await expect(rows.nth(2)).toContainText(empty.companyName);

  await expect(rows.nth(0)).toContainText(expiring.plantName);
  await expect(rows.nth(0)).toContainText(expiring.generatedCode);
  await expect(rows.nth(0)).toContainText("WILP");
  await expect(rows.nth(0)).toContainText(calendarDate(expiringEnd));
  // Columns: #, Company, Plant, Scheme, MoU Code, Expires, Status.
  await expect(rows.nth(0).locator("td").nth(6)).toHaveText("Expiring");
  await expect(rows.nth(1).locator("td").nth(6)).toHaveText("Active");
  // No MoU: every MoU cell is a dash.
  await expect(rows.nth(2).locator("td").nth(4)).toHaveText("—");

  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(rows).toHaveCount(0);
});
