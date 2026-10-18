/**
 * Purpose: UI tests proving the Figma-clone Login and Dashboard screens are wired
 * to the real API rather than to the static data in src/web/src/data. Every figure
 * the screens show is compared with the API's own answer for the same session, so
 * the tests hold whatever rows the database happens to contain.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { E2E_PASSWORD, accountFor } from "./accounts";

const API_URL = "http://localhost:3001";
const GENERIC_MESSAGE = "Invalid username or password.";

async function fillLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("e.g., branch_xyz01").fill(username);
  await page.getByPlaceholder("Enter your password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

async function signInAsAdmin(page: Page): Promise<string> {
  const { username } = accountFor("ADMIN");
  await fillLogin(page, username, E2E_PASSWORD);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  return username;
}

function kpiValue(page: Page, label: string) {
  return page.getByRole("button", { name: label }).locator("p").first();
}

test("valid credentials are checked by the API and land on the Dashboard", async ({ page }) => {
  const username = await signInAsAdmin(page);

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText(`Good morning, ${username}`, { exact: false })).toBeVisible();
});

test("invalid credentials show the API's generic error and stay on login", async ({ page }) => {
  await fillLogin(page, accountFor("ADMIN").username, "definitely-not-the-password");

  await expect(page.getByRole("alert")).toHaveText(GENERIC_MESSAGE);
  await expect(page).toHaveURL(/\/login$/);
});

test("the old browser-only demo credentials are no longer accepted", async ({ page }) => {
  await fillLogin(page, "no-such-user", "Admin@123");

  await expect(page.getByRole("alert")).toHaveText(GENERIC_MESSAGE);
  await expect(page).toHaveURL(/\/login$/);
});

test("without a session the Dashboard redirects to login", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
});

test("the session lives in the server cookie, not in browser storage", async ({ page }) => {
  await signInAsAdmin(page);

  await page.evaluate(() => sessionStorage.clear());
  await page.reload();

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("signing out ends the session on the server", async ({ page }) => {
  await signInAsAdmin(page);

  await page.getByTitle("Sign out").click();
  await expect(page).toHaveURL(/\/login$/);

  const me = await page.request.get(`${API_URL}/api/auth/me`);
  expect(me.status()).toBe(401);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("login hero figures come from /api/public/stats", async ({ page }) => {
  const response = await page.request.get(`${API_URL}/api/public/stats`);
  const stats = (await response.json()) as {
    totalCompanies: number;
    activeMou: number;
    expiringSoon: number;
    activeZones: number;
  };

  await page.goto("/login");

  const figures: readonly (readonly [string, number])[] = [
    ["Active MoUs", stats.activeMou],
    ["Companies", stats.totalCompanies],
    ["Expiring Soon", stats.expiringSoon],
    ["Active Zones", stats.activeZones],
  ];
  for (const [label, value] of figures) {
    const tile = page.locator(".glass-stat").filter({ has: page.getByText(label, { exact: true }) });
    await expect(tile.locator("p").first()).toHaveText(String(value));
  }
});

test("Dashboard KPI tiles come from /api/dashboard/summary", async ({ page }) => {
  await signInAsAdmin(page);
  const response = await page.request.get(`${API_URL}/api/dashboard/summary`);
  expect(response.ok()).toBe(true);
  const summary = (await response.json()) as {
    totalCompanies: number;
    activeMou: number;
    expiringSoon: number;
    expired: number;
    pendingReview: number;
  };

  await expect(kpiValue(page, "Total Companies")).toHaveText(String(summary.totalCompanies));
  await expect(kpiValue(page, "Active MoUs")).toHaveText(String(summary.activeMou));
  await expect(kpiValue(page, "Expiring Soon")).toHaveText(String(summary.expiringSoon));
  await expect(kpiValue(page, "Expired")).toHaveText(String(summary.expired));
  await expect(kpiValue(page, "Pending Review")).toHaveText(String(summary.pendingReview));
  await expect(page.getByText(`${summary.expiringSoon} MoUs expiring within 90 days`)).toBeVisible();
});

test("Recent Activity rows come from /api/dashboard/recent-activity", async ({ page }) => {
  await signInAsAdmin(page);
  const response = await page.request.get(`${API_URL}/api/dashboard/recent-activity?limit=5`);
  expect(response.ok()).toBe(true);
  const rows = (await response.json()) as readonly { company: string }[];

  // The design's illustrative rows must be gone.
  await expect(page.getByText("Tata Consultancy Services")).toHaveCount(0);

  const body = page.locator("table tbody");
  if (rows.length === 0) {
    await expect(body.getByText("No recent activity")).toBeVisible();
    return;
  }
  await expect(body.locator("tr")).toHaveCount(rows.length);
  for (const [index, row] of rows.entries()) {
    await expect(body.locator("tr").nth(index).locator("td").first()).toHaveText(row.company);
  }
});
