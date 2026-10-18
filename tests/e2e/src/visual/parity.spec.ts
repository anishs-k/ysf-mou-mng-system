/**
 * Purpose: Asserts each cloned screen renders the same pixels as the Figma
 * prototype baseline (tests/testdata/figma-baseline), both the first viewport and,
 * for screens taller than it, the content scrolled to its end. The tolerance is a
 * fraction of differing pixels; 1% was agreed as the parity bar, because the
 * prototype loads a newer Roboto build than the self-hosted one and its blurred
 * background orbs rasterise slightly differently.
 */

import { expect, test } from "@playwright/test";

import { CLONED_SCREENS, DATA_DRIVEN_SCREENS, SCREENS, freezeClock, scrollContentToEnd, signIn } from "./pages";

/** Overridable (VISUAL_MAX_DIFF=0) to print the exact differing-pixel count of every screen. */
const MAX_DIFF_PIXEL_RATIO = Number(process.env["VISUAL_MAX_DIFF"] ?? "0.01");

for (const screen of SCREENS) {
  test(`${screen.name} matches the prototype`, async ({ page }) => {
    test.skip(!CLONED_SCREENS.has(screen.name), "not cloned yet");
    test.skip(DATA_DRIVEN_SCREENS.has(screen.name), "figures come from the API, not the prototype");
    await freezeClock(page);
    await page.goto("/login");
    if (screen.name !== "login") {
      await signIn(page);
      await page.goto(screen.localPath);
      await page.locator("aside").waitFor();
    }
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot(`${screen.name}.png`, { maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO });
    if (await scrollContentToEnd(page)) {
      await expect(page).toHaveScreenshot(`${screen.name}-end.png`, { maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO });
    }
  });
}
