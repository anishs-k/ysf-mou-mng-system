# SPEC-21 — Admin User Management (Admin Provisioning)

**Replaces:** SPEC-20 (Self Sign-Up with Admin Approval) — in full.
**Amends:** SPEC-19 (a user may now be scoped to *several* zones), SPEC-01 §5.11.
**Depends on:** SPEC-02 (login, session, roles, password hashing), SPEC-19 (zone isolation).
**Source:** client instruction, 2026-10-19.
**Decisions:** D128–D135 in `docs/design/ADR.md`.

---

## 1. Scope

> **Self sign-up is completely removed.** Nobody can create their own account.
> Every account is created by a super admin. There is no sign-up page, no
> "Create an account" link, no pending/approval state and no anonymous route
> that creates or lists anything.

In place of SPEC-20, a super admin manages users directly: create, edit
(username, email, password, role, zones) and delete. A user may be assigned
**any number of zones** and then sees the data of all of them.

Out of scope: password reset by email, "Forgot Password" (still SPEC-15),
forcing a password change on first login (D18), and an audit log of user edits.

### 1.1 What is removed (everything SPEC-20 added)

| Removed | Was |
|---|---|
| `POST /api/auth/signup` | Anonymous sign-up |
| `GET /api/public/zones` | Zone list for the anonymous sign-up form |
| `GET /api/admin/users/pending` | Pending-request queue |
| `POST /api/admin/users/:userId/decision` | Approve / reject |
| `/signup` screen and the login card's "New here? Create an account" link | Sign-up form |
| `/admin/approvals` screen, "User Approvals" sidebar entry | Approval queue |
| `user.approval_status`, `approval_decided_by`, `approval_decided_at` | Approval state |
| Login's 403 "awaiting approval" / "not approved" answers | Status gate |
| The `signup-ip:<ip>` rate limit (D125) | Sign-up abuse limit |

The removed routes answer like any unknown route. `user.full_name` is kept and
is now set by the admin.

---

## 2. Data — how a user is assigned several zones

SPEC-19's single `user.zone_id` is replaced by a **junction table** (D128):

```
user  1 ──── * user_zone * ──── 1  zone
```

### 2.1 `user_zone` (new)

| Column | Type | Rule |
|---|---|---|
| `user_id` | `uuid` NOT NULL → `user.id` | ON DELETE RESTRICT |
| `zone_id` | `uuid` NOT NULL → `zone.id` | ON DELETE RESTRICT |

`PRIMARY KEY (user_id, zone_id)` — a zone is assigned to a user at most once.
Index `user_zone_zone_idx (zone_id)`.

Example — user *pune.west* sees Pune and Mumbai:

| user_id | zone_id |
|---|---|
| `…pune.west…` | `…PUNE…` |
| `…pune.west…` | `…MUMBAI…` |

### 2.2 `user` changes

| Column | Change |
|---|---|
| `all_zones` | **Added** — `boolean NOT NULL DEFAULT false`. `true` = the user sees every zone and `user_zone` is ignored for them (D129) |
| `zone_id` | **Dropped** — replaced by `user_zone` |
| `approval_status`, `approval_decided_by`, `approval_decided_at` | **Dropped** — self sign-up is gone |
| `full_name` | Kept — `varchar(150)` NULL, set by the admin |

A user's **zone scope** is therefore:

| `all_zones` | `user_zone` rows | Scope |
|---|---|---|
| `true` | ignored | Every zone (all-zone user) |
| `false` | one or more | Exactly those zones (zonal user) |
| `false` | none | **No zone** — sees nothing. Only reachable by broken data; the API never creates it (§4). Fails closed, never open |

A **super admin** is an active `ADMIN` with `all_zones = true` (replaces SPEC-19
D117's "ADMIN with NULL zone").

### 2.3 Migration

Two migrations, applied in order:

1. `0011_spec21_user_zones` — creates `user_zone`, adds `all_zones`, then
   **backfills** (D130):
   - `all_zones = (zone_id IS NULL)` — every existing all-zone user stays all-zone;
   - one `user_zone` row per user whose `zone_id` is set — every zonal user keeps exactly their zone;
   - users whose `approval_status` is not `APPROVED` get `is_active = false`, so an unapproved sign-up never becomes a working login.
2. `0012_spec21_drop_signup` — drops `zone_id` and the three approval columns.

After both, every pre-existing approved user signs in and sees exactly what they saw before.

---

## 3. Identity and scope on the session

- `resolveSession` reads `role`, `all_zones` and the user's `user_zone` ids on
  **every** request (SPEC-19 D118 kept), so a role or zone change applies on the
  user's next request without a re-login. It accepts only `is_active` users.
- `request.auth` carries `zoneScope`: `null` for an all-zone user, otherwise the
  array of assigned zone ids.
- `POST /api/auth/login` and `GET /api/auth/me` return, in place of SPEC-19's
  `zoneId`:

```json
{ "allZones": false, "zoneIds": ["<uuid>", "<uuid>"] }
```

  (`"allZones": true, "zoneIds": []` for an all-zone user.)

## 4. Data isolation for a multi-zone user

Every SPEC-19 §4 rule holds unchanged, with "the user's zone" read as **"any of
the user's zones"**:

- Lists, counts, aggregates, search, alerts, dashboards and exports contain only
  records whose company's `zone_id` is in the user's zones. In SQL:
  `($n::uuid[] IS NULL OR c.zone_id = ANY($n))`; in Drizzle:
  `inArray(company.zoneId, scope)`. A `zoneId` filter is still ANDed with the scope.
- `GET /api/zones` returns only the user's zones.
- A single record of a zone outside the user's zones answers exactly like an
  unknown id (D119).
- The Add Company wizard accepts a `zoneId` only from the user's zones; otherwise
  the field error on `zoneId` is "You can only add companies in your assigned zones".
- Export jobs stay creator-only (D120).

All-zone users are unaffected.

---

## 5. User management API — super admin only

Every route needs a session (else 401) of a super admin (else `403 Forbidden`).

User object returned by every route:

```json
{
  "userId": "<uuid>", "username": "pune.west", "email": "pune@ysf.in",
  "fullName": "Pune West Officer", "role": "VIEWER",
  "allZones": false,
  "zones": [{ "id": "<uuid>", "name": "Mumbai" }, { "id": "<uuid>", "name": "Pune" }],
  "createdAt": "2026-10-19T10:00:00Z"
}
```

`zones` is sorted by name and is `[]` when `allZones` is true.

### 5.1 Field rules (create and edit)

| Field | Rule |
|---|---|
| `username` | Trimmed, lower-cased, 3–255 chars, only `a–z 0–9 . _ - @`. Unique |
| `email` | Valid format, ≤ 255, lower-cased. Unique |
| `fullName` | Optional; if given, 2–150 chars after trimming |
| `password` | 8–128 characters. Stored only as the SPEC-02 scrypt hash (`auth/password.ts`); never returned or logged |
| `role` | `ADMIN`, `DATA_ENTRY` or `VIEWER` |
| `allZones` | Boolean |
| `zoneIds` | Required and non-empty when `allZones` is false: distinct ids of **active** zones. Must be empty or absent when `allZones` is true |

Validation failure → `400 { "error", "errors": { field: message } }`.
Username or email taken (by any user, including a deleted one under its old
name — see §5.5) → `409 { "error", "errors": { "username" | "email": "…already in use" } }`.

### 5.2 `GET /api/admin/users`

All **active** users, ordered by username. Deleted users are not listed.

### 5.3 `POST /api/admin/users`

Body: `{ username, email, fullName?, password, role, allZones, zoneIds }`.
Creates the user and their `user_zone` rows in **one transaction**.
`201` with the user object.

### 5.4 `PATCH /api/admin/users/:userId`

Body: any subset of `{ username, email, fullName, password, role, allZones, zoneIds }`.

- Only fields present are changed; `password` omitted or empty means unchanged.
- `zoneIds` **replaces** the whole set (delete + insert, one transaction).
  Setting `allZones: true` removes all `user_zone` rows; setting
  `allZones: false` requires a non-empty `zoneIds` in the same request unless
  the user already has zones.
- A password change deletes all of that user's sessions (D135). Role, zone and
  identity changes apply on the next request (D118).
- `200` with the updated user object. Unknown or deleted id → `404 "User not found"`.

### 5.5 `DELETE /api/admin/users/:userId`

Soft delete (D132): sets `is_active = false`, deletes the user's sessions, and
renames `username` and `email` to `<original>#deleted-<first 8 hex of id>`
(truncated to fit 255) so both can be used again. `#` is not a valid username
character, so a renamed value can never clash with a real one. Rows that
reference the user (`created_by`, `edited_by`, …) are untouched, so history
still names who did what. `204`. Unknown or already deleted id → `404`.

### 5.6 Safeguards (D133)

- A super admin cannot delete themselves, nor change their own `role` or
  `allZones` → `409 "You cannot remove your own super admin access"`.
- No request may leave **zero** active super admins → `409`. The check runs in
  the same transaction as the change, with the super-admin rows locked, so two
  admins demoting each other at once cannot both succeed.

### 5.7 Who can be created (D134)

A super admin may create users of any role and scope, including another super
admin (`ADMIN` + `allZones`). This replaces D126.

---

## 6. Screens

- **Login** — the "New here? Create an account" link is removed. `/signup` no longer exists.
- **`/admin/users` — "User Management"** — replaces "User Approvals" in the
  sidebar's Operation section; shown to a super admin only (anyone else opening
  the URL sees "Not available", as today).
  - Table: Username, Full name, Email, Role, Zones (names, or "All zones"), Created.
  - **Add User** opens a form: Username, Email, Full name, Password, Confirm
    Password (client-side check only), Role, Zone access: an **"All zones"**
    switch, or a **multi-select of zones** (at least one required).
  - **Edit** opens the same form filled in; Password is blank and left blank means unchanged.
  - **Delete** asks for confirmation.
  - Server field errors are shown under their fields. Own row: Delete and the
    role / zone-access controls are disabled (§5.6).

## 7. Operator CLI

`npm run user:create` (SPEC-19 §7) stays, to bootstrap the first super admin:
`--zone` now takes a comma-separated list of zone codes; omitting it creates an
all-zone user. `db:seed` creates its ADMIN with `all_zones = true`.

```
NEW_USER_PASSWORD=… npm run user:create -- --username pune.west --role VIEWER --zone PUNE,MUMBAI
```

---

## 8. Acceptance criteria

1. After the migrations, every pre-existing approved user can log in; a former all-zone user is `all_zones = true` with no `user_zone` rows; a former zonal user has exactly one `user_zone` row for their old zone; former PENDING/REJECTED users are inactive and cannot log in.
2. `POST /api/auth/signup`, `GET /api/public/zones`, `GET /api/admin/users/pending` and `POST /api/admin/users/:id/decision` no longer exist; the login page has no sign-up link and `/signup` does not render a form.
3. A super admin creates a user with two zones → 201; the user logs in and `/auth/me` returns `allZones: false` and both zone ids.
4. That user's dashboard, zone-wise dashboard, search, alerts and exports contain both zones' records and no third zone's; a record id of a third zone answers like an unknown id.
5. Their Add Company submit is accepted for either assigned zone and refused for a third zone.
6. The stored password is a scrypt hash, never the plaintext; the API never returns it.
7. Create/edit refuse: missing or invalid fields (400 naming the field), `allZones: false` with no zones, an inactive or unknown zone, a duplicate username or email in any letter case (409).
8. Editing zones replaces the set and the user's very next request reflects it; changing the password ends the user's existing sessions and the new password works.
9. Deleting a user makes their login and existing sessions fail, removes them from the list, and frees their username and email for a new user; their old records still show them as creator.
10. A super admin cannot delete or demote themselves; no sequence of requests leaves zero active super admins.
11. Every `/api/admin/users` route returns 401 without a session and 403 to a zonal ADMIN, a DATA_ENTRY and a VIEWER.
12. All-zone users' results are identical to before this spec.
