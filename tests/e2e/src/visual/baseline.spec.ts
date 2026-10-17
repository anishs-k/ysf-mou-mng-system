/**
 * Purpose: Captures the Figma prototype's screens as the baseline images the
 * parity spec compares against. Skipped unless FIGMA_CAPTURE=1, because it reaches
 * an external site and overwrites the committed baselines.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

import { test } from "@playwright/test";

import { FIGMA_URL, SCREENS, freezeClock, scrollContentToEnd, signIn } from "./pages";

const BASELINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../testdata/figma-baseline");

test.skip(process.env["FIGMA_CAPTURE"] !== "1", "set FIGMA_CAPTURE=1 to re-capture the prototype baselines");

test("capture prototype baselines", async ({ page }) => {
  test.setTimeout(180_000);
  await freezeClock(page);
  await page.goto(FIGMA_URL, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(BASELINE_DIR, "login.png"), animations: "disabled", caret: "hide" });

  await signIn(page);
  for (const screen of SCREENS) {
    if (screen.figmaNav === null) continue;
    await page.locator("aside").getByText(screen.figmaNav, { exact: true }).first().click();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(BASELINE_DIR, `${screen.name}.png`), animations: "disabled", caret: "hide" });
    if (await scrollContentToEnd(page)) {
      await page.screenshot({ path: path.join(BASELINE_DIR, `${screen.name}-end.png`), animations: "disabled", caret: "hide" });
    }
  }
});
