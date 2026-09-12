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
- `docker-compose.yml` : Local PostgreSQL 15 for development and for the integration and UI tests. Published on host port 5434 because 5432 and 5433 are already in use on the development machine.
- `.env.example` : Documents `DATABASE_URL`, `TEST_DATABASE_URL`, the `ADMIN_*` seed inputs, `WEB_ORIGIN` and (SPEC-05) `UPLOAD_ROOT`. `.env` itself is gitignored.
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
- `src/domain/src/payroll-items.ts` : The section 4 payroll item catalogue — 22 fixed keys plus the repeatable `OTHER` row — with labels, item types and display order.
- `src/domain/src/money.ts` : The branded `Money` string type (D10) that turns an accidental `Number()` conversion into a compile error, plus `validateAmountString` (SPEC-05) — the shared non-negative/≤2-decimal/≤9,999,999.99 rule every optional amount field (SPEC-05 charges, SPEC-06 payroll items) uses.
- `src/domain/src/mou-rules.ts` : `computeEndDate` and `deriveStatus` — the shared MOU rules of sections 6.1 and 6.2, pure and database-free.
- `src/domain/src/company-code.ts` : `formatCompanyCode` — the `<ZONE_CODE>-<YY>-<NNNN>` format of section 6.3.
- `src/domain/src/company-details-validation.ts` : SPEC-04 Page 1 rules — pure `validateCompanyDetails()`, the GST state-code map, and the Mobile/LAN contact-number rules, shared by the browser and `POST /api/companies/validate-page1`.
- `src/domain/src/commercial-details-validation.ts` : SPEC-05 Page 2 rules — pure `validateCommercialDetails()` (tenure range, stipend date, the 16 charge amounts, repeatable "Other" rows with duplicate-label detection, the backdate-more-than-365-days warning), shared by the browser and the final-save route. Also exports `validateOtherChargeRows()`, the repeatable-row rule SPEC-06's payroll "Other" rows reuse rather than re-deriving.
- `src/domain/src/payroll-details-validation.ts` : SPEC-06 Page 3 rules — pure `validatePayrollDetails()` (scheme, at least one unique trainee category, every one of the 22 fixed payroll items explicitly answered Yes/No with an amount required only on Yes, "Other" rows via the shared `validateOtherChargeRows()`), shared by the browser and the final-save route.
- `src/domain/src/mou-rules.test.ts` : Unit tests for AC1 and AC2.
- `src/domain/src/company-code.test.ts` : Unit tests for AC3.
- `src/domain/src/catalogues.test.ts` : Unit tests for AC4 — catalogue sizes, keys, labels, item types, display order and enum coverage.
- `src/domain/src/company-details-validation.test.ts` : Unit tests for SPEC-04's acceptance criteria.
- `src/domain/src/commercial-details-validation.test.ts` : Unit tests for SPEC-05's acceptance criteria.
- `src/domain/src/payroll-details-validation.test.ts` : Unit tests for SPEC-06's acceptance criteria.
- `src/domain/src/money.test.ts` : Unit tests for `validateAmountString`.

### `@mou/api` — layer 1, backend service

- `src/api/package.json` : Package manifest and per-package task scripts. Also declares the single subpath export `@mou/api/auth/password`, so test fixtures can produce real hashes without widening the service's main entry point.
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
- `src/api/src/db/test-harness.ts` : Shared integration-test setup — test database creation, migration, per-test reset and fixture inserts (`insertZone`, `insertCompany`, `insertPlant`, `insertMou`, `insertPayrollConfig`, `insertCommercialItem`, `insertTraineeCategory`, `insertPayrollItem`, `insertMouDocument`), including a user whose password is a real hash.
- `src/api/src/db/mou-view.ts` : SPEC-07's read-only query assembly — `businessToday()` (the one place a route asks Postgres for "today", per SPEC-01 section 6.2), `fetchCompanyOverview`, `fetchCompanyMous`, `fetchMouCommercialDetail` (status derived at read time, one charge row per fixed key even when unset — `amount: null`), `fetchMouPayrollDetail` (applicable items only, split into allowances/deductions). Reused by SPEC-11 (history) and SPEC-13 (export).
- `src/api/src/db/schema.integration.test.ts` : Integration tests for SPEC-01 AC5 to AC14.
- `src/api/src/routes/enums.ts` : `GET /api/enums` — every SPEC-01 section 2, 3 and 4 list the UI builds its dropdowns from.
- `src/api/src/routes/zones.ts` : `GET /api/zones` and `GET /api/zones/{zoneId}/companies`.
- `src/api/src/routes/companies.ts` : Company wizard endpoints — `POST /api/companies/draft` (create/update draft), `GET /api/companies/draft` (resume), `DELETE /api/companies/draft/:draftId` (cancel, also discards any temp MOU PDF), `POST /api/companies/validate-page1` (SPEC-04 GST uniqueness + duplicate-company check), `POST /api/companies/draft/:draftId/mou-document` (SPEC-05 MOU PDF upload — multer, `%PDF` byte check, size cap, virus-scan hook), `POST /api/companies` (final save transaction). Final save re-validates Pages 1, 2 and 3 via `@mou/domain`, derives `commercial_item` rows (one per entered charge) and `payroll_item` rows (always one per fixed key, plus one per Other row) from the catalogues rather than trusting the client, and promotes the temp PDF to permanent storage plus a `mou_document` row as the last steps of the transaction. Uses per-route `requireSession`, `db.transaction()` across 7+ tables, idempotent submit, and `firstRow()` for `noUncheckedIndexedAccess` safety. Also retains `GET /api/companies/{id}/plants` (public, no auth).
- `src/api/src/upload/mou-document-storage.ts` : SPEC-05 section 4 — deterministic temp/permanent file paths built only from `draftId`/`mouId` (never a user-supplied filename), `validatePdfBuffer` (mimetype + `%PDF` header), the `scanForViruses` hook (a no-op unless `VIRUS_SCAN_COMMAND` is set), and the write/promote/discard helpers. Deliberately small and reusable — SPEC-09 reuses this same validation.
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
- `src/api/src/auth/session-repository.ts` : Creates, resolves and deletes sessions. `resolveSession` validates and slides the 30-minute expiry in one statement, and refuses a session whose user has since been deactivated.
- `src/api/src/auth/login-rate-limit.ts` : The five-failure / fifteen-minute lockout of SPEC-02 section 2.1, stored in `login_attempt` (D17).
- `src/api/src/auth/middleware.ts` : Session cookie handling plus `requireSession` (401) and `requireRole` (403) — the server-side enforcement SPEC-02 section 3.3 demands.
- `src/api/src/auth/password.unit.test.ts` : Unit tests for the hashing, including that a legacy plaintext row can never authenticate.
- `src/api/src/routes/auth.ts` : `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me`, with one generic failure message and an equalised timing path for unknown usernames.
- `src/api/src/auth.integration.test.ts` : Integration tests for SPEC-02 AC2, AC3, AC5 and the server half of AC7.
- `src/api/src/companies.integration.test.ts` : Integration tests for SPEC-03 (AC1 invalid body 400, AC4+AC6 save + idempotency, AC5 failed save rollback, AC7 cancel, AC8 VIEWER 403, cross-user draft protection, DATA_ENTRY access), SPEC-04 (Page 1 validation ACs), SPEC-05 (MOU document upload — valid/invalid/oversized files, ownership, replace-overwrites; final save — blank-vs-zero charges, Other rows, missing-PDF 422, invalid-Page-2 422, `mou_document` metadata, temp-file cleanup on cancel and on save) and SPEC-06 (Yes→No persists `is_applicable=false`/`amount=NULL`, zero/duplicate trainee categories rejected, exactly 22 `payroll_item` rows plus Other rows, consecutive generated codes across two saves, `DOCUMENT_FEE`/`REGISTRATION_FEE` as DEDUCTION, invalid Page 3 blocks save). `createDraftAtStep3()` wraps create-draft → upload-a-real-PDF → persist-full-payload, since final save now requires one; `completePayload()`'s `page3.traineeCategories` is a plain `string[]`, matching the real frontend shape, not the SPEC-03-era `{ categoryName }[]`.

### `@mou/web` — layer 1, web frontend

- `src/web/package.json` : Manifest and task scripts for the frontend workspace.
- `src/web/vite.config.ts` : Vite build and dev-server configuration, with the React and Tailwind plugins.
- `src/web/tsconfig.json`, `src/web/tsconfig.app.json`, `src/web/tsconfig.node.json` : Solution-style compiler configs for the browser code and for the Vite config file.
- `src/web/index.html` : Vite HTML entry point.
- `src/web/src/main.tsx` : React bootstrap. Mounts the app inside a `BrowserRouter`.
- `src/web/src/App.tsx` : The route table. Every route except `/login` sits behind `RequireAuth`, and the dashboard destination routes are generated from the entry-point list so a typed URL meets the same guard.
- `src/web/src/index.css` : Tailwind v4 entry (`@import "tailwindcss"`). There is no `tailwind.config.js` — v4 is configured from CSS.
- `src/web/src/api/client.ts` : The one place the web app calls `@mou/api`. Sends credentials, treats a 401 as "not signed in" rather than an error, and normalises the login failure message. Also the wizard draft endpoints, `validatePage1`, and (SPEC-05) `uploadMouDocument` — a raw `fetch` with a `FormData` body, since `request()`'s JSON content-type can't be reused for a multipart upload. `EnumsResponse` (SPEC-04/05/06) carries every dropdown and catalogue the wizard renders from, including `schemes` and `payrollItems` (SPEC-06). Also the SPEC-07 read-only functions (`fetchZoneCompanies`, `fetchCompanyOverview`, `fetchCompanyMous`, `fetchMouCommercial`, `fetchMouPayroll`, `mouPrintUrl`).
- `src/web/src/auth/AuthContext.tsx` : Holds the signed-in user. Checks `/api/auth/me` on boot, and signs out through the API before clearing local state, which is what makes AC8 hold.
- `src/web/src/auth/RequireAuth.tsx` : Guards a route, waits for the initial session check, and redirects to login with `replace` so the protected URL is not left in history.
- `src/web/src/dashboard/entry-points.ts` : The ten Dashboard Home entry points and the SPEC-02 section 3.3 role matrix, declared once as data. The dashboard, the routes and the UI tests all read this list.
- `src/web/src/pages/LoginPage.tsx` : The login form. Shows exactly the message the API returned, so the screen cannot become a way to probe which usernames exist.
- `src/web/src/pages/DashboardPage.tsx` : Dashboard Home. Renders the entry points the signed-in role may see, with the pending ones present but disabled.
- `src/web/src/pages/ComingSoonPage.tsx` : The placeholder every pending destination renders, including the refusal shown when a role types a URL it may not open.
- `src/web/src/pages/AddCompanyPage.tsx` : The wizard container (SPEC-03 shell, SPEC-04/05/06 pages). Manages 3-step flow, draft persistence via API, resume/discard prompt, final save, VIEWER role guard, and each page's local validation (Page 1 also calls the server on Next; Page 2 also drives the MOU PDF upload; Page 3's Save button is genuinely disabled, not just marked, until all 22 payroll items are answered). Page 3 has no "Next" transition, so its edits are persisted via an explicit `persistDraft(3)` immediately before `submitCompany()`, unlike Pages 1/2 whose own Next already persists.
- `src/web/src/pages/ExistingCompanyPage.tsx` : SPEC-07's 3-page read-only view — Overview (zone → company, contacts, plant selector when there is more than one), Commercial Details (scheme scoped to this company's actual MOUs, status badge, charges table with "—" for a null amount, Print link), Payroll Details (trainee categories, Allowances/Deductions shown only when non-empty). No field anywhere is editable; every fetch is a GET.
- `src/web/src/components/wizard/WizardShell.tsx` : 3-step wizard shell with step indicator (blue active, green completed) and Next/Back/Cancel buttons. Next disabled when `canProceed` is false.
- `src/web/src/components/wizard/Page1.tsx` : SPEC-04 Page 1 — the full 20-field Company Details form, the Mobile/LAN conditional branch, and paste-blocked Confirm Email. Rules come from `@mou/domain`; this component only renders the errors/warnings it is handed.
- `src/web/src/components/wizard/Page2.tsx` : SPEC-05 Page 2 — MOU dates/tenure with a derived end-date preview, the MOU PDF upload input, attendance cycle/stipend date, the 16 fixed charges (rendered from the `commercialItems` catalogue, never hardcoded), and repeatable "Other" rows.
- `src/web/src/components/wizard/Page3.tsx` : SPEC-06 Page 3 — scheme selection, repeatable trainee categories, the 22 fixed payroll items (rendered from the `payrollItems` catalogue, never hardcoded) each as a Yes/No pair with a conditional amount box that clears on switching to No, a live "N of 22 answered" count, and repeatable "Other" rows.

### `@mou/e2e` — cross-package tests

- `tests/e2e/package.json` : Manifest for the cross-package test workspace; depends on `@mou/api`, `@mou/domain` and `@mou/web`.
- `tests/e2e/tsconfig.json` : Type-check-only config using bundler resolution, so extensionless relative imports type-check and still resolve under Playwright.
- `tests/e2e/src/workspace.test.ts` : Smoke test proving workspace linking and the turbo build-before-test ordering both work.
- `tests/e2e/playwright.config.ts` : Playwright configuration. Boots the real API and web dev servers, pins one worker because the tests share a database, and uses `localhost` so the CORS allow-list and the session cookie agree.
- `tests/e2e/src/global-setup.ts` : Creates the three role fixture accounts with real scrypt hashes and clears lockouts, sessions, wizard drafts, company data and (SPEC-05) any leftover `UPLOAD_ROOT/draft-tmp` and `UPLOAD_ROOT/mou` directories between runs. Clears company tables in FK-safe order (children first; `mou_document` before `mou`).
- `tests/e2e/src/ui/accounts.ts` : The three fixture accounts and the password they share.
- `tests/e2e/src/ui/sign-in.ts` : The single sign-in helper every UI spec uses, so all of them drive the genuine login form.
- `tests/e2e/src/ui/login.spec.ts` : UI tests for AC1 and AC4.
- `tests/e2e/src/ui/dashboard.spec.ts` : UI tests for AC6, AC7 (the UI half) and AC8. 8 entry points remain disabled now that SPEC-03's Add New Company and SPEC-07's Existing Company are both available; VIEWER URL test passes with AddCompanyPage role guard.
- `tests/e2e/src/ui/wizard.spec.ts` : UI tests for the wizard shell (SPEC-03), Page 1 (SPEC-04), Page 2 (SPEC-05, including an in-memory PDF upload via `setInputFiles({ buffer })` — no fixture files needed) and Page 3 (SPEC-06). `fillPage1`/`fillPage2`/`fillPage3` plus `VALID_PAGE1`/`VALID_PAGE2`/`VALID_PAGE3` let each test spoil one field of an otherwise-valid baseline (`fillPage3` answers every payroll item No via `getByRole("radio", { name: "No" })`, the simplest valid state); `discardLeftoverDraft()` handles inter-test cleanup.
- `tests/e2e/src/ui/existing-company.spec.ts` : UI tests for SPEC-07. Test data is created directly against the real API (`createViewableCompany()` drives a full wizard submission via `request`, not the wizard UI) plus one direct `pg` insert (`addSecondScheme()`, mirroring `global-setup.ts`'s own use of `pg`) for the two-MOU case the wizard cannot itself produce.
