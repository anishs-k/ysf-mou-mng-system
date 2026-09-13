# Archiecture Decision Record (ADR) Index

This is a index of key Architecture Decision Records. Remember ADRs are high level design decisions which impact multiple packages or source file. Do not document low level design decisions are class design, method design here.

The index format is of two types

1. `<relative document path>` : \{\{short 2-3 lines description of document content\}\}
2. \{\{decision description for short decisions\}\}

## How to use this file

- Remember ADRs are high level design decisions which impact multiple packages or source file.
- Do not document low level design decisions like class design, method design here.

## ADR Index

- `./packagedesign.md` : Documents the package/module design and their dependencies in mermaid.js format.

## Resolved Decisions

Numbering follows `docs/specifications/SPEC-01-foundation-and-master-data.md` §0 so
the two documents stay in step. These apply repo-wide, not only to SPEC-01.

| #   | Decision       | Choice                                                                                                     | Rationale                                                                                                           |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| D1  | Persistence    | PostgreSQL                                                                                                 | The model is relational, and the SPEC-03 §4 save needs one transaction across 8 tables plus an atomic code sequence |
| D2  | Data access    | Drizzle ORM + `drizzle-kit` migrations                                                                     | The schema is TypeScript, types flow to `@mou/api`, plain SQL is generated, and there is no engine binary           |
| D3  | Module layout  | `@mou/domain` (layer 0) → `@mou/api` / `@mou/web` (layer 1)                                                | Satisfies the `ARCHITECTURE.md` acyclic layering rule; the §6 rules stay unit-testable with no database             |
| D4  | MOU versioning | One live `mou` row mutated in place; prior states as JSONB in `agreement_history`                          | `is_current` would be true for every row that ever exists — a dead column every query must remember                 |
| D5  | End date       | `start + tenure − 1 day`, a Postgres generated column                                                      | A 12-month MOU from 1 Jan ends 31 Dec, not 1 Jan next year; generated means it cannot drift                         |
| D6  | Business clock | Fixed Asia/Kolkata via `business_today()`                                                                  | Status and alert thresholds must not shift by 5½ hours based on server or session locale                            |
| D7  | Code sequence  | Counter table, gaps allowed for now                                                                        | Gap-free is a one-line change, pending client confirmation (Q13)                                                    |
| D8  | Charge storage | Commercial charges are rows, shaped like payroll items                                                     | One renderer and one exporter instead of two; a new charge is a seed row, not a migration                           |
| D9  | Primary keys   | UUID v4, `gen_random_uuid()`                                                                               | Generatable before insert (SPEC-03 draft assembly); no record-count leakage in URLs                                 |
| D10 | Money          | `NUMERIC(12,2)` in the database, string in TypeScript                                                      | Exact storage; no spec does arithmetic on money, so no float risk and no decimal library                            |
| D11 | Enum storage   | `varchar` + CHECK constraint; the TS union is the source of truth                                          | Scheme and the role set may still change; altering a CHECK is an ordinary transactional migration                   |
| D12 | Deletion       | Soft delete (`is_active`); all foreign keys `ON DELETE RESTRICT`                                           | History and exports must always resolve; a bad reference should fail loudly, not erase children                     |
| D13 | Testing        | §6 rules unit-tested with no database; schema constraints tested against docker-compose Postgres, uncached | AC1/AC3/AC5 are assertions about Postgres and cannot be proven without it                                           |

### Accepted defaults for open questions

Each is marked `DECISION-PENDING` in the spec with a working default, so
implementation is not blocked. Question numbers refer to
`docs/project_information.md` §12.

| Q   | Topic                           | Default taken                                                                |
| --- | ------------------------------- | ---------------------------------------------------------------------------- |
| Q2  | Generated code format           | `<ZONE_CODE>-<YY>-<NNNN>`                                                    |
| Q3  | MOU tenure unit                 | Number plus a MONTHS/YEARS selector, MONTHS preselected                      |
| Q4  | Allowance vs deduction split    | All 23 payroll items are allowances except Document Fee and Registration Fee |
| Q5  | Zone free text or master        | Master-table dropdown everywhere                                             |
| Q6  | Plants per company              | Many per company; the wizard creates the first                               |
| Q7  | User roles                      | ADMIN / DATA_ENTRY / VIEWER                                                  |
| Q13 | Gap-free company codes          | Gaps allowed for now — **client to confirm**                                 |
| Q14 | Real zone names and short codes | Provisional seed — **client to confirm before go-live**                      |

## SPEC-02 — Authentication and Dashboard

Decided before implementation, in the same review style as D1–D13.

| #   | Decision                       | Choice                                                                                   | Rationale                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D14 | Password hashing               | `node:crypto` scrypt, stored as `scrypt$N$r$p$salt$hash`                                 | Built into Node, so no native build step on Windows and no dependency. The self-describing format lets the cost parameters be raised later without invalidating existing hashes. Verification uses `timingSafeEqual`, and a value that is not a well-formed hash of ours simply cannot authenticate                |
| D15 | Session storage                | A `session` row in Postgres; only an opaque row id travels in an httpOnly cookie         | AC8 needs logout and the 30-minute inactivity rule to be real server-side invalidations. A signed stateless cookie cannot be invalidated, and clearing it client-side is not an invalidation                                                                                                                       |
| D16 | Session payload                | The cookie holds no user id or role; both are re-read from the database on every request | Deactivating a user ends their sessions immediately, and a tampered cookie gains nothing                                                                                                                                                                                                                           |
| D17 | Login lockout state            | A `login_attempt` table keyed by the lower-cased identifier the user typed               | Survives a restart and holds across processes, unlike an in-memory counter. Counting failures for usernames that do not exist is deliberate: it stops the 429 from becoming a way to discover which usernames are real                                                                                             |
| D18 | Password change on first login | **Deferred — needs a spec amendment**                                                    | SPEC-01 §11.2 says SPEC-02 must force a change on first login, but SPEC-02 defines no requirement, endpoint or acceptance criterion for it. Flagged rather than invented                                                                                                                                           |
| D19 | UI stack                       | react-router-dom plus Tailwind CSS v4 via `@tailwindcss/vite`                            | Matches the stack named in `ARCHITECTURE.md`. Tailwind v4 is configured from CSS, so there is no `tailwind.config.js`                                                                                                                                                                                              |
| D20 | UI acceptance testing          | Playwright, driving the real API and web dev servers                                     | AC1/AC4/AC6/AC7/AC8 are browser behaviours — redirects, rendered entry points, hidden controls — that cannot be proven without a browser. The three fixture accounts are seeded with real scrypt hashes so the tests drive the genuine login path, and are named `e2e-*` so they cannot be mistaken for real users |

### Notes on D14–D20

- **The SPEC-02 schema additions are infrastructure, not business data.** SPEC-01
  §5 presented itself as the complete persistent data model, but `session` and
  `login_attempt` are authentication machinery it did not anticipate. They were
  added by a SPEC-02 migration and live in the same Drizzle schema file.
- **`@mou/api` exposes one subpath export**, `@mou/api/auth/password`, so test
  fixtures can produce real password hashes without widening the service's main
  entry point.
- **D13 still governs the domain and schema tests.** D20 applies to the UI
  criteria only; the unit and integration suites are unchanged.

## SPEC-03 — Add Company Wizard Framework

Decided during implementation, in the same review style as D1–D20.

| #   | Decision               | Choice                                                                                                                                                                                        | Rationale                                                                                                                                                                                                                             |
| --- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D21 | Draft persistence      | A `company_draft` table with a JSONB `payload` and `current_page` column, one draft per user                                                                                                  | The wizard must survive a page refresh (AC2), and a JSONB blob is the simplest representation of a multi-step form that has not yet been validated. One per user prevents orphan drafts and makes the resume check a single-row query |
| D22 | Final save transaction | A single `db.transaction()` across company, company_plant, mou, commercial_item, payroll_config, trainee_category, payroll_item                                                               | AC5 requires all-or-nothing: a failure on the last table must leave zero rows. The company code is allocated outside the transaction (D7) to keep the counter lock short                                                              |
| D23 | Idempotent submit      | Submitting the same `draftId` twice returns the already-created company instead of inserting a duplicate                                                                                      | A user who double-clicks Save or hits back and resubmits must not create two companies. The draft's consumed flag is set inside the transaction so the idempotency check is atomic with the insert                                    |
| D24 | Role enforcement       | Per-route `requireSession(pool)` in the companies router; VIEWER gets 403 on draft and submit endpoints; the plants lookup stays public                                                       | The plants endpoint is used by the wizard's zone dropdown and must not require auth. Applying `requireSession` globally broke existing public routes, so it is applied per-route                                                      |
| D25 | VIEWER URL guard       | `AddCompanyPage` checks `user.role` after all hooks and renders a "Not available" message for VIEWERs                                                                                         | Mirrors the server-side role matrix at the UI level so a VIEWER who types `/companies/new` directly is refused without reaching the API. Placed after hooks to respect React's rules of hooks                                         |
| D26 | UI test isolation      | `global-setup.ts` clears `company_draft`, `company`, `mou`, `payroll_item`, `trainee_category`, `payroll_config`, `commercial_item`, `company_plant`, and `company_code_counter` between runs | The full wizard flow test creates a company with an empty `gst_number`. The partial unique constraint on `gst_number` treats `""` as a value, so a re-run would hit a duplicate-key error without cleanup                             |

### Notes on D21–D26

- **The wizard pages are placeholders.** Page 1 collects only zoneId,
  companyName and plantName; Page 2 collects mouStartDate, tenureValue and
  tenureUnit; Page 3 collects scheme. The full field sets arrive with SPEC-04
  (Company Detail), SPEC-05 (Commercial Detail) and SPEC-06 (Payroll Details).
- **The Drizzle `noUncheckedIndexedAccess` issue.** Under
  `noUncheckedIndexedAccess: true`, `array[0]` is `T | undefined` even after a
  length check. A `firstRow()` helper that throws if the array is empty is used
  consistently instead, which is both safe and ergonomic.
- **The Drizzle `.values()` type inference issue.** When an optional column
  (`stipendDate: number | undefined`) is passed, Drizzle's single-object
  overload is rejected and TypeScript falls through to the array overload. The
  workaround is to build a `Record<string, unknown>` with conditional property
  assignment and cast with `as never`.

## SPEC-04 — Wizard Page 1: Company Details

Decided during implementation, in the same review style as D1–D26.

| #   | Decision                    | Choice                                                                                                                                                | Rationale                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D27 | Where the rules live        | A pure `@mou/domain` module (`company-details-validation.ts`), taking `Partial<CompanyDetails>` of plain strings and returning `{ errors, warnings }` | Section 4 requires every rule enforced both client- and server-side. A pure, I/O-free module is the only way both call sites can share the exact same logic without drifting apart; typing input as untrusted strings rather than the enum unions is deliberate, since proving membership is the module's job   |
| D28 | Errors vs warnings          | The result type splits blocking `errors` from advisory `warnings`, keyed by field                                                                     | AC8's GST-vs-State mismatch must inform the user without blocking Next. A single combined map cannot express "shown, but not blocking"                                                                                                                                                                          |
| D29 | Server-only checks          | GST uniqueness and the duplicate company (name + plant + zone) check live only in `POST /api/companies/validate-page1`, not in `@mou/domain`          | Both need a database round trip, so they cannot be pure. They only run once the format rules already pass, to avoid a wasted query on a field that is going to be rejected anyway                                                                                                                               |
| D30 | Final-save defence in depth | The final-save route re-runs `validateCompanyDetails` on `page1` and returns 422 with the offending fields if it fails, instead of trusting the draft | `gst_number` is `UNIQUE`; a draft saved before Page 1 was completed (or edited directly via the API) could otherwise reach the insert with an empty or malformed GST, succeed once, and collide on every subsequent attempt. Validating first turns that into a clear 422 rather than a raw duplicate-key error |

### Notes on D27–D30

- **Q11 default confirmed.** GST Number is globally unique; Company Name +
  Plant is unique within a Zone. No amendment surfaced during implementation,
  so the spec's stated default stands.
- **The Mobile/LAN switch clears both numbers via `window.confirm`.** Section 3
  requires a warning before clearing content; a native confirm dialog is the
  simplest way to satisfy that inside a controlled form component, and the
  Playwright test for AC5 accepts it with `page.once("dialog", ...)`.
- **Confirm Email blocks paste**, per section 4.1 — an `onPaste` handler that
  calls `preventDefault()`, deliberately defeating a copy-paste of the same typo
  into both boxes.

## SPEC-05 — Wizard Page 2: Commercial Details

Decided during implementation, in the same review style as D1–D30.

| #   | Decision                         | Choice                                                                                                                                                            | Rationale                                                                                                                                                                                                                                      |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D31 | Charge-row cardinality           | A blank fixed charge gets **no row** in `commercial_item`; only an entered value (including `0`) gets one                                                         | Section 2.2 says blank means "not applicable" and section 6 (AC6) wants that distinguishable from an entered `0.00`. Row-absence vs. row-present is a simpler way to represent that than writing all 16 rows every time with a nullable amount |
| D32 | MOU document storage paths       | Deterministic paths built only from `draftId`/`mouId` — `draft-tmp/<draftId>/document.pdf` and `mou/<mouId>/document.pdf` — never from the user-supplied filename | This is the strongest form of section 3's "filename sanitised before storage": there is no user input in the path to sanitise. The human-readable name is kept only as the `mou_document.original_filename` column, for display                |
| D33 | Virus scanning                   | `scanForViruses()` runs `VIRUS_SCAN_COMMAND` against the temp file if that env var is set, and is a no-op (clean) otherwise                                       | Section 3 says "virus-scanned **if available**" and no scanner is installed in this environment. A real, documented hook is truthful about what exists; a fabricated integration would not be                                                  |
| D34 | No `validate-page2` endpoint     | Unlike Page 1, Page 2 has no server round trip on Next                                                                                                            | Every Page 2 rule is pure (no GST-style uniqueness check needed), and the one thing that does need the server — the PDF — is already validated synchronously at upload time. A second endpoint would duplicate what upload already proves      |
| D35 | File-move ordering in final save | `promoteTempDocument()` and the `mou_document` insert are the last two steps of the transaction, immediately before deleting the draft                            | A physical file rename cannot be rolled back if a later statement fails. Placing it last minimises that window, the same accepted tradeoff as allocating the company code outside the transaction entirely (D7)                                |

### Notes on D31–D35

- **The final-save route now derives `commercial_item` rows itself** from
  `page2.charges` (a fixed-key map) and `page2.otherItems`, rather than
  trusting a client-supplied array wholesale as the SPEC-03 placeholder did —
  `itemType` for a fixed key always comes from `COMMERCIAL_ITEM_BY_KEY`, never
  from the request body.
- **`Page2Data.tenureValue` and `stipendDate` changed from `number`/
  `number | undefined` to `string`**, matching Page 1's plain-string
  convention (draft JSON is untrusted input either way, and a blank string is
  easier to distinguish from a real value than a coerced `0`).
- **Existing SPEC-03/04 integration tests that call `completePayload()` and
  expect a successful final save were updated** to first create a draft,
  upload a real (tiny, in-memory) PDF to it, then persist the rest of the
  payload — `createDraftAtStep3()` in `companies.integration.test.ts` wraps
  that sequence. This is a genuine behavior change: a company can no longer
  be saved without a PDF, which SPEC-03's placeholder never required.

## SPEC-06 — Wizard Page 3: Payroll Details, Code Generation and Save

Decided during implementation, in the same review style as D1–D35. This spec
completes the Add New Company flow.

| #   | Decision                                        | Choice                                                                                                                                                                                                                                   | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D36 | Shared "Other" row validation                   | `validateOtherChargeRows()` (label + amount + Allowance/Deduction, all-or-nothing, case-insensitive duplicate rejection) extracted out of `commercial-details-validation.ts` and reused by `payroll-details-validation.ts`               | Section 3.3 says the payroll "Other" row is "a repeatable block like SPEC-05 section 2.3" — the two specs share one rule, so the code should too, rather than a second hand-copied implementation drifting from the first over time                                                                                                                                                                                               |
| D37 | Payroll-item cardinality is the opposite of D31 | Every one of the 22 fixed `payroll_item` keys always gets exactly one row, `amount = NULL` when `is_applicable = false` — unlike `commercial_item`'s blank-means-no-row                                                                  | `payroll_item`'s schema CHECK constraints go both directions (`_applicable_amount_chk` and `_inapplicable_amount_chk`), because Yes/No is itself the answer being recorded (AC2 requires every item explicitly answered), not an optional amount the way a commercial charge is                                                                                                                                                   |
| D38 | AC10 needs no new code                          | The rule ("a second wizard run for the same company + plant + scheme is rejected while a current MOU exists") is enforced only by the existing `mou_company_plant_scheme_uq` partial unique index, with no application-level check added | Every wizard run inserts a brand-new `company` + `company_plant` row in the same transaction, so this index can never collide with itself through this wizard's own code path. It only becomes reachable once SPEC-07/SPEC-10 add a way to attach a new MOU to an _existing_ company/plant — flagged here transparently (same spirit as D18's deferred item) rather than adding a check for a path that cannot currently be taken |
| D39 | Save disables, rather than validates-on-click   | Page 3's Save button is genuinely `disabled` while any of the 22 items is unanswered (`canProceed(3)`), unlike Pages 1/2's "always enabled, mark errors on click" pattern                                                                | SPEC-06 AC2 states this explicitly ("Save stays disabled until the count reaches zero"), unlike SPEC-04/05's equivalent acceptance criteria, which only ask for every field to be marked after the fact                                                                                                                                                                                                                           |

### Notes on D36–D39

- **A real bug, not a test flake, surfaced and was fixed while adding UI
  tests.** Unlike Pages 1 and 2, Page 3 has no "Next" transition to persist
  through — Save is the only action — so `AddCompanyPage.tsx`'s Page 3 field
  edits were never sent to the server draft before `submitCompany()` ran,
  and the final save silently validated a stale, empty Page 3. Fixed by
  calling `persistDraft(3)` immediately before `handleSave()` in the Page 3
  branch of `handleNext()`.
- **A second, related bug found via the same UI test**: the final-save route
  still parsed `page3.traineeCategories` as the SPEC-03 placeholder's
  `{ categoryName: string }[]` shape, but `Page3Data.traineeCategories` (this
  spec) is a plain `string[]`, matching `PayrollDetails` in `@mou/domain`. The
  mismatch was invisible to the integration tests because their own
  `completePayload()` fixture had been written to match the _stale_ backend
  shape rather than the real frontend one. Fixed by reading
  `traineeCategories` as a plain array and updating the fixture to match what
  the browser actually sends — a reminder that a test fixture mirroring the
  server's assumptions, rather than the client's actual output, can hide
  exactly this kind of drift. Both bugs were caught only because the
  Playwright UI suite drives the real frontend end to end; the integration
  suite alone would not have found either one.
- **The success screen** now shows the company name and scheme (section
  5.4) alongside the generated code. No "View Company" link is added — SPEC-07
  does not exist yet, so there is nowhere for it to go.

## SPEC-07 — Existing Company: 3-Page View Flow

Decided during implementation. This is the first of the read-mostly specs
(SPEC-07–13), planned together as one batch (see the session's plan file) and
implemented one by one in numeric order.

| #   | Decision                                                          | Choice                                                                                                                                                  | Rationale                                                                                                                                                                                                                            |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D40 | No role check on any SPEC-07 route                                | `requireSession` only, no `requireRole`                                                                                                                 | Section 1: "every field in this flow is view-only" and section 6's table puts every endpoint open to every role including VIEWER — there is nothing here a VIEWER should not see                                                     |
| D41 | Status always computed from `business_today()`                    | Every view endpoint that needs "today" calls the same `business_today()` SQL function SPEC-01 built, never `new Date()` in Node                         | SPEC-01 section 6.2 requires Asia/Kolkata regardless of server time zone; SPEC-07 is the first endpoint to actually consume `business_today()` since AC13 proved it works                                                            |
| D42 | Query assembly lives in `db/mou-view.ts`, not inline in the route | `fetchCompanyOverview`, `fetchCompanyMous`, `fetchMouCommercialDetail`, `fetchMouPayrollDetail` are plain exported functions taking a `Database`/`Pool` | SPEC-11 (history, same shape from a JSON snapshot) and SPEC-13 (export) both need the identical assembly; a route-only implementation would have to be duplicated or reached into                                                    |
| D43 | Print is minimal pdfkit, not a styled template                    | `routes/company-view.ts`'s print handler writes plain `doc.text()` lines                                                                                | Section 4.4 only requires the Page 1 + Page 2 _fields_ to be present in the output; a polished layout is presentation work with no acceptance criterion attached to it, and can be improved later without changing the data contract |

### Notes on D40–D43

- **Two lookup endpoints already existed** from SPEC-01/03 and needed no
  changes: `GET /api/zones/:zoneId/companies` and
  `GET /api/companies/:id/plants`. SPEC-07 only adds the five new endpoints
  section 6 actually requires.
- **A charge with no row is rendered as `null` by the API**, not omitted from
  the array — `fetchMouCommercialDetail` always returns all 16 fixed keys in
  catalogue order, `amount: null` when unset, so the frontend can render every
  row (with "—") without knowing the catalogue itself.
- **The "most recent document" (SPEC-09 section 3.1's "current document")**
  is resolved by `ORDER BY uploaded_at DESC LIMIT 1` in `fetchMouCommercialDetail`.
  SPEC-09 (standalone upload, not yet implemented) is what will let more than
  one document accumulate; the query is already written to handle that.
- **The MOU status badge** uses a symbol prefix (●/✓/✕) plus text and a
  colour, not colour alone, per section 4.2's accessibility requirement.
- **UI test fixtures create data via the real HTTP API** (a full wizard
  submission through `request`, not the wizard UI) rather than driving
  SPEC-03–06's UI, which would make every SPEC-07 test slow and duplicate
  that suite; one direct SQL insert (mirroring `global-setup.ts`'s existing
  use of `pg`) creates the second MOU that AC4's two-scheme case needs, since
  the wizard itself only ever creates one company with one MOU and cannot
  attach a second scheme to an existing one — that becomes possible once
  SPEC-10 lands.

## SPEC-08 — MOU Expiry Alerts

| #   | Decision                                                             | Choice                                                                                                                                                                                                                                | Rationale                                                                                                                                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D44 | Catch-up via set-based date arithmetic, not a day-by-day loop        | `runExpiryAlertJob` computes, per threshold, `end_date - threshold BETWEEN sinceDate AND today` in one query, where `sinceDate` comes from `scheduled_job_state.last_run_date + 1` (or `business_today()` on the very first run ever) | Section 3 requires a missed day to be caught up (AC3) and a same-day rerun to be a no-op (AC2). A `BETWEEN` range plus `ON CONFLICT (mou_id, threshold_days) DO NOTHING` gives both for free, in 3 queries total regardless of how many days were missed, rather than iterating dates in application code  |
| D45 | First-ever run only evaluates today, not all of history              | When `scheduled_job_state` has no row yet, `sinceDate = business_today()`                                                                                                                                                             | Not stated by the spec, but the alternative (treating a fresh install as having missed every day since the epoch) would flood the alert list with every pre-existing MOU's already-past thresholds the first time the job ever runs. Flagged here in case the business owner wants a real backfill instead |
| D46 | The job runs in-process via `setInterval`, not an external cron      | `index.ts`'s `main()` runs the job once at startup (catching up immediately) and re-checks hourly; the check is a no-op unless the date has advanced                                                                                  | This codebase has no other job/queue infrastructure, and the job's own idempotency (D44) makes "checked more often than needed" free. `isDirectRun`-gated, so `node --test` and the Playwright-managed dev server for other suites never trigger it as a side effect of importing `index.ts`               |
| D47 | The badge is a live query on `mou`, not a count of `mou_alert` rows  | `GET /api/alerts/count` runs `end_date BETWEEN business_today() AND business_today() + 90` directly against `mou`                                                                                                                     | Section 5 states this explicitly: a newly created MOU already inside the window must show up before the nightly job ever runs                                                                                                                                                                              |
| D48 | `ExistingCompanyPage` gained `?zoneId=&companyId=` deep-link support | A new effect reads `useSearchParams()` once on mount and, if both are present, drives the same `handleZoneChange`/`handleCompanyChange` a user's own selection would                                                                  | SPEC-08 section 4's row action ("open the company in the Existing Company view") needs to land on the _specific_ company, not an empty selector page. Built once here since SPEC-11/12/13 all describe the same "link to Existing Company" row action                                                      |

### Notes on D44–D48

- **`insertMouEndingIn`** (test-harness.ts) asks Postgres to invert its own
  generated-column formula (`start + 1 month - 1 day = target`) to compute the
  fixture's `mou_start_date`, so a test can target an exact days-remaining
  value on whatever calendar day the suite happens to run, without any
  JS-side calendar math that could disagree with Postgres's own interval
  arithmetic at a month boundary.
- **A parameter-type gotcha**: the per-threshold SQL used the same `$1`
  placeholder both as a plain `smallint` column value and inside an
  `INTERVAL` multiplication in the same statement; `pg` raised "inconsistent
  types deduced for parameter $1" until both usages were given explicit casts
  (`$1::smallint`, `$1::int`). Worth remembering for any future query that
  reuses one bound parameter in two different type contexts.
- **UI test fixtures for this spec insert directly via `pg`** (company,
  plant, MOU and the alert row itself), not through the wizard or the job —
  the Playwright-managed dev server only runs the real job once at startup
  and then hourly, so there is no way (and no need) to trigger a fresh run
  mid-suite just to test how already-raised alerts render. This required
  adding `DELETE FROM mou_alert` and `DELETE FROM scheduled_job_state` to
  `global-setup.ts`'s cleanup, before `DELETE FROM mou` (same `ON DELETE
RESTRICT` reasoning as `mou_document` before it) — a previous local run's
  leftover alert rows otherwise blocked the next run's own cleanup.
- **Row-scoped locators in the UI tests.** `alerts.spec.ts`'s tests don't
  reset the database between each other (they only insert), so multiple
  alerts can be on screen at once by the time a later test runs. `.first()`
  on a bare `getByRole("button", { name: "Acknowledge" })` picked up a
  _different_ test's row once the suite accumulated more than one alert.

## SPEC-09 — Upload MOU PDF (standalone)

| #   | Decision                                                                   | Choice                                                                                                                                                                                  | Rationale                                                                                                                                                                                                                                                                                        |
| --- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D49 | Multiple documents per MOU need distinct filenames                         | `writeMouDocument()` names each file with a freshly generated UUID (`mou/<mouId>/<id>.pdf`), not the deterministic `mou/<mouId>/document.pdf` path SPEC-05's wizard upload already uses | Section 3.1 requires every upload to add a document, never replace one. The wizard's single-document-per-MOU path (one file per draft, promoted once at final save) is untouched; this is a second, additive naming scheme for the same `mou_document` table, not a change to SPEC-05's own path |
| D50 | The DB row is written only after the file is written and scanned           | `writeMouDocument()` → `scanForViruses()` → `db.insert(mouDocument)`, with the file deleted again if the scan fails                                                                     | Keeps `mou_document` the single source of truth for "what documents exist" — a failed insert can never leave an orphaned-but-referenced file, and a failed write can never leave a DB row with nothing behind it                                                                                 |
| D51 | The document list shows the uploader's username, not their id              | `GET /api/mous/:mouId/documents` joins `mou_document.uploaded_by` against `user.username`                                                                                               | Section 3.1 requires the list to show "uploader"; the id alone is meaningless in the UI and no other endpoint already exposes a user-id-to-username lookup to reuse                                                                                                                              |
| D52 | The upload endpoint re-checks the MOU exists but not that it's `is_active` | `POST /api/mous/:mouId/document` looks the MOU up by id alone                                                                                                                           | Unlike a _new_ MOU (SPEC-03) or a read-only view (SPEC-07, which does filter on `is_active`), attaching a document to a superseded MOU version is exactly what SPEC-10/11's edit-history flow will need later; nothing in section 3 restricts uploads to the current version                     |
| D53 | Cascading selectors are a plain component tree, not a shared hook (yet)    | `UploadMouPage.tsx` repeats the same zone→company→plant pattern `ExistingCompanyPage.tsx` already has, rather than factoring out a shared `useCascadingSelectors`                       | The two pages' selectors differ enough (plant is a hard requirement here vs. an optional refinement in SPEC-07; the fourth step here is scheme-then-upload, not scheme-then-view) that extracting a hook now would be speculative; revisit if SPEC-10 needs the identical shape a third time     |

### Notes on D49–D53

- **Reused SPEC-05's exact validation, per the spec's own wording** ("the
  file-validation logic is implemented once and called from both places"):
  `validatePdfBuffer()` and `scanForViruses()` are imported unchanged from
  `upload/mou-document-storage.ts`; only the storage half (`writeMouDocument`,
  `mouDocumentAbsolutePath`) is new, because the wizard's temp-file-then-
  promote flow doesn't apply to an upload that has no draft at all.
- **The scheme step's auto-hide (section 2.1)** is a plain frontend
  condition (`mous.length > 1`) evaluated after `GET /api/companies/:id/mous`
  returns for the chosen plant — no new endpoint needed, since SPEC-07 already
  built exactly this query in `db/mou-view.ts`.
- **The two existing lookup endpoints needed no changes**: `GET
/api/companies/:id/plants` (SPEC-01) and `GET /api/companies/:id/mous`
  (SPEC-07) are reused as-is by the new frontend page.
- **UI test fixtures insert directly via `pg`** (mirrors `alerts.spec.ts`),
  since only the plant/scheme shape matters for these tests, not a real
  wizard submission — a full `createViewableCompany()`-style wizard run
  (SPEC-07's own fixture) would work but is unnecessarily slow for a flow
  that never reads commercial or payroll data.
- **A real, order-dependent bug found by the full-suite run, not the isolated
  one** (SPEC-09): SPEC-08's dashboard badge (`DashboardPage.tsx`) rendered the entry
  label and the badge count as two text nodes inside the _same_ `<span>`, so
  once any `mou_alert` row existed the accessible text became `"MOU Expiry
Alerts 5"` and `dashboard.spec.ts`'s `getByText(label, { exact: true })`
  stopped matching. This only surfaces once `alerts.spec.ts`'s fixtures have
  actually run before `dashboard.spec.ts` in the same suite execution — the
  isolated SPEC-08 verification run never hit it, and even a prior full-suite
  run could get lucky on worker/file ordering. Fixed by wrapping the label in
  its own child `<span>`, isolating its "own text" from the badge sibling's.
  General lesson: a badge/count appended next to a label as a sibling text
  node, rather than a separately-wrapped element, silently breaks any
  `exact: true` text assertion on the label once the badge has content.
- **`getByLabel("Company")` is a substring match by default** and also
  matched the "Company Plant" `<select>` (a strict-mode violation) in the
  new `upload-mou.spec.ts`. Fixed with `{ exact: true }` on every "Company"
  lookup — the same class of bug SPEC-07's own suite had already hit once
  with `getByText`, now recurring with `getByLabel`.

## SPEC-10 — Edit Agreement

| #   | Decision                                                                                                            | Choice                                                                                                                                                                                          | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D54 | No `mou_document` schema change was needed                                                                          | Proof files use `agreement_history.proof_file_path` and the new `mou_edit_request.proof_file_path` (plain `text` columns), not an `mou_document` row                                            | The batch plan (written before SPEC-01's tables were re-read closely) assumed proof would reuse SPEC-09's download endpoint via a generalized `mou_document`. SPEC-01 already gave `agreement_history` its own `proof_file_path` column, so the smaller, already-schema-true design won; no download endpoint for a proof file exists yet, since no SPEC-10 acceptance criterion requires one — SPEC-11 (Agreement History) is the natural place to add one if its own spec requires it                                |
| D55 | `mou_edit_request` modeled directly on `company_draft` (D21)                                                        | New table: `mou_id`, `edit_reason`, `proof_file_path`, `remark`, `loaded_version`, `created_by`, `created_at`, `consumed_at`                                                                    | The request's own row id _is_ the edit token (section 7); `consumed_at` makes it single-use without a separate token table or a signed/expiring token scheme, which nothing in the spec asks for                                                                                                                                                                                                                                                                                                                       |
| D56 | Proof accepts PDF or image, validated by a second small module                                                      | `upload/edit-proof-storage.ts` (`validateProofBuffer`, `writeEditProofFile`), not an extension of SPEC-05/09's `mou-document-storage.ts`                                                        | The allowed mimetypes differ (PDF _or_ image, not PDF only) and proof lives under its own `edit-proof/` tree keyed by the edit-request id, not an MOU id — different enough from `mou-document-storage.ts`'s job to be its own file rather than a parameter threaded through it                                                                                                                                                                                                                                        |
| D57 | Apply replaces every commercial/payroll child row rather than diffing them in SQL                                   | `PUT` deletes all `commercial_item`/`trainee_category`/`payroll_item` rows for the MOU (or its `payroll_config`) and reinserts the derived set, inside the same transaction as the version bump | Mirrors SPEC-03's final-save transaction exactly (same derivation functions, `db/mou-edit.ts`'s `deriveCommercialItemRows`/`derivePayrollItemRows`, reused verbatim); a row-by-row SQL diff would be a second, parallel way to reach the same set of rows for no benefit, since every edit already re-validates and rewrites the whole payload anyway                                                                                                                                                                  |
| D58 | The "no changes" check (AC12) compares derived rows, not raw JSON                                                   | `sameDerivedRows`/`sameTraineeCategories` sort both sides and compare normalized (`toFixed(2)`) amounts                                                                                         | A raw string/JSON comparison would treat "100" and "100.00" as different amounts even though they persist identically; deriving both sides through the exact same function the transaction itself uses guarantees the diff can never disagree with what would actually be written                                                                                                                                                                                                                                      |
| D59 | Concurrency (AC11) is enforced with `SELECT ... FOR UPDATE`, not an optimistic `WHERE version = $1` on the `UPDATE` | The transaction locks the `mou` row, re-checks `version` against the client's, and only then proceeds                                                                                           | An optimistic `UPDATE ... WHERE version = $1` returning zero rows is equivalent but harder to distinguish from "MOU not found" without a second query; a `SELECT FOR UPDATE` also serializes the token-consumption check in the same lock, closing the race between two racing `PUT`s sharing (or nearly sharing) a version, not only the version mismatch case                                                                                                                                                        |
| D60 | Scheme is force-set from the MOU's own current row before validation, not merely rejected if changed                | `payrollDetails.scheme = current.scheme` unconditionally, ignoring whatever the client sent                                                                                                     | Same "ignored rather than applied" rule AC6 states for company identity fields, applied to the scheme too (section 4: "a different scheme means a different MOU"); simpler than a second explicit check that rejects a changed scheme with its own error message, and no acceptance criterion asks for that error to be distinguishable from a normal validation failure                                                                                                                                               |
| D61 | The edit form is a new, purpose-built component, not `Page2`/`Page3` reused                                         | `EditAgreementPage.tsx` renders its own commercial/payroll fields inline                                                                                                                        | `Page2.tsx` carries a wizard-only file-upload control (SPEC-05's MOU PDF, not editable here) and `Page3.tsx` renders an editable scheme `<select>` (never editable here) — reusing either verbatim would mean adding props neither component needs for its actual job just to suppress wizard-only behaviour for this one caller. Both still reuse `@mou/domain`'s `validateCommercialDetails`/`validatePayrollDetails` unchanged, which is what section 4 actually requires ("the same code path, not a second copy") |

### Notes on D54–D61

- **The review screen's diff is field-level for the 16+22 fixed items and
  scalar MOU fields, but a single aggregated row for each "Other" list and
  the trainee-category list.** Diffing a variable-length, order-insensitive
  list of rows field-by-field (which label moved where, which row is new)
  would need its own row-matching algorithm for a screen whose only job is
  to stop a blind Apply; a single "changed/unchanged" row for the whole list
  is enough to alert the user, and the fixed items — the overwhelming
  majority of what actually gets edited per SPEC-10's own examples — get
  full old→new detail.
- **Integration tests build the editable payload from what `POST
/edit-request` returns**, not by hand, so a test can never encode an
  assumption about the payload shape that drifts from what
  `fetchEditablePayload` actually produces.
- **AC3's literal wording ("a direct PUT with reason ... and no proof") does
  not map onto this design 1:1**, since `PUT` never carries a `reason` at
  all — the reason is fixed at `edit-request` time and the token is what
  binds them. The two integration tests covering this AC therefore test the
  equivalent-by-construction claim: `edit-request` with
  `COMMUNICATION_FROM_HR` and no proof is rejected with 400 (making it
  impossible to ever obtain a token that could reach a `PUT` without proof),
  and the `PUT` handler still re-checks the token's own stored reason and
  `proof_file_path` as defence-in-depth.

## SPEC-11 — Agreement History

| #   | Decision                                                                                            | Choice                                                                                                 | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D62 | The diff logic moved into `@mou/domain` as a new, pure module                                       | `agreement-diff.ts` (`computeAgreementDiff`), reused by SPEC-11's `compare` endpoint                   | SPEC-10's review screen already had an equivalent local `computeDiff`, but this is the second caller — worth promoting to layer 0 so browser and server can never disagree on what counts as a change. SPEC-10's own working, already-tested `EditAgreementPage.tsx` was deliberately left using its local version rather than refactored to the shared one, to avoid touching verified code for a cosmetic gain (documented, not silently duplicated) |
| D63 | Every field is returned with a `changed` boolean, not only the changed ones                         | `computeAgreementDiff` always returns all ~45 rows                                                     | AC6 wants changed-only by default with a toggle to "show all" — one function producing every row lets the caller filter either way instead of needing two code paths or two round trips                                                                                                                                                                                                                                                                |
| D64 | `GET /history/current` returns the live agreement in the exact same shape as a history row's detail | New endpoint, backed by SPEC-10's `fetchEditablePayload`                                               | Section 2.3 treats "Current" as just another row to open; giving it an identical response shape means the frontend has exactly one detail renderer, not two, and "compare against Current" (AC7) can resolve either side through the same code path                                                                                                                                                                                                    |
| D65 | Snapshot parsing defaults every missing key rather than validating the stored JSON                  | `parseSnapshot()` treats an absent/malformed field as blank, never throws                              | AC5 requires a snapshot missing a field the current schema has to render "—", not error. Since `agreement_history.snapshot` is only ever written by SPEC-10's own insert (never user input), this is defensive against future schema drift, not an untrusted-input boundary                                                                                                                                                                            |
| D66 | Compare and history-detail routes are registered before the bare `:historyId` route                 | `/history/current` and `/history/compare` both precede `/history/:historyId` in `agreement-history.ts` | Express matches routes in registration order; either literal path would otherwise be captured by `:historyId` first and fail an `isUuid` check meant for a real id                                                                                                                                                                                                                                                                                     |

### Notes on D62–D66

- **A commercial charge and a payroll item can legitimately share a display
  label** (both catalogues have a "Document Fee"). `computeAgreementDiff`'s
  own unit test checks label uniqueness within each section rather than
  across the whole flat row list, since the real UI always renders the two
  sections separately (same reasoning SPEC-07's view already relies on).
- **History rows are produced by driving SPEC-10's real edit-request/apply
  endpoints in both the integration and UI tests**, never by inserting
  `agreement_history` rows directly via `pg` — this is the one spec in the
  batch where the fixture _is_ another spec's own write path, so a test can
  never encode an assumption about the snapshot shape that drifts from what
  SPEC-10 actually writes.
- **No new database table.** SPEC-11 reads `agreement_history` (SPEC-01),
  `mou` and `user` — nothing new to migrate, matching section 1's "this spec
  reads `agreement_history`; it never writes it".

## SPEC-12 — Zone Wise Dashboard

| #   | Decision                                                                                       | Choice                                                                                                                                                           | Rationale                                                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D67 | `is_current` (section 2.1's wording) means `mou.is_active` here                                | Every aggregate filters `WHERE m.is_active`                                                                                                                      | SPEC-01 §10 already flags this spec as describing the pre-D4/D8 vocabulary; `is_active` is this schema's only "is this the live row" flag (D4/D12)                                                                                                                                                                                                 |
| D68 | No new migration, despite section 3 naming two indexes                                         | `mou_active_end_date_idx (is_active, end_date)` and `mou_company_idx (company_id)` already exist from SPEC-01                                                    | Checked before writing the aggregate query, per the plan's own reminder to verify this; both indexes were already there for other reasons (SPEC-08's expiry job, SPEC-07's per-company MOU lookup)                                                                                                                                                 |
| D69 | Status and days-remaining are computed once in SQL via a CTE, not per-row in application code  | `WITH scoped_mou AS (SELECT ..., CASE WHEN ... END AS status, (end_date - today) AS days_remaining FROM mou ...)`, reused by both the summary and matrix queries | Section 3 explicitly requires aggregate queries, not "loading rows and counting in application code"; a CTE keeps the derivation in exactly one place per query rather than repeating the same `CASE` five times across five `COUNT(...) FILTER` clauses                                                                                           |
| D70 | Company/plant counts are unaffected by the scheme/status filters; only MOU-derived columns are | `COUNT(DISTINCT c.id)`/`COUNT(DISTINCT cp.id)` carry no filter; only the `mous`/`active`/`expired`/`new`/`expiring_soon` columns do                              | Section 2.3 ("filters apply to both tables consistently") is read as applying to the MOU-state columns both tables share, not to a zone's physical company/plant counts — filtering to `status=EXPIRED` making the Companies column read 0 for every zone with no expired MOU would be a stranger reading, and no acceptance criterion asks for it |
| D71 | The drill-down endpoint computes status in application code (`deriveStatus`), not SQL          | `fetchZoneDrillDown` reuses the same `@mou/domain` function the rest of the app already uses (SPEC-07's `mou-view.ts`)                                           | This endpoint returns individual rows, not aggregates — the SQL-side `CASE` in D69 exists only because aggregation needs it inside a single query; a row-level endpoint has no such constraint, so reusing the shared, already-tested `deriveStatus` is simpler than a third re-derivation                                                         |
| D72 | "Expiring ≤ 90 days" drills down to the SPEC-08 alert list, not a new MOU list                 | The summary table's figure is a `Link` to `/alerts?zoneId=&days=90`, not a `button` opening the same in-page drill-down as every other column                    | Section 2.4 states this explicitly: that figure "opens the SPEC-08 alert list filtered to that zone" — the alert list is already the authoritative, richer view of expiring agreements (acknowledge, thresholds), so duplicating it here would be two sources of truth for the same numbers                                                        |

### Notes on D67–D72

- **A real, latent join fan-out bug found and fixed before it shipped**: the
  summary query joins `company_plant` and the MOU CTE from `company`
  independently (`LEFT JOIN company_plant ... LEFT JOIN scoped_mou ...`,
  both keyed on `c.id`), which is a Cartesian product per company — a
  company with _P_ plants and _M_ MOUs produces _P×M_ joined rows. `COUNT
(DISTINCT cp.id)` was already safe, but the MOU-derived columns used a
  plain `COUNT(sm.id)`, so a two-plant company's MOU count would silently
  read double. Caught by adding a company-with-two-plants regression test
  (not by any of the acceptance-criteria tests, none of which happen to use
  a multi-plant company) and fixed with `COUNT(DISTINCT sm.id)` throughout.
  Worth remembering: two independent `LEFT JOIN`s from the same parent row,
  each one-to-many, always need `DISTINCT` on whichever side's count you
  actually want.
- **`insertMouEndingIn` (test-harness.ts) cannot produce an "Active with N
  days remaining" fixture when N is large**, since it always uses a 1-month
  tenure — an MOU ending 45 days out with only a 1-month tenure has
  necessarily not started yet (it would have to start 15 days from now),
  so it derives as NEW, not ACTIVE. AC6 needed an agreement already under
  way, so a local test-only helper inverts the same generated-column
  formula with a 6-month tenure instead. General lesson for any future spec
  reusing this helper: it targets "N days until expiry," not "N days
  remaining on an already-active agreement" — those are only the same
  MOU when N is small relative to the tenure.
- **A `getByRole("row", { name: zoneName })` UI-test bug found by the full
  suite run**: both the Summary and Scheme Breakdown tables render a row
  starting with the same zone name, so an unscoped row locator hit
  Playwright's strict-mode violation (two matches) in every test that
  looked up a zone's row. Fixed by scoping to `page.locator("table").first()`
  (Summary renders first in the DOM) — the same "two elements share a text
  fragment" shape of bug SPEC-09 hit with `getByLabel("Company")` matching
  "Company Plant" too, this time with `getByRole("row", ...)` across two
  tables.

## SPEC-13 — Search, Export Excel and Export PDF

This was the last spec in the batch the user asked for in auto-mode
(SPEC-07 through SPEC-13).

| #   | Decision                                                                                                                 | Choice                                                                                                                                                                       | Rationale                                                                                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D73 | One shared query (`db/search.ts`'s `searchMous`) backs Search and both Exports                                           | `by`/`q`/`zoneId`/`status` are all optional for Export (an omitted `by` exports everything visible), required for Search                                                     | Section 5's own framing: "what Search selects is what Export writes out." A single function with an optional pagination argument (present for Search, absent for Export's "every matching row") is simpler than two parallel query-builders that could drift apart                                                                      |
| D74 | Status is derived once in a SQL `CASE` expression reused verbatim in both the row query and its `COUNT(*) OVER()` window | The same `STATUS_CASE` string constant is spliced into both the `SELECT` list and the `WHERE` clause                                                                         | Pagination has to filter on the derived status _before_ `LIMIT`/`OFFSET`, which application-code filtering after the fact cannot do correctly (a page could come back with fewer than 25 valid rows). Same reasoning as SPEC-12's `scoped_mou` CTE, applied to row-level pagination instead of aggregation                              |
| D75 | Exports never stream a file directly from the endpoint that starts them                                                  | `GET /export/excel` and `GET /export/pdf` always create an `export_job` row and respond with `{jobId, status}`; only `GET /export/jobs/:jobId/download` ever serves bytes    | Matches section 6's own endpoint table (`GET /api/export/jobs/{jobId}` is listed as "download link") and AC13 ("unreachable without a session... gone after 24 hours") — a single download endpoint is the one place that rule has to be enforced, rather than two                                                                      |
| D76 | Only Excel export has an asynchronous path; PDF export is always synchronous                                             | The company-count threshold check (section 5, 5,000 companies) exists only in the Excel route                                                                                | Both PDF documents are inherently small (a zone summary, or one company's record) regardless of how many companies exist in the system overall — there is no PDF export whose size scales with the whole dataset the way the Excel workbook's Companies/MOUs/Commercial/Payroll sheets do                                               |
| D77 | The Commercial sheet's "Other" items become dynamic label/amount/type column triples, not a single summary column        | Column count grows to match the row with the most Other items across the whole export                                                                                        | Section 3.2 literally says "followed by 'Other' items as label/amount/type triples" - a set of real, separate cells (so a spreadsheet formula could reference one) is closer to that wording than a single joined text column would be, at the cost of some unused blank cells for rows with fewer Other items than the sheet's maximum |
| D78 | The company-scope PDF reuses SPEC-07's `mou-view.ts` functions unchanged, not a new query                                | `fetchCompanyOverview`/`fetchCompanyMous`/`fetchMouCommercialDetail`/`fetchMouPayrollDetail`, the same four functions SPEC-07's own Print and SPEC-11's compare already call | AC11 only requires this PDF to include payroll (which SPEC-07's Print omits) - the commercial/company data is otherwise identical, so the correct scope of new code is "call one more existing function," not a parallel document-assembly path                                                                                         |
| D79 | Export cleanup runs on the same `setInterval` heartbeat as SPEC-08's expiry job, not its own schedule                    | `runExportCleanup` is scheduled in `index.ts`'s `main()` alongside `runExpiryAlertJob`, same hourly check                                                                    | This app has exactly one job-scheduling mechanism (D46, SPEC-08); a second interval timer for a second job would be needless duplication for a requirement ("deleted after 24 hours") that tolerates an hour of slack fine                                                                                                              |

### Notes on D73–D79

- **`exceljs` was added as a new dependency** (network-verified via `npm view`
  first, the same check every prior new dependency in this batch got).
  It ships its own bundled type declarations (`types` in its own
  `package.json`), so no `@types/exceljs` was needed.
- **A real test-fixture bug found by the integration run, not the UI
  run this time**: the first two Search tests inserted a company with no
  MOU at all, then searched for it and asserted a result — but Search
  returns one row _per current MOU_ (section 2.2), so a company with zero
  MOUs can never appear, by construction. Fixed by giving both fixtures a
  plant and an MOU, the same shape every other search/export fixture in
  this file already has. Worth remembering for SPEC-13 specifically: a
  "company" fixture that only exercises the `company` table is invisible
  to every one of this spec's endpoints.
- **The generic `Buffer<ArrayBufferLike>` vs. `Buffer` type mismatch**
  between a Node 24 `Buffer.from(arrayBuffer)` and `exceljs`'s own bundled
  type declarations needed an `as never` cast in the integration test that
  reads a downloaded workbook back — a plain `as unknown as Buffer` cast
  was not enough, since the variable's _declared_ type was already the
  ambient `Buffer`; the mismatch is in the generic type parameter
  `exceljs`'s `.d.ts` expects, which only a type-erasing cast bypasses.
- **All ten Dashboard Home entry points now have a real destination.**
  `App.tsx`'s route table dropped the `DASHBOARD_ENTRY_POINTS.filter(...).map(...)`
  fallback loop entirely (nothing left un-implemented to generate it for);
  `ComingSoonPage` remains only as the `*` catch-all for a genuinely
  unrecognised path. `dashboard.spec.ts`'s "an entry point whose spec has
  not landed is present but disabled" test was rewritten to assert the
  opposite - zero disabled entries - since its premise (some spec still
  pending) is no longer true.

## SPEC-14 — Figma UI Replication

A visual-only restyle of every already-implemented page against a Figma Make
export (`figma_code/`), resolved through a grill-me interview rather than
assumed. Full detail and page-by-page mapping in
`docs/specifications/SPEC-14-figma-ui-replication.md` §0.

| #    | Decision                                                                                                                                                                                                                                                                    | Choice                                                                                                                                                                                                                                                        | Rationale                                                                                                                                                                                                                                                             |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D80  | SPEC-14 scope                                                                                                                                                                                                                                                               | **Visual/style replication only.** Every existing route, page boundary, step flow and data-entry interaction pattern (SPEC-01–13) stays exactly as implemented; only colours, typography, spacing, chrome and component styling change                        | Resolving what "100% accurate look" meant was the first branch — without this, every later SPEC-14 decision below is ambiguous                                                                                                                                        |
| D81  | Figma's floating multilingual AI chatbot widget                                                                                                                                                                                                                             | Excluded entirely — no spec backs it, and even a static version is new UI surface and new content beyond a visual reskin                                                                                                                                      | Nothing in SPEC-01–13 describes a chatbot; adding one would be new scope smuggled into a restyle spec                                                                                                                                                                 |
| D82  | Fonts (Figma's `index.css` loads Roboto/Roboto Mono from Google Fonts via CDN `@import`)                                                                                                                                                                                    | **Self-hosted** instead — font files served from `@mou/web`'s own static assets                                                                                                                                                                               | An internal enterprise app should not gain a runtime dependency on `fonts.googleapis.com` merely from a visual reskin                                                                                                                                                 |
| D83  | Login page's "Remember Me" / "Forgot Password" (no SPEC-02 backing)                                                                                                                                                                                                         | Rendered visually, wired to no-ops; real functionality logged separately in `SPEC-15-deferred-ui-features.md`                                                                                                                                                 | A pure UI-replication spec should not silently invent new authentication behaviour, but also should not just delete Figma-specified elements                                                                                                                          |
| D84  | Dashboard KPI tiles (Total Companies, Active MOU, Expiring Soon, Expired, Pending Review)                                                                                                                                                                                   | Built as new minimal backend scope (SPEC-14 §5.1), not omitted or faked with static numbers                                                                                                                                                                   | Faking counts on an internal ops dashboard is worse than not showing them; the four "real" KPIs were already one query away via SPEC-12's aggregation                                                                                                                 |
| D85  | Meaning of "Pending Review" (no equivalent concept exists — MOU status is only NEW/ACTIVE/EXPIRED)                                                                                                                                                                          | `COUNT(*)` on `company_draft` — unfinished onboarding wizard sessions (SPEC-03)                                                                                                                                                                               | Reuses an existing table built for exactly this purpose; zero new schema                                                                                                                                                                                              |
| D86  | Dashboard "Recent Activity" feed                                                                                                                                                                                                                                            | Built from existing timestamps — `company.createdAt` UNION `agreement_history.createdAt` — not a new activity-log table                                                                                                                                       | Both tables already carry the needed timestamps; instrumenting every mutating route for a dedicated audit table was explicitly rejected as oversized for this spec                                                                                                    |
| D87  | Topbar search box (decorative even in Figma's own code) and bell (wired in Figma to the expiry-alerts page)                                                                                                                                                                 | Both wired for real: bell → `/alerts`, search box Enter → `/search?q=...`                                                                                                                                                                                     | Cheap, real wiring to routes that already exist, distinct from adopting Figma's rejected "global search" IA proposal (D80)                                                                                                                                            |
| D88  | Login page's four "live" stat tiles, which would need a new unauthenticated endpoint (every existing endpoint requires a session, SPEC-02)                                                                                                                                  | Replaced with static marketing copy — icon + label, no numbers; no public endpoint added                                                                                                                                                                      | Exposing aggregate business counts pre-authentication is a security-relevant change that a UI-replication spec should not make unilaterally                                                                                                                           |
| D89  | Brand copy in `figma_code` ("NAPS Apprenticeship Portal · V2.0", "Ministry of Skill Development & Entrepreneurship") — not cross-referenced anywhere in `project_information.md`, and its scheme name doesn't match this system's (WILP/BOC and DVOC/MSBTE/FLEXI, not NATS) | Reproduced verbatim                                                                                                                                                                                                                                           | User confirmed this is accurate to the real client context despite predating this repo's own docs                                                                                                                                                                     |
| D90  | Expiry Alert detail modal: Figma has no "Acknowledge" control (SPEC-08's required action) but does have a "Renew" button navigating to Upload MOU                                                                                                                           | Keep Acknowledge (SPEC-08 AC6 depends on it), add Figma's "Renew" as an additional shortcut to the existing `/upload-mou` route                                                                                                                               | Figma's design silently drops a required, already-implemented, tested acceptance criterion; SPEC-14 must not let a visual reskin regress functionality                                                                                                                |
| D91  | `figma_code`'s `napsData.ts`/`natsData.ts` mock rows (different scheme "NATS", city-level "zones")                                                                                                                                                                          | Reference-only for visual design; not imported. Real zones/schemes stay exactly as SPEC-01 defines them                                                                                                                                                       | Confirms via `deriveStatus`/enum inspection that this mock data does not correspond to any real domain concept in this repo                                                                                                                                           |
| D92  | Sidebar navigation items/order/icons/role-visibility                                                                                                                                                                                                                        | Driven by the existing `DASHBOARD_ENTRY_POINTS` list (`src/web/src/dashboard/entry-points.ts`)                                                                                                                                                                | That file is already the single source of truth for the dashboard cards and route guards; a hand-duplicated sidebar list would drift from it                                                                                                                          |
| D93  | No shared page chrome exists today (`src/web/src` has no Sidebar/Topbar/Layout component)                                                                                                                                                                                   | New `AppShell` layout route (Sidebar + Topbar + `Outlet`) wraps every authenticated route; `/login` stays outside it                                                                                                                                          | Standard React Router nested-route pattern; the alternative (duplicating chrome markup into all thirteen pages) is the kind of drift this repo's other layers already avoid                                                                                           |
| D94  | Design tokens (`figma_code/src/index.css`'s colour variables, radii, shadows, `.glass-*` classes)                                                                                                                                                                           | Ported verbatim into `@mou/web`'s `index.css` `@theme` block; no `tailwind.config.js` introduced                                                                                                                                                              | Matches this repo's existing Tailwind v4 CSS-first convention, noted in `index.css` itself before SPEC-14                                                                                                                                                             |
| D95  | Icons (Figma uses inline SVG, no icon library)                                                                                                                                                                                                                              | Ported into a shared `icons.tsx` module, not a new dependency                                                                                                                                                                                                 | Matches both `figma_code`'s own approach and `package.json`'s already-minimal dependency set                                                                                                                                                                          |
| D96  | Export Excel/PDF are two routes (SPEC-13); Figma has one combined `ExportPage`                                                                                                                                                                                              | Stay two routes; Figma's single page's visuals are split across both                                                                                                                                                                                          | Consistent with D80 — no route merges regardless of how Figma grouped the screens                                                                                                                                                                                     |
| D97  | Sidebar user badge (Figma hardcodes "Rajendra Kumar" / "Admin · North Zone")                                                                                                                                                                                                | Shows the real signed-in user's name/initials/role; omits the zone sub-label                                                                                                                                                                                  | Users are not zone-scoped in the data model (SPEC-01 §2.9) — showing an invented zone would misrepresent a VIEWER's actual (all-zone) access                                                                                                                          |
| D98  | The persistent Sidebar (D93) now renders every visible `DASHBOARD_ENTRY_POINTS` label on every authenticated page, including Dashboard Home's own "Choose a task" card grid of the same entries                                                                             | Existing Playwright assertions that located an entry label with an unscoped `getByText`/`getByRole("listitem")` were scoped to `page.locator("main")` (the routed page content, sibling of the Sidebar in `AppShell`) — the dashboard's own grid, not the nav | A locator fix for a genuine new wrapper element (D93's Sidebar), not a behaviour change — the entry's label, path and click target are unchanged                                                                                                                      |
| D99  | The shared Topbar (D93) puts one real `<input type="text">` search box (D87) on every authenticated page                                                                                                                                                                    | `existing-company.spec.ts`'s AC7 ("nothing is editable" on the read-only Payroll Details step) was updated from "zero textboxes" to "exactly one textbox, named Search"                                                                                       | Same category as D98 — the assertion's intent (no _editable payroll data_) is preserved; only the literal DOM count changed because chrome now exists where none did before                                                                                           |
| D100 | Wizard forms (Page 1/2/3, ~40 fields across `AddCompanyPage`) and the Edit Agreement form's field grids                                                                                                                                                                     | Restyled at the container/chrome level (Topbar, glass-card wrappers, brand-coloured buttons) rather than every individual input; every field's `id`/label/behaviour is untouched                                                                              | Proportionate scope call: the shared chrome change (Sidebar/Topbar/tokens) delivers most of the visual-fidelity gain app-wide, while re-theming dozens of already-correct native inputs for marginal additional polish carried outsized regression risk for this pass |

### Notes on D80–D100

- D98–D100 were found during implementation, not the interview — each is a
  place where D93's new persistent Sidebar+Topbar chrome (present on every
  page for the first time) changed what an _existing_ Playwright test's
  unscoped locator matched, even though the feature it tested did not
  change. The fix in every case was scoping the test locator to the routed
  page content, never changing the app's behaviour to suit the test.
- All eighteen decisions were resolved in one grill-me interview against
  `figma_code/` before any implementation began (SPEC-14). Nine were pure
  codebase inspection (D91–D97 plus part of D80); the rest were genuine
  product/scope forks that only the user could resolve, most of them found
  by reading `figma_code/src/App.tsx` closely enough to notice where its
  own behaviour was itself a stub (D87's dead search box, D90's missing
  Acknowledge control) rather than assuming Figma's code was authoritative
  by default.
- **D84–D86 turned into the largest scope addition in this batch.** What
  looked like a pure restyle (SPEC-14) grew a small vertical slice of real
  backend work — two new endpoints — because the alternative (faking
  dashboard numbers, or an unauthenticated stats endpoint) was worse than
  either omitting the section or building it for real. Worth remembering
  for any future "just restyle it" request: check whether the target design
  shows _data_ the current system doesn't yet expose before agreeing the
  work is visual-only.

## SPEC-16 — Figma Design Revision v2 Alignment

Alignment of the application with a second Figma Make export
(`figma_code-v2/`). Unlike SPEC-14, this is **not** a restyle — it changes the
domain model, the master reference data and the wizard's field model. Full
detail, evidence and the phase plan in
`docs/specifications/SPEC-16-figma-v2-alignment.md` §0.

| #    | Decision                                | Choice                                                                                                                                                                                                                                           | Rationale                                                                                                                                                                                                                                                                                                                                                                   |
| ---- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D101 | Scheme enum                             | **Adopt all 7** — `NAPS`, `NATS`, `WILP`, `BVOC`, `DVOC`, `FLEXI`, `MSBTE`; `BOC_AND_DVOC` splits into `BVOC` + `DVOC`                                                                                                                           | v2's own guidelines give B.Voc 3 years vs D.Voc 2 years (genuinely different qualifications) and its dataset lists them separately. No data migration was needed — no seed or migration inserts `mou` rows                                                                                                                                                                  |
| D102 | Zone master                             | **Seed the 24 real zones**, replacing the five placeholders, with deterministic uppercase codes ≤10 chars                                                                                                                                        | v2's names are the real operating list, and SPEC-01 §11.1 required replacing the placeholders before go-live                                                                                                                                                                                                                                                                |
| D103 | `zone.code`                             | **Retained**, but no longer embedded in generated codes — becomes a stable internal/display code                                                                                                                                                 | Direct consequence of D109. The column is `NOT NULL UNIQUE`; dropping it buys nothing and risks the seed and reporting                                                                                                                                                                                                                                                      |
| D104 | Payroll item placement                  | **Stays at MOU level** on `payroll_config`; allowances/deductions are **not** nested per trainee category                                                                                                                                        | Preserves SPEC-06's domain model and the fixed-key invariant SPEC-07 and SPEC-13 read. Accepted cost: v2's per-category nesting is not reproduced                                                                                                                                                                                                                           |
| D105 | Payroll catalogue                       | **Replace** with v2's list: 8 fixed allowances + 15 fixed deductions + **one shared `OTHER` key** = 24 entries                                                                                                                                   | v2 has 25 checkbox labels, but "Other Allowance" and "Other Deduction" both map onto the single `OTHER` key — the box the user ticks preselects that row's `item_type`, which preserves the existing `(item_key = 'OTHER') = (custom_label IS NOT NULL)` CHECK                                                                                                              |
| D106 | Payroll input control                   | **Checkbox** (checked = applicable); all 23 fixed rows are still written per MOU with `is_applicable = false` when unchecked                                                                                                                     | Preserves SPEC-07 §4.3's "one row per fixed key even when unset". **Drops** SPEC-06 §4's "every item must have an explicit Yes or No" rule and its counter — a checkbox has no unanswered state                                                                                                                                                                             |
| D107 | New stored fields                       | `company.sector` (NOT NULL, CHECK, backfilled `OTHER`) plus `trainee_category.qualification`, `.stipend_rate`, `.trainee_count`                                                                                                                  | `sector` is marked required in v2; `stipend_rate` is money so `NUMERIC(12,2)` per D10; `trainee_count` is a non-negative integer                                                                                                                                                                                                                                            |
| D108 | Per-item sub-attributes                 | **Dedicated nullable columns**: `commercial_item.period` + `.basis`; `payroll_item.insurance_type` + `.insurance_gfs_amount` + `.insurance_mou_amount`                                                                                           | Keeps the one-row-per-key invariant, stays queryable in SQL for SPEC-13's export and SPEC-11's snapshot diff, and lets the two enumerable ones carry CHECK constraints. A JSONB blob would hide them from both                                                                                                                                                              |
| D109 | Company code                            | **Moves to the MOU.** `mou.generated_code` (unique, immutable, NOT NULL); `company.generated_code` dropped. Format `MOU-<SCHEME>-<YYYY>-<NNNN>`; counter re-keyed to `(scheme, year)`                                                            | A company running two schemes holds two agreements and so needs two codes — a company-level code could only name one. Removes `zone.code` from the format, which shrinks Q14's blast radius from high-risk to low                                                                                                                                                           |
| D110 | Purchase contact                        | **Add 3 nullable columns** on `company`: `purchase_name`, `purchase_number`, `purchase_email`. Confirm Purchase Email is validated but not stored                                                                                                | v2 does not mark these required, and the client's verified flow document has HR + Finance only. Confirmation-not-stored matches SPEC-04's existing pattern                                                                                                                                                                                                                  |
| D111 | Page 1 field order                      | **Adopt v2's order**: Scheme → Zone → Sector → Company Name → Company Type → Plant/Location → Registration Type → GST → TAN                                                                                                                      | Treats v2 as the newer client intent; SPEC-04 §2's "in diagram order" claim is rewritten accordingly                                                                                                                                                                                                                                                                        |
| D112 | User Manual page                        | **Static web content** at `/user-manual`, visible to **all** roles; no backend, no table. New 11th dashboard entry point plus a new "Operation" sidebar section                                                                                  | It is documentation prose, not domain data — a table or endpoint adds surface for no benefit                                                                                                                                                                                                                                                                                |
| D113 | Scheme guidelines content               | Lives in `@mou/domain` as a reference constant, served by `GET /api/enums`                                                                                                                                                                       | SPEC-01 §7 makes `/api/enums` the single source for every dropdown. Guidelines are scheme reference data, so they follow the same rule. Zero schema                                                                                                                                                                                                                         |
| D114 | Branding copy                           | **Adopt both** v2 strings: "company **AMS** registration" and footer "**Agreement Management System** v2.0"                                                                                                                                      | The app already renders that name in the sidebar and login (SPEC-14), so the footer was the last inconsistent string. Two strings, no domain rename — `mou` stays `mou` everywhere                                                                                                                                                                                          |
| D115 | Demo dataset                            | Seed **only the 120 fully-specified rows** — 65 companies, 120 MOUs, 19 zones, 6 schemes; skip the 113 rows with an empty plant name. Synthetic values for the `NOT NULL` columns                                                                | The 120-row subset has zero `(company, plant, scheme)` collisions so `mou_company_plant_scheme_uq` holds; the full 233 contains one duplicate. Explicitly demo data, never production, and excluded from `db:seed`, migrations and CI                                                                                                                                       |
| D116 | **Reverses D88.** Login page stat tiles | Live numbers now, backed by a new, deliberately unauthenticated `GET /api/public/stats` (`db/public-stats.ts`, `routes/public-stats.ts`) returning four coarse whole-portal counts: `totalCompanies`, `activeMou`, `expiringSoon`, `activeZones` | Explicit user instruction ("it should be wired to the backend") overriding D88's default-safe static copy. Kept narrow to limit the new exposure: reuses `fetchZoneSummary` (not `fetchDashboardSummary`), so `pendingReview` — internal draft-onboarding counts — is never exposed pre-authentication; no per-zone/per-company detail, no route wired with a session check |

### Notes on D101–D115

- **D109 is the decision with the widest blast radius**, and it is also the one
  that _reduces_ an existing risk: because `zone.code` no longer feeds the
  generated code, replacing a zone code after go-live can no longer orphan
  historical codes. Q14's content is closed; its authority is not — the client
  still has to sign the 24-zone list off.
- **D106 removes a rule the client originally asked for** (SPEC-06 §4's "every
  item must have an explicit Yes or No"). The checkbox model is v2's own
  design and carries no unanswered state, so the rule could not survive it.
  Flagged for confirmation during spec review.
- **D105's twelve deductions duplicate SPEC-01 §3's commercial charges** by
  label. Accepted as two deliberately separate lists; whether they should be
  de-duplicated is left as post-implementation cleanup.
- **The generated migrations had to be hand-edited before they would run
  against a populated database.** `drizzle-kit generate` emitted
  `ADD COLUMN … NOT NULL` for `company.sector` and `mou.generated_code`, which
  fails the moment a row exists, and it emitted no path at all for the 15
  payroll keys D105 retires or for the counter rows D109 invalidates. The
  shipped migrations add the columns nullable, backfill, then tighten; fold
  retired payroll keys into `OTHER` keeping the old name as the label rather
  than deleting captured amounts; clear the zone-keyed counter before
  re-keying it; and re-seed the counter from the backfilled MOUs so the next
  allocation cannot reuse a number. Worth remembering: "migration generated
  and hand-checked" has to include running it against a database that already
  has data, not only against the empty database CI builds.
