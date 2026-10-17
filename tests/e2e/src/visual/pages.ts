/**
 * Purpose: The single list of screens the visual-parity suite covers, shared by the
 * baseline capture (which drives the Figma prototype) and the comparison spec
 * (which drives the local clone), plus the helpers both need: a frozen clock, so
 * the "Good morning · <date>" greeting is identical on both sides, and the
 * prototype's own login sequence, and the scroll helper that brings the part of a
 * screen below the first viewport into view so it can be compared too.
 */

import type { Page } from "@playwright/test";

export const FIGMA_URL = "https://quest-debug-23523110.figma.site/";
export const FIGMA_USERNAME = "admin";
export const FIGMA_PASSWORD = "Admin@123";

/** Saturday 17 Oct 2026, 09:00 IST - a morning, so both sides greet "Good morning". */
export const FROZEN_TIME = new Date("2026-10-17T09:00:00+05:30");

export interface Screen {
  /** Baseline file name, without extension. */
  readonly name: string;
  /** Sidebar label in the prototype; null for the login screen. */
  readonly figmaNav: string | null;
  /** Route in the local clone. */
  readonly localPath: string;
}

export const SCREENS: readonly Screen[] = [
  { name: "login", figmaNav: null, localPath: "/login" },
  { name: "dashboard", figmaNav: "Dashboard", localPath: "/" },
  { name: "add-new-company", figmaNav: "Add New Company", localPath: "/companies/new" },
  { name: "existing-company", figmaNav: "Existing Company", localPath: "/companies" },
  { name: "edit-agreement", figmaNav: "Edit Agreement", localPath: "/agreements/edit" },
  { name: "upload-mou", figmaNav: "Upload MoU", localPath: "/upload-mou" },
  { name: "mou-expiry-alert", figmaNav: "MoU Expiry Alert", localPath: "/alerts" },
  { name: "agreement-history", figmaNav: "Agreement History", localPath: "/agreements/history" },
  { name: "zone-dashboard", figmaNav: "Zone Dashboard", localPath: "/zones/overview" },
  { name: "export", figmaNav: "Export", localPath: "/export" },
  { name: "user-manual", figmaNav: "User Manual", localPath: "/user-manual" },
];

/** Screens implemented so far; every screen of the prototype is cloned. */
export const CLONED_SCREENS: ReadonlySet<string> = new Set(SCREENS.map((screen) => screen.name));

export async function freezeClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(FROZEN_TIME);
}

/** Fills the login form the way a user does; works on both the prototype and the clone. */
export async function signIn(page: Page): Promise<void> {
  const fields = page.locator("input:not([type=checkbox])");
  await fields.nth(0).fill(FIGMA_USERNAME);
  await fields.nth(1).fill(FIGMA_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.locator("aside").waitFor();
}

/**
 * Scrolls the screen's content area (the element below the top bar that owns the
 * scrollbar) to its end. Returns false when the content fits and nothing scrolled,
 * so callers only capture a second image for screens taller than the viewport.
 */
export async function scrollContentToEnd(page: Page): Promise<boolean> {
  const scrolled = await page.evaluate(() => {
    const scroller = [...document.querySelectorAll("main *")].find((element) => {
      const overflow = getComputedStyle(element).overflowY;
      return (overflow === "auto" || overflow === "scroll") && element.scrollHeight > element.clientHeight + 4;
    });
    if (scroller === undefined) return false;
    scroller.scrollTop = scroller.scrollHeight;
    return true;
  });
  if (scrolled) await page.waitForTimeout(300);
  return scrolled;
}
