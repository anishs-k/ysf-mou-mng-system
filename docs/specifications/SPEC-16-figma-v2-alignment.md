# SPEC-16 — Design Revision v2 Alignment

**Depends on:** SPEC-01 (enums, data model, zone master, company code), SPEC-02
(auth, dashboard entry points, role matrix), SPEC-04 (Page 1), SPEC-05 (Page 2),
SPEC-06 (Page 3), SPEC-07 (view flow), SPEC-13 (search/export).
**Source:** `figma_code-v2/` — a second Figma Make export, diffed against
`figma_code/` on 2026-09-13. Full delta recorded in
`.agents/memory/2026-09-13.md`.
**Status:** decisions resolved through a grill-me interview, 2026-09-13 (§0).
Implementation not started.

> **This is not a SPEC-14-style restyle.** `figma_code-v2/src/index.css` is
> byte-identical to `figma_code/src/index.css`, so the design tokens do not
> change. What changes is the **domain**: the scheme enum, the zone master, the
> company-code format and ownership, four new stored fields, and the payroll
> item catalogue. Roughly 17 of v2's ~22 components are byte-identical to v1 and
> need no work at all; the change is concentrated in `App.tsx`'s wizard, its
> master data, and one new page.

---

## 0. Resolved decisions

Settled in a grill-me interview on 2026-09-13, each verified against the
implemented `src/` tree before being put to the user. Numbering continues
`docs/design/ADR.md` (D1–D100). These belong in `ADR.md` as well — not written
there yet, deliberately: this spec is the single reviewable artefact, and the
ADR index is updated only when the user asks (see §7).

| # | Decision | Choice | Rationale / verified evidence |
|---|---|---|---|
| D101 | Scheme enum | **Adopt all 7** — `NAPS`, `NATS`, `WILP`, `BVOC`, `DVOC`, `FLEXI`, `MSBTE`; `BOC_AND_DVOC` splits into `BVOC` + `DVOC` | v2's own guidelines give B.Voc 3 years vs D.Voc 2 years (genuinely different qualifications), and its 233-row dataset lists them separately. `NATS` is the largest group (96 rows). **No data migration needed** — verified: `BOC_AND_DVOC` appears in only 6 places (enum, `0000_init_schema.sql` CHECK, 2 test files, 2 build artefacts) and no seed or migration inserts `mou` rows |
| D102 | Zone master | **Seed the 24 real zones**, replacing the 5 placeholders, with deterministic uppercase codes ≤10 chars (§2.1) | v2's names are the real operating list. SPEC-01 §11.1 explicitly requires replacing the placeholders *before* go-live, and no `company` rows exist yet, so no historical code can be orphaned |
| D103 | `zone.code` | **Retained**, but no longer embedded in company codes; becomes a stable internal/display code | Direct consequence of D109. The column is `NOT NULL UNIQUE`; dropping it buys nothing and risks the seed and reporting |
| D104 | Payroll item placement | **Stays at MOU level** on `payroll_config`. Allowances/deductions are **not** nested per trainee category | Preserves SPEC-06's domain model and the `payroll_item_config_idx` / fixed-key invariant that SPEC-07 and SPEC-13 read. Accepted cost: v2's per-category nesting is not reproduced; Page 3 renders one set of items below the category list |
| D105 | Payroll catalogue | **Replace** with v2's list: 8 fixed allowances + 15 fixed deductions + **one shared `OTHER` key** = 24 catalogue entries | v2 has 25 checkbox labels, but two of them are "Other Allowance" and "Other Deduction". SPEC-01 §4's existing model has a single `OTHER` key with a user-chosen `item_type` and the CHECK `(item_key = 'OTHER') = (custom_label IS NOT NULL)`. Both checkboxes therefore map to `OTHER`, the clicked one preselecting `item_type` |
| D106 | Payroll input control | **Checkbox** (checked = applicable). All 23 fixed rows are still written per MOU with `is_applicable = false` when unchecked | Preserves SPEC-07 §4.3's "one row per fixed key even when unset" and SPEC-13's Commercial/Payroll sheets. **Drops** SPEC-06 §4's "every item must have an explicit Yes or No" rule and the "N of 22 answered" counter — a checkbox has no unanswered state |
| D107 | New stored fields | `company.sector` (NOT NULL, CHECK, backfilled `OTHER`) plus `trainee_category.qualification`, `.stipend_rate`, `.trainee_count` | `sector` is marked `required` in v2. `stipend_rate` is money, so `NUMERIC(12,2)` per D10; `trainee_count` is a non-negative integer |
| D108 | Per-item sub-attributes | **Dedicated nullable columns**: `commercial_item.period` + `.basis`; `payroll_item.insurance_type` + `.insurance_gfs_amount` + `.insurance_mou_amount` | Keeps the one-row-per-key invariant, stays queryable in SQL for SPEC-13's export and SPEC-11's snapshot diff, and lets the two enumerable ones carry CHECK constraints. A JSONB blob would hide them from both |
| D109 | Company code | **Moves to the MOU.** `mou.generated_code` (unique, immutable, NOT NULL); `company.generated_code` dropped. Format `MOU-<SCHEME>-<YYYY>-<NNNN>`. Counter rekeys to `(scheme, year)` | v2's data shape is one code per company+plant+scheme row, and 29 companies in the seed carry 2+ schemes — a company-level code could only name one of them. `MOU-` (4) + scheme (≤5 after D101) + `-YYYY-` (6) + `NNNN` (4) = 19 chars, inside `varchar(30)` |
| D110 | Purchase contact | **Add 3 nullable columns** on `company`: `purchase_name`, `purchase_number`, `purchase_email`. Confirm Purchase Email is validated but not stored | v2 does not mark these `required`, and the client's verified flow document (SPEC-04's source) has HR + Finance only. Confirmation-not-stored matches SPEC-04's existing Confirm Email pattern |
| D111 | Page 1 field order | **Adopt v2's order**: Scheme → Zone → Sector → Company Name → Company Type → Plant/Location → Registration Type → GST → TAN | Treats v2 as the newer client intent. SPEC-04 §2's "in diagram order" claim and its field numbering are rewritten accordingly |
| D112 | User Manual page | **Static web content** at `/user-manual`, visible to **all** roles, no backend, no table. New 11th dashboard entry point + a new "Operation" sidebar section | It is documentation prose, not domain data — a table or endpoint would add surface for no benefit. SPEC-02 AC6 changes from ten entry points to eleven |
| D113 | Scheme guidelines content | Lives in `@mou/domain` as a reference constant, served by `GET /api/enums` | SPEC-01 §7: "`/api/enums` is the single source the UI uses to build every dropdown… No dropdown in any later spec hardcodes its options." Guidelines are scheme reference data, so they follow the same rule. Zero schema |
| D114 | Branding copy | **Adopt both** v2 strings: "company **AMS** registration" and footer "**Agreement Management System** v2.0" | The app already renders "Agreement Management System" in `Sidebar.tsx:97` and `LoginPage.tsx:91,154` (SPEC-14), so the footer was the last inconsistent string. Two strings, no domain rename — `mou` stays `mou` in code, tables and specs |
| D115 | Demo dataset | Seed **only the 120 fully-specified rows** — 65 companies, 120 MOUs, 19 zones, 6 schemes. Skip the 113 rows with an empty plant name. Synthetic values for the `NOT NULL` columns | Verified: the 120-row subset has **zero** `(name, plant, scheme)` collisions, so `mou_company_plant_scheme_uq` holds. The full 233 contains 1 duplicate and 113 empty plants. 29 companies carry 2+ schemes, which usefully exercises the multi-MOU path. The 65 companies still need synthetic `gst_number`/`tan_number`/address values because those columns are `NOT NULL` — so this is **demo data, never production** |

### 0.1 Explicitly out of scope

- v2's `_AE` / `_EX` / `_XD` hardcoded expiry-date arrays and its status
  rotation. SPEC-01 §6.2 derives status from real dates; nothing may store it.
- v2's `MOU-<SCHEME>-<YYYY>-<NNNN>` sequence being globally numbered in the
  mockup. The real counter is per scheme per year (§3.3).
- The wizard's "Review & Save" step, whose content is static mock data in both
  v1 and v2 and is unchanged.
- The attendance-cycle calendar range picker on Page 2 — present in v1 too, so
  not a v2 change.
- Any change to the 16 commercial charge keys (SPEC-01 §3). Only the two new
  sub-attribute columns are added.

---

## 1. Scope

- The scheme enum, zone master and company-code changes (D101–D103, D109).
- The payroll catalogue and control change (D105, D106).
- The four new stored fields and six new sub-attribute columns (D107, D108).
- Page 1's reorder and its two new controls (D110, D111).
- The User Manual page, the 11th entry point and the new sidebar section (D112).
- Scheme guidelines served from `/api/enums` (D113) and two copy strings (D114).
- A demo seed of 65 companies / 120 MOUs (D115).

---

## 2. Master data changes

### 2.1 Zone master (D102)

The five provisional rows in `src/api/src/db/seed/zones.ts` are replaced by:

| # | Name | Code | # | Name | Code |
|---|---|---|---|---|---|
| 1 | Ahilya Nagar | `AHILYANGR` | 13 | Nashik | `NASHIK` |
| 2 | Assam | `ASSAM` | 14 | NCR Haryana | `NCRHARYANA` |
| 3 | Chennai | `CHENNAI` | 15 | NCR Noida | `NCRNOIDA` |
| 4 | Chiplun | `CHIPLUN` | 16 | Pune | `PUNE` |
| 5 | Coimbatore | `COIMBATORE` | 17 | Rajasthan | `RAJASTHAN` |
| 6 | Daman | `DAMAN` | 18 | Ranjangaon | `RANJANGAON` |
| 7 | Goa | `GOA` | 19 | Rudrapur | `RUDRAPUR` |
| 8 | Gujarat Sanand | `GJSANAND` | 20 | Sikkim | `SIKKIM` |
| 9 | Gujarat Vadodara | `GJVADODARA` | 21 | Solapur | `SOLAPUR` |
| 10 | Haridwar | `HARIDWAR` | 22 | Jamshedpur | `JAMSHEDPUR` |
| 11 | Karnataka | `KARNATAKA` | 23 | Kolhapur | `KOLHAPUR` |
| 12 | Madhya Pradesh | `MP` | 24 | Mumbai | `MUMBAI` |

Codes are unique, uppercase and ≤10 characters (satisfying `zone_code_upper_chk`
and the `varchar(10)` column). Zones absent from v2's list but present in v1's
derived list — Bharuch, Pithampur, Raigad, Ratnagiri, NCR, Haryana, Noida — are
**not** seeded; v1's list was derived from mock data, not authoritative.

> **Client confirmation still required.** This closes the *content* of Q14 but
> not its authority: `specindex.md` should record that the list is now sourced
> from the v2 design and still needs sign-off before go-live. Because D109
> removes `zone.code` from generated company codes, a later code change is now
> low-risk rather than high-risk — a material improvement to Q14's blast radius.

### 2.2 Scheme enum (D101)

`SCHEMES` becomes `["NAPS", "NATS", "WILP", "BVOC", "DVOC", "FLEXI", "MSBTE"]`
with labels `NAPS`, `NATS`, `WILP`, `B.Voc`, `D.Voc`, `FLEXI`, `MSBTE`.

`mou_scheme_chk` is regenerated. Existing `BOC_AND_DVOC` rows, if any exist in a
developer database, are not migrated — there is no defensible automatic mapping
between one combined value and two distinct ones, and no production data exists.
The dev database is reset instead.

### 2.3 Scheme guidelines (D113)

A new `SCHEME_GUIDELINES` constant in `@mou/domain`, keyed by `Scheme`, each with
`tagline`, `eligibility`, `duration`, `stipend` and `benefit`, reproduced from
v2's copy (7 entries). Served as part of `GET /api/enums` so the web app
hardcodes nothing, per SPEC-01 §7.

### 2.4 Sector list (D107)

A new `SECTORS` enum of 17 values: Automobile, Banking & Finance, Chemical,
Construction, Defence, Education, Electronics / IT, Engineering, FMCG,
Healthcare, Logistics, Manufacturing, Pharmaceutical, Power & Energy, Retail,
Textile, Other. Stored uppercase-snake in the database, mirrored by a CHECK
constraint, exactly as D11 requires.

### 2.5 Commercial period and basis (D108)

Two new enumerable lists, applied to every `commercial_item` row including
`OTHER` rows:

- `COMMERCIAL_PERIODS`: `MONTHLY`, `QUARTERLY`, `ONE_TIME`, `ANNUAL`
- `COMMERCIAL_BASES`: `FLAT`, `PER_TRAINEE_PER_MONTH`, `PRO_RATA`,
  `ON_PAYABLE_STIPEND`, `OTHER`

> v2's source labels contain two typos — `Pro data` and `On payble stipend`.
> The correct forms (`Pro-rata`, `On payable stipend`) are used here. Reproducing
> a typo in a stored enum value would be permanent.

### 2.6 Payroll item catalogue (D105)

| # | Key | Label | Item type |
|---|---|---|---|
| 1 | `ATTENDANCE_BONUS` | Attendance Bonus | ALLOWANCE |
| 2 | `ACCOMMODATION_ALLOWANCE` | Accommodation Allowance | ALLOWANCE |
| 3 | `CONVEYANCE` | Conveyance | ALLOWANCE |
| 4 | `HRA` | HRA | ALLOWANCE |
| 5 | `BONUS` | Bonus | ALLOWANCE |
| 6 | `NIGHT_SHIFT_ALLOWANCE` | Night Shift Allowance | ALLOWANCE |
| 7 | `EDUCATION_ALLOWANCE` | Education Allowance | ALLOWANCE |
| 8 | `INSURANCE` | Insurance | ALLOWANCE |
| 9 | `ADMISSION_DEDUCTION` | Admission Deduction | DEDUCTION |
| 10 | `ADVANCE` | Advance | DEDUCTION |
| 11 | `CANTEEN_DEDUCTION` | Canteen Deduction | DEDUCTION |
| 12 | `COUPON_AMOUNT` | Coupon Amount | DEDUCTION |
| 13 | `COURSE_REGISTRATION_FEE` | Course Registration Fee | DEDUCTION |
| 14 | `DOCUMENT_FEE` | Document Fee | DEDUCTION |
| 15 | `EDUCATION_FEE` | Education Fee | DEDUCTION |
| 16 | `EXAM_FEE` | Exam Fee | DEDUCTION |
| 17 | `INSURANCE_DEDUCTION` | Insurance Deduction | DEDUCTION |
| 18 | `JOINING_FEE_DEDUCTION` | Joining Fee Deduction | DEDUCTION |
| 19 | `LEFT_DEDUCTION` | Left Deduction | DEDUCTION |
| 20 | `SHOES_DEDUCTION` | Shoes Deduction | DEDUCTION |
| 21 | `SKILL_DIPLOMA_FEES` | Skill Diploma Fees | DEDUCTION |
| 22 | `TRANSPORTATION_DEDUCTION` | Transportation Deduction | DEDUCTION |
| 23 | `UNIFORM_DEDUCTION` | Uniform Deduction | DEDUCTION |
| 24 | `OTHER` | Other (custom label + amount) | user-selected |

23 fixed keys plus one shared `OTHER`. Every item answered No — or unchecked —
still produces a row (§3.4). `INSURANCE` (8) is the only key that carries the
insurance sub-model of D108.

> **Accepted duplication.** Twelve of these deduction labels also exist as
> SPEC-01 §3 commercial charges (Canteen Deduction, Coupon Amount, Document Fee,
> Joining Fee, Left Deduction, Skill Diploma Fees, Transportation Deduction,
> Shoes/Uniform Deduction, Insurance Deduction, Course Registration Fee,
> Education Fee, Exam Fee). This is not new: `DOCUMENT_FEE` already appears in
> both §3 and §4 by design, and the two lists describe different things — a
> charge billed to the company versus an amount recovered per trainee. Flagged
> so it is a recorded decision rather than a surprise in review.

---

## 3. Data model changes

Six new nullable columns, one NOT NULL column, one column dropped, one counter
rekeyed. One migration.

### 3.1 `company`

| Change | Column | Type | Notes |
|---|---|---|---|
| add | `sector` | `varchar(30)` NOT NULL | CHECK against §2.4; backfilled `OTHER` for existing rows |
| add | `purchase_name` | `varchar(150)` | nullable |
| add | `purchase_number` | `varchar(20)` | nullable |
| add | `purchase_email` | `varchar(255)` | nullable |
| **drop** | `generated_code` | — | moves to `mou` (D109) |

### 3.2 `mou`

| Change | Column | Type | Notes |
|---|---|---|---|
| add | `generated_code` | `varchar(30)` NOT NULL UNIQUE | immutable; §3.3 |

### 3.3 `company_code_counter` (D109)

Re-keyed from `(zone_id, year)` to `(scheme, year)`. Allocation keeps SPEC-01
§6.3's mechanism and its D7 trade-off unchanged — the same
`INSERT … ON CONFLICT DO UPDATE` in its own short transaction *before* the save
transaction opens, so gaps remain permitted:

```sql
INSERT INTO company_code_counter (scheme, year, last_value)
VALUES ($1, $2, 1)
ON CONFLICT (scheme, year)
DO UPDATE SET last_value = company_code_counter.last_value + 1
RETURNING last_value;
```

Format: `MOU-<SCHEME>-<YYYY>-<NNNN>`, e.g. `MOU-WILP-2026-0042`. `SCHEME` is the
scheme of the MOU being created; `YYYY` is the four-digit IST year from
`business_today()`. Values above 9999 render at natural width, as before.

> **Semantic note.** The code now identifies an *MOU*, not a company. A company
> with WILP and FLEXI agreements holds two codes. Every screen that previously
> showed "the company's code" now shows the code of the MOU in context.

### 3.4 `trainee_category`

| Change | Column | Type | Notes |
|---|---|---|---|
| add | `qualification` | `varchar(150)` | nullable |
| add | `stipend_rate` | `NUMERIC(12,2)` | nullable, `CHECK (stipend_rate >= 0)`; money-as-string per D10 |
| add | `trainee_count` | `integer` | nullable, `CHECK (trainee_count >= 0)` |

### 3.5 `commercial_item`

| Change | Column | Type | Notes |
|---|---|---|---|
| add | `period` | `varchar(20)` | nullable, CHECK against §2.5 |
| add | `basis` | `varchar(30)` | nullable, CHECK against §2.5 |

### 3.6 `payroll_item`

| Change | Column | Type | Notes |
|---|---|---|---|
| add | `insurance_type` | `varchar(10)` | nullable, CHECK `TOPUP` \| `RECOVERY` \| `BOTH`; populated only when `item_key = 'INSURANCE'` |
| add | `insurance_gfs_amount` | `NUMERIC(12,2)` | nullable, `CHECK (insurance_gfs_amount >= 0)` |
| add | `insurance_mou_amount` | `NUMERIC(12,2)` | nullable, `CHECK (insurance_mou_amount >= 0)` |

Constraint addition, so the sub-model cannot be half-written:

```sql
CHECK (
  item_key = 'INSURANCE'
  OR (insurance_type IS NULL AND insurance_gfs_amount IS NULL AND insurance_mou_amount IS NULL)
)
```

---

## 4. API and validation changes

### 4.1 `GET /api/enums`

Gains `sectors`, `commercialPeriods`, `commercialBases`, the 24-key
`payrollItems` catalogue and `schemeGuidelines`. Still the single source every
dropdown reads.

### 4.2 Validation modules (`@mou/domain`)

| Module | Change |
|---|---|
| `company-details-validation.ts` | `sector` required and must be a known value; `purchaseNumber` optional but, when present, follows the same Mobile/LAN branch as the HR and Finance numbers; `purchaseEmail` optional, valid format when present |
| `commercial-details-validation.ts` | `period` and `basis` optional, but each must be a known value when present; the existing "Other row needs all fields" rule extends to the two new columns |
| `payroll-details-validation.ts` | Rewritten around the 24-key catalogue. Every fixed key is answered by its checkbox — an unchecked key is `is_applicable = false`, **not** an error. `INSURANCE` requires `insurance_type`, and requires `insurance_gfs_amount` when the type includes top-up and `insurance_mou_amount` when it includes recovery. The "all items answered" rule and the answered-count are removed |

### 4.3 Final save (`POST /api/companies`)

- Allocates the MOU code (§3.3) **before** the transaction opens, as today.
- Writes `mou.generated_code` instead of `company.generated_code`.
- Writes `company.sector`, the three purchase columns, the three new
  `trainee_category` columns, `commercial_item.period`/`basis`, and the
  insurance columns.
- Derives 23 fixed `payroll_item` rows plus one row per `OTHER` entry, with
  `is_applicable` from the checkbox state.

### 4.4 Edit Agreement (`PUT /api/mous/:mouId`)

The editable payload gains `period`/`basis` per commercial item, the three
insurance fields, and the three new trainee-category fields. `generated_code` is
**not** editable — SPEC-10 §4 already forbids editing it, and that rule now
attaches to the MOU rather than the company. The `sameDerivedRows` comparison
extends to the new columns so AC12 ("no changes to apply") stays honest.

### 4.5 Read paths

`db/mou-view.ts`, `db/search.ts`, `db/zone-dashboard.ts`, `db/mou-edit.ts` and
`db/export-builder.ts` are updated to select `mou.generated_code` in place of
`company.generated_code` and to carry the new columns. SPEC-13's search-by-code
matches `mou.generated_code`.

---

## 5. UI changes

### 5.1 Wizard Page 1 (D107, D110, D111)

Basic Information, in v2's order: **Scheme** (with an `i` button revealing the
guidelines panel from §2.3), **Zone**, **Sector**, **Company Name**,
**Company Type**, **Plant / Location**, **Registration Type**, **GST Number**,
**TAN Number**. Contact Information gains a Purchase block (Name, Number, Email,
Confirm Email) last, all optional.

### 5.2 Wizard Page 2 (D108)

The charge row grows from 4 to 5 columns: charge select, amount, **period**,
**basis**, Remove. The single combined frequency dropdown is retired.

### 5.3 Wizard Page 3 (D105, D106)

Scheme select at the top; the repeatable trainee-category list with its three
new inputs (Qualification, Stipend Rate, Trainee Count); then **one** set of
payroll items below the categories — 8 allowance checkboxes and 15 deduction
checkboxes, each revealing an amount box, plus "Other Allowance" and "Other
Deduction" entries that add repeatable label+amount rows. Checking `Insurance`
reveals the type radio (Top Up (GFS) / Recovery (MOU) / Both) and its
conditional amount boxes. The "N of 22 answered" counter and the
disabled-until-complete Save rule are removed; Save is enabled once the page's
other rules pass.

### 5.4 Existing Company (D101)

Gains a **Scheme** filter beside the existing Zone and Status filters, filtering
the list client-side and cleared by the Clear button. The scheme dropdown on the
commercial page now lists the schemes the company actually holds from the
7-value enum.

### 5.5 User Manual (D112)

New `/user-manual` route inside `AppShell`, a new `UserManualPage` component
with a 12-section table of contents and scroll-to-section navigation, and a new
`Ic.book` icon. `DASHBOARD_ENTRY_POINTS` gains an 11th entry (`user-manual`,
"User Manual"), visible to every role, and the sidebar renders it under a new
orange **Operation** section header — which requires `navItems` to accept
section separators.

### 5.6 Copy (D114)

`LoginPage`: "company MOU registration" → "company AMS registration"; footer
"Company MOU Management System v2.0" → "Agreement Management System v2.0".

---

## 6. Implementation phases

Each phase ends green before the next begins, per
`.agents/workingrules.md`.

### Phase A — Domain, schema and migrations
1. `enums.ts`: 7 schemes, `SECTORS`, `COMMERCIAL_PERIODS`, `COMMERCIAL_BASES`,
   `INSURANCE_TYPES`, `SCHEME_GUIDELINES`.
2. `commercial-items.ts` / `payroll-items.ts`: new 24-key payroll catalogue.
3. `company-code.ts`: `formatCompanyCode(scheme, year, sequence)`.
4. `schema.ts`: every change in §3; migration generated and hand-checked.
5. `seed/zones.ts`: the 24 rows of §2.1.
6. Unit tests updated: `catalogues.test.ts` (24 entries, 7 schemes),
   `company-code.test.ts` (new format), `mou-rules.test.ts` (unchanged).
7. Integration tests for the new constraints, including the §3.6 insurance
   CHECK and the re-keyed counter's concurrency guarantee.

### Phase B — API, validation and read paths
1. `/api/enums` payload (§4.1).
2. The three validation modules (§4.2).
3. Final save (§4.3) and Edit Agreement (§4.4).
4. Read paths (§4.5) — `mou-view`, `search`, `zone-dashboard`, `mou-edit`,
   `export-builder`.
5. Integration tests: blank-vs-unchecked payroll rows, insurance type/amount
   coupling, sector required, purchase optional, period/basis optional,
   scheme-split code allocation, search by MOU code.

### Phase C — Wizard UI
1. `Page1.tsx`: reorder, Sector, Scheme + guidelines panel, Purchase block.
2. `Page2.tsx`: 5-column charge row.
3. `Page3.tsx`: 24-key checkbox model, insurance block, counter removed.
4. `AddCompanyPage.tsx`: draft payload and submit shape.
5. Playwright: `wizard.spec.ts` fixtures updated (Page 3's
   `getByRole("radio", { name: "No" })` helper becomes checkbox interaction).

### Phase D — Other screens, User Manual, copy
1. `ExistingCompanyPage.tsx`: scheme filter.
2. `icons.tsx`: `Ic.book`. `entry-points.ts`: 11th entry.
3. `Sidebar.tsx`: `NavEntry` section support + Operation header.
4. `App.tsx`: `/user-manual` route.
5. New `UserManualPage.tsx`.
6. `LoginPage.tsx`: two strings.
7. Playwright: `dashboard.spec.ts` count 10 → 11; `existing-company.spec.ts`
   scheme filter; new `user-manual.spec.ts`.

### Phase E — Demo seed and full verification
1. `db/seed/demo.ts` + an `npm run db:seed:demo` script, separate from
   `db:seed`, never wired into migrations or CI. 65 companies, 120 MOUs,
   synthetic values for the `NOT NULL` columns, `sector` distributed across the
   §2.4 list, and payroll rows derived from the catalogue so every MOU satisfies
   the invariants.
2. Full pipeline: `build`, `check-types`, `lint`, unit, integration (uncached)
   and the full Playwright suite.

---

## 7. Amendments required to existing specs

**Applied.** Each row below has been edited into the named spec, with every
amendment marked inline and, where a superseded rule is kept for auditability
(SPEC-01 §4's catalogue, §6.3's old code format, §11.1's placeholder zones),
struck through or labelled rather than silently deleted. Decisions D101–D115
have also been recorded in `docs/design/ADR.md`.

Two further amendments were needed that this table did not originally list,
both consequences of D109: SPEC-03 §4 step 3 (the code is generated for the
`mou` row, not the company) and SPEC-10 (the immutable code is
`mou.generated_code`, and Page 3's "Yes/No answer" is now a checkbox per D106).

Still outstanding and **not** applied: the pre-existing drift from D4 and D8 —
SPEC-03, SPEC-05, SPEC-07, SPEC-08, SPEC-10 and SPEC-12 still describe the
superseded `is_current` column and, in SPEC-03's case, the
`commercial_detail` / `commercial_other_item` tables. That predates this spec
and is recorded in `docs/implementation_plan.md` under "Known gaps carried
forward". SPEC-05's own `commercial_detail` reference was corrected here
because the same paragraph was being amended for D108.

| Spec | Change required |
|---|---|
| SPEC-01 §2.4 | Scheme list 4 → 7; `BOC_AND_DVOC` → `BVOC` + `DVOC` |
| SPEC-01 §2 | Add `SECTORS`, `COMMERCIAL_PERIODS`, `COMMERCIAL_BASES`, `INSURANCE_TYPES` |
| SPEC-01 §3 | `commercial_item` gains `period` + `basis` |
| SPEC-01 §4 | Catalogue replaced by §2.6's 23 fixed keys + `OTHER` |
| SPEC-01 §5.2 | `company.generated_code` dropped; `sector` + 3 purchase columns added |
| SPEC-01 §5.4 | `mou.generated_code` added |
| SPEC-01 §5.7 | `trainee_category` gains 3 columns |
| SPEC-01 §5.8 | `payroll_item` gains 3 insurance columns |
| SPEC-01 §5.13 | `company_code_counter` re-keyed to `(scheme, year)` |
| SPEC-01 §6.3 | Format → `MOU-<SCHEME>-<YYYY>-<NNNN>`; AC3 rewritten |
| SPEC-01 §11.1 | Zone seed replaced by §2.1; Q14 partially closed |
| SPEC-02 §3.1, §3.3 | Entry points 10 → 11; User Manual added to the matrix for all roles; AC6 updated |
| SPEC-04 §2, §4 | Field order (D111); Sector required; purchase fields optional; AC1–AC10 renumbered |
| SPEC-05 §2, §3 | Charge row gains `period` + `basis` |
| SPEC-06 §3.3, §4 | Checkbox model; 24-key catalogue; "all answered" rule and counter removed; AC2, AC4, AC7, AC9 rewritten |
| SPEC-07 §2, §6 | Scheme filter added; code shown is the MOU's |
| SPEC-13 §2.1, §3.2 | Search by `mou.generated_code`; Commercial sheet gains period/basis; Payroll sheet gains insurance columns |
| `specindex.md` | New SPEC-16 entry; Q14 note updated |

---

## 8. Acceptance criteria

### Schema and domain
1. `GET /api/enums` returns 7 schemes, 17 sectors, 4 periods, 5 bases and a
   24-entry payroll catalogue, each with label, item type and display order.
2. A `mou` with an unknown scheme is rejected by `mou_scheme_chk`.
3. A `company` with an unknown `sector` is rejected; a `company` with no
   `sector` is rejected (NOT NULL).
4. A `payroll_item` with `item_key = 'INSURANCE'` and a `insurance_gfs_amount`
   but no `insurance_type` is rejected by the §3.6 CHECK.
5. A non-`INSURANCE` `payroll_item` carrying any insurance column is rejected.
6. `commercial_item.period` and `.basis` accept only the §2.5 values; both
   accept NULL.
7. `trainee_category.stipend_rate` and `.trainee_count` reject negatives.
8. 50 parallel allocations for one `(scheme, year)` yield 50 distinct values.
9. `formatCompanyCode('WILP', 2026, 42)` is `MOU-WILP-2026-0042`; sequence 10000
   renders `MOU-WILP-2026-10000`.
10. A second active `mou` for the same `(company_id, company_plant_id, scheme)`
    is still rejected.
11. The zone seed inserts 24 rows and is idempotent on re-run.

### Wizard
12. Page 1 renders Scheme first and Sector is required; leaving Sector empty
    blocks Next.
13. Selecting a scheme reveals its guidelines panel with all five fields.
14. The Purchase block is optional — leaving all four inputs empty still allows
    Next, but a filled Purchase Email that disagrees with Confirm Purchase Email
    blocks Next.
15. Page 2's charge row renders period and basis; a charge saved with a period
    and no basis persists `period` set and `basis` NULL.
16. Page 3 renders 8 allowance and 15 deduction checkboxes plus the two Other
    entries; saving with **nothing** checked succeeds and writes 23
    `payroll_item` rows, all `is_applicable = false`.
17. Checking Insurance with type "Both" requires both amounts; with type
    "Top Up (GFS)" requires only the GFS amount.
18. Saving writes exactly 23 fixed rows plus one row per Other entry.
19. The generated code appears on the success screen in
    `MOU-<SCHEME>-<YYYY>-<NNNN>` form and matches the MOU's scheme.
20. A company onboarded twice with two different schemes holds two MOUs with two
    different codes.

### Other screens
21. Existing Company filters by scheme, and Clear resets it.
22. The commercial page's scheme dropdown lists only schemes the company holds.
23. `/user-manual` renders 12 sections and is reachable by ADMIN, DATA_ENTRY and
    VIEWER alike.
24. The sidebar shows the Operation section and the User Manual entry.
25. Dashboard Home renders 11 entry points.
26. Login shows "company AMS registration" and the
    "Agreement Management System v2.0" footer.

### Demo seed
27. `npm run db:seed:demo` inserts 65 companies and 120 MOUs across 19 zones and
    6 schemes, and is idempotent.
28. No seeded MOU violates `mou_company_plant_scheme_uq`, and every seeded
    company satisfies the `NOT NULL` constraints.
29. Every seeded MOU has 23 fixed `payroll_item` rows.
30. `db:seed:demo` is not referenced by `db:seed`, any migration, or CI.

---

## 9. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | Dropping `company.generated_code` breaks every screen and query that reads it | Phase B enumerates all five read paths; SPEC-13's search-by-code is the only one with its own acceptance criterion |
| R2 | The 120-row seed's synthetic GST numbers could be mistaken for real records | Seed script is separate, named `demo`, documented as non-production, and excluded from migrations and CI (AC30) |
| R3 | SPEC-06's "all answered" removal weakens a rule the client asked for | D106 is recorded; the checkbox model is v2's own design and the client should confirm it during spec review |
| R4 | Twelve payroll deductions duplicate SPEC-01 §3 commercial charges | Accepted in D105 and recorded in §2.6. Reviewers should confirm the two lists are meant to stay separate |
| R5 | `zone.code` is now display-only, which may confuse future readers | D103 records it; the column's comment in `schema.ts` is updated to say so |
| R6 | Seven schemes where the client's flow document listed four | D101 records the evidence; the wizard's dropdown is the single place the enum surfaces to users |

---

## 10. Open items

| # | Item | Blocks | Owner |
|---|---|---|---|
| O1 | Confirm the 24 zone names and their derived codes | Zone seed go-live (not implementation) | Client |
| O2 | Confirm the 7-scheme enum, in particular that NAPS and NATS are both live | Implementation of Phase A | Client |
| O3 | Confirm the 17-value Sector list is complete | Phase A | Client |
| O4 | Confirm that the checkbox model replacing Yes/No is intended, given SPEC-06's original rule | Phase C | Client |
| O5 | Decide whether the 12 duplicated deduction labels should be de-duplicated against SPEC-01 §3 | Post-implementation cleanup | Client + architect |
