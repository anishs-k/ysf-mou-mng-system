/**
 * Purpose: UI tests for SPEC-20's two screens on the real API: the login card's
 * "Create an account" link opens /signup, a submitted request is refused at login
 * as awaiting approval, the super admin finds it under User Approvals, approves it
 * as Data Entry, and the person can then sign in; a zonal or non-admin user is
 * shown neither the sidebar link nor the screen.
 */

import { expect, test } from "@playwright/test";

import { pool, signInAs, uniqueSuffix } from "./figma-fixtures";

const PASSWORD = "Secret@123";

/** The per-IP sign-up limit (D125) would otherwise trip on repeated runs from localhost. */
async function clearSignUpThrottle(): Promise<void> {
  const db = pool();
  try {
    await db.query(`DELETE FROM login_attempt WHERE username LIKE 'signup-ip:%'`);
  } finally {
    await db.end();
  }
}

test("a sign-up waits for approval, then signs in with the role the super admin chose", async ({ page }) => {
  await clearSignUpThrottle();
  const email = `signup.${uniqueSuffix()}@example.com`;

  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page.getByRole("heading", { name: "Create an account" })).toBeVisible();

  await page.getByLabel("Full Name").fill("Signup Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Zone").selectOption({ index: 1 });
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm Password").fill("Mismatch@123");
  await page.getByRole("button", { name: /Request Account/ }).click();
  await expect(page.getByText("Passwords do not match")).toBeVisible();

  await page.getByLabel("Confirm Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Request Account/ }).click();
  await expect(page.getByRole("heading", { name: "Request submitted" })).toBeVisible();

  await page.goto("/login");
  await page.getByPlaceholder("e.g., branch_xyz01").fill(email);
  await page.getByPlaceholder("Enter your password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("alert")).toContainText("Your account is awaiting admin approval.");

  await signInAs(page, "ADMIN");
  await page.getByRole("link", { name: "User Approvals" }).click();
  const row = page.getByTestId("pending-row").filter({ hasText: email });
  await expect(row).toContainText("Signup Tester");
  await row.getByLabel(`Role for ${email}`).selectOption("DATA_ENTRY");
  await row.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByRole("status")).toContainText(`${email} approved as Data Entry.`);
  await expect(page.getByTestId("pending-row").filter({ hasText: email })).toHaveCount(0);

  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByPlaceholder("e.g., branch_xyz01").fill(email);
  await page.getByPlaceholder("Enter your password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("reject asks for confirmation before turning a request away", async ({ page }) => {
  await clearSignUpThrottle();
  const email = `reject.${uniqueSuffix()}@example.com`;
  await page.goto("/signup");
  await page.getByLabel("Full Name").fill("Reject Tester");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Zone").selectOption({ index: 1 });
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirm Password").fill(PASSWORD);
  await page.getByRole("button", { name: /Request Account/ }).click();
  await expect(page.getByRole("heading", { name: "Request submitted" })).toBeVisible();

  await signInAs(page, "ADMIN");
  await page.goto("/admin/approvals");
  const row = page.getByTestId("pending-row").filter({ hasText: email });
  await row.getByRole("button", { name: "Reject" }).click();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Confirm reject" }).click();
  await expect(page.getByRole("status")).toContainText(`${email} rejected.`);
});

test("only a super admin is shown User Approvals", async ({ page }) => {
  await signInAs(page, "VIEWER");
  await expect(page.getByRole("link", { name: "User Approvals" })).toHaveCount(0);
  await page.goto("/admin/approvals");
  await expect(page.getByRole("heading", { name: "Not available" })).toBeVisible();
});
