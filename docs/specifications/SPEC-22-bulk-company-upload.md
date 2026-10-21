# SPEC-22 — Bulk Company Upload

**Amends:** SPEC-03 (the Add New Company page gains a Bulk Upload mode), SPEC-05 §3 (the MOU PDF is not required for a bulk-created MOU).
**Depends on:** SPEC-04, SPEC-05, SPEC-06 (the field rules every row must pass), SPEC-09 (attaching the MOU PDF afterwards), SPEC-19 / SPEC-21 (zone scope).
**Source:** client instruction, 2026-10-19.
**Decisions:** D136–D141 in `docs/design/ADR.md`.

> **Amended 2026-10-21 by SPEC-25 (D154 / D159: the columns, their four sections and the blank PDF form of SPEC-25 §6 replace §3.1 and AC3).**

---

## 1. Scope

An authoring user (ADMIN or DATA_ENTRY, SPEC-02 §3.3) can onboard many companies
at once from one Excel sheet instead of running the four-step wizard per company.

- One sheet row = one company, its plant and its MOU — exactly what one wizard run creates.
- The rows go through **the same rules as the wizard** (`validateCompanyDetails`,
  `validateCommercialDetails`, `validatePayrollDetails`, GST uniqueness, duplicate
  company + plant per zone, zone scope).
- **All or nothing** (D139): if any row is wrong, nothing is saved and every error is
  listed by row and column.

Out of scope: updating existing companies from a sheet, CSV, background/queued
imports, and attaching MOU PDFs in bulk.

## 2. UI — Add New Company page

At the top of `/companies/new` there is a **Manual Entry / Bulk Upload** switch with a
short instruction text explaining the three steps (download the template, fill one
row per company, upload it).

When **Bulk Upload** is selected the whole manual wizard is hidden — stepper,
resume-draft banner, form fields and the Back / Save buttons. Only these are shown:

| Button | Does |
|---|---|
| **Download Excel Template** | Downloads `company-bulk-template.xlsx` (§3.1) |
| **Download PDF Template** | Downloads `company-bulk-template.pdf` (§3.2) — for printing / reference only |
| **Upload Bulk Data** | Opens a file picker that accepts **`.xlsx` only** and uploads it (§4) |

After an upload the page shows either "N companies created" with each row's MoU
code, or the list of row / column / message errors. Switching back to Manual Entry
restores the wizard unchanged.

## 3. Templates — `GET /api/companies/bulk/template?format=xlsx|pdf`

Session + authoring role required (403 otherwise). Both formats are generated on
the server from **one column list** in `@mou/domain` (`BULK_COMPANY_COLUMNS`, D136),
so the Excel headers, the PDF and the upload parser can never disagree.

### 3.1 Columns (in this order)

| Section | Columns |
|---|---|
| Company Details | Company Type\*, Company Name\*, Registration Type\*, TAN Number\*, GST Number\*, Zone\*, Plant / Location\*, Sector\*, Address Line 1\*, Address Line 2, City\*, District\*, PIN Code\*, State\*, Contact Type\*, HR Contact Name\*, HR Contact Number\*, Finance Head Name\*, Finance Head Contact\*, Official Email ID\*, Purchase Name, Purchase Number, Purchase Email ID |
| Commercial Details | Scheme\*, MoU Start Date\*, MoU Tenure\*, Tenure Unit\*, Attendance Cycle\*, Stipend Date\*, then one column per fixed commercial charge (16, e.g. "Admin Charges") |
| Payroll | Trainee Categories\*, then one column per fixed payroll item except PF, ESI and TDS (13 since D151 / D152, e.g. "Payroll: Attendance Bonus" — prefixed because several items share a name with a commercial charge, e.g. Insurance) |

\* = required. Not in the sheet (D137): PF, ESI and TDS — every row is saved with
their defaults, PF 12%, ESI 0.75%, TDS As applicable (D152; such a column in an older
template is ignored); the "Confirm" email fields (the sheet holds
one value), the per-charge period / basis, the "Other" charge and payroll rows, and
the MOU PDF. They can be added afterwards with Edit Agreement (SPEC-10) and
Upload MoU (SPEC-09).

### 3.2 Cell formats (D140, D141)

| Column | Accepted |
|---|---|
| Company Type, Registration Type, Sector, Contact Type, Scheme, Tenure Unit | The label or the code, case-insensitive (e.g. "Private Sector" or `PRIVATE_SECTOR`). The Excel template offers a dropdown |
| Zone | Zone name or zone code; must be one of the uploader's zones (SPEC-19 §4.4). The dropdown lists only those zones |
| Attendance Cycle | One of "16th to 15th", "21st to 20th", "26th to 25th", "Calendar Month" (dropdown) |
| MoU Start Date | An Excel date, `YYYY-MM-DD` or `DD-MM-YYYY` / `DD/MM/YYYY` |
| Commercial charge columns | Blank = not applicable; otherwise the amount |
| Payroll item columns | Blank or `No` = not applicable; an amount = Yes with that amount. `Yes` without an amount is an error |
| Trainee Categories | `Name \| Qualification \| Stipend Rate` entries separated by `;` — qualification and rate optional, e.g. `ITI Fitter \| ITI \| 9000; Diploma` |

The Excel file has a **Companies** sheet (frozen bold header row, dropdowns on
the list columns), an **Instructions** sheet, and a hidden **Lists** sheet that feeds
the dropdowns. The PDF prints the same columns as a table — section, column,
required, accepted values / format — plus the instructions.

## 4. Upload — `POST /api/companies/bulk`

Multipart field `file`. Session + authoring role required.

1. **File checks (400):** missing file; not `.xlsx`; larger than **5 MB**; not a
   readable workbook; no **Companies** sheet; a required column header missing
   (headers are matched by text, so column order does not matter); no data rows;
   more than **500** data rows. Fully blank rows are skipped.
2. **Row checks:** each row is mapped (§3.2) and run through the three domain
   validators. The MOU PDF rule of SPEC-05 §3 is **not** applied (D138). Also
   checked: GST already registered, the same company name + plant already in that
   zone, and the same GST or the same name + plant + zone appearing twice **in the file**.
3. **Any error → 422** `{ error, rowErrors: [{ row, column, message }] }`, where `row`
   is the Excel row number. Nothing is written.
4. **No errors → 201** `{ created: [{ row, companyId, companyName, generatedCode }] }`.
   All rows are written in **one transaction** with the same rows the wizard's final
   save writes (company, plant, MOU, commercial items, payroll config, trainee
   categories, payroll items) — but no `mou_document` row.

MoU codes are allocated per scheme per year as for the wizard (D109). Like the
wizard (D7) the allocation runs outside the transaction, so a failed upload can
leave gaps in the sequence.

## 5. Acceptance criteria

- **AC1** Selecting Bulk Upload hides every manual-form element; only the two download buttons and Upload Bulk Data are shown, plus the instruction text and the mode switch.
- **AC2** The Excel template's header row is exactly `BULK_COMPANY_COLUMNS` in order; list columns carry dropdowns; the Zone dropdown lists only the uploader's zones.
- **AC3** The PDF template is a valid PDF listing every column. Since D152 it uses
  the record PDF's layout (SPEC-23 §5): the YSF band with the logo, the instructions,
  one table per section (Column / Required / Accepted values) whose header row repeats
  after a page break, and "Page x of y" footers.
- **AC4** A valid two-row file creates two companies, each with plant, MOU, commercial items, trainee categories and all 22 payroll items, and returns their MoU codes.
- **AC5** One invalid row in a three-row file → 422 with that row's errors, and no company is created.
- **AC6** A row whose zone is outside the uploader's zones is refused with the SPEC-19 message.
- **AC7** A GST already registered, or repeated within the file, is refused.
- **AC8** A non-xlsx file, a missing column, or more than 500 rows → 400.
- **AC9** A VIEWER gets 403 on both routes.
- **AC10** A bulk-created MOU has no document and accepts one through Upload MoU (SPEC-09).
