# SPEC-05 — Wizard Page 2: Commercial Details

**Depends on:** SPEC-01 (charge item catalogue, end-date rule), SPEC-03, SPEC-04.
**Source:** `docs/project_information.md` §4.2, §8.10, §10.2

---

## 1. Scope

Page 2 of the Add New Company wizard: MOU dates and tenure, the signed MOU PDF
upload, the payment cycle, and all 16 fixed charge/deduction amounts plus
repeatable "Other" rows.

---

## 2. Fields (in diagram order)

| # | Field | Type | Required | Notes |
|---|---|---|---|---|
| 1 | MOU Start Date | date | yes | |
| 2 | MOU Tenure | number + unit | yes | value + MONTHS/YEARS selector. **No End Date field is captured.** |
| 3 | Upload MOU PDF | file | yes | PDF only |
| 4 | Attendance Cycle | text | yes | |
| 5 | Stipend Date | number | yes | day of month, 1–31 |
| 6–21 | The 16 charge items | decimal | no | SPEC-01 §3, rows 1–16, in that exact order |
| 22 | Other | repeatable rows | no | label + amount + Allowance/Deduction |

### 2.1 Derived end date
The computed end date (SPEC-01 §6.1) is displayed read-only beside the tenure
field so the user can sanity-check it. It is not an input.

### 2.2 The 16 charge fields
Rendered in the SPEC-01 §3 order:
Admin Charges, Insurance, Shoes and Uniform, Supervisor Charges, Sourcing
Charges, Education Charges, Training Charges, Assessment Charges, One Time
Registration Fees, Canteen Deduction, Coupon Amount, Document Fee, Joining Fee,
Left Deduction, Skill Diploma Fees, Transportation Deduction.

Each is an optional amount box. Leaving one blank means "not applicable" and
persists as `NULL` — distinct from an entered `0.00` (SPEC-01 §6.4).

### 2.3 "Other" rows
A repeatable block. Each row captures:
- **Label** — free text, what the charge is called.
- **Amount** — decimal.
- **Type** — Allowance or Deduction.

Rows can be added and removed. Zero rows is valid. A row with any one field
filled must have all three filled.

> **DECISION-PENDING (Q12)** — source wording implies a single "Other" entry
> but says "ideally repeatable rows". Default: repeatable.

---

## 3. Validation

| Field | Rule |
|---|---|
| MOU Start Date | required, valid date. Backdated more than 365 days → warning, not a blocker |
| MOU Tenure value | required, positive integer, 1–120 for MONTHS, 1–10 for YEARS |
| MOU Tenure unit | required, MONTHS or YEARS |
| MOU PDF | required; MIME type `application/pdf` **and** `%PDF` file-header check; max 10 MB; filename sanitised before storage; virus-scanned if a scanner is available |
| Attendance Cycle | required |
| Stipend Date | required, integer 1–31 |
| All 16 charge amounts | optional; when present: numeric, non-negative, at most 2 decimal places, ≤ 9,999,999.99 |
| Other row | if any of label / amount / type is filled, all three become required. Label 1–100 chars, unique within the page (case-insensitive) |

Content-type is checked from the file bytes, not only from the browser-supplied
header — a renamed `.exe` must be rejected.

---

## 4. Upload handling

The file is written to a temporary location keyed to the draft (SPEC-03 §3.4),
not to permanent storage. Replacing the file before Save discards the previous
temporary file. The permanent `mou_document` row is created only in the final
save transaction.

---

## 5. Data written

None during the page. Values map at final save to:
- `mou.mou_start_date`, `tenure_value`, `tenure_unit`, `end_date`, `attendance_cycle`, `stipend_date`
- `commercial_detail` — one column per charge item
- `commercial_other_item` — one row per "Other" entry
- `mou_document` — the uploaded PDF

---

## 6. Acceptance criteria

1. Entering start date 2026-01-01 with tenure 24 MONTHS displays end date 2027-12-31; with 2 YEARS it displays the same.
2. A `.docx` renamed to `.pdf` is rejected.
3. An 11 MB PDF is rejected with a size error.
4. Stipend Date 0 or 32 is rejected; 31 is accepted.
5. A charge amount of `-5` or `12.345` is rejected; `1200.50` and blank are both accepted.
6. A blank charge persists as NULL and an entered `0` persists as `0.00` — distinguishable after save.
7. An "Other" row with a label but no amount blocks Next; a fully empty row is ignored.
8. Two "Other" rows with the same label are rejected.
9. Next with no PDF uploaded is blocked.
10. Replacing the PDF and then cancelling the wizard leaves no temporary file behind.
