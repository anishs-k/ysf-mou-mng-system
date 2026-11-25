# SPEC-32 — Section-wise Role-Based Access (Permission Matrix)

**Amends:** SPEC-02 §3.3 (role matrix), SPEC-26 (HR / Finance roles), SPEC-29 (contacts export).
**Depends on:** SPEC-19 / SPEC-21 (zone scope), SPEC-10 + SPEC-28 (Edit Agreement).
**Source:** client instruction, 2026-11-25 (matrix approved as drafted, option A: fixed in code).

---

## 1. Scope

Until now access was three role lists: who may author records, who may edit an
agreement, who may export contacts. Every signed-in user could see every
section of a record. SPEC-32 replaces the lists with a **role × permission
matrix**: each section of a record has a view and a change permission.

- Zone scope (SPEC-19) is unchanged: it decides **which companies** a user sees.
  SPEC-32 decides **what inside a company** they may see and change.
- The five roles are unchanged. No database migration.
- The matrix is fixed in code (`src/domain/src/permissions.ts`). An admin
  screen to edit it is out of scope.

## 2. Permissions

| Permission | Covers |
|---|---|
| `company.create` | Add New Company wizard, drafts, bulk upload |
| `company.view` / `company.edit` | Company identity, plants, address |
| `contacts.view` / `contacts.edit` | HR, Finance Head, Purchase, POC, Decision Maker, Zonal Manager |
| `commercial.view` / `commercial.edit` | MoU dates, tenure, charges, sign status, payment term, remark |
| `payroll.view` / `payroll.edit` | Trainee categories, allowances, deductions, other payroll terms |
| `documents.view` / `documents.upload` | MoU documents and company certificates |
| `agreement.edit` | Opening Edit Agreement (request + apply) |
| `alerts.ack` | Acknowledging an expiry alert |
| `export.data` | Excel, PDF and record PDF exports |
| `contacts.export` | The contacts Excel, and contact columns in the full Excel |
| `users.manage` | User management (further limited to a super admin, SPEC-21) |

## 3. Matrix

✅ change · 👁 view only · ❌ none

| Section | Admin | Data Entry | HR | Finance | Viewer |
|---|---|---|---|---|---|
| Add company / bulk upload | ✅ | ✅ | ✅ | ✅ | ❌ |
| Company details | ✅ | ✅ | ✅ | 👁 | 👁 |
| Contacts | ✅ | ✅ | ✅ | 👁 | ❌ |
| Commercial | ✅ | ✅ | 👁 | ✅ | 👁 |
| Payroll | ✅ | ✅ | ✅ | ✅ | 👁 |
| Documents | ✅ | ✅ | ✅ | ✅ | 👁 |
| Edit Agreement | ✅ | ❌ | ✅ | ✅ | ❌ |
| Acknowledge alerts | ✅ | ✅ | ✅ | ✅ | ❌ |
| Export (Excel / PDF) | ✅ | ✅ | ✅ | ✅ | ❌ |
| Contacts export | ✅ | ❌ | ✅ | ✅ | ❌ |
| User management | super admin | ❌ | ❌ | ❌ | ❌ |

Decisions taken with the matrix:

1. **Creating a record is its own permission** (`company.create`), held by Admin,
   Data Entry, HR and Finance as before (SPEC-26). The section rules apply to
   later changes, so HR and Finance can still add a company.
2. **The Viewer loses every export** (previously open to all roles).
3. **The full Excel export** leaves out the contact columns of the Companies
   sheet for a role without `contacts.export` (Data Entry).

`company.edit` is part of the matrix, but no screen changes company details
after creation today (Edit Agreement keeps identity locked, SPEC-10 §4).

## 4. Enforcement

Hiding in the UI is not the control (SPEC-02 §3.3). Each rule is enforced by the API.

### 4.1 Route guards

`requirePermission(permission)` answers 401 without a session and 403 when the
role lacks it.

| Route | Permission |
|---|---|
| `GET /api/companies/:id/overview` | `company.view` |
| `GET /api/mous/:mouId/commercial`, `/print` | `commercial.view` |
| `GET /api/mous/:mouId/payroll` | `payroll.view` |
| `GET /api/mous/:mouId/record.pdf`, `/api/export/excel`, `/api/export/pdf`, `/api/export/records.pdf` | `export.data` |
| `GET /api/export/contacts` | `contacts.export` |
| `POST /api/mous/:mouId/edit-request`, `PUT /api/mous/:mouId` | `agreement.edit` |
| Document uploads | `documents.upload` |
| Alert acknowledgement | `alerts.ack` |
| Bulk template / prefill / upload | `company.create` |
| `/api/admin/users*` | `users.manage` + super admin |

### 4.2 Response filtering

A role without `contacts.view` (the Viewer) receives no contact data:

- the overview blanks the HR / Finance names, numbers and emails (`""`) and the
  Purchase, POC, Decision Maker and Zonal Manager fields (`null`);
- search rows blank the HR contact;
- the Print PDF leaves out the contact lines;
- the history compare drops the contacts, so no contact rows are listed.

### 4.3 Edit Agreement per section

`PUT /api/mous/:mouId` carries contacts, commercial and payroll together. A
section the role may only view must come back **unchanged**; otherwise the
whole edit is refused with 403 `You can't change <Section>` (e.g. HR changing
Commercial Details, Finance changing Contact Details). Unchanged sections are
always allowed.

### 4.4 Web

- `can(user, permission)` reads the same matrix.
- Company record: contact rows hidden without `contacts.view`; Export PDF,
  Upload MoU and Edit MoU buttons follow `export.data`, `documents.upload` and
  `agreement.edit`.
- Existing Companies list: the bulk Export PDF button needs `export.data`.
- Sidebar / dashboard: the Export entries need `export.data`.
- Edit Agreement: a tab the role may only view is wrapped in a disabled
  fieldset with a "View only" badge.

## 5. Acceptance criteria

1. Domain: each role holds exactly the permissions of §3 (table-driven test), and
   every change permission implies its view permission.
2. A Viewer gets 403 from every export route and sees no contacts in the
   overview or search rows.
3. Data Entry's full Excel has no contact columns; Admin's has them.
4. HR changing commercial details, or Finance changing a contact, gets 403 and
   nothing is saved; HR may change payroll and contacts, Finance may change
   commercial and payroll.
5. The role lists `AUTHORING_ROLES`, `AGREEMENT_EDIT_ROLES` and
   `CONTACT_EXPORT_ROLES` keep their values; they are now read from the matrix.
