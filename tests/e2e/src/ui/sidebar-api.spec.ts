/**
 * Purpose: UI tests proving the Figma-clone shell follows the signed-in session -
 * the sidebar officer card shows the API user and role, navigation and Dashboard
 * quick actions follow the SPEC-02 section 3.3 role matrix, a forbidden URL shows
 * "Not available", and the Topbar bell reflects GET /api/alerts/count.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { API_URL, signInAs } from "./figma-fixtures";

const AUTHORING_ONLY = ["Add New Company", "Upload MoU"] as const;
const ADMIN_ONLY = ["Edit Agreement"] as const;

function sidebar(page: Page) {
  return page.locator("aside");
}

test("the officer card shows the signed-in user and role, not the prototype officer", async ({ page }) => {
  const username = await signInAs(page, "ADMIN");

  await expect(sidebar(page).getByText(username, { exact: true })).toBeVisible();
  await expect(sidebar(page).getByText("Admin", { exact: true })).toBeVisible();
  await expect(sidebar(page).getByText("Rajendra Kumar")).toHaveCount(0);
});

test("ADMIN sees every navigation entry and quick action", async ({ page }) => {
  await signInAs(page, "ADMIN");

  for (const label of [...AUTHORING_ONLY, ...ADMIN_ONLY]) {
    await expect(sidebar(page).getByRole("link", { name: label })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /Add New Company/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit Agreement/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Upload MoU PDF/ })).toBeVisible();
});

test("DATA_ENTRY sees authoring entries but not Edit Agreement", async ({ page }) => {
  await signInAs(page, "DATA_ENTRY");

  await expect(sidebar(page).getByText("Data Entry", { exact: true })).toBeVisible();
  for (const label of AUTHORING_ONLY) {
    await expect(sidebar(page).getByRole("link", { name: label })).toBeVisible();
  }
  await expect(sidebar(page).getByRole("link", { name: "Edit Agreement" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit Agreement/ })).toHaveCount(0);

  await page.goto("/agreements/edit");
  await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
});

test("VIEWER sees no authoring entries and forbidden URLs show Not available", async ({ page }) => {
  await signInAs(page, "VIEWER");

  await expect(sidebar(page).getByText("Viewer", { exact: true })).toBeVisible();
  for (const label of [...AUTHORING_ONLY, ...ADMIN_ONLY]) {
    await expect(sidebar(page).getByRole("link", { name: label })).toHaveCount(0);
  }
  await expect(page.getByRole("button", { name: /Add New Company/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Upload MoU PDF/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit Agreement/ })).toHaveCount(0);
  // Read-only entries stay.
  await expect(sidebar(page).getByRole("link", { name: "Zone Dashboard" })).toBeVisible();

  for (const path of ["/companies/new", "/upload-mou", "/agreements/edit"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
  }

  await page.goto("/alerts");
  await expect(page.getByRole("heading", { name: "Not available" })).toHaveCount(0);
});

test("the bell dot follows /api/alerts/count and the bell opens the alerts screen", async ({ page }) => {
  await signInAs(page, "VIEWER");
  const response = await page.request.get(`${API_URL}/api/alerts/count`);
  expect(response.ok()).toBe(true);
  const { count } = (await response.json()) as { count: number };

  const bell = page.getByRole("button", { name: "Expiry alerts" });
  await expect(bell).toBeVisible();
  await expect(bell.getByTestId("alerts-dot")).toHaveCount(count > 0 ? 1 : 0);

  await bell.click();
  await expect(page).toHaveURL(/\/alerts$/);
});
