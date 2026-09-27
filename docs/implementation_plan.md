# Implementation Plan

This document described the phase wise implementation plan of the MOU management system application. 

## Phase Implementation sequence
- Do not start next phase till the previous phase is fully implemented and user explictly asks for implementation of next phase.
- Strictly follow the implementation sequence below
    1. phase 1
    2. Phase 2
    3. Phase 3

## Implementation Phases
If the phases are empty, then ask user to define the implementation phases.

### Phase 1
1. `SPEC-01-foundation-and-master-data.md` — **implemented**. Delivers the enums
   and master reference lists, the complete persistent data model as a Drizzle
   schema plus generated migrations, zone and plant master data, the master
   lookup API, and the shared derived rules (MOU end date, MOU status, generated
   company code). Creates the `@mou/domain` package and the database layer in
   `@mou/api`. Nothing here is user-visible; every later spec depends on it.

2. `SPEC-02-auth-and-dashboard.md` — **implemented**. Login, logout, session
   handling and the five-failure login lockout; the Dashboard Home screen with all
   ten entry points and the role visibility matrix; and the server-side role
   enforcement that matrix depends on. Adds the first user-visible screens in
   `@mou/web` and the Playwright UI suite.

3. `SPEC-03-add-company-wizard-framework.md` — **implemented**. The 3-step
   company onboarding wizard shell with draft persistence (one JSONB draft per
   user), a final save transaction that inserts across 7 tables atomically with
   company code generation, idempotent submit, role checks (VIEWER refused), and
   the dashboard entry point enabled. The page-specific forms (Page 1 Company
   Details, Page 2 Commercial Details, Page 3 Payroll Details) are minimal
   placeholders that will be expanded by SPEC-04, SPEC-05 and SPEC-06
   respectively.

4. `SPEC-04-wizard-page1-company-details.md` — **implemented**. The full
   20-field Page 1 form (company identity, address, HR/Finance contact block),
   the Mobile-or-LAN conditional branch with warn-then-clear on switch, and the
   validation of section 4: shared `@mou/domain` rules enforced identically in
   the browser and on the server, GST uniqueness and the duplicate
   company-name-plus-plant-per-zone check run server-side on Next via
   `POST /api/companies/validate-page1`, and the GST-vs-State mismatch as a
   non-blocking warning. Final save now rejects an invalid Page 1 with a 422
   instead of writing a row.

5. `SPEC-05-wizard-page2-commercial-details.md` — **implemented**. The full
   Page 2 form: MOU start date/tenure with a derived end-date preview, the
   signed MOU PDF upload (validated by MIME type and `%PDF` file-header bytes,
   size-capped at 10 MB, stored to a temp location keyed by the draft and
   promoted to permanent storage only at final save), attendance cycle and
   stipend date, the 16 fixed commercial charges rendered from the SPEC-01
   catalogue, and repeatable "Other" rows with duplicate-label detection.
   `@mou/domain`'s `validateCommercialDetails` enforces every rule identically
   in the browser and on the server; final save now derives `commercial_item`
   rows itself and rejects an invalid Page 2 or a missing PDF with a 422.

6. `SPEC-06-wizard-page3-payroll-and-save.md` — **implemented. This completes
   the Add New Company flow.** The full Page 3 form: scheme selection,
   repeatable trainee categories (at least one, unique case-insensitively),
   the Yes/No + amount answer for all 22 fixed payroll items with a live
   "N of 22 answered" count and Save genuinely disabled until every item is
   answered, and repeatable "Other" rows sharing SPEC-05's row-validation
   rule. `@mou/domain`'s `validatePayrollDetails` enforces every rule
   identically in the browser and on the server; final save derives all 22
   `payroll_item` rows itself (always one row per fixed key, unlike Page 2's
   commercial items) and rejects an invalid Page 3 with a 422. Code
   generation and the final save transaction, already built in SPEC-03,
   needed no changes beyond this validation and the payroll-item insert
   itself.

7. `SPEC-07-existing-company-view.md` — **implemented**. The read-only
   3-page view flow: Overview (zone → company, contacts, plants), Commercial
   Details (scheme-scoped to the MOUs the company actually has, derived
   status and end date, all 16 charges, the current MOU document) and
   Payroll Details (trainee categories, applicable allowances/deductions
   only), plus Print (pdfkit, Page 1 + Page 2 fields). Every endpoint is a
   GET open to all roles including VIEWER — nothing here writes. The query
   assembly (`db/mou-view.ts`) is built to be reused by SPEC-11 and SPEC-13.

8. `SPEC-08-mou-expiry-alerts.md` — **implemented**. New `mou_alert` and
   `scheduled_job_state` tables; `runExpiryAlertJob` raises one alert row per
   (MOU, threshold) the day `days_remaining` first equals 90/60/30, catches up
   any missed days via set-based date arithmetic, and is safe to run twice a
   day. Runs in-process (`setInterval`, hourly check, idempotent) — no queue
   or external cron. `GET /api/alerts/expiring` (filtered list),
   `GET /api/alerts/count` (a live query, not `mou_alert` rows — appears on
   the Dashboard Home badge immediately for a brand-new MOU) and
   `POST /api/alerts/:id/acknowledge` (ADMIN/DATA_ENTRY). `ExistingCompanyPage`
   gained `?zoneId=&companyId=` deep-link support for the alert list's "Open"
   action, reused by later specs' own links to it.

9. `SPEC-09-upload-mou-pdf.md` — **implemented**. A standalone upload path,
   separate from the wizard's own Page 2 upload, for attaching an MOU PDF
   after the fact: `GET /api/mous/:mouId/documents` (list, newest first,
   with uploader username), `POST /api/mous/:mouId/document` (ADMIN/DATA_ENTRY,
   reuses SPEC-05's exact PDF validation), `GET /api/documents/:documentId`
   (any authenticated role). Unlike the wizard's one-document-per-MOU path,
   every upload here adds a new `mou_document` row under a freshly generated
   filename, so multiple uploads never collide or overwrite each other.
   `/upload-mou` is a cascading Zone → Company → Plant → Scheme picker, with
   the scheme step auto-hidden when the chosen plant has exactly one MOU
   (section 2.1) and required when it has more than one.

10. `SPEC-10-edit-agreement.md` — **implemented**. Amending a saved MOU's
    commercial and payroll terms (never company identity, `generated_code`,
    or scheme). A reason (Communication from HR / Addendum in Agreement /
    Change in Statutory Compliance) must be chosen before any field becomes
    editable; Communication from HR additionally requires a proof file (PDF
    or image). `POST /api/mous/:mouId/edit-request` returns a single-use edit
    token plus the current editable payload; `PUT /api/mous/:mouId` re-runs
    SPEC-05/06's own validators unchanged, rejects a request without a valid
    unconsumed token or with nothing changed, and — inside one transaction —
    snapshots the pre-edit state into `agreement_history`, replaces the
    commercial/payroll rows, and bumps `mou.version`. A `SELECT ... FOR
    UPDATE` on the MOU row is what makes a second, stale Apply lose (section
    5.1) rather than silently overwrite a newer edit. ADMIN only. New
    `mou_edit_request` table, modeled on `company_draft`. `/agreements/edit`
    is a new cascading Zone→Company→Plant→Scheme picker, reason gate, edit
    form and review-changes screen.

11. `SPEC-11-agreement-history.md` — **implemented**. A read-only record of
    past agreement versions: `GET /api/mous/:mouId/history` (version list,
    newest first, plus the live current version), `GET
    /api/mous/:mouId/history/:historyId` (one version's full snapshot,
    tolerating a missing/extra key so future schema drift can never make it
    error), `GET /api/mous/:mouId/history/compare?from=&to=` (field-level
    diff between any two versions, or a version and `current`), and the
    proof-file download. All read-only, open to every role — no endpoint or
    UI action can write `agreement_history` (SPEC-10 is the only writer). The
    diff logic (`computeAgreementDiff`) moved into `@mou/domain` as a new,
    pure, shared module. `/agreements/history` supports a `?mouId=` deep link
    from the Existing Company commercial page, skipping the cascading
    selectors, the same pattern SPEC-08's alert list already established.

12. `SPEC-12-zone-wise-dashboard.md` — **implemented**. A read-only
    aggregate report: `GET /api/dashboard/zone-wise?scheme=&status=` (one
    row per active zone plus totals, and a zone × scheme matrix with row and
    column totals, both computed by conditional-aggregate SQL, not
    application-code counting) and `GET
    /api/dashboard/zone-wise/:zoneId/companies?scheme=&status=` (the
    drill-down row list behind a click on either table). No new migration —
    the indexes section 3 asks for already existed from SPEC-01. `/zones/overview`
    renders both tables plus the drill-down list, linking each row to the
    Existing Company view and the "Expiring ≤ 90 days" figure straight to
    SPEC-08's alert list, filtered to that zone.

13. `SPEC-13-search-and-exports.md` — **implemented**. Three read-only tools
    sharing one query layer (`db/search.ts`'s `searchMous`, section 5: "what
    Search selects is what Export writes out"): `GET /api/search?by=&q=&
    zoneId=&status=&page=` (paginated, 25/page, one row per current MOU),
    `GET /api/export/excel?by=&q=&zoneId=&status=` (a four-sheet `.xlsx` -
    Companies, MOUs, Commercial, Payroll - via the new `exceljs` dependency),
    and `GET /api/export/pdf?scope=all_zones|company&companyId=&plantId=`.
    Both exports go through a new `export_job` table and are only ever
    downloaded through `GET /api/export/jobs/:jobId/download` (never
    streamed directly, never a guessable URL), deleted 24 hours after
    creation by a new cleanup job scheduled the same way SPEC-08's expiry
    job is. Excel export generates asynchronously only over a 5,000-company
    threshold; PDF export is always synchronous (both PDF documents are
    small regardless of dataset size). New `/search`, `/export/excel` and
    `/export/pdf` pages complete the Dashboard Home entry-point list — every
    one of the ten now has a real destination, and `App.tsx`'s
    not-yet-implemented fallback route loop was removed.

**This completes the SPEC-07 through SPEC-13 batch** the user asked to be
implemented one by one, in auto-mode. Every specification in
`docs/specifications/specindex.md` is now implemented. Phase boundaries
beyond Phase 1 remain **to be confirmed by the user** before any further
phase-level work begins.

14. `SPEC-14-figma-ui-replication.md` — **implemented**. A visual-only restyle
    of every page against a Figma Make export (`figma_code/`) — no route,
    step order or data-entry behaviour changed (D80). Foundation: design
    tokens and `.glass-*` utilities ported verbatim into `index.css`
    (D94), Roboto/Roboto Mono self-hosted via `@fontsource/*` instead of a
    Google Fonts `@import` (D82), a shared inline-SVG icon set
    (`components/icons.tsx`, D95), and a new persistent `AppShell` layout
    route (Sidebar + Topbar, D93) wrapping every authenticated route, driven
    entirely by the existing `DASHBOARD_ENTRY_POINTS` list (D92) so the
    sidebar, the dashboard cards and the route guards cannot drift apart.
    Two new minimal read-only endpoints back the Dashboard's KPI row and
    Recent Activity table that the design needs and nothing prior computed:
    `GET /api/dashboard/summary` (Total Companies/Active MOU/Expiring
    Soon/Expired, summed from SPEC-12's own per-zone aggregation, plus
    Pending Review as a `company_draft` row count, D84/D85) and `GET
    /api/dashboard/recent-activity?limit=` (a `company.createdAt` UNION
    `agreement_history.editedAt` feed, D86). Every one of the thirteen
    existing pages was restyled to the new chrome and tokens; the AI chatbot
    (D81), Login's Remember Me/Forgot Password (D83, real version deferred to
    `SPEC-15-deferred-ui-features.md`), and a public stats endpoint (D88)
    were explicitly not built. Alerts gained a "Renew" shortcut to
    `/upload-mou` alongside the existing Acknowledge action (D90). Introducing
    the Sidebar (which repeats every entry-point label) and the Topbar (which
    puts a real search `<input>` on every page) required scoping three
    pre-existing Playwright locators to the routed page content rather than
    the whole page (D98/D99) — no test's asserted behaviour changed, only
    what an unscoped locator now also matched.

15. `SPEC-16-figma-v2-alignment.md` — **implemented** (Phases A–E). Alignment
    with a second Figma export, `figma_code-v2/`. Unlike SPEC-14 this is not a
    restyle: it changes the domain. Decisions D101–D115, now also recorded in
    `docs/design/ADR.md`.

    Phase A — the scheme enum goes 4 → 7 (`BOC_AND_DVOC` splits into `BVOC`
    and `DVOC`; `NAPS` and `NATS` added, D101); the zone seed is replaced by
    24 real zones (D102); the payroll catalogue becomes 23 fixed keys plus one
    shared `OTHER` (D105); `formatCompanyCode` becomes
    `MOU-<SCHEME>-<YYYY>-<NNNN>` (D109). Phase B — the five read paths that
    showed a company-level code were re-pointed at `mou.generated_code`
    (D109), and the three validation modules gained Sector, the purchase block
    and the insurance sub-model (D107, D108, D110). Phase C — wizard Page 1
    reordered with Scheme first and a guidelines panel (D111, D113), Page 2's
    charge row gained period and basis, Page 3 moved from Yes/No radios to
    checkboxes (D106). Phase D — Existing Company gained a scheme filter, the
    sidebar gained an "Operation" section, and a static User Manual became the
    eleventh entry point (D112). Phase E — `npm run db:seed:demo` inserts 65
    companies and 120 MOUs (D115); it is separate from `db:seed` and is
    referenced by no migration and no CI job.

    Two things worth carrying forward. First, the generated migrations had to
    be hand-edited before they would run against a populated database:
    `drizzle-kit generate` emitted `ADD COLUMN … NOT NULL` for
    `company.sector` and `mou.generated_code`, which fails as soon as a row
    exists, and emitted no path for the 15 payroll keys D105 retires or the
    counter rows D109 invalidates. The shipped migrations add nullable,
    backfill, then tighten; fold retired keys into `OTHER` keeping the old
    name as the label; and re-seed the counter from the backfilled MOUs.
    151/151 integration tests passed throughout — but only because the test
    database is always built empty, so the failure was invisible until the
    migration was run against the development database. Second, the schema
    test's column assertion had to become set-based rather than
    order-based: Postgres appends every `ADD COLUMN`, so physical column
    order tracks migration history, not `schema.ts`.

16. `SPEC-17-figma-v3-alignment.md` — **implemented**. Alignment with the
    third Figma export (`figma_code-v3/`). Standardized all-caps `MOU` to
    mixed-case `MoU` across UI text, labels, export filenames and PDF print
    headers. Updated scheme display labels (`BVOC` $\rightarrow$ `BVoc`, `DVOC`
    $\rightarrow$ `DVoc`), category insurance state key to `insuranceMoU`, and
    replaced `logo-ysf.png` with the registered trademark symbol ($\text{\textregistered}$)
    asset. AI chatbot marked out of scope.

17. `SPEC-18-figma-v3-ui-completion.md` — **implemented**. Visual and layout
    fidelity completion for Figma v3:
    - Sidebar: Added `OPERATION` section header and `User Manual` item linking to `/user-manual`.
    - User Manual: Created `UserManualPage.tsx` with sticky 12-section TOC navigation, smooth topbar scroll offsets, cover card, step badges, and FAQ cards.
    - Dashboard: Rebuilt with 3-tier layout (interactive 5-tile KPI row with drill-down, 1/3 `Quick Actions` + 2/3 `Recent Activity` grid, and bottom `glass-alert` Expiring MoUs banner).
    - Expiry Alerts: Added top 3 interactive threshold cards (`Critical ≤ 30 days`, `Warning 31–60 days`, `Notice 61–90 days`) and colored days badges.
    - Export: Added report summary cards grid on Export Excel page.

### Known gaps carried forward

- `SPEC-01` §11.2 requires a forced password change on first login, but `SPEC-02`
  defines no requirement, endpoint or acceptance criterion for it. Deferred
  pending a spec amendment (see ADR D18).
- `SPEC-01` §10 lists edits that decisions D4 and D8 force on `SPEC-03`, `SPEC-05`,
  `SPEC-07`, `SPEC-08`, `SPEC-10`, `SPEC-12` and `SPEC-13`. Those specs still
  describe the superseded `is_current` column and `commercial_detail` table.

### Phase 2 
1. All features of Phase 1  are maintained

### Phase 3
1. All features of Phase 1 and Phase 2 are maintained.
