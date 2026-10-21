/**
 * Purpose: The Existing Companies screen - a company-name search (debounced, 2+
 * characters) with zone, scheme and status filters over GET /api/search, one
 * server page at a time with a pager, and the record view (existingCompany/
 * CompanyRecord.tsx) that opens from a row, its View button, or a
 * ?zoneId=&companyId= deep link (which opens the company's newest active MoU).
 * SPEC-24: Export PDF downloads every record the current filters select as one PDF.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { downloadRecordsPdf, fetchCompanyAgreements, fetchSearch } from "../api/client.ts";
import type { SearchFilters, SearchResponse } from "../api/client.ts";
import { SCHEME_FILTER_OPTIONS, STATUS_FILTER_OPTIONS, useZoneOptions } from "../hooks/useSearchFilterOptions.ts";
import { Field, SelectInput } from "../ui/form.tsx";
import { PENDING_FIGURE, displayStatus, formatCalendarDate, schemeLabel } from "../ui/format.ts";
import { saveBlob } from "../ui/download.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Pager } from "../ui/Pager.tsx";
import { Badge, Card } from "../ui/primitives.tsx";
import { BRAND, statusTone } from "../ui/theme.ts";
import { CompanyRecord } from "./existingCompany/CompanyRecord.tsx";
import type { RecordSelection } from "./existingCompany/CompanyRecord.tsx";

const COLUMNS = ["Company", "MoU Code", "Zone", "Plant", "Scheme", "Expires", "Status", ""];
const TH_CLASS = "px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide";
const GHOST_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-3 py-1.5 text-xs  ";
const EXPORT_BUTTON =
  "inline-flex items-center justify-center gap-2 h-10 px-4 font-semibold transition-all duration-150 border select-none rounded-lg bg-secondary text-primary border-border text-xs hover:bg-blue-100 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer";

/** The API rejects a shorter company query; typing pauses this long before searching. */
const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;
const LOAD_ERROR = "Could not load company records. Please refresh the page.";

interface Filters {
  readonly zoneId: string;
  readonly scheme: string;
  readonly status: string;
}

const NO_FILTERS: Filters = { zoneId: "", scheme: "", status: "" };

function toSearchFilters(filters: Filters, query: string): SearchFilters {
  const q = query.trim();
  const byCompany: SearchFilters = q.length >= MIN_QUERY_LENGTH ? { by: "company", q } : {};
  return { ...byCompany, zoneId: filters.zoneId, scheme: filters.scheme, status: filters.status };
}

export function ExistingCompaniesScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const zones = useZoneOptions();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<RecordSelection | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  // ?zoneId=&companyId= (from other screens) opens that company's newest active MoU.
  const linkedCompanyId = searchParams.get("companyId") ?? "";
  useEffect(() => {
    if (linkedCompanyId === "") return;
    let cancelled = false;
    fetchCompanyAgreements(linkedCompanyId)
      .then((agreements) => {
        const mou = agreements.find((agreement) => agreement.isActive) ?? agreements[0];
        if (!cancelled && mou !== undefined) setSelected({ mouId: mou.mouId, companyId: linkedCompanyId });
      })
      .catch(() => {
        if (!cancelled) setLoadError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [linkedCompanyId]);

  useEffect(() => {
    if (query === debouncedQuery) return;
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, debouncedQuery]);

  useEffect(() => {
    let cancelled = false;
    fetchSearch(toSearchFilters(filters, debouncedQuery), page)
      .then((response) => {
        if (cancelled) return;
        setResult(response);
        setLoadError("");
      })
      .catch(() => {
        if (!cancelled) setLoadError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [filters, debouncedQuery, page]);

  const update = (patch: Partial<Filters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };
  const clear = () => {
    setFilters(NO_FILTERS);
    setQuery("");
    setPage(1);
  };
  // SPEC-24: the same filters the table shows, so the PDF holds exactly the listed records.
  const exportPdf = () => {
    setExporting(true);
    setExportError("");
    downloadRecordsPdf(toSearchFilters(filters, debouncedQuery))
      .then(({ blob, filename }) => saveBlob(blob, filename))
      .catch((reason: unknown) => setExportError(reason instanceof Error ? reason.message : "Export failed."))
      .finally(() => setExporting(false));
  };
  const closeRecord = () => {
    setSelected(null);
    if (linkedCompanyId !== "") setSearchParams({}, { replace: true });
  };

  if (selected !== null) return <CompanyRecord selection={selected} onBack={closeRecord} />;

  const rows = result?.rows ?? [];
  return (
    <ScreenFrame
      title="Existing Companies"
      subtitle="Search, view and manage MoU company records"
      contentClassName="p-4 md:p-6 space-y-4 md:space-y-5"
    >
      {exportError !== "" && (
        <div role="alert" className="rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
          {exportError}
        </div>
      )}
      {loadError !== "" && (
        <div role="alert" className="rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
          {loadError}
        </div>
      )}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
          <div className="relative flex-1 min-w-0 sm:min-w-52">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Icon name="search" className="w-4 h-4" />
            </span>
            <input
              placeholder="Search by company name…"
              aria-label="Search by company name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full h-10 pl-9 pr-3 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Field className="flex-1 sm:w-44">
              <SelectInput ariaLabel="Zone" options={zones} value={filters.zoneId} onChange={(zoneId) => update({ zoneId })} />
            </Field>
            <Field className="flex-1 sm:w-32">
              <SelectInput ariaLabel="Scheme" options={SCHEME_FILTER_OPTIONS} value={filters.scheme} onChange={(scheme) => update({ scheme })} />
            </Field>
            <Field className="flex-1 sm:w-36">
              <SelectInput ariaLabel="Status" options={STATUS_FILTER_OPTIONS} value={filters.status} onChange={(status) => update({ status })} />
            </Field>
            <button type="button" onClick={clear} className={GHOST_BUTTON}>
              Clear
            </button>
            <button
              type="button"
              onClick={exportPdf}
              disabled={exporting || result?.total === 0}
              aria-busy={exporting}
              className={EXPORT_BUTTON}
            >
              {exporting ? (
                <span aria-hidden="true" className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <Icon name="download" />
              )}
              {exporting ? "Exporting…" : "Export PDF"}
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <p className="text-sm font-bold" style={{ color: BRAND.navy }}>
            {result === null ? PENDING_FIGURE : result.total} records found
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {COLUMNS.map((heading) => (
                  <th key={heading} className={TH_CLASS}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = displayStatus(row.status, row.endDate);
                const open = () => setSelected({ mouId: row.mouId, companyId: row.companyId, companyName: row.companyName });
                return (
                  <tr
                    key={row.mouId}
                    onClick={open}
                    className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 font-semibold text-foreground text-xs">{row.companyName}</td>
                    <td className="px-4 py-3 mono text-xs font-bold" style={{ color: BRAND.blue }}>
                      {row.generatedCode}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{row.zoneName}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{row.plantName ?? PENDING_FIGURE}</td>
                    <td className="px-4 py-3">
                      <Badge text={schemeLabel(row.scheme)} tone="info" />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs mono">{formatCalendarDate(row.endDate)}</td>
                    <td className="px-4 py-3">
                      <Badge text={status} tone={statusTone(status)} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          open();
                        }}
                        className={GHOST_BUTTON}
                      >
                        <Icon name="eye" className="w-4 h-4" />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {result !== null && <Pager page={result.page} total={result.total} pageSize={result.pageSize} onPage={setPage} />}
      </Card>
    </ScreenFrame>
  );
}
