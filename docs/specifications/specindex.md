# Index of Specification Documents for MOU management system
This is index of specification documents of MOU management system. 

The index format is 
- `<relative document path>` : \{\{short 2-3 lines description of document content\}\}

## How to use this file
- Use this file to determine which specification documents to load. 
- Do not load all specification documents every time.
- Update the index whenever you add a new specification document. 

## Specification Document Index

Specs are numbered in implementation order. Later specs assume the ones before
them exist. `SPEC-01` is mandatory for everything; `SPEC-03` must precede
`SPEC-04`, `SPEC-05` and `SPEC-06`.

- `./SPEC-01-foundation-and-master-data.md` : All enums and master reference lists, the complete data model, zone/plant master data, and the shared derived rules (MOU end date, MOU status, generated company code). Every other spec references it.
- `./SPEC-02-auth-and-dashboard.md` : Login, logout, session handling and rate limiting, plus the Dashboard Home screen with entry points to both main flows and all eight extra features, and the role visibility matrix.
- `./SPEC-03-add-company-wizard-framework.md` : The Add New Company wizard shell — 3-step navigation, Back/Cancel, draft persistence across refresh, and the single all-or-nothing final save transaction. Contains no fields itself.
- `./SPEC-04-wizard-page1-company-details.md` : Wizard Page 1 — company identity, address block, HR and Finance contacts, the shared Mobile/LAN contact-type branch, and TAN/GST/PIN/email validation.
- `./SPEC-05-wizard-page2-commercial-details.md` : Wizard Page 2 — MOU start date and tenure, signed MOU PDF upload, attendance cycle and stipend date, the 16 fixed charge amounts and repeatable "Other" rows.
- `./SPEC-06-wizard-page3-payroll-and-save.md` : Wizard Page 3 — scheme selection, trainee categories, the Yes/No + amount answer for all 23 payroll items, then automatic code generation and final save. Completes the Add New Company flow.
- `./SPEC-07-existing-company-view.md` : The read-only 3-page Existing Company flow — Zone/Company overview, scheme-wise commercial details with MOU status and Print, and the payroll view split into allowances and deductions.
- `./SPEC-08-mou-expiry-alerts.md` : The 30/60/90-day MOU expiry alert rule, the daily scheduled job with missed-day catch-up, the alert list screen with acknowledgement, and the dashboard count badge.
- `./SPEC-09-upload-mou-pdf.md` : The standalone Zone → Company → Plant → Scheme → Upload path for attaching an MOU PDF after creation, with shared PDF validation and authenticated document download.
- `./SPEC-10-edit-agreement.md` : Reason-gated amendment of a saved MOU — reason dropdown with mandatory proof upload for "Communication from HR", the editable field scope, the change review screen, version bump and history snapshot.
- `./SPEC-11-agreement-history.md` : Read-only, append-only audit view of past agreement versions — version list with reason, editor and proof, full snapshot detail, and version-to-version comparison.
- `./SPEC-12-zone-wise-dashboard.md` : Zone-grouped summary of companies, plants and MOUs by derived status, the zone × scheme matrix, filters and drill-down into the underlying records.
- `./SPEC-13-search-and-exports.md` : Search by Company/Plant/Scheme, Excel export as a four-sheet workbook, and PDF export scoped to All Zones or a single company. All three share one filter and query layer.
- `./SPEC-14-figma-ui-replication.md` : Visual-only restyle of every already-implemented page to match the `figma_code/` Figma export pixel-for-pixel, plus the small new read-only Dashboard KPI/Recent-Activity endpoints that restyle alone cannot honestly provide. Changes no route, data model or interaction pattern.
- `./SPEC-15-deferred-ui-features.md` : Not implemented. Holds the "Remember Me" and "Forgot Password" login controls SPEC-14 renders but leaves inert, and the open design questions for building them for real later.
- `./SPEC-16-figma-v2-alignment.md` : **Implemented** (Phases A–E). Aligns the application with the second Figma export (`figma_code-v2/`). Unlike SPEC-14 this is **not** a restyle — it changes the domain: the scheme enum goes 4 → 7 (BOC_AND_DVOC splits into BVOC + DVOC, NAPS + NATS added), the zone master is replaced with 24 real zones, the company code moves from `company` to `mou` and becomes `MOU-<SCHEME>-<YYYY>-<NNNN>`, the payroll catalogue becomes 23 fixed keys + `OTHER`, and four new fields (Sector, Qualification, Stipend Rate, Trainee Count) plus six sub-attribute columns are added. Also adds the User Manual page and a demo seed of 65 companies / 120 MOUs. Decisions D101–D115 in its §0; §7 lists the amendments it forces on SPEC-01–SPEC-13.
- `./SPEC-17-figma-v3-alignment.md` : Design Revision v3 Alignment. Standardizes casing from all-caps `MOU` to mixed-case `MoU` across UI text, labels, export reports, and user manual. Updates scheme labels `BVOC`/`DVOC` to `BVoc`/`DVoc`, category insurance key to `insuranceMoU`, and updates registered trademark logo asset. Floating AI assistant feature marked out of scope.
- `./SPEC-18-figma-v3-ui-completion.md` : Figma v3 UI Layout and Component Alignment. Delivers exact layout fidelity: grouped Sidebar with "Operation" / "User Manual" section, UserManualPage with sticky TOC and 12 guide sections, 3-tier Dashboard (interactive KPI drill-down, 1/3 Quick Actions + 2/3 Recent Activity, bottom Expiring MoUs banner), and 3-band Expiry Alert cards.

## Open Decisions Flagged Across Specs

Each is marked `DECISION-PENDING` inline with a working default so implementation
is not blocked. Question numbers refer to `docs/project_information.md` §12.

| Q | Topic | Default taken | Spec |
|---|---|---|---|
| 1 | "No" branch on payroll items | Skips that item's amount box only, not the remaining items | SPEC-06 §2 |
| 2 | Generated code format | `<ZONE_CODE>-<YY>-<NNNN>` | SPEC-01 §6.3 |
| 3 | MOU tenure unit | Number + MONTHS/YEARS selector, MONTHS default | SPEC-01 §6.1 |
| 4 | Allowance vs deduction split | All 23 are allowances except Document Fee and Registration Fee | SPEC-01 §4 |
| 5 | Zone free text or master | Master table dropdown everywhere | SPEC-01 §7 |
| 6 | Plants per company | Many; the wizard creates the first | SPEC-01 §5.3 |
| 7 | User roles | ADMIN / DATA_ENTRY / VIEWER | SPEC-01 §2.9, SPEC-02 §3.3 |
| 8 | Edit Agreement scope | Commercial and payroll only; company identity and scheme locked | SPEC-10 §4 |
| 9 | Expiry alert channel | In-app; email behind a flag, off by default | SPEC-08 §6 |
| 10 | Print coverage | Page 1 + Page 2; full record via Export PDF | SPEC-07 §4.4 |
| 11 | Company uniqueness | GST unique globally; name + plant unique within zone | SPEC-04 §4 |
| 12 | "Other" rows | Repeatable, in both commercial and payroll | SPEC-01 §5.5, §5.8 |
| 13 | Gap-free company codes? | Gaps allowed for now — **client to confirm** | SPEC-01 §6.3 |
| 14 | Real zone names + short codes | Provisional seed (North/South/East/West/Central) — **client to confirm before go-live**. SPEC-16 D102 replaces this with 24 real zones and derived codes, and D109 removes `zone.code` from generated company codes, so a later change is now low-risk rather than high-risk | SPEC-01 §11.1, SPEC-16 §2.1 |

## Resolved Technical Decisions

Settled during the SPEC-01 design review and recorded in full in SPEC-01 §0.
They apply repo-wide, not only to SPEC-01, and belong in `docs/design/ADR.md`.

PostgreSQL · Drizzle ORM · `@mou/domain` (layer 0) → `@mou/api` / `@mou/web` ·
one live MOU row with JSON history (no `is_current`) · `end_date = start + tenure − 1 day`
as a generated column · Asia/Kolkata business clock · UUID v4 keys ·
`NUMERIC(12,2)` stored, string in TypeScript · varchar + CHECK enums ·
soft delete with `ON DELETE RESTRICT` · pure unit tests plus uncached
docker-compose integration tests.

SPEC-01 §10 lists the edits these decisions force on SPEC-03, 05, 07, 08, 10, 12 and 13.
