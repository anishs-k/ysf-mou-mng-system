# SPEC-06 — Wizard Page 3: Payroll Details, Code Generation and Save

**Depends on:** SPEC-01 (allowance catalogue, code rule), SPEC-03, SPEC-04, SPEC-05.
**Completes:** the Add New Company flow.
**Source:** `docs/project_information.md` §4.3, §8.11, §10.3

---

## 1. Scope

Page 3 of the wizard: scheme selection, trainee categories, the Yes/No + amount
answer for all 23 payroll items, then automatic code generation and the final
save.

---

## 2. Flow

```mermaid
flowchart TD
    A[Select Scheme<br/>WILP / BOC and DVOC / MSBTE / FLEXI] --> B[Add Trainee Category<br/>one or more]
    B --> C[For every payroll item]
    C --> D{YES or NO?}
    D -->|YES| E[Show amount box, enter value]
    D -->|NO| F[No amount box for this item]
    E --> G{All items answered?}
    F --> G
    G -->|No| C
    G -->|Yes| H[Generate Code automatically]
    H --> I[SAVE COMPANY]
```

> **DECISION-PENDING (Q1)** — the source flow diagram labels the NO branch
> "Skip directly to Generate Code step", which reads as though one No aborts the
> remaining items. The narrative documentation says otherwise. Default, shown
> above: **No skips only that item's amount box**; every remaining item is still
> asked. Confirm with the business owner.

---

## 3. Fields

### 3.1 Scheme
Single-select dropdown, required: WILP, BOC and DVOC, MSBTE, FLEXI (SPEC-01 §2.4).

The wizard captures one scheme per run. A company that runs several schemes has
one MOU per scheme; the additional ones are created by running the wizard again
for the same company, or through SPEC-10. This is why `mou` is one-to-many from
`company`.

### 3.2 Trainee Category
Repeatable free-text rows under the selected scheme. At least one is required.
Category names are unique within the config, compared case-insensitively.

### 3.3 Payroll items
All 23 items from SPEC-01 §4, in that exact order:

Attendance Bonus, 1st Year Allowance, 2nd Year Allowance, 3rd Year Allowance,
Accommodation Allowance, Arrears, Bonus, Canteen Allowance, Conveyance,
Document Fee, Education Allowance, Ex-Gratia, Foundry Allowance, Leave
Encashment, Leave With Wages, Night Shift Allowance, Reimbursement of Education
Charges, Special Allowance, Registration Fee, Travelling Allowance, Uniform
Refund, Washing Allowance, Other.

Each of items 1–22 renders as a Yes/No control:
- **Yes** reveals an amount box; the amount is then required.
- **No** hides the amount box and the item persists with `is_applicable = false`, `amount = NULL`.
- Switching Yes → No clears the amount.

Item 23, **Other**, is a repeatable block like SPEC-05 §2.3: label + amount +
Allowance/Deduction, zero or more rows.

Each item's `item_type` comes from the SPEC-01 §4 mapping; the user does not
choose it, except on "Other" rows.

---

## 4. Validation

| Rule |
|---|
| Scheme required |
| At least one trainee category; each 1–100 chars, unique within the config |
| Every one of items 1–22 must have an explicit Yes or No — no item may be left unanswered |
| Yes → amount required, numeric, non-negative, ≤ 2 decimal places, ≤ 9,999,999.99 |
| No → amount box hidden and stored as NULL |
| "Other" row → if any field is filled, label, amount and type all become required; labels unique within the page |
| The same company + plant + scheme must not already have a current MOU |

A progress indicator shows how many of the 22 items remain unanswered. **Save**
stays disabled until the count reaches zero.

---

## 5. Code generation and save

1. When every item is answered and validation passes, the user presses **Save**.
2. The server generates the company code per **SPEC-01 §6.3** — `<ZONE_CODE>-<YY>-<NNNN>`.
3. The full save transaction from **SPEC-03 §4** runs.
4. On success a confirmation screen shows the generated code, the company name
   and the scheme, with links to view the company (SPEC-07) or return to the
   dashboard.

The code is server-generated, unique and permanently non-editable. It is never
shown before save, because nothing is reserved before save.

---

## 6. Data written

At final save:
- `payroll_config` — one row for the MOU
- `trainee_category` — one row per category
- `payroll_item` — 22 rows for the fixed items plus one per "Other" row
- `mou.scheme` — the selected scheme
- `company.generated_code` — the generated code

Plus everything from SPEC-04 and SPEC-05, in the same transaction.

---

## 7. Acceptance criteria

1. Answering No to Attendance Bonus still presents 3rd Year Allowance and every other remaining item.
2. Save is disabled while any of the 22 items is unanswered, and the remaining count is visible.
3. Answering Yes with an empty amount blocks Save with a field-level error.
4. Switching an item from Yes with 500 to No, then saving, stores `is_applicable = false` and `amount = NULL`.
5. Saving with zero trainee categories is rejected.
6. Two categories named "Trainee" and "trainee" are rejected as duplicates.
7. After save, exactly 22 `payroll_item` rows exist for the fixed keys, plus one per "Other" row.
8. The generated code matches `<ZONE_CODE>-<YY>-<NNNN>` and is unique; two saves in the same zone and year produce consecutive sequence numbers.
9. Every saved `payroll_item` carries the `item_type` from SPEC-01 §4 — `DOCUMENT_FEE` and `REGISTRATION_FEE` as DEDUCTION, the rest as ALLOWANCE.
10. A second wizard run for the same company + plant + scheme is rejected while a current MOU exists.
11. A save that fails validation server-side writes nothing and leaves the draft intact.
