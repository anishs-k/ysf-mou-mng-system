/**
 * Purpose: UI tests for the login screen and session gating - SPEC-02 acceptance
 * criteria AC1 and AC4. They drive the real form against the real API, so the
 * generic failure message, the redirect for an unauthenticated visit and the
 * cookie-based session are all exercised as a browser would meet them.
 */

import { expect, test } from "@playwright/test";

import { accountFor } from "./accounts";
import { signIn, submitLogin } from "./sign-in";

const GENERIC_MESSAGE = "Invalid username or password.";

test("AC1 valid credentials land on Dashboard Home", async ({ page }) => {
  await signIn(page, accountFor("ADMIN"));

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("AC1 invalid credentials show the generic error and stay on the login screen", async ({ page }) => {
  const account = accountFor("ADMIN");

  await submitLogin(page, account.username, "definitely-not-the-password");

  await expect(page.getByRole("alert")).toHaveText(GENERIC_MESSAGE);
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toHaveCount(0);
});

test("AC1 an unknown username shows the very same message", async ({ page }) => {
  await submitLogin(page, "no-such-user", "whatever");

  await expect(page.getByRole("alert")).toHaveText(GENERIC_MESSAGE);
  await expect(page).toHaveURL(/\/login$/);
});

test("AC4 visiting any dashboard URL without a session redirects to login", async ({ page }) => {
  for (const path of ["/", "/companies", "/companies/new", "/alerts", "/search"]) {
    await page.goto(path);

    await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
    await expect(page.getByLabel("Username or email")).toBeVisible();
  }
});

test("a signed-in user visiting /login is sent to the dashboard", async ({ page }) => {
  await signIn(page, accountFor("VIEWER"));

  await page.goto("/login");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
