/**
 * Purpose: UI tests for Dashboard Home - SPEC-02 acceptance criteria AC6, AC7 (the
 * UI half) and AC8. The expected labels are written out here rather than imported
 * from the app, so a change to the dashboard's own list has to be a deliberate
 * change to the test as well; that is the point of an acceptance test.
 */

import { expect, test } from "@playwright/test";

import { accountFor } from "./accounts";
import { signIn } from "./sign-in";

const ALL_ENTRY_POINTS = [
  "Add New Company",
  "Existing Company",
  "MOU Expiry Alerts",
  "Upload MOU PDF",
  "Edit Agreement",
  "Agreement History",
  "Zone Wise Dashboard",
  "Export Excel",
  "Export PDF",
  "Search",
];

/** SPEC-02 section 3.3: a VIEWER is refused these three. */
const AUTHORING_ENTRY_POINTS = ["Add New Company", "Upload MOU PDF", "Edit Agreement"];

/**
 * D93's persistent Sidebar (built from this same entry-point list) now also
 * links every visible entry point, so an unscoped `getByText(label)` matches
 * both the sidebar link and the dashboard's own card and violates Playwright's
 * strict mode. Scoping to `main` (the routed page content, not the sidebar)
 * keeps these assertions about the dashboard's own "Choose a task" grid.
 */
test("AC6 Dashboard Home renders all ten entry points from section 3.1", async ({ page }) => {
  await signIn(page, accountFor("ADMIN"));

  await expect(page.locator("main").getByRole("listitem")).toHaveCount(10);
  for (const label of ALL_ENTRY_POINTS) {
    await expect(page.locator("main").getByText(label, { exact: true })).toBeVisible();
  }
});

test("every entry point has landed and none is disabled", async ({ page }) => {
  await signIn(page, accountFor("ADMIN"));

  // SPEC-02 section 3.1 required a disabled "coming soon" state for a
  // destination whose spec had not yet landed - true throughout this
  // session's SPEC-03/07-13 batch, and no longer true now that SPEC-13
  // (the last of the batch) has landed too.
  await expect(page.getByText("Coming soon", { exact: false })).toHaveCount(0);
  await expect(page.locator('[aria-disabled="true"]')).toHaveCount(0);
});

test("AC7 a VIEWER sees only the seven entry points their role allows", async ({ page }) => {
  await signIn(page, accountFor("VIEWER"));

  await expect(page.locator("main").getByRole("listitem")).toHaveCount(7);

  for (const label of AUTHORING_ENTRY_POINTS) {
    await expect(page.getByText(label, { exact: true })).toHaveCount(0);
  }

  for (const label of ALL_ENTRY_POINTS.filter((entry) => !AUTHORING_ENTRY_POINTS.includes(entry))) {
    await expect(page.locator("main").getByText(label, { exact: true })).toBeVisible();
  }
});

test("AC7 a VIEWER who types a restricted URL is refused", async ({ page }) => {
  await signIn(page, accountFor("VIEWER"));

  await page.goto("/companies/new");

  await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
  await expect(page.getByText("Add New Company", { exact: true })).toHaveCount(0);
});

test("a DATA_ENTRY user sees the authoring entry points but not Edit Agreement", async ({ page }) => {
  await signIn(page, accountFor("DATA_ENTRY"));

  await expect(page.locator("main").getByText("Add New Company", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByText("Upload MOU PDF", { exact: true })).toBeVisible();
  await expect(page.getByText("Edit Agreement", { exact: true })).toHaveCount(0);
});

test("AC8 logging out invalidates the session on the server", async ({ page }) => {
  await signIn(page, accountFor("ADMIN"));

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  // The back button must not restore an authenticated screen.
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(0);

  // And the protected URL is refused when typed again, which proves the session was
  // destroyed on the server rather than merely forgotten by the browser.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByLabel("Username or email")).toBeVisible();
});
