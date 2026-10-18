# SPEC-19 — Zone-Based Data Access

**Depends on:** SPEC-01 (zone master, data model), SPEC-02 (login, session, roles),
and every data spec it restricts: SPEC-03–SPEC-13.
**Source:** client instruction, 2026-10-18 ("strict Zone-Based Role Access / Data Isolation").
**Decisions:** D117–D121 in `docs/design/ADR.md`.

---

## 1. Scope

A user may be tied to one zone. Such a user must be unable to see, change or
export any record belonging to another zone — through the UI, through a direct
API call, or by guessing an id. A user not tied to a zone keeps today's
behaviour and sees every zone.

Out of scope: a user-management screen, users spanning several zones, and
restricting the anonymous login-page counts (§6).

---

## 2. Who is restricted

Access has two independent axes:

| Axis | Stored as | Answers |
|---|---|---|
| **Role** (unchanged) | `user.role`: `ADMIN` / `DATA_ENTRY` / `VIEWER` | *What* the user may do (SPEC-02 §3.3) |
| **Zone scope** (new) | `user.zone_id`: nullable FK to `zone.id` | *Which* records the user may touch |

- `zone_id IS NULL` — **all-zone user** ("super admin" when the role is
  `ADMIN`). No zone restriction is applied anywhere.
- `zone_id` set — **zonal user**. Every rule in §4 applies, whatever the role.

So a zonal `ADMIN` can edit agreements, but only in their zone; a zonal
`VIEWER` can only read, and only their zone.

---

## 3. Identity

The existing server-side session (SPEC-02 §2.1) is kept; no JWT.

- `resolveSession` reads `user.zone_id` with the role on **every** request and
  places it on `request.auth.zoneId`. Changing a user's zone or role therefore
  takes effect on their next request, without a re-login.
- `POST /api/auth/login` and `GET /api/auth/me` also return `zoneId`
  (`null` for an all-zone user) so the UI can adapt. The UI is a convenience
  only; every rule below is enforced by the API.

---

## 4. Rules for a zonal user

A record's zone is its company's `zone_id`. An MOU, document, alert, history
version or proof file belongs to the zone of the company that owns the MOU.

### 4.1 Lists and counts — filtered

Every list, count and aggregate contains only the user's zone:

| Endpoint | Effect |
|---|---|
| `GET /api/zones` | Returns only the user's zone |
| `GET /api/zones/:zoneId/companies` | Another zone → `[]` |
| `GET /api/dashboard/summary`, `/dashboard/recent-activity` | Counted over the user's zone; "Pending Review" counts only drafts whose Page 1 zone is the user's |
| `GET /api/dashboard/zone-wise`, `…/:zoneId/companies` | Only the user's zone row; another zone → empty |
| `GET /api/search` | Only the user's zone |
| `GET /api/alerts/expiring`, `/alerts/count` | Only the user's zone |

A `zoneId` filter naming another zone is not an error — it simply matches
nothing, because the zone restriction is ANDed with every user-supplied filter.

### 4.2 Single records — hidden

A request naming a record of another zone by id gets **exactly the response a
non-existent id gets** (the route's own 404 and message). A 403 would confirm
that the id exists. Applies to:

- `/api/companies/:id/plants`, `/overview`, `/agreements`, `/mous`
- `/api/mous/:mouId/commercial`, `/payroll`, `/print`, `/history…`,
  `/documents`, `/document`, `/edit-request`, `PUT /api/mous/:mouId`,
  `/alerts/acknowledge`
- `/api/documents/:documentId`, `/api/alerts/:alertId/acknowledge`

Routes whose unknown id yields an empty list (`/plants`, `/companies/:id/mous`,
`/mous/:mouId/documents`) yield the same empty list for another zone's id.

"Exactly" holds for well-formed requests. The zone check runs before a route's
own query-string or body validation, so a malformed request naming another
zone's id may get a 404 where an unknown id gets a 400. No data is returned
either way, and ids are random UUIDs that cannot be enumerated.

### 4.3 Exports

- `GET /api/export/excel` and `/export/pdf` build only from the user's zone; a
  PDF for a company of another zone is refused like an unknown company.
- `GET /api/export/jobs/:jobId` and `…/download` answer only the user who
  created the job (any user, zonal or not) — a job's file was built under its
  creator's scope and must not be handed to someone else. Another user's job
  is reported as not found.

### 4.4 Creating records

- The Add Company wizard's Page 1 validation and final submit reject a
  `zoneId` other than the user's with a field error on `zoneId`:
  "You can only add companies in your own zone". Saving a draft is not
  checked: a draft is private to its author and creates no record, and the
  final submit re-checks before anything is written.
- Upload MoU and Edit Agreement act on an MOU, so §4.2 covers them.

---

## 5. All-zone users

No filter is added; behaviour is byte-for-byte today's. The one exception is
§4.3's job-ownership rule, which applies to everyone.

---

## 6. Unchanged on purpose

- `GET /api/public/stats` (D116) stays anonymous and whole-portal. It returns
  four coarse counts and no names; scoping is impossible before login.
- `GET /api/enums` is reference data, not zone data.
- The expiry-alert job (SPEC-08 §3) is a system process and runs over all zones.
- Two previously unauthenticated routes, `GET /api/zones/:zoneId/companies` and
  `GET /api/companies/:id/plants`, and `GET /api/zones` now require a session.
  They returned company names to anyone; §4 cannot hold without this.

---

## 7. Creating zonal users

No UI. `npm run user:create` (in `src/api`) creates a user with a role and an
optional zone code; the password is read from the `NEW_USER_PASSWORD`
environment variable so it never lands in shell history:

```
NEW_USER_PASSWORD=… npm run user:create -- --username pune.viewer --role VIEWER --zone PUNE
```

Omitting `--zone` creates an all-zone user.

---

## 8. Acceptance criteria

With zones A and B, a company and MOU in each, an all-zone ADMIN and a zonal
user of zone A:

1. Login and `/auth/me` return `zoneId` = A for the zonal user and `null` for the all-zone user.
2. `/zones` returns only A to the zonal user and every zone to the all-zone user.
3. Dashboard summary, zone-wise dashboard, search and alerts count only zone A for the zonal user, and both zones for the all-zone user.
4. Every §4.2 endpoint returns the not-found response for zone B's ids to the zonal user, and works for zone A's.
5. Excel and PDF exports by the zonal user contain no zone B row; a PDF for zone B's company is refused.
6. An export job is invisible (status and download) to every user except its creator.
7. The zonal user's Page 1 validation and final submit are refused for zone B, and no company is created.
8. The three formerly anonymous routes return 401 without a session.
9. Changing the zonal user's `zone_id` in the database changes what their very next request returns.
10. The all-zone user's results are identical to before this spec.
