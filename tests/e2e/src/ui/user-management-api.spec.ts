/**
 * Purpose: UI tests for SPEC-21 on the real API, replacing SPEC-20's sign-up
 * specs: the login card offers no sign-up, a super admin creates a two-zone user
 * on /admin/users who can then sign in, edits and deletes them (delete asks for
 * confirmation), and anyone else is shown neither the sidebar link nor the screen.
 */

import { expect, test } from "@playwright/test";

import { insertZone, signInAs, uniqueSuffix } from "./figma-fixtures";

const PASSWORD = "Secret@123";

test("the login page offers no self sign-up", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Create an account" })).toHaveCount(0);
  await expect(page.getByText("New here?")).toHaveCount(0);
  await page.goto("/signup");
  await expect(page.getByRole("button", { name: /Request Account/ })).toHaveCount(0);
});

test("a super admin creates a two-zone user, who then signs in", async ({ page }) => {
  const pune = await insertZone("Pune");
  const mumbai = await insertZone("Mumbai");
  const username = `e2e.user.${uniqueSuffix()}`;

  await signInAs(page, "ADMIN");
  await page.getByRole("link", { name: "User Management" }).click();
  await page.getByRole("button", { name: "Add User" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(`${username}@example.com`);
  await page.getByLabel("Full Name").fill("Two Zone Officer");
  await page.getByLabel("Role").selectOption("VIEWER");
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm Password").fill("Mismatch@123");
  await page.getByRole("button", { name: "Create User" }).click();
  await expect(page.getByText("Passwords do not match")).toBeVisible();
  await expect(page.getByText("Choose at least one zone")).toBeVisible();

  await page.getByLabel("Confirm Password").fill(PASSWORD);
  await page.getByLabel(pune.zoneName).check();
  await page.getByLabel(mumbai.zoneName).check();
  await page.getByRole("button", { name: "Create User" }).click();
  await expect(page.getByRole("status")).toContainText(`${username} created.`);
  const row = page.getByTestId("user-row").filter({ hasText: username });
  await expect(row).toContainText(pune.zoneName);
  await expect(row).toContainText(mumbai.zoneName);

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByPlaceholder("e.g., branch_xyz01").fill(username);
  await page.getByPlaceholder("Enter your password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("link", { name: "User Management" })).toHaveCount(0);
});

test("editing changes a user's zones, and delete asks for confirmation", async ({ page }) => {
  const pune = await insertZone("Pune");
  const mumbai = await insertZone("Mumbai");
  const username = `e2e.edit.${uniqueSuffix()}`;

  await signInAs(page, "ADMIN");
  await page.goto("/admin/users");
  await page.getByRole("button", { name: "Add User" }).click();
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Email").fill(`${username}@example.com`);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm Password").fill(PASSWORD);
  await page.getByLabel(pune.zoneName).check();
  await page.getByRole("button", { name: "Create User" }).click();
  const row = page.getByTestId("user-row").filter({ hasText: username });
  await expect(row).toContainText(pune.zoneName);

  await row.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel(pune.zoneName).uncheck();
  await page.getByLabel(mumbai.zoneName).check();
  await page.getByRole("button", { name: "Save Changes" }).click();
  await expect(page.getByRole("status")).toContainText(`${username} updated.`);
  await expect(row).toContainText(mumbai.zoneName);
  await expect(row).not.toContainText(pune.zoneName);

  await row.getByRole("button", { name: "Delete" }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Confirm delete" }).click();
  await expect(page.getByRole("status")).toContainText(`${username} deleted.`);
  await expect(page.getByTestId("user-row").filter({ hasText: username })).toHaveCount(0);
});

test("only a super admin is shown User Management", async ({ page }) => {
  await signInAs(page, "VIEWER");
  await expect(page.getByRole("link", { name: "User Management" })).toHaveCount(0);
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
});
