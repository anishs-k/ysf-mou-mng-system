# SPEC-03 — Add New Company: Wizard Framework

**Depends on:** SPEC-01 (data model, draft table), SPEC-02 (session).
**Feeds:** SPEC-04, SPEC-05, SPEC-06 — the three pages that plug into this shell.
**Source:** `docs/project_information.md` §4 (intro), §10.4

This spec builds the container: navigation, draft persistence and the final
save transaction. It builds **no fields**. Implement it before the page specs so
each page has somewhere to live.

---

## 1. Scope

- The 3-step wizard shell: step indicator, Next, Back, Cancel.
- Draft persistence so a refresh does not destroy work in progress.
- The single final-save transaction invoked at the end of Page 3.

**Out of scope:** the fields and validation of each page (SPEC-04/05/06), and the
code-generation format (defined in SPEC-01 §6.3, invoked here).

---

## 2. Flow

```mermaid
flowchart LR
    P1[PAGE 1<br/>Company Detail] -->|NEXT| P2[PAGE 2<br/>Commercial Details]
    P2 -->|NEXT| P3[PAGE 3<br/>Payroll Details]
    P2 -->|BACK| P1
    P3 -->|BACK| P2
    P3 --> GC[Generate Code<br/>automatic]
    GC --> SC[SAVE COMPANY]
```

---

## 3. Rules

### 3.1 Sequential completion
1. A page opens only after the previous page has passed its own validation and
   the user pressed **Next**.
2. **Next** is disabled while the current page has any validation error.
3. Deep-linking to Page 2 or Page 3 without a draft that has cleared the earlier
   pages redirects back to the furthest valid page.

### 3.2 Back navigation
**Back** returns to the previous page with every entered value intact. Going back
and forward again must never silently drop or reset a value, including
repeatable rows such as trainee categories or "Other" items.

### 3.3 Nothing persists until final save
No row is written to `company`, `company_plant`, `mou`, `commercial_detail`,
`payroll_config`, `trainee_category`, `payroll_item` or `mou_document` before the
Save on Page 3. All in-progress state lives in `company_draft`.

### 3.4 Draft persistence
- A draft row is created on first Next from Page 1 and updated on every
  subsequent Next and Back.
- The draft holds the whole wizard payload plus `current_page`.
- A user has at most one open draft at a time. Re-entering "Add New Company"
  while a draft exists prompts: **Resume draft** or **Discard and start new**.
- Drafts untouched for 30 days are purged by a scheduled job.
- The uploaded MOU PDF from Page 2 is held in a temporary location referenced by
  the draft and moved into permanent storage only during the final save. Orphaned
  temporary files are cleaned up with their draft.

### 3.5 Cancel
**Cancel** asks for confirmation, then deletes the draft and its temporary
upload, and returns to Dashboard Home.

---

## 4. Final save transaction

Triggered by **Save** on Page 3. All of the following happen inside one
transaction — either every row is written or none is:

1. Re-validate the entire draft payload server-side. Client validation is never
   trusted. Any failure aborts with a field-level error report and the draft is
   left untouched.
2. Insert `company`.
3. Generate the code per SPEC-01 §6.3 and set **`mou.generated_code`** — `MOU-<SCHEME>-<YYYY>-<NNNN>`. *(amended by SPEC-16 D109: the code belongs to the MOU, not the company, and is written in step 5 with the `mou` row.)*
4. Insert the `company_plant` row captured on Page 1.
5. Insert `mou` (scheme from Page 3, dates and cycle from Page 2), computing
   `end_date` per SPEC-01 §6.1, `version = 1`, `is_current = true`.
6. Insert `commercial_detail` and its `commercial_other_item` rows.
7. Move the uploaded PDF into permanent storage and insert `mou_document`.
8. Insert `payroll_config`, its `trainee_category` rows and all `payroll_item` rows.
9. Delete the draft.

On success the user sees a confirmation showing the generated code, with links
to view the company (SPEC-07) or return to the dashboard.

### 4.1 Idempotency
A double-clicked Save must not create two companies. The final submit carries the
draft id; once a draft is consumed, a second submit for the same draft returns
the already-created company instead of creating another.

---

## 5. API

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/companies/draft` | Create or update the draft; body is the partial wizard payload + `current_page` |
| GET | `/api/companies/draft` | Fetch the current user's open draft, or 404 |
| DELETE | `/api/companies/draft/{draftId}` | Discard a draft and its temporary upload |
| POST | `/api/companies` | Final submit `{draftId}` → creates everything, returns `{companyId, generatedCode}` |

Access: ADMIN and DATA_ENTRY only. VIEWER gets 403 on all four.

---

## 6. Acceptance criteria

1. Next on Page 1 with an invalid field does not advance and does not create a draft.
2. After completing Page 1 and refreshing the browser, the wizard resumes on Page 2 with Page 1's values intact.
3. Back from Page 3 to Page 1 and forward again preserves every value including repeatable rows.
4. Before Save, no row exists in `company` — verified by querying after reaching Page 3.
5. A save that fails at the payroll step leaves zero rows in `company`, `mou` and `commercial_detail`.
6. Submitting the same `draftId` twice creates exactly one company.
7. Cancel deletes the draft row and the temporary PDF.
8. A VIEWER calling `POST /api/companies` receives 403.
