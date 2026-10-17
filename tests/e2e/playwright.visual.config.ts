/**
 * Purpose: Playwright configuration for the visual-parity suite that compares the
 * static clone in @mou/web against the Figma prototype pixel by pixel. Kept apart
 * from playwright.config.ts because it needs no API, no database and no global
 * setup - only the web dev server. Baseline screenshots of the prototype live in
 * tests/testdata/figma-baseline and are (re)captured with `npm run test:visual:baseline`.
 *
 * VISUAL_BROWSER_CHANNEL lets a machine whose bundled Chromium is missing reuse an
 * installed browser (e.g. "msedge"); baseline and comparison must use the same one,
 * since font rasterisation differs between engines.
 */

import { defineConfig } from "@playwright/test";

const WEB_URL = "http://localhost:5173";
const channel = process.env["VISUAL_BROWSER_CHANNEL"];

export default defineConfig({
  testDir: "./src/visual",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  snapshotPathTemplate: "../testdata/figma-baseline/{arg}{ext}",
  expect: {
    toHaveScreenshot: { animations: "disabled", caret: "hide", scale: "css" },
  },
  use: {
    baseURL: WEB_URL,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    ...(channel === undefined ? {} : { channel }),
  },
  webServer: {
    command: "npm run dev --workspace=@mou/web",
    url: WEB_URL,
    reuseExistingServer: process.env["CI"] === undefined,
    timeout: 120_000,
    stdout: "pipe",
  },
});
