/**
 * Purpose: SPEC-13's Search screen - a Search By selector (Company, Plant or
 * a Scheme dropdown), the extra Zone/MOU-status filters, and paginated
 * results (25 per page, section 2.1). Every result row is one current MOU
 * (section 2.2), linking to the Existing Company view. The active filters
 * carry into "Export to Excel" unchanged (section 2.3/5) - Search and
 * Export share the exact same filter shape for this reason.
 */

import { MOU_STATUS_OPTIONS, SCHEME_OPTIONS } from "@mou/domain";
import { useEffect, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";

import type { SearchRow, ZoneOption } from "../api/client.ts";
import { fetchSearch, fetchZones } from "../api/client.ts";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Card } from "../components/ui.tsx";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring";
const PAGE_SIZE = 25;

export function SearchPage() {
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  // D87: the shared Topbar's search box seeds this page's own query via
  // ?q= on navigation - read once from the URL this page was opened with.
  const [searchParams] = useSearchParams();
  const [zones, setZones] = useState<readonly ZoneOption[]>([]);
  const [by, setBy] = useState<"company" | "plant" | "scheme">("company");
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [zoneId, setZoneId] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<readonly SearchRow[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch(() => undefined);
  }, []);

  const trimmedQ = q.trim();
  const queryValid = by === "scheme" ? trimmedQ !== "" : trimmedQ.length >= 2;

  // A previous valid query's rows/total are simply not rendered once
  // `queryValid` goes false again (guarded in the JSX below), rather than
  // reset here - clearing them synchronously in the effect body itself is
  // exactly what react-hooks/set-state-in-effect flags.
  useEffect(() => {
    if (!queryValid) {
      return;
    }
    let cancelled = false;
    fetchSearch({ by, q: trimmedQ, zoneId: zoneId || undefined, status: status || undefined }, page)
      .then((response) => {
        if (cancelled) return;
        setError(null);
        setAttempted(true);
        setRows(response.rows);
        setTotal(response.total);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setAttempted(true);
          setError(e instanceof Error ? e.message : "Search failed");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [by, trimmedQ, zoneId, status, page, queryValid]);

  function handleByChange(nextBy: "company" | "plant" | "scheme") {
    setBy(nextBy);
    setQ("");
    setPage(1);
  }

  const totalPages = total !== null ? Math.max(1, Math.ceil(total / PAGE_SIZE)) : 1;
  const exportParams = new URLSearchParams({ by, q: trimmedQ });
  if (zoneId !== "") exportParams.set("zoneId", zoneId);
  if (status !== "") exportParams.set("status", status);

  return (
    <>
      <Topbar title="Search" subtitle="Find a record by company, plant or scheme" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl">
      {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-6 flex flex-wrap items-end gap-4 glass-card rounded-xl p-4">
        <div>
          <label htmlFor="searchBy" className="block text-sm font-medium text-gray-700">
            Search By
          </label>
          <select
            id="searchBy"
            value={by}
            onChange={(event) => handleByChange(event.target.value as "company" | "plant" | "scheme")}
            className={INPUT_CLASS}
          >
            <option value="company">Company</option>
            <option value="plant">Plant</option>
            <option value="scheme">Scheme</option>
          </select>
        </div>

        <div>
          <label htmlFor="searchQuery" className="block text-sm font-medium text-gray-700">
            {by === "scheme" ? "Scheme" : "Query"}
          </label>
          {by === "scheme" ? (
            <select
              id="searchQuery"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
              className={INPUT_CLASS}
            >
              <option value="">Select scheme</option>
              {SCHEME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="searchQuery"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setPage(1);
              }}
              placeholder="At least 2 characters"
              className={INPUT_CLASS}
            />
          )}
        </div>

        <div>
          <label htmlFor="searchZone" className="block text-sm font-medium text-gray-700">
            Zone
          </label>
          <select
            id="searchZone"
            value={zoneId}
            onChange={(event) => {
              setZoneId(event.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          >
            <option value="">All zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="searchStatus" className="block text-sm font-medium text-gray-700">
            MoU Status
          </label>
          <select
            id="searchStatus"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            className={INPUT_CLASS}
          >
            <option value="">All statuses</option>
            {MOU_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {attempted && (
          <Link
            to={`/export/excel?${exportParams.toString()}`}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Export to Excel
          </Link>
        )}
      </div>

      {!queryValid && (
        <p className="text-sm text-muted-foreground">
          {by === "scheme" ? "Select a scheme to search." : "Enter at least 2 characters to search."}
        </p>
      )}

      {queryValid && attempted && total === 0 && (
        <p className="text-sm text-muted-foreground">No records found for &lsquo;{trimmedQ}&rsquo;.</p>
      )}

      {queryValid && rows.length > 0 && (
        <Card className="overflow-x-auto p-4">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase text-muted-foreground">
                <th className="py-1 font-medium">Company Name</th>
                <th className="py-1 font-medium">MoU Code</th>
                <th className="py-1 font-medium">Zone</th>
                <th className="py-1 font-medium">Plant</th>
                <th className="py-1 font-medium">Scheme</th>
                <th className="py-1 font-medium">MoU Start Date</th>
                <th className="py-1 font-medium">MoU End Date</th>
                <th className="py-1 font-medium">MoU Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.mouId} className="border-b border-gray-100">
                  <td className="py-1">
                    <Link
                      to={`/companies?zoneId=${row.zoneId}&companyId=${row.companyId}`}
                      className="font-medium hover:underline"
                      style={{ color: "#1B5FAE" }}
                    >
                      {row.companyName}
                    </Link>
                  </td>
                  <td className="py-1">{row.generatedCode}</td>
                  <td className="py-1">{row.zoneName}</td>
                  <td className="py-1">{row.plantName ?? "—"}</td>
                  <td className="py-1">{row.scheme}</td>
                  <td className="py-1">{row.mouStartDate}</td>
                  <td className="py-1">{row.endDate}</td>
                  <td className="py-1">{row.status}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-foreground hover:bg-muted disabled:opacity-50"
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-border px-3 py-1.5 text-foreground hover:bg-muted disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </Card>
      )}
        </div>
      </div>
    </>
  );
}
