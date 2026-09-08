/**
 * Purpose: Smoke test proving the monorepo wiring itself works - that npm
 * workspaces link @mou/api and @mou/web, and that turbo built their dist
 * output before this task ran. It fails if the workspace globs, the build
 * pipeline or the task dependency order break.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { PACKAGE_NAME as API_PACKAGE } from "@mou/api";
import { PACKAGE_NAME as WEB_PACKAGE } from "@mou/web";

test("workspace packages resolve across the monorepo", () => {
  assert.equal(API_PACKAGE, "@mou/api");
  assert.equal(WEB_PACKAGE, "@mou/web");
});
