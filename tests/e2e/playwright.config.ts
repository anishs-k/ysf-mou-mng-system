/**
 * Purpose: Playwright configuration for the SPEC-02 UI acceptance criteria. It boots
 * the real API and the real web dev server rather than mocking either, so the tests
 * exercise the browser, the session cookie, CORS and the server's own role checks
 * together. Workers are pinned to one because the tests share a single database.
 *
 * The base URL is deliberately `localhost`, not `127.0.0.1`: the API's CORS
 * allow-list and the session cookie are both scoped to the `localhost` origin, and
 * mixing the two spellings would silently break credentials.
 */

import { defineConfig, devices } from "@playwright/test";

const WEB_PORT = 5173;
const API_PORT = 3001;
const WEB_URL = `http://localhost:${WEB_PORT}`;
const API_HEALTH_URL = `http://127.0.0.1:${API_PORT}/api/zones`;

/**
 * Localhost must never go through a proxy. Sandboxes and corporate networks set
 * HTTP_PROXY/HTTPS_PROXY, and Playwright honours them for both the browser and its
 * own web-server readiness probe - so without this the probe for http://localhost
 * is sent to the proxy, never reaches the dev server, and the run stalls until the
 * 120s webServer timeout. Setting it here rather than in the shell matters because
 * turborepo filters environment variables before Playwright starts.
 */
function bypassProxyForLocalhost(): void {
  const existing = process.env["NO_PROXY"] ?? process.env["no_proxy"] ?? "";
  const hosts = new Set(
    existing
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ""),
  );
  for (const host of ["localhost", "127.0.0.1", "::1"]) {
    hosts.add(host);
  }
  const value = [...hosts].join(",");
  process.env["NO_PROXY"] = value;
  process.env["no_proxy"] = value;
}

bypassProxyForLocalhost();

export default defineConfig({
  testDir: "./src/ui",
  fullyParallel: false,
  workers: 1,
  forbidOnly: process.env["CI"] !== undefined,
  retries: 0,
  reporter: [["list"]],
  globalSetup: "./src/global-setup.ts",
  use: {
    baseURL: WEB_URL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev --workspace=@mou/api",
      url: API_HEALTH_URL,
      reuseExistingServer: process.env["CI"] === undefined,
      timeout: 120_000,
      stdout: "pipe",
    },
    {
      command: "npm run dev --workspace=@mou/web",
      url: WEB_URL,
      reuseExistingServer: process.env["CI"] === undefined,
      timeout: 120_000,
      stdout: "pipe",
    },
  ],
});
