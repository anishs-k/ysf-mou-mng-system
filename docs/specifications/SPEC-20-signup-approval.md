# SPEC-20 — Self Sign-Up with Admin Approval

**Depends on:** SPEC-02 (login, session, roles), SPEC-19 (zone scope, super admin).
**Source:** client instruction, 2026-10-18.
**Decisions:** D122–D127 in `docs/design/ADR.md`.

---

## 1. Scope

A person can request an account themselves. The request is held as **pending**
until a super admin approves it (choosing the role) or rejects it. Until then
the person cannot sign in.

Out of scope: email notifications, password reset, and editing an already
decided user. The two screens are described in §3.1.

---

## 2. Data

`user` gains:

| Column | Type | Rule |
|---|---|---|
| `approval_status` | `varchar(10)` NOT NULL, CHECK `PENDING` / `APPROVED` / `REJECTED` | Default `PENDING` |
| `full_name` | `varchar(150)` NULL | Set by sign-up |
| `approval_decided_by` | `uuid` NULL → `user.id` | Who approved / rejected |
| `approval_decided_at` | `timestamptz` NULL | When |

and `username` widens from 50 to 255 characters, because a signed-up user's
username **is** their email (D123).

**Migration:** every row that exists when the migration runs becomes
`APPROVED`; only rows inserted afterwards default to `PENDING`. Without this the
existing ADMIN would be locked out. Every trusted creation path — `db:seed`,
`user:create`, test fixtures, the e2e setup — inserts `APPROVED` explicitly.

---

## 3. Sign-up — `POST /api/auth/signup`

No session required. Body:

```json
{ "email": "a@b.com", "password": "…", "fullName": "…", "zoneId": "<uuid>" }
```

| Field | Rule |
|---|---|
| `email` | Valid format, ≤ 255 characters; stored lower-cased as both `email` and `username` |
| `password` | 8–128 characters |
| `fullName` | 2–150 characters after trimming |
| `zoneId` | An active zone |

Responses:

- `201 { "approvalStatus": "PENDING", "message": "…" }` — a user is created with
  `approval_status = PENDING`, role `VIEWER` (least privilege, replaced at
  approval), the chosen `zone_id`, and **no session**.
- `400 { "error", "errors": { field: message } }` — validation failure.
- `409 { "error": "This email is already registered." }` — the email or the
  username is taken (D124: clear UX accepted over hiding which emails exist).
- `429 { "error", "retryAfterSeconds" }` — more than 5 sign-ups from one client
  IP; the IP is then refused for 15 minutes. Reuses the `login_attempt` lockout
  table under the key `signup-ip:<ip>` (D125).

Every signed-up user is a **zonal** user of the zone they chose (SPEC-19).

The form's zone dropdown is filled from `GET /api/public/zones`, which needs no
session and returns only `[{ id, name }]` of active zones (D127). `/api/zones`
stays behind a session (SPEC-19 D121).

### 3.1 Screens

- `/signup` — the sign-up form in the login screen's layout, reached from a
  "Create an account" link on the login card; on success it shows that the
  request awaits approval.
- `/admin/approvals` — "User Approvals" in the sidebar's Operation section,
  shown to a super admin only: the pending list with a role choice and
  Approve / Reject (reject asks for confirmation). Anyone else opening the URL
  sees "Not available".

---

## 4. Login

After the password is verified:

| Status | Response | Session |
|---|---|---|
| `APPROVED` | Unchanged (200) | Created |
| `PENDING` | `403 { "error": "Your account is awaiting admin approval.", "approvalStatus": "PENDING" }` | None |
| `REJECTED` | `403 { "error": "Your sign-up request was not approved.", "approvalStatus": "REJECTED" }` | None |

A wrong password still gets the generic 401, whatever the status — the status
is revealed only to someone who already knows the password. `resolveSession`
also accepts only `APPROVED` users, so a session can never outlive approval.

---

## 5. Approval — super admin only

A super admin is an `ADMIN` whose `zone_id` is NULL (SPEC-19 D117). Any other
signed-in user gets `403 Forbidden`; no session gets 401.

### 5.1 `GET /api/admin/users/pending`

Pending users, oldest first:
`[{ userId, email, fullName, zoneId, zoneName, requestedAt }]`.

### 5.2 `POST /api/admin/users/:userId/decision`

```json
{ "decision": "APPROVE", "role": "DATA_ENTRY" }   // or "VIEWER"
{ "decision": "REJECT" }
```

- `APPROVE` requires `role` of `DATA_ENTRY` or `VIEWER`; `ADMIN` cannot be
  granted here (D126). Sets the status, the role, `approval_decided_by` and
  `approval_decided_at`.
- `REJECT` sets the status and the audit columns; the role is left as is.
- `200 { userId, approvalStatus, role }` on success.
- `400` — bad decision or role. `404 "User not found"`. `409 "This request has
  already been decided"` — only a `PENDING` user can be decided, so two admins
  deciding at once cannot overwrite each other.

---

## 6. Acceptance criteria

1. Running the migration leaves every pre-existing user `APPROVED` and able to log in.
2. A valid sign-up returns 201, creates a `PENDING` `VIEWER` with the chosen zone and full name, and sets no cookie.
3. Invalid email, short password, short name, unknown or inactive zone each return 400 naming the field.
4. A second sign-up with the same email, in any letter case, returns 409.
5. The sixth sign-up from one IP returns 429.
6. A pending user with the right password gets 403 "awaiting admin approval" and no cookie; with a wrong password, the generic 401.
7. A rejected user gets 403 "not approved" and no cookie.
8. The pending list is visible to a super admin only; a zonal ADMIN, a DATA_ENTRY and a VIEWER get 403.
9. Approving with `DATA_ENTRY` lets the user log in with that role and their zone; approving with `ADMIN` or without a role returns 400.
10. Deciding an already decided user returns 409; an unknown id 404.
11. `GET /api/public/zones` answers without a session with only the active zones' `id` and `name`.
