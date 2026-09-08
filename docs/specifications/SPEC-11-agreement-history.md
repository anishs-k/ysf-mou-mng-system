# SPEC-11 — Agreement History

**Depends on:** SPEC-10 (writes the rows this spec reads), SPEC-01, SPEC-02.
**Source:** `docs/project_information.md` §6.4

---

## 1. Scope

A read-only record of past versions of an agreement, for audit and reference.
This spec reads `agreement_history`; it never writes it — SPEC-10 does that.

---

## 2. Screen

Reached from Dashboard Home, or from a link on the Existing Company commercial
page (SPEC-07 §4).

### 2.1 Selection
Zone → Company → Plant → Scheme, using the same cascading selectors as SPEC-09
§2, resolving to one MOU. When reached from SPEC-07 the MOU is already known and
the selectors are skipped.

### 2.2 Version list
Newest first, one row per `agreement_history` entry, plus a row at the top for
the current live version.

| Column | Source |
|---|---|
| Version | `agreement_history.version` (the version superseded) |
| Changed On | `edited_at` |
| Changed By | `edited_by` → username |
| Reason | `edit_reason`, display label |
| Remark | free-text remark, if any |
| Proof | download link when a proof file exists, "—" otherwise |

The current version row shows "Current" in place of a change reason.

### 2.3 Version detail
Opening a row shows the full snapshot for that version, laid out like the
Existing Company view (SPEC-07 §4 and §5) — commercial terms, then trainee
categories, allowances and deductions. Entirely read-only.

Snapshots are rendered from the stored JSON, not by re-reading live tables. A
snapshot must remain readable even after the live record has changed shape, so
the renderer tolerates keys it does not recognise and fields that are missing,
showing "—" rather than failing.

### 2.4 Compare
Selecting two versions shows a field-by-field difference: field name, the value
in the older version, the value in the newer. Unchanged fields are hidden by
default with a toggle to show all.

Comparing the newest history row with "Current" is the common case and must work.

---

## 3. Rules

- History is append-only. There is no edit or delete, at any role including ADMIN.
- A proof file linked from a history row is downloaded through the same
  authenticated endpoint as any other stored file (SPEC-09 §3).
- An MOU that has never been edited shows only the "Current" row and an empty
  state: "No amendments recorded for this agreement."

---

## 4. API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/mous/{mouId}/history` | Version list |
| GET | `/api/mous/{mouId}/history/{historyId}` | One version's full snapshot |
| GET | `/api/mous/{mouId}/history/compare?from=&to=` | Field-level differences; `to=current` compares against the live record |
| GET | `/api/documents/{documentId}` | Proof download (SPEC-09) |

All read-only, available to every authenticated role.

---

## 5. Acceptance criteria

1. An MOU edited three times shows three history rows plus the current row.
2. Rows are ordered newest first and each shows the correct reason label and editor.
3. A row created with reason "Communication from HR" offers a working proof download; the other reasons show "—".
4. Opening a version renders the values as they were at that version, not the current ones.
5. A snapshot missing a field the current schema has renders "—" instead of erroring.
6. Comparing version 1 with version 2 lists only fields that actually changed, until "show all" is toggled.
7. Comparing the latest history row with Current reflects the most recent edit.
8. An MOU with no edits shows the empty state.
9. No endpoint or UI action can modify or delete a history row, including for an ADMIN.
10. Requesting a proof file without a session returns 401.
