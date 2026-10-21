# SPEC-24 — Bulk Record PDF from the Existing Companies List

**Amends:** SPEC-13 (a third export, the list's bulk record PDF), SPEC-23 §5 (the record PDF renderer and loader now take many records).
**Depends on:** SPEC-13 (`/api/search` filters and `searchMous`), SPEC-19 / SPEC-21 (zone scope), SPEC-23 §5 (the record PDF template).
**Source:** client instruction, 2026-10-20.
**Decisions:** D149–D150 in `docs/design/ADR.md`.

---

## 1. Scope

From the Existing Companies list, any signed-in user downloads **one PDF holding the full record of every MoU the current filters select** — the same designed template as the record view's Export PDF (SPEC-23 §5), once per MoU.

Out of scope: choosing individual rows, background generation, emailing the file.

## 2. UI — Existing Companies list

- An **Export PDF** button sits right after **Clear** in the filter row, with a download icon.
- While the file is being built the button is disabled, shows a spinner and reads **Exporting…**.
- It uses exactly the filters the table shows: the company search (once it has 2+ characters), Zone, Scheme and Status.
- It is disabled when the list has no records.
- On success the browser saves `companies-<YYYY-MM-DD>.pdf` (received as a Blob, saved through an object URL). On failure the API's message is shown above the filters.

## 3. API — `GET /api/export/records.pdf`

- **Parameters:** the `/api/search` filters (`by`, `q`, `zoneId`, `scheme`, `status`, `startFrom`, `startTo`), parsed by the same `parseSearchFilters`. An invalid combination gets the same **422** as `/search`.
- **Records:** every MoU `searchMous` returns for those filters under the caller's zone scope, in the list's order. There is **no record limit** (D149).
- **No match:** **422** `"No MoU records match the filters"`, so an empty PDF is never sent.
- **Response:** `200`, `application/pdf`, `Content-Disposition: attachment; filename="companies-<business date>.pdf"`, and `X-Record-Count`. Both headers are exposed to the web app's origin.
- **Who:** any signed-in role, the same as `/search` and the record PDF. **401** without a session.
- The file is built and streamed in the request, with no export job row: it is ready in seconds (§4).

## 4. Loading in batch (D149)

Each view loader in `db/mou-view.ts` has a batch form that loads any number of records in a fixed handful of queries (`inArray`): `fetchCompanyOverviews`, `fetchCompaniesAgreements`, `fetchMouCommercialDetails` and `fetchMouPayrollDetails`. `loadCompanyRecords` uses them, plus two document queries. The one-record functions the screens use are now the one-id case of the batch forms, so a single record and a bulk export can never differ.

Measured on the client's database (374 MoUs): ~3 s to load every record, ~2 s to render 748 pages (8 MB), against ~1 s **per record** before.

## 5. Template (D150)

`renderCompanyRecordsPdf(records)`:
- Draws each record with the SPEC-23 §5 template.
- Starts each record on a **new page** with its own header band (logo, company name, Zone · MoU code, status).
- Pages that a record runs onto carry **that record's** running header.
- "Page x of y" counts across the whole file.
- The record view's single PDF is the one-record case.

## 6. Acceptance criteria

- **AC1** With no filters, the PDF holds every MoU the list shows. `X-Record-Count` equals the list total.
- **AC2** Scheme, zone, status and company-search filters narrow the PDF exactly as they narrow the list.
- **AC3** A zonal user's PDF holds only their zones' MoUs.
- **AC4** No match → 422. An invalid filter → the same 422 as `/search`. No session → 401.
- **AC5** Each record starts on a new page with its header band. The pages of a two-record file equal the pages of the two records rendered alone.
- **AC6** The button is disabled with a spinner and "Exporting…" while the request runs, then the file downloads as `companies-<date>.pdf`.
- **AC7** For every active MoU, the batch loader returns exactly what the one-record loader returns.
