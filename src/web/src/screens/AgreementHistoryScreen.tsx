/**
 * Purpose: The Agreement History screen - the MoU portfolio table from GET
 * /api/search, one server page at a time. Scheme and zone apply as soon as they
 * change (as in the prototype); the From / To start-date range applies on Filter.
 * Export Excel runs the server export for the same filters, and the eye button
 * (or a ?mouId= deep link) opens that MoU's version history dialog.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { fetchSearch, startExcelExport } from "../api/client.ts";
import type { SearchFilters, SearchResponse } from "../api/client.ts";
import { useExportDownload } from "../hooks/useExportDownload.ts";
import { SCHEME_FILTER_OPTIONS, useZoneOptions } from "../hooks/useSearchFilterOptions.ts";
import { Field, SelectInput, TextInput } from "../ui/form.tsx";
import { PENDING_FIGURE, displayStatus, formatCalendarDate, schemeLabel } from "../ui/format.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Pager } from "../ui/Pager.tsx";
import { Badge, Button, Card } from "../ui/primitives.tsx";
import type { BadgeTone } from "../ui/theme.ts";
import { VersionHistoryDialog } from "./agreementHistory/VersionHistoryDialog.tsx";

const COLUMNS = ["Company", "MoU Code", "Zone", "Scheme", "Start", "End", "Status", ""];
const TH_CLASS = "px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide";
const SECONDARY_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary     border-border    hover:bg-blue-100 px-3 py-1.5 text-xs  ";
const GHOST_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-3 py-1.5 text-xs  ";
const LOAD_ERROR = "Could not load agreements. Please refresh the page.";
const RANGE_ERROR = "The From date must not be after the To date.";
const EXPORT_KEY = "excel";

interface DateRange {
  readonly from: string;
  readonly to: string;
}

interface OpenHistory {
  readonly mouId: string;
  readonly companyName?: string;
}

/** Unlike the other screens, history marks Expiring agreements red, as the prototype does. */
function historyTone(status: string): BadgeTone {
  if (status === "Active") return "success";
  if (status === "New") return "info";
  return "danger";
}

function pageCaption(result: SearchResponse): string {
  if (result.total === 0) return "0 agreements";
  const first = (result.page - 1) * result.pageSize + 1;
  const last = first + result.rows.length - 1;
  return `${first}–${last} of ${result.total} agreements`;
}

export function AgreementHistoryScreen() {
  const [searchParams, setSearchParams] = useSearchParams();
  const zones = useZoneOptions();
  const exporter = useExportDownload();
  const [scheme, setScheme] = useState("");
  const [zoneId, setZoneId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [range, setRange] = useState<DateRange>({ from: "", to: "" });
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<OpenHistory | null>(null);

  const linkedMouId = searchParams.get("mouId") ?? "";
  const history: OpenHistory | null = opened ??(linkedMouId === "" ? null : { mouId: linkedMouId });
  const filters: SearchFilters = { scheme, zoneId, startFrom: range.from, startTo: range.to };

  useEffect(() => {
    let cancelled = false;
    fetchSearch({ scheme, zoneId, startFrom: range.from, startTo: range.to }, page)
      .then((response) => {
        if (cancelled) return;
        setResult(response);
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [scheme, zoneId, range, page]);

  const changeScheme = (value: string) => {
    setScheme(value);
    setPage(1);
  };
  const changeZone = (value: string) => {
    setZoneId(value);
    setPage(1);
  };
  const applyRange = () => {
    if (from !== "" && to !== "" && from > to) {
      setError(RANGE_ERROR);
      return;
    }
    setRange({ from, to });
    setPage(1);
  };
  const closeHistory = () => {
    setOpened(null);
    if (linkedMouId !== "") setSearchParams({}, { replace: true });
  };

  const rows = result?.rows ?? [];
  const exporting = exporter.busyKey === EXPORT_KEY;
  const message = error !== "" ? error : exporter.error;

  return (
    <ScreenFrame title="Agreement History" subtitle="Complete record of all MoU agreements" contentClassName="p-4 md:p-6 space-y-4 md:space-y-5">
      {message !== "" && (
        <div role="alert" className="rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
          {message}
        </div>
      )}
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
          <Field className="flex-1 sm:w-40">
            <SelectInput ariaLabel="Scheme" options={SCHEME_FILTER_OPTIONS} value={scheme} onChange={changeScheme} />
          </Field>
          <Field className="flex-1 sm:w-44">
            <SelectInput ariaLabel="Zone" options={zones} value={zoneId} onChange={changeZone} />
          </Field>
          <Field className="flex-1 sm:w-40">
            <TextInput ariaLabel="From date" type="date" value={from} onChange={setFrom} />
          </Field>
          <Field className="flex-1 sm:w-40">
            <TextInput ariaLabel="To date" type="date" value={to} onChange={setTo} />
          </Field>
          <div className="flex gap-2">
            <Button size="sm" onClick={applyRange}>
              <Icon name="search" className="w-4 h-4" />
              Filter
            </Button>
            <button
              type="button"
              disabled={exporting}
              onClick={() => void exporter.run(EXPORT_KEY, () => startExcelExport(filters))}
              className={`${SECONDARY_BUTTON} ${exporting ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <Icon name="download" />
              {exporting ? "Exporting…" : "Export Excel"}
            </button>
          </div>
        </div>
      </Card>

      <Card>
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
                return (
                  <tr key={row.mouId} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-semibold text-foreground text-xs">{row.companyName}</td>
                    <td className="px-4 py-3 mono text-xs font-bold text-[#1B5FAE]">{row.generatedCode}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{row.zoneName}</td>
                    <td className="px-4 py-3">
                      <Badge text={schemeLabel(row.scheme)} tone="info" />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs mono">{formatCalendarDate(row.mouStartDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground text-xs mono">{formatCalendarDate(row.endDate)}</td>
                    <td className="px-4 py-3">
                      <Badge text={status} tone={historyTone(status)} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        className={GHOST_BUTTON}
                        aria-label={`View ${row.generatedCode}`}
                        onClick={() => setOpened({ mouId: row.mouId, companyName: row.companyName })}
                      >
                        <Icon name="eye" className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {result === null ? (
          <p className="px-5 py-3 text-xs text-muted-foreground border-t border-border">{PENDING_FIGURE}</p>
        ) : (
          <Pager page={result.page} total={result.total} pageSize={result.pageSize} onPage={setPage} caption={pageCaption(result)} />
        )}
      </Card>

      {history !== null && <VersionHistoryDialog mouId={history.mouId} companyName={history.companyName} onClose={closeHistory} />}
    </ScreenFrame>
  );
}
