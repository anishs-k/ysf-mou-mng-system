/**
 * Purpose: Smoke test proving the monorepo wiring itself works - that npm
 * workspaces link @mou/api and @mou/web, and that turbo built @mou/api's dist
 * output before this task ran. @mou/web is a Vite application with no library
 * entry point yet, so it is resolved through its manifest rather than imported.
 * It fails if the workspace globs, the build pipeline or the task dependency
 * order break.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

import { PACKAGE_NAME as API_PACKAGE } from "@mou/api";

const require = createRequire(import.meta.url);
const webManifest = require("@mou/web/package.json") as { name: string };

test("workspace packages resolve across the monorepo", () => {
  assert.equal(API_PACKAGE, "@mou/api");
  assert.equal(webManifest.name, "@mou/web");
});
