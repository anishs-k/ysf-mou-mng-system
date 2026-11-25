/**
 * Purpose: Unit tests for the query-string parsing that GET /api/search and
 * GET /api/export/excel share (parseSearchFilters) and Search's own paging
 * (parseSearchPaging). Both are pure functions of the query object, so the
 * validation rules are proven here without a database; the SQL they feed is
 * covered by search-export.integration.test.ts.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseExportView, parseSearchFilters, parseSearchPaging } from "./search-export.ts";

const VALID_ZONE = "11111111-1111-4111-8111-111111111111";

const ZONE = "123e4567-e89b-12d3-a456-426614174000";

test("no parameters at all is valid and selects everything", () => {
  assert.deepEqual(parseSearchFilters({}), { filters: {} });
});

test("by/q keep their existing rules when by is given", () => {
  assert.equal(parseSearchFilters({ by: "company" }).error, "q is required");
  assert.match(parseSearchFilters({ by: "company", q: "a" }).error ?? "", /at least 2 characters/);
  assert.ok(parseSearchFilters({ by: "scheme", q: "NOPE" }).error);
  assert.ok(parseSearchFilters({ by: "zone", q: "ab" }).error);
  assert.deepEqual(parseSearchFilters({ by: "company", q: " tat " }).filters, { by: "company", q: "tat" });
});

test("q without by is rejected rather than silently ignored", () => {
  assert.ok(parseSearchFilters({ q: "tata" }).error);
});

test("scheme is an independent filter that combines with by/q and zoneId", () => {
  const result = parseSearchFilters({ by: "company", q: "tat", scheme: "WILP", zoneId: ZONE });
  assert.equal(result.error, undefined);
  assert.deepEqual(result.filters, { by: "company", q: "tat", scheme: "WILP", zoneId: ZONE });
  assert.ok(parseSearchFilters({ scheme: "NOT_A_SCHEME" }).error);
});

test("status accepts the derived statuses plus the EXPIRING filter", () => {
  for (const status of ["ACTIVE", "EXPIRED", "NEW", "EXPIRING"]) {
    assert.equal(parseSearchFilters({ status }).error, undefined, status);
    assert.equal(parseSearchFilters({ status }).filters.status, status);
  }
  assert.ok(parseSearchFilters({ status: "EXPIRING_SOON" }).error);
});

test("startFrom/startTo must be real YYYY-MM-DD dates in order", () => {
  assert.deepEqual(parseSearchFilters({ startFrom: "2026-01-01", startTo: "2026-12-31" }).filters, {
    startFrom: "2026-01-01",
    startTo: "2026-12-31",
  });
  assert.equal(parseSearchFilters({ startFrom: "2026-01-01" }).error, undefined);
  assert.ok(parseSearchFilters({ startFrom: "01-01-2026" }).error);
  assert.ok(parseSearchFilters({ startTo: "2026-02-30" }).error);
  assert.ok(parseSearchFilters({ startFrom: "2026-12-31", startTo: "2026-01-01" }).error);
});

test("an invalid zoneId is still rejected", () => {
  assert.ok(parseSearchFilters({ zoneId: "nope" }).error);
});

test("paging defaults to page 1 of 25", () => {
  assert.deepEqual(parseSearchPaging({}), { page: 1, pageSize: 25 });
});

test("pageSize accepts 1-100 and rejects anything else", () => {
  assert.deepEqual(parseSearchPaging({ page: "3", pageSize: "100" }), { page: 3, pageSize: 100 });
  assert.ok("error" in parseSearchPaging({ pageSize: "0" }));
  assert.ok("error" in parseSearchPaging({ pageSize: "101" }));
  assert.ok("error" in parseSearchPaging({ pageSize: "2.5" }));
  assert.ok("error" in parseSearchPaging({ page: "0" }));
});

test("SPEC-34 organisation narrows to YSF or YSI and combines with the other filters", () => {
  assert.deepEqual(parseSearchFilters({ organisation: "YSI", zoneId: VALID_ZONE }), { filters: { organisation: "YSI", zoneId: VALID_ZONE } });
  assert.deepEqual(parseSearchFilters({ organisation: "ABC" }), { filters: {}, error: "organisation must be YSF or YSI" });
});

test("export view: full by default, mou on request, anything else refused", () => {
  assert.equal(parseExportView({}), "full");
  assert.equal(parseExportView({ view: "full" }), "full");
  assert.equal(parseExportView({ view: "mou" }), "mou");
  assert.equal(parseExportView({ view: "everything" }), undefined);
});

test("mouId narrows any export to one MoU; it must be a UUID", () => {
  assert.deepEqual(parseSearchFilters({ mouId: VALID_ZONE }), { filters: { mouId: VALID_ZONE } });
  assert.deepEqual(parseSearchFilters({ mouId: "abc" }), { filters: {}, error: "mouId must be a UUID" });
});
