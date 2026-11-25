# SPEC-36 — Export: Only MoU or Full Details

**Amends:** SPEC-13 (export), SPEC-23 §5 (record PDF), SPEC-24 (bulk record PDF), SPEC-08 (expiry alerts export).
**Source:** client instruction, 2026-11-25. The client chose option (a): "Only MoU" means the MoU details, not the signed PDF file.

---

## 1. Scope

Every record export offers two choices from one button (`ExportMenu`):

| Choice | Excel | PDF |
|---|---|---|
| **Only MoU** | The client's MOU TEMPLATE layout: a **YSF** and / or a **YSI** sheet (only those with MoUs), one row per MoU, the sheet's columns in its order. YSI also has its five extra fees. | Per MoU: header band, a **MoU** grid (GST, zone, plant, zonal manager, MoU code, expiry, left trainee recovery) and the **Commercial** section. No contacts, payroll, history or documents. |
| **Full Details** | Unchanged: the four-sheet workbook (Companies, MOUs, Commercial, Payroll). | Unchanged: the full record. |

## 2. Where

| Screen | Button | API |
|---|---|---|
| Existing Company → record | Export Excel | `GET /api/export/excel?mouId=…&view=mou|full` |
| Existing Company list | Export Excel | `GET /api/export/excel?…&view=mou|full` (the list's filters) |
| Export Data | Export Filtered Data, MoU Summary Report, Expiry Report | `GET /api/export/excel?…&view=mou|full` |
| Agreement History | Export Excel | same |
| MoU Expiry Alert | Export Excel | same, with `status=EXPIRING` |

- `view` is optional and defaults to `full`. Any other value answers 400.
- Client follow-up: every record export downloads Excel. The record PDF routes
  (`record.pdf`, `records.pdf`, both with `?view=`) remain, but no screen uses them now.
- The zone summary PDF and the contacts report keep their single form.
- MoU Expiry Alert previously exported a CSV of the visible alert rows. It now
  exports every MoU expiring in the alert window, in either form.

## 3. Only MoU Excel columns (`db/mou-sheet-export.ts`)

**YSF sheet:**
Sr. No., MoU Code, Company Name (GST), Zonal Manager, Division, TYPE, MoU Status,
Mail Confirmation, Match with Invoice, Payment Term, Stipend Date, Admin, Supervisor,
Insurance, Shoes & Uniform, Sourcing, Education / Training, Left Trainee, Assessment,
Other Charges, MoU Date, Validity, Status, Remark, Invoice Remark.

**YSI sheet:** the same, plus:
- Education Fees, after Education / Training;
- Course Registration Fees, Examination Fees, Employability Skill Test Fees and
  MSBTE Affiliation Fees, after Left Trainee.

Further rules:
- Fee cells hold numbers, and are blank when the fee is not applicable.
- List codes are shown as their labels.
- Only the sheets of the organisations in the export appear: a YSI MoU gives just
  the YSI sheet. When nothing matches, both empty sheets show the layout.
- Only MoU never includes contact columns, so it needs no "contacts.export" permission.

No migration.
