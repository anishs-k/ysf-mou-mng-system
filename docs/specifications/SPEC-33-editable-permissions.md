# SPEC-33 — Editable Permissions (Roles & Permissions screen)

**Amends:** SPEC-32 (the matrix moves from code to the database), SPEC-21 §6 (User Management navigation).
**Depends on:** SPEC-21 (super admin), SPEC-32 (permissions, enforcement points).
**Source:** client instruction, 2026-11-25.

---

## 1. Scope

SPEC-32 fixed the role × permission matrix in code. SPEC-33 lets a **super admin**
(an ADMIN with all zones) change it from the app, with no deploy.

- The five roles stay the same. Creating new roles is out of scope.
- **ADMIN is locked**: it always holds every permission, so nobody can lock the
  admins out.
- **`users.manage` is never granted** to another role. User Management and this
  screen stay with the super admin.
- **A change permission brings its view permission** (contacts.edit → contacts.view,
  documents.upload → documents.view, contacts.export → contacts.view, and so on).
  Removing a view also removes its change on the screen.

## 2. Data

Migration `0023_spec33_role_permissions`:

| Table | Columns | Notes |
|---|---|---|
| `role_permission` | `role`, `permission`, PK (role, permission) | CHECK role ∈ DATA_ENTRY, HR, FINANCE, VIEWER; CHECK permission ∈ PERMISSIONS without `users.manage`. Seeded with SPEC-32's matrix. ADMIN has no rows. |
| `role_permission_audit` | `id`, `role`, `added` jsonb, `removed` jsonb, `changed_by` → user, `changed_at` | One row per role per save that changed something. Append-only. |

## 3. API

- The session query reads the user's role grants from `role_permission` on every
  request. `request.auth.permissions` is `effectivePermissions(role, stored)`
  (ADMIN → all). So a saved change applies to signed-in users on their next request.
- `/api/auth/login` and `/api/auth/me` return `permissions`.
- Every SPEC-32 check (`requirePermission`, contact filtering, Edit Agreement's
  section check, the Excel contact columns) reads `auth.permissions`, not the role.
- `GET /api/admin/permissions` returns `{ locked: { role: "ADMIN", permissions }, roles: [{ role, permissions }] }`.
- `PUT /api/admin/permissions` takes `{ roles: [{ role, permissions: string[] }] }`
  (one or more editable roles, no duplicates). It answers 400 for ADMIN, an unknown
  role or a malformed body. Grants are normalised, replaced in one transaction and
  audited. It returns the saved matrix.
- Both routes need a session, `users.manage` and a super admin, or they answer 403.

## 4. Web

- **Sidebar:** "User Management" becomes a group, visible to a super admin only.
  Clicking it opens **Users** (`/admin/users`) and **Roles & Permissions**
  (`/admin/permissions`) beneath it. It stays open while one of them is shown.
- **Roles & Permissions screen:**
  - One row per section; one column per role (Admin first, locked with a lock icon).
  - Each cell has View and Change ticks.
  - **Save (n)** opens a confirmation that lists, per role, what is added (+) and
    removed (−). **Confirm save** sends the changed roles. **Discard** reverts.
- Every UI rule (`can`, `canOpenPath`) reads `user.permissions` from the session.

## 5. Acceptance criteria

1. Migration 0023 seeds exactly SPEC-32's matrix, and nothing for ADMIN.
2. Only a super admin may read or save. A zonal admin or any other role gets 403.
3. Saving the Viewer with `contacts.export` and `users.manage` stores
   `contacts.view` + `contacts.export` and no `users.manage`, and writes one audit
   row with the added and removed permissions.
4. ADMIN, unknown roles and malformed bodies get 400.
5. After a Viewer is granted `export.data`, that already signed-in Viewer's next
   `/api/export/excel` is accepted, and `/api/auth/me` lists `export.data`.
