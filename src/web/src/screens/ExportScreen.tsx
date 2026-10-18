/**
 * Purpose: The Export Data screen - zone / scheme / company (2+ characters) /
 * status / start-date filters with a live "N records match" count from GET
 * /api/search, "Export Filtered Data" as a server Excel export of the same
 * filters, and the report cards: MoU Summary (Excel, no filters), Expiry (Excel,
 * status EXPIRING), an all-zones PDF report, and the bulk-documents ZIP, which
 * has no API yet and is shown disabled.
 */

import { useEffect, useState } from "react";

import { fetchSearch, startExcelExport, startPdfExport } from "../api/client.ts";
import type { ExportJobStatus, SearchFilters } from "../api/client.ts";
import { useExportDownload } from "../hooks/useExportDownload.ts";
import { SCHEME_FILTER_OPTIONS, STATUS_FILTER_OPTIONS, useZoneOptions } from "../hooks/useSearchFilterOptions.ts";
import { Field, SelectInput, TextInput } from "../ui/form.tsx";
import { PENDING_FIGURE } from "../ui/format.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge, Button, Card, SectionTitle } from "../ui/primitives.tsx";
import { BRAND } from "../ui/theme.ts";

interface Filters {
  readonly zoneId: string;
  readonly scheme: string;
  readonly company: string;
  readonly status: string;
  readonly from: string;
  readonly to: string;
}

interface Report {
  readonly key: string;
  readonly title: string;
  readonly caption: string;
  readonly format: string;
  /** Absent for a report the API cannot produce yet. */
  readonly start?: () => Promise<ExportJobStatus>;
}

const NO_FILTERS: Filters = { zoneId: "", scheme: "", company: "", status: "", from: "", to: "" };
/** The API rejects a shorter company query; typing pauses this long before counting. */
const MIN_QUERY_LENGTH = 2;
const COUNT_DEBOUNCE_MS = 300;
const FILTERED_KEY = "filtered";
const RANGE_ERROR = "The From Date must not be after the To Date.";
const COUNT_ERROR = "Could not count the matching records. Please refresh the page.";

const REPORTS: readonly Report[] = [
  {
    key: "summary",
    title: "MoU Summary Report",
    caption: "All company MoU records with status",
    format: "Excel (.xlsx)",
    start: () => startExcelExport({}),
  },
  {
    key: "expiry",
    title: "Expiry Report",
    caption: "Companies with upcoming expirations",
    format: "Excel (.xlsx)",
    start: () => startExcelExport({ status: "EXPIRING" }),
  },
  {
    key: "pdf",
    title: "PDF Report",
    caption: "Zone-wise MoU summary across all zones",
    format: "PDF (.pdf)",
    start: () => startPdfExport({ scope: "all_zones" }),
  },
  { key: "zip", title: "MoU Documents Bulk", caption: "Bulk PDF download of signed MoUs", format: "ZIP (.zip)" },
];

function toSearchFilters(filters: Filters): SearchFilters {
  const q = filters.company.trim();
  const byCompany: SearchFilters = q.length >= MIN_QUERY_LENGTH ? { by: "company", q } : {};
  return {
    ...byCompany,
    zoneId: filters.zoneId,
    scheme: filters.scheme,
    status: filters.status,
    startFrom: filters.from,
    startTo: filters.to,
  };
}

function rangeIsValid(filters: Filters): boolean {
  return filters.from === "" || filters.to === "" || filters.from <= filters.to;
}

export function ExportScreen() {
  const zones = useZoneOptions();
  const exporter = useExportDownload();
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [counted, setCounted] = useState<{ readonly filters: Filters; readonly total: number } | null>(null);
  const [countError, setCountError] = useState("");
  const set = (key: keyof Filters) => (value: string) => setFilters((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!rangeIsValid(filters)) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchSearch(toSearchFilters(filters), 1, 1)
        .then((response) => {
          if (cancelled) return;
          setCounted({ filters, total: response.total });
          setCountError("");
        })
        .catch(() => {
          if (!cancelled) setCountError(COUNT_ERROR);
        });
    }, COUNT_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters]);

  const validRange = rangeIsValid(filters);
  const total = validRange && counted !== null && counted.filters === filters ? String(counted.total) : PENDING_FIGURE;
  const message = !validRange ? RANGE_ERROR : countError !== "" ? countError : exporter.error;
  const busy = exporter.busyKey !== null;

  return (
    <ScreenFrame
      title="Export Data"
      subtitle="Download MoU reports in various formats"
      contentClassName="p-4 md:p-6 max-w-3xl mx-auto space-y-4 md:space-y-5"
    >
      {message !== "" && (
        <div role="alert" className="rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
          {message}
        </div>
      )}
      <Card className="p-6">
        <SectionTitle>Export Filters</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Zone" htmlFor="exportZone">
            <SelectInput id="exportZone" placeholder="All Zones" options={zones} value={filters.zoneId} onChange={set("zoneId")} />
          </Field>
          <Field label="Scheme" htmlFor="exportScheme">
            <SelectInput id="exportScheme" placeholder="All Schemes" options={SCHEME_FILTER_OPTIONS} value={filters.scheme} onChange={set("scheme")} />
          </Field>
          <Field label="Company" htmlFor="exportCompany">
            <TextInput id="exportCompany" placeholder="All Companies" value={filters.company} onChange={set("company")} />
          </Field>
          <Field label="Status" htmlFor="exportStatus">
            <SelectInput id="exportStatus" placeholder="All" options={STATUS_FILTER_OPTIONS} value={filters.status} onChange={set("status")} />
          </Field>
          <Field label="From Date" htmlFor="exportFrom">
            <TextInput id="exportFrom" type="date" value={filters.from} onChange={set("from")} />
          </Field>
          <Field label="To Date" htmlFor="exportTo">
            <TextInput id="exportTo" type="date" value={filters.to} onChange={set("to")} />
          </Field>
        </div>
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">{total} records match current filters</p>
          <Button
            variant="accent"
            disabled={busy || !validRange}
            onClick={() => void exporter.run(FILTERED_KEY, () => startExcelExport(toSearchFilters(filters)))}
          >
            <Icon name="download" />
            {exporter.busyKey === FILTERED_KEY ? "Preparing export…" : "Export Filtered Data"}
          </Button>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        {REPORTS.map((report) => {
          const start = report.start;
          return (
            <Card key={report.key} className="p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div style={{ color: BRAND.blue }}>
                  <Icon name="download" />
                </div>
                <Badge text={report.format} />
              </div>
              <h4 className="font-bold text-sm text-foreground mb-1">{report.title}</h4>
              <p className="text-xs text-muted-foreground mb-4">{start === undefined ? `${report.caption} · Not available yet` : report.caption}</p>
              <Button
                size="sm"
                className="w-full justify-center"
                disabled={start === undefined || busy}
                onClick={start === undefined ? undefined : () => void exporter.run(report.key, start)}
              >
                <Icon name="download" />
                {exporter.busyKey === report.key ? "Preparing…" : "Download"}
              </Button>
            </Card>
          );
        })}
      </div>
    </ScreenFrame>
  );
}
