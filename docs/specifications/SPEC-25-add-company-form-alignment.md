# SPEC-25 — Add New Company: Form Alignment, Blank PDF Form and Excel Template

**Amends:** SPEC-01 §3 (commercial catalogue: 16 → 9 fixed charges, D153), SPEC-04 (contacts: HR / Finance emails, no Contact Type — D155, D156), SPEC-05 (tenure in months — D157), SPEC-06 / SPEC-16 §2.6 / SPEC-23 §2.6 (payroll is PF / ESI / TDS only, no Other payroll rows — D158), SPEC-22 §3 (template columns, sections and the PDF — D154, D159).
**Depends on:** SPEC-22 (bulk upload), SPEC-23 (PF / ESI / TDS defaults, D148; the record PDF look), D151 / D152.
**Source:** client instruction, 2026-10-21, with the client's UI screenshots and answers: three separate emails (HR, Finance, Purchase) each with a confirm box; no Contact Type; "MoU Tenure (Months)" as one number; the 13 remaining payroll allowance / deduction items and the Other payroll rows removed everywhere; the Excel template keeps one header row with one amount column per charge and one Trainee Categories cell.
**Decisions:** D153–D159 in `docs/design/ADR.md`.

---

## 1. Scope

The Add New Company form - the wizard, the bulk Excel template and the PDF - is brought to the client's UI field for field, and the data model follows it:

1. The commercial catalogue keeps the 9 core charges (§2).
2. HR and Finance each get their own email; Contact Type is no longer asked (§3).
3. The tenure is a whole number of months (§4).
4. Payroll is only PF, ESI and TDS, filled with their defaults; no other payroll item and no Other payroll row exists (§5).
5. The PDF template becomes a blank, hand-fillable form in the record PDF's look; the Excel template is one header row of the same fields (§6).

## 2. Commercial charges (D153)

The fixed charges are Admin Charges, Insurance, Shoes and Uniform, Supervisor Charges, Sourcing Charges, Education Charges, Training Charges, Assessment Charges and One Time Registration Fees, plus the repeatable Other row. Canteen Deduction, Coupon Amount, Document Fee, Joining Fee, Left Deduction, Skill Diploma Fees and Transportation Deduction are removed from the catalogue, the charge dropdown and the templates. Migration `0017` deletes any such `commercial_item` row (none existed) and rebuilds `commercial_item_key_chk`.

## 3. Contacts (D155, D156)

| Field | Rule |
|---|---|
| HR Contact Name, Finance Head Name | Required, as before |
| HR Contact Number, Finance Head Contact | Required. With no Contact Type each number is accepted as a 10-digit mobile (starting 6–9) **or** a LAN number (6–15 digits, optional STD code separated by `-` or a space) |
| HR Email ID, Finance Email ID | Required, valid email. Each has a Confirm box in the wizard that must match ignoring case. HR and Finance may hold the same address |
| Purchase Name, Number, Email ID | Optional, as before; the Purchase Email keeps its Confirm box |

`company.official_email` is replaced by `hr_email` and `finance_email` (both NOT NULL). Migration `0018` copies every existing official email into both; `0019` drops `official_email`. `company.contact_type` becomes nullable: existing companies keep theirs, new ones store NULL. The API's `officialEmail` / `confirmEmail` become `hrEmail`, `confirmHrEmail`, `financeEmail`, `confirmFinanceEmail`; the company overview returns `hrEmail`, `financeEmail` and a nullable `contactType`. The record view, the record PDF and the Excel export show HR Email and Finance Email instead of one Email, and no Contact Type.

## 4. Tenure (D157)

"MoU Tenure (Months)" is one whole number, 1–120. A blank unit means Months; `YEARS` is refused ("Enter the tenure in months"). Migration `0018` restates every Years tenure in months (`value × 12`); the generated `end_date` is unchanged. Edit Agreement edits the months only. Version-history snapshots keep what they recorded.

## 5. Payroll (D158)

- The payroll catalogue is PF, ESI and TDS (plus the `OTHER` key, which nothing writes any more). The 13 items Attendance Bonus, Accommodation Allowance, Conveyance, HRA, Bonus, Night Shift Allowance, Education Allowance, Insurance, Admission Deduction, Coupon Amount, Education Fee, Joining Fee Deduction and Skill Diploma Fees are removed, and with Insurance the D108 insurance sub-model (`insurance_type`, `insurance_gfs_amount`, `insurance_mou_amount` and their CHECKs).
- Migration `0018` deletes every `payroll_item` row other than PF, ESI and TDS (Other rows included) and rebuilds `payroll_item_key_chk`.
- The wizard's Payroll step holds only the trainee category cards. Every save stores PF 12%, ESI 0.75% and TDS As applicable (D148); Edit Agreement is where they change. A filled Other payroll row is refused ("Other payroll items are no longer recorded").

## 6. Templates (D154, D159)

### 6.1 Sections and columns

One list, `BULK_COMPANY_COLUMNS` in `@mou/domain`, in four sections:

| Section | Columns (\* = required) |
|---|---|
| Basic Information & Address | Scheme\*, Zone\*, Sector\*, Company Name\*, Company Type\*, Plant / Location\*, Registration Type\*, GST Number\*, TAN Number\*, Address Line 1\*, Address Line 2, City\*, District\*, PIN Code\*, State\* |
| Contact Information | HR Contact Name\*, HR Contact Number\*, HR Email ID\*, Finance Head Name\*, Finance Head Contact\*, Finance Email ID\*, Purchase Name, Purchase Number, Purchase Email ID |
| Commercial Details | MoU Start Date\*, MoU Tenure (Months)\*, Attendance Cycle\*, Stipend Date\*, then one amount column per core charge |
| Payroll Details | Trainee Categories\* (`Name \| Qualification \| Stipend Rate; ...`) |

No PF, ESI, TDS, payroll item, Contact Type or Tenure Unit column. A column of that kind in an older template is ignored.

### 6.2 Excel

The Companies sheet has the single header row above; each header's note reads `<section> · Imp / Yes` or `· No` and its format. The Instructions sheet repeats the columns grouped by section with Required as Imp / Yes or No.

### 6.3 PDF — the blank Add New Company form

`GET /api/companies/bulk/template?format=pdf` returns a blank A4 form in the record PDF's look (`db/pdf-layout.ts`): the navy YSF band with the logo, then the four sections. Single fields are labelled blank cells two to a row (addresses and emails full width), required ones marked `*`, list fields naming their choices under the writing line. Commercial as per MoU is a numbered 5-row table (Charge Name | Amount (Rs.) | Period | Basis) with the 9 core charges, the periods and the bases listed above it; Trainee Categories is a numbered 5-row table (Trainee Category | Qualification | Stipend Rate (Rs.)). A table moves to the next page whole rather than splitting. Amounts read "Rs." because the standard PDF font has no ₹ glyph.

## 7. Deployment

Migrations `0017`–`0019` must run on the live database together with this code: `0018` / `0019` drop columns the previous release reads.

## 8. Acceptance criteria

- **AC1** `/api/enums` serves 10 commercial items and 4 payroll items (PF, ESI, TDS, Other).
- **AC2** Page 1 without a Contact Type accepts a mobile HR number and a LAN Finance number; it refuses `12ab`. A Confirm HR / Finance Email that differs is refused.
- **AC3** A tenure of 36 with no unit saves as 36 Months; `YEARS` is refused.
- **AC4** A wizard save stores exactly the PF, ESI and TDS rows with their defaults; a filled Other payroll row answers 422.
- **AC5** After migration 0018 every company holds its old official email as HR and Finance email, every tenure is in months with an unchanged end date, and only PF / ESI / TDS payroll rows remain.
- **AC6** The template's columns are those of §6.1, in order; the PDF form prints each single field once as a blank labelled cell, both 5-row tables, and no PF / ESI / TDS, payroll item, Contact Type, Tenure Unit or removed charge.
