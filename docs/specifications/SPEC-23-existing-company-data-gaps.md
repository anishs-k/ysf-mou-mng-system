# SPEC-23 — Existing Company: PF / ESI / TDS, Company Documents and the Record PDF

**Amends:** SPEC-01 §4 / SPEC-16 (payroll catalogue: 23 → 26 fixed items), SPEC-06 §3 (how PF, ESI and TDS are answered), SPEC-07 (the Payroll and Documents tabs, and what the Export PDF button opens), SPEC-22 §3 (three more payroll columns and their cell formats, D141 — withdrawn by D152, see §2.6).
**Depends on:** SPEC-06, SPEC-07, SPEC-09 (upload validation and storage), SPEC-10 / SPEC-11 (edit and history show payroll answers), SPEC-13 (exports), SPEC-19 / SPEC-21 (zone scope).
**Source:** client instruction, 2026-10-20 — the finalised Existing Company UI design, plus the client's answers: PF / ESI are a percentage **of the stipend**, stored and shown only (no calculation); TDS is one of two fixed options; GST and Registration certificates are **company-level** documents.
**Decisions:** D142–D148 in `docs/design/ADR.md` (D148, 2026-10-20, replaces the no-backfill rule of D144).

---

## 1. Scope

The finalised Existing Company design was checked field by field against the schema and the APIs. Overview, Commercial and History are already fully backed — the "Expiring" status and the MoU Code / Expires fields on Overview were already derived in the web app. Three gaps are closed here:

1. **PF, ESI and TDS** do not exist as payroll items, and the payroll model holds only rupee amounts — it cannot hold a percentage or a fixed text answer (§2).
2. **GST Certificate and Registration Certificate** have nowhere to live — `mou_document` holds only the MoU PDF and belongs to an MOU, not a company (§3).
3. **Export PDF** on the record opens SPEC-07's Print, which by design omits payroll. A full, designed record PDF is added (§5).

The "Expiring" rule moves into `@mou/domain` so the PDF and the web app cannot disagree (§4). Its behaviour does not change.

Out of scope: computing PF / ESI / TDS amounts, deleting or replacing documents, documents of any other type.

## 2. PF, ESI and TDS (D142–D144)

### 2.1 Catalogue

Three fixed payroll items are added, all **DEDUCTION**, listed after Uniform Deduction and before Other:

| Key | Label | Value kind | Answer |
|---|---|---|---|
| `PF` | Provident Fund (PF) | `PERCENT` | Yes with a percentage, or No |
| `ESI` | ESI | `PERCENT` | Yes with a percentage, or No |
| `TDS` | TDS | `STATUS` | **As applicable** or **Not applicable** |

Every payroll item now has a **value kind** in the catalogue; all 23 existing items are `AMOUNT`. The value kind belongs to the item, not to the row (D143), and `/api/enums` serves it with each payroll item.

### 2.2 Storage — no new columns (D143)

- `PERCENT`: the percentage is stored in `payroll_item.amount`, e.g. `12.00`. It is a percentage **of the stipend**, stored and displayed only — nothing is calculated from it (D142).
- `STATUS` (TDS): `is_applicable = true` means "As applicable", `false` means "Not applicable". `amount` is always NULL.
- Migration `0013` changes CHECK constraints only:
  - `payroll_item_key_chk` accepts the three new keys.
  - `payroll_item_applicable_amount_chk` becomes `NOT is_applicable OR amount IS NOT NULL OR item_key = 'TDS'`.
  - New `payroll_item_percent_chk`: `item_key NOT IN ('PF', 'ESI') OR amount <= 100`.
  - New `payroll_item_status_chk`: `item_key <> 'TDS' OR amount IS NULL`.

### 2.3 Validation

| Value kind | Yes / As applicable | No / Not applicable |
|---|---|---|
| `AMOUNT` | Unchanged: an amount up to 9,999,999.99, at most 2 decimals | Amount ignored |
| `PERCENT` | Required: 0 to 100, at most 2 decimals | Amount ignored |
| `STATUS` | No amount | No amount |

SPEC-06 AC2 still holds: every fixed item, the three new ones included, needs an explicit answer.

### 2.4 Display

One shared formatter in `@mou/domain` is used by the web app, the Excel export and both PDFs:

| Value kind | Shown as |
|---|---|
| `AMOUNT` | `₹ 1500.00/mo` — payroll amounts are monthly (D142). PDFs print `Rs. 1500.00/mo`: the standard PDF font has no ₹ glyph |
| `PERCENT` | `12%` (and "of stipend" where there is room for a note) |
| `STATUS` | `As applicable` / `Not applicable` |

- **Wizard Page 3:** does **not** ask for PF, ESI or TDS (D148). The server saves the statutory defaults — **PF 12%, ESI 0.75%, TDS As applicable** — and the Review step shows them. **Edit Agreement** lists all three, pre-filled: PF and ESI ask Yes / No and then take a percentage with a `%` suffix; TDS shows As applicable / Not applicable in place of Yes / No.
- **Payroll view** (`GET /api/mous/:mouId/payroll`): each row now carries `valueKind` and `isApplicable`, and `amount` is null for TDS and for any item not answered Yes. Other items still appear only when applicable. **PF, ESI and TDS are always listed** under Deductions (amended 2026-10-20): `12%` / `As applicable` when answered, `Not applicable` when answered No, and `Not recorded` (`isApplicable: null`) when the MOU holds no answer.
- **History and compare** (SPEC-11): PF / ESI read `Yes (12%)`; TDS reads `As applicable` / `Not applicable`.

### 2.5 Existing MOUs (D144)

**Default backfill (D148).** Migration `0015` inserts the defaults (PF 12%, ESI 0.75%, TDS As applicable) for every payroll config that lacks a PF, ESI or TDS row; it never changes a row that exists. Edit Agreement loads a still-missing row as its default too, and the payroll view keeps "Not recorded" only as a safety net. No `agreement_history` row is written for the backfill — it is not an edit.

### 2.6 Bulk upload (amends SPEC-22 §3, D141)

> **Superseded 2026-10-21 (D152).** The bulk sheet has no PF, ESI or TDS column:
> every row is saved with the §2.5 defaults (PF 12%, ESI 0.75%, TDS As applicable),
> and such a column in an older template is ignored. The text below is kept as the
> record of the earlier rule.

Three more payroll columns: **Payroll: Provident Fund (PF)**, **Payroll: ESI**, **Payroll: TDS**.

| Column | Accepted |
|---|---|
| PF, ESI | Blank = the default (PF 12%, ESI 0.75%). `No` = not applicable. `12` or `12%` = Yes, 12 percent. `Yes` alone is an error |
| TDS | Blank = the default, As applicable. `Yes` or `As applicable` = As applicable. `No` or `Not applicable` = Not applicable. Anything else is an error |

## 3. Company documents (D145)

### 3.1 Table `company_document`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `company_id` | uuid FK → company, NOT NULL | ON DELETE RESTRICT; indexed |
| `document_type` | varchar(30) NOT NULL | CHECK in `GST_CERTIFICATE`, `REGISTRATION_CERTIFICATE` |
| `file_path` | text NOT NULL | Relative to `UPLOAD_ROOT`: `company/<companyId>/<id>.<ext>`, never built from the filename |
| `original_filename` | varchar(255) NOT NULL | |
| `mime_type` | varchar(50) NOT NULL | The type the bytes proved |
| `file_size_bytes` | bigint NOT NULL | |
| `uploaded_at` | timestamptz NOT NULL | default now() |
| `uploaded_by` | uuid FK → user, NOT NULL | |

Document type labels: **GST Certificate**, **Registration Certificate**.

### 3.2 Endpoints

All three are zone-scoped like every company route: an out-of-zone id answers like an unknown one (SPEC-19).

| Route | Who | Does |
|---|---|---|
| `GET /api/companies/:id/documents` | any signed-in role | The company's documents, newest first: `id, documentType, originalFilename, mimeType, fileSizeBytes, uploadedAt, uploadedByUsername` |
| `POST /api/companies/:id/documents` | ADMIN, DATA_ENTRY | Multipart `file` + `documentType`. 201 with the new row; 422 on a bad type, a bad file or a failed scan |
| `GET /api/company-documents/:documentId` | any signed-in role | Streams the file inline with its stored mime type |

Upload rules, as SPEC-09:
- **10 MB** limit.
- The file must be a **PDF, JPEG or PNG**, proved by its first bytes (`%PDF`, `FF D8 FF`, `89 50 4E 47`) and not by the browser's claim.
- `VIRUS_SCAN_COMMAND` runs when it is configured.
- Every upload **adds** a row and replaces nothing, so an older certificate stays downloadable.

### 3.3 Documents tab (amends SPEC-07)

- Two groups: **MoU Documents** (unchanged, the selected MoU's PDFs) and **Company Documents** (the company's certificates, each with its type label).
- Every row shows its file name, size (KB / MB) and upload date, with a download link.
- For ADMIN / DATA_ENTRY, Company Documents has an **Upload Document** control: a type dropdown, a file picker and Upload.

## 4. Display status in `@mou/domain` (D146)

`displayMouStatus(status, endDate, today)` moves from `web/src/ui/format.ts` into `@mou/domain`, unchanged: an ACTIVE MoU whose end date is 0–90 days away is **Expiring**, otherwise the stored status label. The web formatter delegates to it, and the record PDF uses it.

## 5. Record PDF — `GET /api/mous/:mouId/record.pdf` (D147)

- Any signed-in role, zone-scoped, 404 for an unknown or inactive MoU. Served `application/pdf`, inline, named `<MoU code>.pdf`.
- The record view's **Export PDF** button opens this route.
- `/api/mous/:mouId/print` stays as SPEC-07 §4.4 defines it (Page 1 + Page 2 only).

Layout (A4 portrait, pdfkit):

1. **Header band** (navy) on the first page: the YSF logo (`logo-ysf.png`), the company name in bold, `Zone · MoU Code`, and a status pill. Below it, "Generated <date> by <username>".
2. **Five sections**, each opening with a bold heading bar: **Overview**, **Commercial**, **Payroll**, **History**, **Documents**.
   - **Overview:** a two-column bordered label / value grid with the fields of the Overview tab.
   - **Commercial:** the MoU fields grid, then a charges table (Charge | Amount | Period | Basis) including Other rows.
   - **Payroll:** an Allowances table and a Deductions table (Item | Value, values formatted per §2.4 so PF / ESI read `12%` and TDS reads its text), then the trainee categories.
   - **History:** every MoU of the company (MoU Code | Start | End | Scheme | Status).
   - **Documents:** MoU and company documents together (Document | Type | Size | Uploaded).
3. **Page breaks:** a table that runs over a page repeats its header row on the next page, and a section heading is never left alone at the foot of a page.
4. **Running header** from page 2: the company name and the MoU code above an orange rule.
5. **Footer** on every page: "YSF MoU Management System · Confidential" and "Page x of y".
6. Amounts read `Rs. <amount>` (see §2.4). The logo file ships with the API (`src/api/assets/`); if it is missing, a drawn "YSF" mark takes its place.

## 6. Acceptance criteria

- **AC1** `/api/enums` lists PF, ESI and TDS as DEDUCTION items with value kinds `PERCENT`, `PERCENT` and `STATUS`. The other 23 items are `AMOUNT` (13 since D151 removed ten demo deductions).
- **AC2** Saving PF = 12 and ESI = 0.75 stores `12.00` and `0.75`. 100.01 is refused by the validator, and by the database if the validator is bypassed.
- **AC3** TDS "As applicable" stores `is_applicable = true` with a NULL amount, and the Payroll tab shows "As applicable". "Not applicable" is shown too.
- **AC4** The Payroll tab shows an AMOUNT item as `₹ <amount>/mo` and PF as `12%`.
- **AC5** ~~A bulk row with PF `12%`, ESI `0.75` and TDS `As applicable` saves as AC2 and AC3. TDS `maybe` is a cell error.~~ Since D152: every bulk row saves PF 12.00, ESI 0.75 and TDS As applicable; PF / ESI / TDS cells in an older template are ignored.
- **AC6** A wizard save that never mentions PF, ESI or TDS stores PF 12.00, ESI 0.75 and TDS As applicable. After migration 0015 every existing MOU holds the same defaults, its Payroll tab shows `12%`, `0.75%`, `As applicable`, and Edit Agreement can change all three.
- **AC7** A GST certificate PNG uploads (201) and is listed with its type, size and date. A `.docx` renamed to `.pdf` is refused (422). A VIEWER gets 403 on upload. An out-of-zone company answers 404.
- **AC8** The record PDF is a valid PDF that contains the company name, the MoU code, all five section headings, `12%` for PF and the TDS text.
- **AC9** `/print` is unchanged and still omits payroll.
