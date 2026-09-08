# SPEC-08 — MOU Expiry Alerts

**Depends on:** SPEC-01 (end date, status), SPEC-02 (dashboard badge).
**Source:** `docs/project_information.md` §6.1, §8.6, §10.6

---

## 1. Scope

Warn users 30, 60 and 90 days before an MOU expires so renewal can be planned in
time. Covers the alert list screen, the dashboard badge, and the scheduled job
that raises alerts.

---

## 2. Alert rule

```
days_remaining = end_date - today

alert thresholds: 90, 60, 30 days
```

An MOU raises an alert on the day `days_remaining` equals exactly 90, 60 or 30.
Only `is_current = true` MOUs are considered. Already-expired MOUs raise no new
alert but remain visible in the list under an "Expired" filter.

Because the trigger is an exact match, a job that fails to run one day would
silently skip that threshold. The job therefore records the last successful run
date and, on the next run, evaluates every day it missed.

---

## 3. Scheduled job

- Runs once daily at a configured time.
- Evaluates all current MOUs against the thresholds.
- Writes one `mou_alert` row per (MOU, threshold), never duplicating an existing one.
- Is safe to run twice on the same day — a second run creates no extra rows.

### 3.1 `mou_alert`
| Column | Type | Notes |
|---|---|---|
| id | PK | |
| mou_id | FK | |
| threshold_days | int | 90, 60 or 30 |
| triggered_on | date | |
| acknowledged_at | timestamp | nullable |
| acknowledged_by | FK user | nullable |
| notified_at | timestamp | nullable, set when the notification was sent |

Unique on `(mou_id, threshold_days)`.

---

## 4. Alert list screen

Reached from Dashboard Home. Shows every unacknowledged alert, newest threshold
first.

**Columns:** Company Name, Generated Code, Zone, Plant, Scheme, MOU Start Date,
End Date, Days Remaining, Threshold, Status.

**Filters:** threshold (30 / 60 / 90 / all), zone, scheme, and acknowledged state.

**Row actions:** open the company in the Existing Company view (SPEC-07), and
**Acknowledge**, which stamps `acknowledged_at` and `acknowledged_by` and drops
the row from the default list.

An MOU that has passed its end date shows Days Remaining as a negative value and
status Expired.

---

## 5. Dashboard badge

Dashboard Home shows a count of current MOUs with `0 <= days_remaining <= 90`.
This is a live count, not a count of `mou_alert` rows, so a newly created MOU
that is already inside the window appears immediately without waiting for the
nightly job. Clicking the badge opens the alert list.

---

## 6. Notification delivery

Default: **in-app only** — the badge and the alert list. Email delivery is
implemented behind a configuration flag, disabled by default. When enabled,
recipients are the company's HR and Finance Head email on file, plus all ADMIN
users.

> **DECISION-PENDING (Q9)** — the source does not state a delivery channel.
> Default is in-app; the email path exists but is off until confirmed. Turning
> it on must not require changing the alert rule or the job.

---

## 7. API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/alerts/expiring?days=30\|60\|90\|all&zoneId=&scheme=&acknowledged=` | Alert list |
| GET | `/api/alerts/count` | Badge count of current MOUs within 90 days |
| POST | `/api/alerts/{alertId}/acknowledge` | Acknowledge an alert |

Read endpoints are open to all roles. Acknowledge requires ADMIN or DATA_ENTRY.

---

## 8. Acceptance criteria

1. An MOU ending exactly 90 days from today raises one alert with `threshold_days = 90`.
2. Running the job twice on the same day creates no duplicate alert row.
3. If the job does not run for three days, the next run raises any threshold crossed during those days.
4. An MOU ending 45 days from today raises no alert but is included in the badge count.
5. An MOU ending 120 days from today is not in the badge count.
6. Acknowledging an alert removes it from the default list and preserves who acknowledged it and when.
7. An expired MOU shows negative days remaining and status Expired, and raises no new alerts.
8. Superseded MOU versions (`is_current = false`) never raise alerts.
9. With the email flag off, no email is sent and `notified_at` stays null.
