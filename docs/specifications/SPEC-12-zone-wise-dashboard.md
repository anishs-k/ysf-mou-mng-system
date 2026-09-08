# SPEC-12 — Zone Wise Dashboard

**Depends on:** SPEC-01 (zone master, status rule), SPEC-02, SPEC-08 (expiry counts).
**Source:** `docs/project_information.md` §6.5

---

## 1. Scope

A summarised view of companies and MOUs grouped by zone. Read-only reporting;
it creates and changes nothing.

---

## 2. Screen

### 2.1 Summary table
One row per active zone, plus a totals row.

| Column | Meaning |
|---|---|
| Zone | zone name |
| Companies | count of companies in the zone |
| Plants | count of active plants across those companies |
| MOUs | count of current MOUs (`is_current = true`) |
| Active | current MOUs with derived status ACTIVE |
| Expired | current MOUs with derived status EXPIRED |
| New | current MOUs with derived status NEW |
| Expiring ≤ 90 days | current MOUs with `0 <= days_remaining <= 90` |

Status is derived per SPEC-01 §6.2 at query time. Superseded MOU versions are
excluded from every count.

The totals row sums each column across zones. Because a company belongs to
exactly one zone, no company is counted twice.

### 2.2 Scheme breakdown
Below the summary, a zone × scheme matrix showing the count of current MOUs per
zone for each of WILP, BOC and DVOC, MSBTE and FLEXI, with row and column totals.

### 2.3 Filters
- Scheme — restricts every count to one scheme.
- MOU status — restricts to Active, Expired or New.

Filters apply to both tables consistently.

### 2.4 Drill-down
- Clicking a zone name opens the company list for that zone.
- Clicking a count opens the same list pre-filtered to what the number
  represents — clicking "Expired" in the West row lists West's expired MOUs.
- Clicking the "Expiring ≤ 90 days" figure opens the SPEC-08 alert list filtered
  to that zone.

Each drill-down row links to the Existing Company view (SPEC-07).

### 2.5 Empty states
A zone with no companies still appears, with zeros. If no companies exist at all,
the screen shows "No companies recorded yet."

---

## 3. Performance

Counts are computed by aggregate queries, not by loading rows and counting in
application code. Because MOU status is derived from dates rather than stored,
the aggregation filters on `mou_start_date` and `end_date` directly.

Index `mou` on `(is_current, end_date)` and on `company_id` to keep the
aggregation cheap as the record count grows.

---

## 4. API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/dashboard/zone-wise?scheme=&status=` | Summary table and scheme matrix |
| GET | `/api/dashboard/zone-wise/{zoneId}/companies?scheme=&status=` | Drill-down list |

Read-only, available to every authenticated role.

---

## 5. Acceptance criteria

1. Every active zone appears, including zones with zero companies.
2. Company counts per zone sum to the total company count.
3. An MOU starting next month counts under New, not Active.
4. An MOU past its end date counts under Expired.
5. Superseded MOU versions are excluded from all counts.
6. An MOU ending in 45 days counts in both Active and "Expiring ≤ 90 days".
7. Filtering by scheme WILP makes every count reflect only WILP MOUs, in both tables.
8. Clicking the Expired count for a zone lists exactly those MOUs.
9. The scheme matrix row totals equal the MOU count in the summary table for the same zone.
10. No action on this screen writes to the database.
