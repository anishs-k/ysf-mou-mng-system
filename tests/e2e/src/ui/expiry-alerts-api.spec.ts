/**
 * Purpose: UI tests proving the Figma-clone MoU Expiry Alerts screen reads GET
 * /api/alerts/expiring (all thresholds, acknowledged or not), shows one row per
 * MoU, derives its KPI tiles from those rows, loads the HR contact from the company
 * overview, lets ADMIN / DATA_ENTRY acknowledge (by alert id, or by MoU when no
 * alert row exists yet), and hands Renew to Upload MoU with ?mouId=.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { API_URL, insertAlert, insertCompanyWithMou, signInAs } from "./figma-fixtures";

interface AlertRow {
  readonly generatedCode: string;
  readonly daysRemaining: number;
  readonly acknowledgedAt: string | null;
}

/** One entry per MoU code: unacknowledged when any of its alerts is. */
function perMou(rows: readonly AlertRow[]): Map<string, { daysRemaining: number; unacknowledged: boolean }> {
  const byCode = new Map<string, { daysRemaining: number; unacknowledged: boolean }>();
  for (const row of rows) {
    const known = byCode.get(row.generatedCode);
    byCode.set(row.generatedCode, {
      daysRemaining: Math.min(known?.daysRemaining ?? row.daysRemaining, row.daysRemaining),
      unacknowledged: (known?.unacknowledged ?? false) || row.acknowledgedAt === null,
    });
  }
  return byCode;
}

async function apiAlerts(page: Page): Promise<readonly AlertRow[]> {
  const response = await page.request.get(`${API_URL}/api/alerts/expiring?days=all&acknowledged=all`);
  expect(response.ok()).toBe(true);
  return (await response.json()) as readonly AlertRow[];
}

function tileValue(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(label) }).locator("p").first();
}

function rowFor(page: Page, code: string) {
  return page.locator("table tbody tr").filter({ hasText: code });
}

test("rows and KPI tiles come from the API, one row per MoU", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ daysToEnd: 20 });
  await insertAlert(fixture.mouId, 60);
  await insertAlert(fixture.mouId, 30);

  await signInAs(page, "VIEWER");
  const mous = perMou(await apiAlerts(page));
  const days = [...mous.values()];

  await page.goto("/alerts");
  await expect(page.getByRole("heading", { name: "MoU Expiry Alerts" })).toBeVisible();

  await expect(page.locator("table tbody tr")).toHaveCount(mous.size);
  await expect(rowFor(page, fixture.generatedCode)).toHaveCount(1);
  await expect(rowFor(page, fixture.generatedCode)).toContainText(fixture.companyName);
  await expect(rowFor(page, fixture.generatedCode)).toContainText("Expiring");

  await expect(tileValue(page, "Expiring in 30 days")).toHaveText(
    String(days.filter((mou) => mou.daysRemaining >= 0 && mou.daysRemaining <= 30).length),
  );
  await expect(tileValue(page, "Expiring in 60 days")).toHaveText(
    String(days.filter((mou) => mou.daysRemaining >= 0 && mou.daysRemaining <= 60).length),
  );
  await expect(tileValue(page, "Unacknowledged")).toHaveText(String(days.filter((mou) => mou.unacknowledged).length));

  // The prototype's hand-written alert rows are gone.
  await expect(page.getByText("Reliance Industries Ltd")).toHaveCount(0);
});

test("the detail dialog shows the HR contact from the company overview", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ daysToEnd: 25 });
  await insertAlert(fixture.mouId, 30);

  await signInAs(page, "VIEWER");
  await page.goto("/alerts");
  await rowFor(page, fixture.generatedCode).getByRole("button", { name: `View ${fixture.companyName}` }).click();

  const dialog = page.getByRole("dialog", { name: fixture.companyName });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(fixture.hrContactName);
  await expect(dialog).toContainText(fixture.hrContactNumber);
  await expect(dialog).toContainText(fixture.plantName);
  // VIEWER cannot acknowledge.
  await expect(dialog.getByRole("button", { name: "Acknowledge" })).toHaveCount(0);
});

test("DATA_ENTRY acknowledges an alert through the API", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ daysToEnd: 40 });
  await insertAlert(fixture.mouId, 60);

  await signInAs(page, "DATA_ENTRY");
  await page.goto("/alerts");
  const before = Number(await tileValue(page, "Unacknowledged").innerText());

  await rowFor(page, fixture.generatedCode).getByRole("button", { name: `View ${fixture.companyName}` }).click();
  const dialog = page.getByRole("dialog", { name: fixture.companyName });
  await dialog.getByRole("button", { name: "Acknowledge" }).click();

  await expect(tileValue(page, "Unacknowledged")).toHaveText(String(before - 1));
  const after = await apiAlerts(page);
  const ours = after.filter((row) => row.generatedCode === fixture.generatedCode);
  expect(ours.every((row) => row.acknowledgedAt !== null)).toBe(true);
});

test("Renew opens Upload MoU with the alert's MoU preselected", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ daysToEnd: 15 });
  await insertAlert(fixture.mouId, 30);

  await signInAs(page, "ADMIN");
  await page.goto("/alerts");
  await rowFor(page, fixture.generatedCode).getByRole("button", { name: "Renew" }).click();

  await expect(page).toHaveURL(new RegExp(`/upload-mou\\?mouId=${fixture.mouId}`));
  await expect(page.getByLabel("Zone")).toHaveValue(fixture.zoneId);
  await expect(page.getByLabel("Company")).toHaveValue(fixture.companyId);
  await expect(page.getByLabel("Plant")).toHaveValue(fixture.plantId);
  await expect(page.getByLabel("Scheme")).toHaveValue(fixture.mouId);
});

test("a MoU with no raised alert row can still be acknowledged", async ({ page }) => {
  // The API lists MoUs live from their end dates, so no mou_alert row is inserted here.
  const fixture = await insertCompanyWithMou({ daysToEnd: 50 });

  await signInAs(page, "ADMIN");
  await page.goto("/alerts");
  await rowFor(page, fixture.generatedCode).getByRole("button", { name: `View ${fixture.companyName}` }).click();
  await page.getByRole("dialog", { name: fixture.companyName }).getByRole("button", { name: "Acknowledge" }).click();

  await expect(page.getByRole("dialog", { name: fixture.companyName }).getByRole("button", { name: "Acknowledge" })).toHaveCount(0);
  const ours = (await apiAlerts(page)).filter((row) => row.generatedCode === fixture.generatedCode);
  expect(ours.length).toBeGreaterThan(0);
  expect(ours.every((row) => row.acknowledgedAt !== null)).toBe(true);
});
