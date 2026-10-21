# Index of source code for MOU management system

## Index format is

- `<relative filepath from project root>` : purpose of the source file.

## How to use this file

- Use this file to determine which source code file to load based "purpose" of the source code file
- Do not load all source code documents every time.
- Update the index whenever you add a new source code file.

## Sourcemap Index

### Monorepo root configuration

- `package.json` : npm workspace root. Declares the workspace globs (`src/*`, `tests/e2e`), the pinned package manager and the `db:*` / `test:*` delegating scripts. Holds no build logic of its own.
- `turbo.json` : Turborepo task pipeline. Defines build/check-types/test/test:integration/test:ui/lint/dev/clean, their dependency order, cache outputs and the environment variables tasks may read — `globalEnv` is required, because turbo 2 strips undeclared variables from child processes.
- `tsconfig.base.json` : Shared strict TypeScript compiler options. Every package tsconfig extends this; listed in turbo `globalDependencies` so a change busts the cache.
- `docker-compose.yml` : `postgres` (local PostgreSQL 15 for development and for the integration and UI tests, published on host port 5434 because 5432 and 5433 are already in use on the development machine), plus `api` and `web` — the full application, buildable and runnable with `docker compose up -d --build` alone on a machine with nothing but Docker installed (see `docs/devenv.md`, "Run everything via Docker"). The `api` service's `DATABASE_URL` is set here directly (`...@postgres:5432/...`, the compose network hostname) and deliberately differs from `.env.example`'s own value (`...@localhost:5434/...`, for a developer running `@mou/api` on the host).
- `.dockerignore` : Keeps the build context for `src/api/Dockerfile` and `src/web/Dockerfile` (both use the repo root as their context, since this is an npm-workspaces monorepo) small — excludes `node_modules`, `dist`, `.git`, test artefacts and the Figma reference exports.
- `.env.example` : Documents `DATABASE_URL`, `TEST_DATABASE_URL`, the `ADMIN_*` seed inputs, `WEB_ORIGIN`, (SPEC-05) `UPLOAD_ROOT`, and (Docker) `MOU_API_PORT`/`MOU_WEB_PORT`. `.env` itself is gitignored.
- `environment.sh` : Gitignored local environment bootstrap for bash / Git Bash. Prepends the Node 24 toolchain to `PATH` (the root manifest requires Node >= 24) and exports the database, seed, CORS and (SPEC-05) `UPLOAD_ROOT` variables. Must be **sourced** (`source ./environment.sh`), not executed.
- `environment.ps1` : The PowerShell twin of `environment.sh` for Windows terminals. Sets the same variables via `$env:` and must be **dot-sourced** (`. .\environment.ps1`). Defaults are only applied when a variable is not already set, so an override survives.

### `@mou/domain` — layer 0

- `src/domain/package.json` : Manifest for the layer 0 package. Zero runtime dependencies, ESM, tests run through `node --test` with type stripping.
- `src/domain/tsconfig.json` : Build config. Emits to `dist`, excludes test files and rewrites `.ts` import extensions to `.js`.
- `src/domain/tsconfig.test.json` : Type-check-only config that additionally includes the test files.
- `src/domain/eslint.config.js` : Flat ESLint configuration for the package.
- `src/domain/src/index.ts` : Public surface of the package. Re-exports the enums, catalogues, Money type, derived rules and the Page 1/Page 2 validation modules so consumers never reach into internal files.
- `src/domain/src/enums.ts` : The SPEC-01 section 2 master reference lists, each as a value tuple, a union type, a value-to-label map and a ready-made option list, plus `ENUM_SETS` for `/api/enums`.
- `src/domain/src/commercial-items.ts` : The section 3 commercial charge catalogue — 16 fixed keys plus the repeatable `OTHER` row — with labels, item types and display order.
- `src/domain/src/payroll-items.ts` : The section 4 payroll item catalogue — 26 fixed keys since SPEC-23 (PF, ESI, TDS added) plus the repeatable `OTHER` row — with labels, item types, display order and each item's value kind (`AMOUNT` / `PERCENT` / `STATUS`, D143); `PERCENT_ITEM_KEYS` / `STATUS_ITEM_KEYS` feed the schema CHECKs.
- `src/domain/src/money.ts` : The branded `Money` string type (D10) that turns an accidental `Number()` conversion into a compile error, plus `validateAmountString` (SPEC-05) — the shared non-negative/≤2-decimal/≤9,999,999.99 rule every optional amount field (SPEC-05 charges, SPEC-06 payroll items) uses.
- `src/domain/src/mou-rules.ts` : `computeEndDate` and `deriveStatus` — the shared MOU rules of sections 6.1 and 6.2, pure and database-free.
- `src/domain/src/company-code.ts` : `formatCompanyCode` — the `<ZONE_CODE>-<YY>-<NNNN>` format of section 6.3.
- `src/domain/src/company-details-validation.ts` : SPEC-04 Page 1 rules — pure `validateCompanyDetails()`, the GST state-code map, and the Mobile/LAN contact-number rules, shared by the browser and `POST /api/companies/validate-page1`.
- `src/domain/src/commercial-details-validation.ts` : SPEC-05 Page 2 rules — pure `validateCommercialDetails()` (tenure range, stipend date, the 16 charge amounts, repeatable "Other" rows with duplicate-label detection, the backdate-more-than-365-days warning), shared by the browser and the final-save route. Also exports `validateOtherChargeRows()`, the repeatable-row rule SPEC-06's payroll "Other" rows reuse rather than re-deriving. Also exports `ATTENDANCE_CYCLES`, the wizard's cycle options, shared with the SPEC-22 sheet dropdown.
- `src/domain/src/user-account-validation.ts` (SPEC-21 §5.1) : Pure `validateUserAccount(input, "create" | "edit")` — username/email normalised and checked, optional full name, 8–128 character password (blank on edit = unchanged), role, and zone access (a zonal user needs at least one distinct zone id; all zones cannot list zones). Shared by the API and the User Management form.
- `src/domain/src/user-account-validation.test.ts` (SPEC-21) : Unit tests for both modes, normalisation and every zone-access combination.
- `src/domain/src/bulk-company-sheet.ts` (SPEC-22) : `BULK_COMPANY_COLUMNS` — the one column list the Excel template, the PDF template and the upload parser share (D136) — plus the dropdown lists and instructions. `matchBulkHeaders` matches headers by text; `readBulkRow` maps one sheet row (list cells by label or code, dates, charge / payroll cells, the `Name | Qualification | Rate; ...` category cell) onto the wizard's page payloads and runs the three page validators, re-keying errors to sheet columns and skipping the MOU PDF rule (D138); `findInFileDuplicates` flags a repeated GST or company + plant + zone.
- `src/domain/src/bulk-company-sheet.test.ts` (SPEC-22) : Unit tests for the column list, header matching, cell mapping, column-keyed errors, the PDF exemption and in-file duplicates.
- `src/domain/src/payroll-value.ts` (SPEC-23 §2) : What a stored payroll answer means by its catalogue value kind (D143) — `validatePercentString` (0–100, 2 decimals, for PF / ESI), `payrollStatusLabel` (TDS's As applicable / Not applicable), `formatPayrollValue` (the one display text: `₹ x/mo`, `12%` or the status; a PDF passes `Rs.`) and `payrollAnswerText` (the history views' `Yes (12%)` / `No` wording).
- `src/domain/src/payroll-value.test.ts` (SPEC-23) : Unit tests for the formatter, the percentage trimming, the PDF currency and the history wording per value kind.
- `src/domain/src/payroll-details-validation.ts` : SPEC-06 Page 3 rules — pure `validatePayrollDetails()` (scheme, at least one unique trainee category, every one of the 22 fixed payroll items explicitly answered Yes/No with an amount required only on Yes, "Other" rows via the shared `validateOtherChargeRows()`), shared by the browser and the final-save route.
- `src/domain/src/mou-rules.test.ts` : Unit tests for AC1 and AC2.
- `src/domain/src/company-code.test.ts` : Unit tests for AC3.
- `src/domain/src/catalogues.test.ts` : Unit tests for AC4 — catalogue sizes, keys, labels, item types, display order and enum coverage.
- `src/domain/src/company-details-validation.test.ts` : Unit tests for SPEC-04's acceptance criteria.
- `src/domain/src/commercial-details-validation.test.ts` : Unit tests for SPEC-05's acceptance criteria.
- `src/domain/src/payroll-details-validation.test.ts` : Unit tests for SPEC-06's acceptance criteria.
- `src/domain/src/money.test.ts` : Unit tests for `validateAmountString`.

- `src/api/Dockerfile` : Multi-stage build for the `api` container — `npm ci` across the whole workspace (needed because `@mou/api` depends on `@mou/domain`'s compiled output), `turbo run build --filter=@mou/api`, then a slim runtime image carrying only the two packages' `dist/` plus the generated SQL migrations. Keeps the workspace-aware root `node_modules` in the runtime stage rather than pruning to one package's dependencies, because npm workspaces symlinks every in-repo package into root `node_modules` regardless of which `package.json` declares the dependency.
- `src/api/docker-entrypoint.sh` : Runs on every `api` container start, before the server: applies migrations (`dist/db/migrate.js`) then the idempotent zone/admin seed (`dist/db/seed/index.js`), so `docker compose up` alone leaves a brand-new machine with a working login. Set `SKIP_DB_BOOTSTRAP=1` to opt out.
- `src/web/Dockerfile` : The same build-then-slim pattern as `src/api/Dockerfile`, but the final stage is `nginx:alpine` serving the static Vite build. `VITE_API_URL` is a build `ARG`, not a runtime env var — Vite inlines `import.meta.env.*` at build time — and defaults to empty, since `client.ts` already prefixes every call with `/api/...` and `nginx.conf` proxies that same-origin path to the `api` container.
- `src/web/nginx.conf.template` : Serves the built SPA. A `.template` (rendered with `envsubst` by the stock `nginx:alpine` entrypoint) rather than a plain `.conf`, because the listen port must vary per deployment — Railway assigns a random `$PORT` the container is required to listen on, while docker-compose keeps a fixed 80 and maps its own host port to it. `try_files ... /index.html` so a hard refresh on a client-side route (e.g. `/companies/new`) does not 404. Ends with an `include` of the proxy snippet below.
- `src/web/20-api-proxy.sh` : Generates the `/api/` reverse-proxy `location` block at container start, but only when `API_UPSTREAM` is set — the one place the two supported deployments genuinely diverge. docker-compose sets it to `http://api:3001`, so the browser talks to a single origin and the session cookie stays same-site with no CORS hop; Railway leaves it unset, because separate services share no compose network to proxy across, and the browser instead calls the API's own public URL (baked in at build time as `VITE_API_URL`). Writes an empty file when unset, so a stale snippet can never point at a dead upstream.

### `@mou/api` — layer 1, backend service

- `src/api/package.json` : Package manifest and per-package task scripts. Also declares the single subpath export `@mou/api/auth/password`, so test fixtures can produce real hashes without widening the service's main entry point. A code-review/Docker fix added `@mou/domain` to `dependencies` — the code already imported from it, but npm workspaces' automatic symlinking of every in-repo package into root `node_modules` had silently hidden the missing declaration; a prunable Docker image needs it declared honestly.
- `src/api/tsconfig.json` : Backend compiler config; extends the shared base, emits to `dist`, excludes tests and the test harness.
- `src/api/tsconfig.test.json` : Type-check-only config that additionally includes the test files.
- `src/api/drizzle.config.ts` : drizzle-kit configuration. Points at the TypeScript schema, the `drizzle` migration output folder and snake_case casing.
- `src/api/drizzle/0000_init_schema.sql` : Generated migration creating all 13 SPEC-01 tables with their CHECK constraints, `ON DELETE RESTRICT` foreign keys and indexes.
- `src/api/drizzle/0001_business_today.sql` : Custom migration adding `business_today()`, which drizzle-kit cannot express from the schema.
- `src/api/drizzle/0002_auth.sql` : Generated migration adding the SPEC-02 `session` and `login_attempt` tables.
- `src/api/src/index.ts` : Backend entry point. `createApp()` wires CORS with credentials, cookie parsing and every router, and is exported so tests can drive the real HTTP surface; `PACKAGE_NAME` is exported for the workspace smoke test.
- `src/api/src/db/schema.ts` : The persistent data model as a Drizzle schema — the single source of truth for the migrations and the inferred types.
- `src/api/src/db/client.ts` : Creates the PostgreSQL pool and the Drizzle handle with snake_case casing.
- `src/api/src/db/migrate.ts` : Applies the generated migrations. Shared by the `db:migrate` CLI and the integration-test harness so both use one migration path.
- `src/api/src/db/company-code-repository.ts` : The atomic company-code sequence allocation of SPEC-01 section 6.3.
- `src/api/src/db/seed/zones.ts` : Seeds the provisional zone master rows (SPEC-01 section 11.1).
- `src/api/src/db/seed/admin-user.ts` : Seeds the single ADMIN row, hashing the password and repairing the legacy plaintext value SPEC-01 left behind (SPEC-01 §11.2, SPEC-02 §2.1).
- `src/api/src/db/seed/index.ts` : Entry point for `npm run db:seed`; runs both seeds idempotently.
- `src/api/src/db/test-harness.ts` : Shared integration-test setup — test database creation, migration, per-test reset and fixture inserts (`insertZone`, `insertCompany`, `insertPlant`, `insertMou`, `insertPayrollConfig`, `insertCommercialItem`, `insertTraineeCategory`, `insertPayrollItem`, `insertMouDocument`), including a user whose password is a real hash. `testDatabaseUrl` refuses a `TEST_DATABASE_URL` that points at the `DATABASE_URL` database, since every test truncates all tables.
- `src/api/src/db/mou-view.ts` : SPEC-07's read-only query assembly — `businessToday()` (the one place a route asks Postgres for "today", per SPEC-01 section 6.2), `fetchCompanyOverview`, `fetchCompanyMous`, `fetchMouCommercialDetail` (status derived at read time, one charge row per fixed key even when unset — `amount: null`), `fetchMouPayrollDetail` (applicable items only, split into allowances/deductions). Reused by SPEC-11 (history) and SPEC-13 (export). SPEC-24: each loader has a batch form (`fetchCompanyOverviews`, `fetchCompaniesAgreements`, `fetchMouCommercialDetails`, `fetchMouPayrollDetails`) loading any number of records in a fixed handful of queries; the one-record functions are their one-id case.
- `src/api/src/db/schema.integration.test.ts` : Integration tests for SPEC-01 AC5 to AC14.
- `src/api/src/routes/enums.ts` : `GET /api/enums` — every SPEC-01 section 2, 3 and 4 list the UI builds its dropdowns from.
- `src/api/src/routes/zones.ts` : `GET /api/zones` and `GET /api/zones/{zoneId}/companies`.
- `src/api/src/routes/companies.ts` : Company wizard endpoints — `POST /api/companies/draft` (create/update draft), `GET /api/companies/draft` (resume), `DELETE /api/companies/draft/:draftId` (cancel, also discards any temp MOU PDF), `POST /api/companies/validate-page1` (SPEC-04 GST uniqueness + duplicate-company check), `POST /api/companies/draft/:draftId/mou-document` (SPEC-05 MOU PDF upload — multer, `%PDF` byte check, size cap, virus-scan hook), `POST /api/companies` (final save transaction). Final save re-validates Pages 1, 2 and 3 via `@mou/domain`, derives `commercial_item` rows (one per entered charge) and `payroll_item` rows (always one per fixed key, plus one per Other row) from the catalogues rather than trusting the client, and promotes the temp PDF to permanent storage plus a `mou_document` row as the last steps of the transaction. Uses per-route `requireSession`, `db.transaction()` across 7+ tables, idempotent submit, and `firstRow()` for `noUncheckedIndexedAccess` safety. Also retains `GET /api/companies/{id}/plants` (public, no auth). A code-review fix added `describeUniqueConflict()`: a unique-constraint violation reaching the final-save transaction (two requests racing past Page 1 validation, which only proves "no conflict at that moment") now answers 409 with a message naming the conflicting constraint, instead of the same generic 500 as a genuine fault. SPEC-22 moved the final save's company / plant / MOU / item inserts into `db/company-writer.ts` (shared with bulk upload) and exports `describeUniqueConflict()` for the bulk route.
- `src/api/src/upload/mou-document-storage.ts` : SPEC-05 section 4 — deterministic temp/permanent file paths built only from `draftId`/`mouId` (never a user-supplied filename), `validatePdfBuffer` (mimetype + `%PDF` header), the `scanForViruses` hook (a no-op unless `VIRUS_SCAN_COMMAND` is set), and the write/promote/discard helpers. Deliberately small and reusable — SPEC-09 reuses this same validation.
- `src/api/src/upload/file-errors.ts` : Distinguishes "file genuinely missing" (ENOENT) from any other filesystem fault for every download route (MOU document, agreement-history proof, export job, the wizard's temp-document check) — a code-review fix. The four routes previously caught every read error and reported 404 "missing", which disguised a permission or disk fault as a message telling the user to re-upload a file that was still present. `isFileNotFoundError()` / `readFileOrThrowMissing()` are the shared, narrow check; anything that is not ENOENT is rethrown and surfaces as a 500.
- `src/api/src/upload/file-errors.unit.test.ts` : Unit tests for `isFileNotFoundError`/`readFileOrThrowMissing` — ENOENT vs. EACCES/EISDIR/EPERM/EIO, and a real missing-vs-present file on disk.
- `src/api/src/auth/cookie-options.unit.test.ts` : Unit tests for the session cookie's `sameSite`/`secure` selection — the `lax` default, the `none` opt-in for a cross-site deployment, `none` implying `secure`, an unrecognised value falling back to `lax` rather than failing open, and (a latent bug this fixed) `clearSessionCookie` using the same attributes it was set with, since a browser only clears a cookie when `path`/`sameSite`/`secure` match.
- `src/api/src/routes/request-parse.ts` : The request-parsing primitives (`UUID_PATTERN`, `isUuid`, `asRecord`, `asArray`, `readJsonField`) that ten route files had each declared independently — a code-review fix consolidating identical duplicated code. Deliberately excludes `firstRow()`, which exists in two genuinely different contracts (throwing vs. `T | undefined`) across the codebase and would change a caller's postcondition if unified.
- `src/api/src/routes/request-parse.unit.test.ts` : Unit tests for every helper in `request-parse.ts`.
- `src/api/src/db/search.ts` : `searchMous` (SPEC-13) — the one query Search
  and both Exports share (D73), status derived once via a shared
  `STATUS_CASE` SQL fragment so pagination filters correctly on a derived
  value (D74).
- `src/api/src/db/export-builder.ts` : `buildExportWorkbook` (the four-sheet
  `.xlsx` via `exceljs`), `buildAllZonesPdfBuffer`, `buildCompanyPdfBuffer`
  (both via `pdfkit`, reusing SPEC-07's `mou-view.ts` functions unchanged,
  D78) — nothing here re-derives a status, a charge or a payroll item.
- `src/api/src/upload/export-storage.ts` : where a generated export lives on
  disk (`exports/<jobId>.<ext>`), mirroring `mou-document-storage.ts`.
- `src/api/src/jobs/export-cleanup.ts` : `runExportCleanup` — deletes
  `export_job` rows (and their files) past `expires_at`; scheduled in
  `index.ts` on the same hourly heartbeat as SPEC-08's expiry job (D79).
- `src/api/src/routes/search-export.ts` : `GET /search`, `GET /export/excel`,
  `GET /export/pdf`, `GET /export/jobs/:jobId`, `GET
/export/jobs/:jobId/download` — the only route that ever serves a file's
  bytes (D75); every other export route only ever returns `{jobId, status}`.
- `src/api/src/search-export.integration.test.ts` : Integration tests for
  SPEC-13 (AC1-AC13); reads a downloaded workbook back with `exceljs` itself
  rather than a hand-rolled byte check.
- `src/web/src/pages/SearchPage.tsx` : SPEC-13's `/search` page — Search By
  selector, paginated results, "Export to Excel" carrying the same filters.
- `src/web/src/pages/ExportExcelPage.tsx` : SPEC-13's `/export/excel` page -
  the same filter shape as Search (pre-filled via query string when linked
  from a search), Start Export, poll-until-ready.
- `src/web/src/pages/ExportPdfPage.tsx` : SPEC-13's `/export/pdf` page -
  scope choice, cascading selectors for the company scope (Export disabled
  until fully resolved, AC10), poll-until-ready.
- `src/web/src/pages/UserManualPage.tsx` : SPEC-18 / SPEC-16 `/user-manual` page —
  full 12-section user reference guide with sticky table-of-contents navigation,
  scheme pill badges, step definitions, callout boxes, and comprehensive FAQ items.
- `tests/e2e/src/ui/search-export.spec.ts` : UI tests for SPEC-13 (the
  minimum-length hint, a real search hit linking to Existing Company, the
  no-records message, both exports' download links, and the company-scope
  PDF's disabled-until-resolved rule).
- `src/domain/src/agreement-diff.ts` (SPEC-11) is not reused by SPEC-13's
  exports - the Excel/PDF builders assemble their own rows directly from
  `search.ts`/`mou-view.ts`, since an export lists current data, not a diff.
- `src/api/src/db/zone-dashboard.ts` : SPEC-12's aggregations —
  `fetchZoneSummary` and `fetchSchemeMatrix` (conditional-aggregate SQL, a
  shared `scoped_mou` CTE deriving status once per query, D69) and
  `fetchZoneDrillDown` (row-level, reuses `@mou/domain`'s `deriveStatus`
  directly rather than re-deriving status in SQL a third time, D71).
- `src/api/src/routes/zone-dashboard.ts` : `GET /dashboard/zone-wise` and
  `GET /dashboard/zone-wise/:zoneId/companies`, both open to any
  authenticated role.
- `src/api/src/zone-dashboard.integration.test.ts` : Integration tests for
  SPEC-12 (AC1-AC10), including a regression test for a join fan-out bug
  found and fixed during this spec (D...; see ADR "Notes on D67–D72").
- `src/web/src/pages/ZoneWiseDashboardPage.tsx` : SPEC-12's
  `/zones/overview` page — summary table, scheme matrix, scheme/status
  filters applied to both, and an in-page drill-down list linking to the
  Existing Company view. The "Expiring ≤ 90 days" figure links straight to
  `/alerts?zoneId=&days=90` instead of opening the in-page drill-down (D72).
- `tests/e2e/src/ui/zone-dashboard.spec.ts` : UI tests for SPEC-12 (a
  zero-company zone, drill-down into Existing Company, and the scheme
  filter); fixtures insert directly via `pg`.
- `src/domain/src/agreement-diff.ts` : `computeAgreementDiff` (SPEC-11) — a
  pure, layer-0 field-by-field comparison between two agreement snapshots,
  every field returned with a `changed` flag so the caller can implement
  "hidden by default, toggle to show all" (AC6) without a second code path.
- `src/api/src/routes/agreement-history.ts` : SPEC-11's four read-only
  routes — `GET /mous/:mouId/history` (version list + `currentVersion`),
  `GET /mous/:mouId/history/current` (the live agreement in the same detail
  shape as a history row, D64), `GET /mous/:mouId/history/compare?from=&to=`
  (registered before the `:historyId` route, D66), `GET
/mous/:mouId/history/:historyId`, and `GET
/mous/:mouId/history/:historyId/proof`. Every route is open to any
  authenticated role; nothing here writes.
- `src/api/src/agreement-history.integration.test.ts` : Integration tests
  for SPEC-11 (AC1-AC10); history rows are produced by driving SPEC-10's
  real edit-request/apply endpoints, never inserted directly.
- `src/web/src/pages/AgreementHistoryPage.tsx` : SPEC-11's
  `/agreements/history` page — cascading selectors (skipped via a `?mouId=`
  deep link), version list, a shared detail renderer for any version
  including "Current", and compare with a changed-only/show-all toggle.
- `tests/e2e/src/ui/agreement-history.spec.ts` : UI tests for SPEC-11 (the
  empty state, a real edit's history row and detail, compare, and the
  Existing Company deep link); the one history row exercised is produced by
  driving SPEC-10's real API, not a `pg` insert.
- `src/web/src/pages/ExistingCompanyPage.tsx` : gained an "Agreement History"
  link next to Print on the commercial page (SPEC-11 section 2).
- `src/api/src/db/mou-edit.ts` : SPEC-10's `fetchEditablePayload` (the full
  editable commercial+payroll shape SPEC-05/06's own validators expect, all
  22 payroll items back — not just applicable ones, unlike SPEC-07's
  read-only view), `deriveCommercialItemRows`/`derivePayrollItemRows`
  (mirrors the final-save derivation in `routes/companies.ts`), and
  `sameDerivedRows`/`sameTraineeCategories` (the AC12 "no changes" diff).
- `src/api/src/upload/edit-proof-storage.ts` : SPEC-10's proof-file
  validation (PDF or image, header-checked) and storage
  (`edit-proof/<mouId>/<requestId>.<ext>`), separate from
  `mou-document-storage.ts` since the allowed types and storage key differ.
- `src/api/src/routes/edit-agreement.ts` : SPEC-10's two endpoints -
  `POST /mous/:mouId/edit-request` (reason/proof/remark → single-use edit
  token) and `PUT /mous/:mouId` (token + payload + version → applies inside
  one transaction, snapshotting to `agreement_history`). ADMIN only.
- `src/api/src/edit-agreement.integration.test.ts` : Integration tests for
  SPEC-10 (AC2, AC4-AC13).
- `src/web/src/pages/EditAgreementPage.tsx` : SPEC-10's `/agreements/edit`
  page - cascading selectors, reason gate, edit form (purpose-built, not
  `Page2`/`Page3` reused - see ADR D61), review-changes screen, Apply.
- `tests/e2e/src/ui/edit-agreement.spec.ts` : UI tests for SPEC-10 (AC1, AC2,
  AC5, a full edit-review-apply round trip, and the DATA_ENTRY "Not
  available" guard); fixtures insert directly via `pg`.
- `src/api/src/routes/mou-documents.ts` : SPEC-09's three standalone document
  endpoints — `GET /mous/:mouId/documents` (list, newest first, joined to
  `user` for the uploader's username), `POST /mous/:mouId/document`
  (ADMIN/DATA_ENTRY, multer memory storage, reuses `validatePdfBuffer`/
  `scanForViruses` from `upload/mou-document-storage.ts`), `GET
/documents/:documentId` (any authenticated role, streams the file).
- `src/api/src/mou-documents.integration.test.ts` : Integration tests for
  SPEC-09 AC5-AC10 (AC1-AC4's cascading-selector rules are UI-only, covered
  by `upload-mou.spec.ts`).
- `src/web/src/pages/UploadMouPage.tsx` : SPEC-09's `/upload-mou` page —
  Zone → Company → Plant → Scheme, scheme step auto-hidden for a single-MOU
  plant, file input + attached-documents table with download links.
- `tests/e2e/src/ui/upload-mou.spec.ts` : UI tests for SPEC-09 (AC1-AC5, AC7,
  plus the VIEWER "Not available" guard); fixtures insert directly via `pg`
  (mirrors `alerts.spec.ts`).
- `src/api/src/upload/mou-document-storage.ts` : gained `writeMouDocument()`
  and `mouDocumentAbsolutePath()` (SPEC-09) alongside SPEC-05's original
  draft-temp-file functions — a second, additive storage path for a document
  attached outside the wizard, keyed by a fresh id rather than the MOU id
  alone, so multiple uploads to the same MOU never collide.
- `src/api/src/jobs/expiry-alerts.ts` : `runExpiryAlertJob` (SPEC-08) — raises `mou_alert` rows via set-based date arithmetic per threshold (90/60/30), reading and updating `scheduled_job_state` so a missed day is caught up rather than skipped. Scheduled from `index.ts` via `setInterval`, not a cron library.
- `src/api/src/routes/alerts.ts` : SPEC-08's three routes — `GET /api/alerts/expiring` (filtered list), `GET /api/alerts/count` (a live `mou` query, not `mou_alert` rows), `POST /api/alerts/:alertId/acknowledge` (ADMIN/DATA_ENTRY via `requireRole`).
- `src/api/src/alerts.integration.test.ts` : Integration tests for SPEC-08 (AC1–AC9), calling `runExpiryAlertJob` directly (it has no HTTP endpoint of its own) alongside the three routes.
- `src/api/src/routes/company-view.ts` : The five SPEC-07 read-only endpoints — `GET /api/companies/:id/overview`, `GET /api/companies/:id/mous?plantId=`, `GET /api/mous/:mouId/commercial`, `GET /api/mous/:mouId/payroll`, `GET /api/mous/:mouId/print` (pdfkit, Page 1+2 fields only, never payroll). `requireSession` only — no role restriction, since every field in this flow is view-only for every role.
- `src/api/src/company-view.integration.test.ts` : Integration tests for SPEC-07 (AC2, AC4, AC6, AC8, AC9, AC10, AC11, the most-recent-document rule, and that a VIEWER reaches every endpoint while an unauthenticated request gets 401).
- `src/api/src/routes.integration.test.ts` : Integration tests for SPEC-01 AC15 and AC16.
- `src/api/src/auth/password.ts` : scrypt hashing and verification (D14). Self-describing stored format, `timingSafeEqual` comparison, and refusal of anything that is not a well-formed hash of ours.
- `src/api/src/auth/user-repository.ts` : The single user read the login flow needs — by username or email, case-insensitively, active rows only.
- `src/api/src/auth/session-repository.ts` : Creates, resolves and deletes sessions. `resolveSession` validates and slides the 30-minute expiry in one statement, and refuses a session whose user has since been deactivated or deleted. It reads the user's role and SPEC-21 zone scope (`all_zones` plus the `user_zone` ids) on every request into `request.auth`. `deleteSessionsOfUser` ends every session of one user.
- `src/api/src/auth/login-rate-limit.ts` : The five-failure / fifteen-minute lockout of SPEC-02 section 2.1, stored in `login_attempt` (D17).
- `src/api/src/auth/middleware.ts` : Session cookie handling plus `requireSession` (401) and `requireRole` (403) — the server-side enforcement SPEC-02 section 3.3 demands.
- `src/api/src/auth/password.unit.test.ts` : Unit tests for the hashing, including that a legacy plaintext row can never authenticate.
- `src/api/src/routes/auth.ts` : `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me`, with one generic failure message and an equalised timing path for unknown usernames. Login and me both answer through `resolveSession`, returning `allZones` + `zoneIds` (SPEC-21 §3). SPEC-20's sign-up route was removed by SPEC-21.
- `src/api/src/auth.integration.test.ts` : Integration tests for SPEC-02 AC2, AC3, AC5 and the server half of AC7.
- `src/api/src/companies.integration.test.ts` : Integration tests for SPEC-03 (AC1 invalid body 400, AC4+AC6 save + idempotency, AC5 failed save rollback, AC7 cancel, AC8 VIEWER 403, cross-user draft protection, DATA_ENTRY access), SPEC-04 (Page 1 validation ACs), SPEC-05 (MOU document upload — valid/invalid/oversized files, ownership, replace-overwrites; final save — blank-vs-zero charges, Other rows, missing-PDF 422, invalid-Page-2 422, `mou_document` metadata, temp-file cleanup on cancel and on save) and SPEC-06 (Yes→No persists `is_applicable=false`/`amount=NULL`, zero/duplicate trainee categories rejected, exactly 22 `payroll_item` rows plus Other rows, consecutive generated codes across two saves, `DOCUMENT_FEE`/`REGISTRATION_FEE` as DEDUCTION, invalid Page 3 blocks save). `createDraftAtStep3()` wraps create-draft → upload-a-real-PDF → persist-full-payload, since final save now requires one; `completePayload()`'s `page3.traineeCategories` is a plain `string[]`, matching the real frontend shape, not the SPEC-03-era `{ categoryName }[]`.
- `src/api/src/db/dashboard-summary.ts` (SPEC-14) : `fetchDashboardSummary` sums `zone-dashboard.ts`'s per-zone SPEC-12 aggregation across zones for the KPI row (D84), plus a `company_draft` row count for "Pending Review" (D85). `fetchRecentActivity` is one SQL query unioning `company.createdAt` and `agreement_history.editedAt` events, newest first, limit clamped to [1, 50] (D86).
- `src/api/src/routes/dashboard-summary.ts` (SPEC-14) : `GET /api/dashboard/summary` and `GET /api/dashboard/recent-activity?limit=`, both `requireSession` only, no role restriction — matches the Dashboard's own visibility.
- `src/api/src/dashboard-summary.integration.test.ts` (SPEC-14) : Integration tests for the two endpoints above (AC6/AC7 of SPEC-14 §5).
- `src/api/src/db/public-stats.ts` (D116, reverses D88) : `fetchPublicStats` sums `zone-dashboard.ts`'s per-zone aggregation into four coarse counts (`totalCompanies`, `activeMou`, `expiringSoon`, `activeZones`) for the Login page's stat tiles. Deliberately does not reuse `fetchDashboardSummary` — that also returns `pendingReview` (draft-onboarding count), which stays behind a session.
- `src/api/src/routes/public-stats.ts` (D116) : `GET /api/public/stats` — the one route in the app with no `requireSession`, by design. Sends `Cache-Control: public, max-age=30`.
- `src/api/src/public-stats.integration.test.ts` (D116) : Confirms the route answers with zero cookies, exposes exactly the four documented fields (nothing else), and that the aggregation sums correctly across zones.
- `src/api/src/auth/zone-scope.ts` (SPEC-19, SPEC-21) : Zone isolation in one place. `ZoneScope` (an array of zone ids, or `null` for an all-zone user; an empty array sees nothing), `zoneScopeOf(request)`, `zoneAllowed`, `recordInScope` (one indexed lookup of a company, MOU, document or alert's owning zone) and `requireInScope` route middleware, which answers an out-of-zone id with the route's own not-found response (D119). SQL callers filter with `= ANY($n::uuid[])`, Drizzle callers with `inArray`.
- `src/api/src/db/seed/create-user.ts` (SPEC-19 §7, SPEC-21 §7) : `npm run user:create` — bootstraps a login with a role and optional comma-separated `--zone` codes (omitted = all zones), in one transaction with its `user_zone` rows; the password is read from `NEW_USER_PASSWORD`, and an existing username is refused.
- `src/api/drizzle/0009_spec19_user_zone.sql` (SPEC-19) : Adds the nullable `user.zone_id` FK to `zone`. NULL keeps every existing user all-zone, so it is safe on a populated database.
- `src/api/src/zone-scope.integration.test.ts` (SPEC-19) : Acceptance tests AC1–AC9 with two zones, an all-zone ADMIN and a zonal ADMIN: filtered lists and counts, zone-B ids indistinguishable from unknown ids, refused writes with no side effect, scoped Excel/PDF exports, creator-only export jobs, wizard zone refusal, and a zone change applying on the next request.
- `src/api/src/routes/admin-users.ts` (SPEC-21 §5) : The super admin's user management API — `GET`/`POST /api/admin/users`, `PATCH`/`DELETE /api/admin/users/:userId`. Guarded by session + ADMIN + all zones; validates with `validateUserAccount`, checks active zones and username/email clashes (409), hashes passwords, and maps `db/user-admin.ts` refusals to 404/409/400.
- `src/api/src/db/user-admin.ts` (SPEC-21) : List, create, edit and soft-delete users with their `user_zone` rows. Every write is one transaction that locks the active super admins (ordered by id), re-checks the actor, and refuses a self-demotion or the removal of the last super admin (D133). Delete renames username/email to `<original>#deleted-<id8>` and ends the user's sessions (D132); a password change ends them too (D135).
- `src/api/drizzle/0010_spec20_signup_approval.sql` (SPEC-20) : Adds `approval_status`, `full_name` and the approval audit columns to `user` and widens `username` to 255. Hand-edited to backfill existing users `APPROVED` before the default becomes `PENDING` (D122).
- `src/api/src/admin-users.integration.test.ts` (SPEC-21) : Acceptance tests AC2, AC3, AC6–AC11 — the SPEC-20 routes are gone, a two-zone user is created and signs in, passwords are scrypt-only, field/zone/duplicate refusals, zone replacement and session end on password change, soft delete freeing names, the self/last-super-admin safeguards under concurrency, and super-admin-only access.
- `src/api/src/db/company-writer.ts` (SPEC-22) : `insertCompanyWithMou` — writes one validated company (company, plant, MOU with its scheme-year code, commercial items, payroll config, trainee categories, all fixed payroll items plus Other rows) inside the caller's transaction. Used by the wizard's final save and by bulk upload, so both write identical rows; the MOU PDF stays the caller's concern.
- `src/api/src/db/bulk-company-files.ts` (SPEC-22) : `buildBulkTemplateWorkbook` (Companies sheet with frozen, colour-coded headers and dropdowns fed from a hidden Lists sheet, the Zone list being the uploader's zones; an Instructions sheet), `buildBulkTemplatePdf` (pdfkit, landscape; D152: the record PDF's layout from `pdf-layout.ts` — YSF band, instructions, one column / required / accepted-values table per section) and `readBulkSheet` (header matching, cell text incl. dates and rich text, blank rows skipped, 500-row cap, template-shaped refusals). SPEC-25 D159: the PDF is now the blank Add New Company form (four sections, 5-row charge and trainee tables) and the Excel header notes / Instructions table name each column's section and Imp / Yes or No.
- `src/api/src/db/bulk-company-files.unit.test.ts` (SPEC-22) : Database-free tests for the template headers and dropdowns, the PDF (D152: band title, section tables, page numbers, no PF / ESI / TDS or removed columns, the logo), reading a filled template back, and each refusal.
- `src/api/src/db/bulk-company-import.ts` (SPEC-22) : `importBulkCompanies` — all or nothing (D139): every row through `readBulkRow`, the zone scope, in-file duplicates and the GST / company + plant clashes (two queries for the whole file); a clean file is written in one transaction via `insertCompanyWithMou`.
- `src/api/src/routes/bulk-companies.ts` (SPEC-22) : `GET /api/companies/bulk/template?format=xlsx|pdf` and `POST /api/companies/bulk` (multer memory, 5 MB, .xlsx only). Authoring roles only, checked before the file is buffered; 400 for a non-template file, 422 with `rowErrors`, 409 on a racing unique conflict, 201 with each new MoU code.
- `src/api/src/bulk-companies.integration.test.ts` (SPEC-22) : AC2–AC10 — both templates, a clean two-row import with the wizard's rows and no PDF (then Upload MoU), a bad row saving nothing, out-of-zone, registered and repeated GST, non-xlsx / missing column, and VIEWER refusal.
- `src/api/drizzle/0011_spec21_user_zones.sql` (SPEC-21) : Creates the `user_zone (user_id, zone_id)` junction table (D128) and `user.all_zones` (D129). Hand-edited to backfill: NULL `zone_id` → `all_zones = true`, a set `zone_id` → one `user_zone` row, and unapproved sign-ups deactivated (D130, D131).
- `src/api/drizzle/0012_spec21_drop_signup.sql` (SPEC-21) : Drops `user.zone_id` and SPEC-20's `approval_status` / `approval_decided_by` / `approval_decided_at`. Must run after 0011, which copies `zone_id` first.
- `src/api/drizzle/0013_spec23_payroll_value_kinds.sql` (SPEC-23 D143) : CHECK-only — `payroll_item_key_chk` gains PF / ESI / TDS, `payroll_item_applicable_amount_chk` lets TDS be applicable with no amount, and the new `payroll_item_percent_chk` (PF / ESI ≤ 100) and `payroll_item_status_chk` (TDS never carries an amount). No column changes.
- `src/api/drizzle/0014_spec23_company_document.sql` (SPEC-23 D145) : Creates `company_document` (company-level GST / Registration certificates) with its type CHECK, RESTRICT foreign keys to `company` and `user`, and the `company_id` index.
- `src/api/drizzle/0015_spec23_statutory_defaults_backfill.sql` (SPEC-23 D148) : Hand-written data migration — inserts PF 12%, ESI 0.75% and TDS As applicable for every `payroll_config` that lacks those rows. Insert-only (`NOT EXISTS`), so it never changes an entered answer and is safe to re-run.
- `src/api/drizzle/0016_d151_remove_demo_deductions.sql` (D151) : Generated CHECK rebuild with a hand-written step between the drop and the add — deletes every `payroll_item` row of the ten removed demo deductions, then re-adds `payroll_item_key_chk` without them.
- `src/api/drizzle/0017_d153_core_commercial_charges.sql` (D153) : Generated CHECK rebuild with a hand-written DELETE of the 7 removed commercial charges between the drop and the add.
- `src/api/drizzle/0018_d155_d158_form_alignment.sql` (SPEC-25) : Step 1 of 2 - adds `hr_email` / `finance_email`, makes `contact_type` nullable, drops the insurance sub-model, and (hand-written) copies the official email into both new columns, restates Years tenures as months and deletes every payroll row but PF / ESI / TDS before the new payroll CHECK.
- `src/api/drizzle/0019_d155_drop_official_email.sql` (D155) : Step 2 of 2 - makes the HR and Finance emails NOT NULL and drops `official_email`.
- `src/api/src/upload/company-document-storage.ts` (SPEC-23 §3) : `detectCompanyDocumentFile` proves PDF / JPEG / PNG from the first bytes (never the mimetype or filename), and the id-only `company/<companyId>/<id>.<ext>` path under the shared `UPLOAD_ROOT`.
- `src/api/src/upload/company-document-storage.unit.test.ts` (SPEC-23) : Unit tests for each signature, a renamed .docx, truncated files and the id-only path.
- `src/api/src/routes/company-documents.ts` (SPEC-23 §3.2) : `GET` / `POST /api/companies/:id/documents` and `GET /api/company-documents/:documentId` — SPEC-09's pattern (10 MB, virus-scan hook, append-only rows, zone scope via the new `companyDocument` record kind in `auth/zone-scope.ts`) with the type proved by magic bytes and served with the stored mime type.
- `src/api/src/company-documents.integration.test.ts` (SPEC-23) : AC7 — PNG upload and listing, newest first, download bytes and type, a renamed .docx and an unknown type refused, VIEWER 403, out-of-zone 404.
- `src/api/src/db/company-record-pdf.ts` (SPEC-23 §5) : `loadCompanyRecord` assembles one MoU's record from `mou-view.ts` plus both document tables; `renderCompanyRecordPdf` (pure, pdfkit) draws the navy header band with the YSF logo (or a drawn "YSF" mark), five bordered sections, tables whose header row repeats after a page break, a running header from page 2 and "Page x of y" footers (the shared drawing comes from `pdf-layout.ts`). SPEC-24: `renderCompanyRecordsPdf` draws many records into one file (each from a new page, that record's running header, page numbers across the file) and `loadCompanyRecords` loads them through the batch view loaders; the one-record functions are their one-item case.
- `src/api/src/db/pdf-layout.ts` (D152) : The YSF look shared by the record PDF and the bulk template PDF — palette and margins, the navy title band with the logo (`drawBrandBand`), running header, section heading bars, bordered zebra tables whose header row repeats after a page break, "Page x of y" footers, and `loadYsfLogo` (reads `src/api/assets/logo-ysf.png` relative to the module). SPEC-25 D159: also the blank-form pieces - `blankFieldGrid` (labelled blank cells two to a row), `blankTable` (numbered empty rows, kept whole when they fit a page), `blankTableHeight` and `smallPrint`.
- `src/api/src/db/company-record-pdf.unit.test.ts` (SPEC-23) : Database-free tests that read the uncompressed PDF's text back — header, the five headings in order, PF as `12%`, TDS as text, Rs. amounts, page numbering, repeated table headers, empty-section notes and the logo / fallback mark.
- `src/api/src/db/mou-edit.unit.test.ts` (SPEC-23) : Unit tests for `derivePayrollItemRows` — one row per fixed key, PF kept as its percentage, TDS never given an amount.
- `src/api/assets/logo-ysf.png` (SPEC-23 D147) : A copy of the web app's YSF logo for the record PDF header; copied into the API container by `src/api/Dockerfile`.

### `@mou/web` — layer 1, web frontend

- `src/web/package.json` : Manifest and task scripts for the frontend workspace.
- `src/web/vite.config.ts` : Vite build and dev-server configuration, with the React and Tailwind plugins.
- `src/web/tsconfig.json`, `src/web/tsconfig.app.json`, `src/web/tsconfig.node.json` : Solution-style compiler configs for the browser code and for the Vite config file. `tsconfig.app.json` cannot `extend` the shared `tsconfig.base.json` (its `module`/`moduleResolution` conflict with Vite's own bundler mode), so it had silently never turned `strict` on at all — a Docker-build-time discovery (a discriminated union's `else` branch failed to narrow without `strictNullChecks`, in `AuthContext.tsx`/`EditAgreementPage.tsx`, both otherwise-correct code) fixed by adding `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride` and `forceConsistentCasingInFileNames` explicitly, matching the base config's intent.
- `src/web/index.html` : Vite HTML entry point.
- `src/web/src/main.tsx` : React bootstrap. Mounts the app inside a `BrowserRouter`.
- `src/web/src/App.tsx` : The route table. `/login` sits outside `AppShell`; every other route is a child of `<RequireAuth><AppShell/></RequireAuth>` (SPEC-14 D93) so the persistent Sidebar/Topbar wraps every destination behind one guard.
- `src/web/src/index.css` : Tailwind v4 entry. Since SPEC-14 (D94): self-hosted `@fontsource/roboto`/`@fontsource/roboto-mono` imports (D82), the `@theme inline` token map and `:root` colour variables ported from `figma_code`, and every `.glass-*` blur utility class. Still no `tailwind.config.js` — v4 stays CSS-configured.
- `src/web/src/components/icons.tsx` (SPEC-14, D95) : The shared inline-SVG icon set (`Icon.*`) ported from `figma_code`'s `Ic` object, plus `ENTRY_ICON` — one icon key per `DASHBOARD_ENTRY_POINTS` id, shared by `Sidebar` and `DashboardPage` so they cannot fall out of sync.
- `src/web/src/components/ui.tsx` (SPEC-14) : Shared presentational primitives ported from `figma_code` — `Badge`, `Btn`, `Card`, `SecTitle`, and the `brand` colour constants. Deliberately excludes Figma's `Input`/`Select` wrappers, since every page's native `<input>`/`<select>` already carries the `id`/`htmlFor` pairing Playwright's `getByLabel` depends on.
- `src/web/src/components/layout/AppShell.tsx` (SPEC-14, D93) : The layout route — owns the Sidebar's collapsed/mobile-drawer state and renders `<Sidebar/>` beside a `<main><Outlet/></main>`, exposing `openMobileMenu` to routed pages via `AppShellContext`/`useOutletContext()`.
- `src/web/src/components/layout/Sidebar.tsx` (SPEC-14) : The persistent nav — entries from `visibleEntryPoints(user.role)` (D92, one source of truth shared with the dashboard cards and route guards), the signed-in user's initials/username/role (D97), and sign-out. Logout's accessible name stays "Log out" (not Figma's "Sign out") since `dashboard.spec.ts` already asserts that name.
- `src/web/src/components/layout/Topbar.tsx` (SPEC-14) : Per-page header — `title`/`subtitle` props (replacing each page's old ad-hoc `<h1>`), a hamburger wired to `AppShell`'s mobile drawer, a real search box (Enter → `/search?q=`, D87) and a bell (→ `/alerts`, D87).
- `src/web/src/api/client.ts` : The one place the web app calls `@mou/api`. Sends credentials, treats a 401 as "not signed in" rather than an error, and normalises the login failure message. Also the wizard draft endpoints, `validatePage1`, and (SPEC-05) `uploadMouDocument` — a raw `fetch` with a `FormData` body, since `request()`'s JSON content-type can't be reused for a multipart upload. `EnumsResponse` (SPEC-04/05/06) carries every dropdown and catalogue the wizard renders from, including `schemes` and `payrollItems` (SPEC-06). Also the SPEC-07 read-only functions (`fetchZoneCompanies`, `fetchCompanyOverview`, `fetchCompanyMous`, `fetchMouCommercial`, `fetchMouPayroll`, `mouPrintUrl`), and (SPEC-14) `fetchDashboardSummary`/`fetchRecentActivity` for the Dashboard KPI row and Recent Activity table. A code-review fix made `fetchEnums()`/`fetchZones()` cache the in-flight _promise_ in a module-level variable (cleared on rejection) rather than re-fetching on every one of the nine pages that read this rarely-changing reference data.
- `src/web/src/auth/AuthContext.tsx` : Holds the signed-in user. Checks `/api/auth/me` on boot, and signs out through the API before clearing local state, which is what makes AC8 hold.
- `src/web/src/auth/RequireAuth.tsx` : Guards a route, waits for the initial session check, and redirects to login with `replace` so the protected URL is not left in history.
- `src/web/src/dashboard/entry-points.ts` : The ten Dashboard Home entry points and the SPEC-02 section 3.3 role matrix, declared once as data. The dashboard, the routes and the UI tests all read this list.
- `src/web/src/pages/LoginPage.tsx` : The login form. Shows exactly the message the API returned, so the screen cannot become a way to probe which usernames exist. Restyled per SPEC-14 (glass login card, gradient hero); the sign-in logic itself is unchanged. The four stat tiles fetch real counts from `GET /api/public/stats` on mount (D116, reverses D88), falling back to label-only tiles (no number) if that fetch fails.
- `src/web/src/pages/DashboardPage.tsx` : Dashboard Home. Renders the entry points the signed-in role may see, with the pending ones present but disabled. SPEC-14 adds the KPI row (`fetchDashboardSummary`, D84) and the Recent Activity table (`fetchRecentActivity`, D86) above the entry-point card grid; the grid itself, its `<li>` structure and every label are unchanged.
- `src/web/src/pages/ComingSoonPage.tsx` : The placeholder every pending destination renders, including the refusal shown when a role types a URL it may not open.
- `src/web/src/pages/AddCompanyPage.tsx` : The wizard container (SPEC-03 shell, SPEC-04/05/06 pages). Manages 3-step flow, draft persistence via API, resume/discard prompt, final save, VIEWER role guard, and each page's local validation (Page 1 also calls the server on Next; Page 2 also drives the MOU PDF upload; Page 3's Save button is genuinely disabled, not just marked, until all 22 payroll items are answered). Page 3 has no "Next" transition, so its edits are persisted via an explicit `persistDraft(3)` immediately before `submitCompany()`, unlike Pages 1/2 whose own Next already persists. SPEC-14 restyles `WizardShell`'s chrome and this page's success/not-available screens; Page1/Page2/Page3's own field markup is untouched (D100).
- `src/web/src/pages/ExistingCompanyPage.tsx` : SPEC-07's 3-page read-only view — Overview (zone → company, contacts, plant selector when there is more than one), Commercial Details (scheme scoped to this company's actual MOUs, status badge, charges table with "—" for a null amount, Print link), Payroll Details (trainee categories, Allowances/Deductions shown only when non-empty). No field anywhere is editable; every fetch is a GET.
- `src/web/src/pages/AlertsPage.tsx` (SPEC-08, restyled SPEC-14) : The alert list with threshold/zone/scheme/acknowledged filters and Acknowledge (ADMIN/DATA_ENTRY). SPEC-14 adds a "Renew" shortcut per row, plain-navigating to `/upload-mou` (D90).
- `src/web/src/pages/UploadMouPage.tsx` (SPEC-09, restyled SPEC-14) : The standalone Zone→Company→Plant→Scheme upload flow, scheme step auto-hidden with exactly one MOU.
- `src/web/src/pages/EditAgreementPage.tsx` (SPEC-10, restyled SPEC-14) : The reason-gated edit flow (select → reason → edit → review → done), ADMIN only.
- `src/web/src/pages/AgreementHistoryPage.tsx` (SPEC-11, restyled SPEC-14) : The version list, per-version detail, and compare-any-two-versions view; `?mouId=` deep-link support.
- `src/web/src/pages/ZoneWiseDashboardPage.tsx` (SPEC-12, restyled SPEC-14) : The zone summary table, the zone × scheme matrix, and click-to-drill-down; the Summary table's `<table>` renders before the Scheme Breakdown `<table>` — Playwright's `locator("table").first()` depends on that order.
- `src/web/src/pages/SearchPage.tsx` (SPEC-13, restyled SPEC-14) : Company/Plant/Scheme search with zone/status filters and pagination. SPEC-14 additionally seeds its query from `?q=` on mount, so the Topbar's search box (D87) can land here with the typed text already filled in.
- `src/web/src/pages/ExportExcelPage.tsx` (SPEC-13, restyled SPEC-14) : The Excel export screen, sharing Search's filter shape; a Start Export action and poll-until-ready status.
- `src/web/src/pages/ExportPdfPage.tsx` (SPEC-13, restyled SPEC-14) : The PDF export screen — All Zones, or one company/plant via cascading selectors; Export disabled until the company scope fully resolves.
- `src/web/src/components/wizard/WizardShell.tsx` : 3-step wizard shell with step indicator (blue active, green completed) and Next/Back/Cancel buttons. Next disabled when `canProceed` is false. SPEC-14 restyles the indicator/chrome via a `Topbar` + glass `Card`; unchanged otherwise.
- `src/web/src/components/wizard/Page1.tsx` : SPEC-04 Page 1 — the full 20-field Company Details form, the Mobile/LAN conditional branch, and paste-blocked Confirm Email. Rules come from `@mou/domain`; this component only renders the errors/warnings it is handed.
- `src/web/src/components/wizard/Page2.tsx` : SPEC-05 Page 2 — MOU dates/tenure with a derived end-date preview, the MOU PDF upload input, attendance cycle/stipend date, the 16 fixed charges (rendered from the `commercialItems` catalogue, never hardcoded), and repeatable "Other" rows.
- `src/web/src/components/wizard/Page3.tsx` : SPEC-06 Page 3 — scheme selection, repeatable trainee categories, the 22 fixed payroll items (rendered from the `payrollItems` catalogue, never hardcoded) each as a Yes/No pair with a conditional amount box that clears on switching to No, a live "N of 22 answered" count, and repeatable "Other" rows.
- `src/web/src/hooks/useCascadingSelectors.ts` : A code-review fix — the Zone→Company→Plant→Scheme(MOU) cascade that `UploadMouPage`, `EditAgreementPage`, `AgreementHistoryPage` and `ExportPdfPage` had each hand-rolled independently (ADR D53 flagged revisiting this "if needed a third time"; it was needed a sixth). Deliberately state-only — returns values and change handlers, never JSX — so every page keeps its own `<select>`/`<label>` markup, ids and `htmlFor` pairing, which the Playwright suite locates by label text. `ExistingCompanyPage` is not wired to it: its cascade genuinely diverges (plants arrive embedded in the company-overview response; the MOU list loads on an explicit "Next" click, not automatically).
- `src/web/src/screens/UserManagementScreen.tsx` (SPEC-21 §6) : `/admin/users` — the super admin's user list (username, name, email, role, zones or "All zones", created) with Add User, Edit and a two-step Delete; the own row cannot be deleted. Replaces SPEC-20's approval screen.
- `src/web/src/screens/userManagement/UserForm.tsx` (SPEC-21 §6) : The Add / Edit User form — `validateUserAccount` from `@mou/domain` plus a client-only Confirm Password, API field errors under each field, and zone access as an "All zones" switch or a zone checkbox list. An edit sends only changed fields; role and zone access are locked on the admin's own row.
- `src/web/src/screens/addCompany/BulkUploadPanel.tsx` (SPEC-22 §2) : `EntryModeSwitch` (Manual Entry / Bulk Upload with the how-to text, above both modes of Add New Company) and `BulkUploadPanel` — Download Template (one click saves both the Excel and the PDF template), Upload Bulk Data (.xlsx only), then the created companies with MoU codes or the row / column error table. `AddCompanyScreen` renders only this panel in bulk mode.
- `src/web/src/screens/existingCompany/CompanyDocumentsSection.tsx` (SPEC-23 §3.3) : The Documents tab's "Company Documents" group — the company's GST / Registration certificates with type, size, upload date and download link, and for ADMIN / DATA_ENTRY an Upload Document control (type dropdown + PDF / JPG / PNG picker) that reloads the list.
- `src/web/src/ui/download.ts` (SPEC-24) : `saveBlob` — hands a Blob to the browser as a download via an object URL, revoked a moment later; used by the Existing Companies list's Export PDF and the bulk upload templates.
- `src/web/src/screens/login/AuthPageFrame.tsx` (SPEC-20) : The signed-out chrome (orbs, header, content row, footer) and `FieldLabel`, moved verbatim out of `LoginScreen`. Its other user, SPEC-20's sign-up page, was removed by SPEC-21.

### `@mou/e2e` — cross-package tests
- `tests/e2e/src/ui/user-management-api.spec.ts` (SPEC-21) : The login page has no sign-up; a super admin creates a two-zone user on User Management who then signs in; editing swaps the user's zones; delete asks for confirmation; a Viewer gets neither the link nor the screen.
- `tests/e2e/src/ui/bulk-upload-api.spec.ts` (SPEC-22) : Bulk Upload hides the wizard and shows only the three bulk buttons; both templates download; the untouched template and a non-xlsx file are refused.

- `tests/e2e/package.json` : Manifest for the cross-package test workspace; depends on `@mou/api`, `@mou/domain` and `@mou/web`.
- `tests/e2e/tsconfig.json` : Type-check-only config using bundler resolution, so extensionless relative imports type-check and still resolve under Playwright.
- `tests/e2e/src/workspace.test.ts` : Smoke test proving workspace linking and the turbo build-before-test ordering both work.
- `tests/e2e/playwright.config.ts` : Playwright configuration. Boots the real API and web dev servers, pins one worker because the tests share a database, and uses `localhost` so the CORS allow-list and the session cookie agree.
- `tests/e2e/src/global-setup.ts` : Creates the three role fixture accounts with real scrypt hashes and clears lockouts, sessions, wizard drafts, company data and (SPEC-05) any leftover `UPLOAD_ROOT/draft-tmp` and `UPLOAD_ROOT/mou` directories between runs. Clears company tables in FK-safe order (children first; `mou_document` before `mou`).
- `tests/e2e/src/ui/accounts.ts` : The three fixture accounts and the password they share.
- `tests/e2e/src/ui/sign-in.ts` : The single sign-in helper every UI spec uses, so all of them drive the genuine login form.
- `tests/e2e/src/ui/login.spec.ts` : UI tests for AC1 and AC4.
- SPEC-14 note: `AppShell`'s persistent Sidebar (D93) repeats every visible `DASHBOARD_ENTRY_POINTS` label on every authenticated page, and the shared Topbar puts one real search `<input>` on every page too. `dashboard.spec.ts` scopes its entry-label assertions to `page.locator("main")` and `existing-company.spec.ts`'s AC7 counts exactly one textbox (named Search) instead of zero — both locator-only fixes for the new chrome (D98/D99), not behaviour changes.
- `tests/e2e/src/ui/dashboard.spec.ts` : UI tests for AC6, AC7 (the UI half) and AC8. 8 entry points remain disabled now that SPEC-03's Add New Company and SPEC-07's Existing Company are both available; VIEWER URL test passes with AddCompanyPage role guard.
- `tests/e2e/src/ui/wizard.spec.ts` : UI tests for the wizard shell (SPEC-03), Page 1 (SPEC-04), Page 2 (SPEC-05, including an in-memory PDF upload via `setInputFiles({ buffer })` — no fixture files needed) and Page 3 (SPEC-06). `fillPage1`/`fillPage2`/`fillPage3` plus `VALID_PAGE1`/`VALID_PAGE2`/`VALID_PAGE3` let each test spoil one field of an otherwise-valid baseline (`fillPage3` answers every payroll item No via `getByRole("radio", { name: "No" })`, the simplest valid state); `discardLeftoverDraft()` handles inter-test cleanup.
- `tests/e2e/src/ui/existing-company.spec.ts` : UI tests for SPEC-07. Test data is created directly against the real API (`createViewableCompany()` drives a full wizard submission via `request`, not the wizard UI) plus one direct `pg` insert (`addSecondScheme()`, mirroring `global-setup.ts`'s own use of `pg`) for the two-MOU case the wizard cannot itself produce.
