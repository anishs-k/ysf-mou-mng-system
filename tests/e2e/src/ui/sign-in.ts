/**
 * Purpose: The one way the UI tests sign in, so every spec exercises the same real
 * path - the login form, the API, the session cookie and the dashboard - instead of
 * seeding a cookie directly. Files here are helpers, not tests: Playwright only
 * collects `*.spec.ts`.
 */

import { expect } from "@playwright/test";
import type { Page } from "@playwright/test";

import { E2E_PASSWORD } from "./accounts";
import type { E2eAccount } from "./accounts";

export async function submitLogin(page: Page, username: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signIn(page: Page, account: E2eAccount): Promise<void> {
  await submitLogin(page, account.username, E2E_PASSWORD);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}
