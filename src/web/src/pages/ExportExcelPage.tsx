/**
 * Purpose: SPEC-13's Export Excel screen - the same filter shape Search
 * uses (arriving pre-filled via query string when linked from a search,
 * section 2.3/5), a Start Export action, and a poll-until-ready status
 * (section 5: under the 5,000-company threshold the job is already `ready`
 * by the time this page gets its first response, but the polling loop
 * covers the background path too without a separate code path).
 */

import { MOU_STATUS_OPTIONS, SCHEME_OPTIONS } from "@mou/domain";
import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";

import type { ExportJobStatus, SearchFilters, ZoneOption } from "../api/client.ts";
import { exportDownloadUrl, fetchExportJob, fetchZones, startExcelExport } from "../api/client.ts";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Icon } from "../components/icons.tsx";
import { Card, brand } from "../components/ui.tsx";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring";
const POLL_INTERVAL_MS = 1500;

export function ExportExcelPage() {
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [searchParams] = useSearchParams();
  const [zones, setZones] = useState<readonly ZoneOption[]>([]);
  const [by, setBy] = useState<"" | "company" | "plant" | "scheme">(
    (searchParams.get("by") as "company" | "plant" | "scheme" | null) ?? "",
  );
  const [q, setQ] = useState(searchParams.get("q") ?? "");
  const [zoneId, setZoneId] = useState(searchParams.get("zoneId") ?? "");
  const [status, setStatus] = useState(searchParams.get("status") ?? "");

  const [job, setJob] = useState<ExportJobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  async function handleStart() {
    setError(null);
    setStarting(true);
    setJob(null);
    try {
      const filters: SearchFilters = {
        by: by === "" ? undefined : by,
        q: q.trim() === "" ? undefined : q.trim(),
        zoneId: zoneId === "" ? undefined : zoneId,
        status: status === "" ? undefined : status,
      };
      const started = await startExcelExport(filters);
      setJob(started);
      if (started.status === "pending") {
        pollRef.current = setInterval(() => {
          fetchExportJob(started.jobId)
            .then((updated) => {
              setJob(updated);
              if (updated.status !== "pending" && pollRef.current !== null) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
            })
            .catch(() => undefined);
        }, POLL_INTERVAL_MS);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start the export");
    } finally {
      setStarting(false);
    }
  }

  return (
    <>
      <Topbar title="Export Excel" subtitle="Download the company and MoU data as a workbook" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
      {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <Card className="space-y-4 p-6">
        <p className="text-sm text-muted-foreground">
          With no filter set, the export includes every company and MoU you may see.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="excelBy" className="block text-sm font-medium text-gray-700">
              Search By
            </label>
            <select
              id="excelBy"
              value={by}
              onChange={(event) => {
                setBy(event.target.value as "" | "company" | "plant" | "scheme");
                setQ("");
              }}
              className={INPUT_CLASS}
            >
              <option value="">No filter</option>
              <option value="company">Company</option>
              <option value="plant">Plant</option>
              <option value="scheme">Scheme</option>
            </select>
          </div>
          {by !== "" && (
            <div>
              <label htmlFor="excelQuery" className="block text-sm font-medium text-gray-700">
                {by === "scheme" ? "Scheme" : "Query"}
              </label>
              {by === "scheme" ? (
                <select id="excelQuery" value={q} onChange={(event) => setQ(event.target.value)} className={INPUT_CLASS}>
                  <option value="">Select scheme</option>
                  {SCHEME_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input id="excelQuery" value={q} onChange={(event) => setQ(event.target.value)} className={INPUT_CLASS} />
              )}
            </div>
          )}
          <div>
            <label htmlFor="excelZone" className="block text-sm font-medium text-gray-700">
              Zone
            </label>
            <select id="excelZone" value={zoneId} onChange={(event) => setZoneId(event.target.value)} className={INPUT_CLASS}>
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="excelStatus" className="block text-sm font-medium text-gray-700">
              MoU Status
            </label>
            <select id="excelStatus" value={status} onChange={(event) => setStatus(event.target.value)} className={INPUT_CLASS}>
              <option value="">All statuses</option>
              {MOU_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          disabled={starting || (by !== "" && q.trim() === "")}
          onClick={() => void handleStart()}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: brand.blue }}
        >
          Start Export
        </button>

        {job !== null && (
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            {job.status === "pending" && <p className="text-muted-foreground">Preparing your export…</p>}
            {job.status === "failed" && <p className="text-red-700">The export failed. Please try again.</p>}
            {job.status === "ready" && (
              <a href={exportDownloadUrl(job.jobId)} className="font-medium hover:underline" style={{ color: "#1B5FAE" }}>
                Download workbook
              </a>
            )}
          </div>
        )}
      </Card>

      {/* Report Cards Grid */}
      <div className="grid sm:grid-cols-2 gap-4 mt-6">
        <Card className="p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div style={{ color: brand.blue }}>{Icon.download}</div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold mono bg-secondary text-primary border border-border">
              Excel (.xlsx)
            </span>
          </div>
          <h4 className="font-bold text-sm text-foreground mb-1">MoU Summary Report</h4>
          <p className="text-xs text-muted-foreground mb-4">All company MoU records with commercial and payroll status</p>
          <button
            type="button"
            disabled={starting}
            onClick={() => void handleStart()}
            className="w-full justify-center inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg px-4 py-2 text-sm text-white disabled:opacity-50"
            style={{ background: brand.blue, borderColor: brand.blue }}
          >
            {Icon.download} Export Summary
          </button>
        </Card>

        <Card className="p-5 hover:shadow-md transition-shadow">
          <div className="flex items-start justify-between mb-3">
            <div style={{ color: brand.blue }}>{Icon.download}</div>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold mono bg-secondary text-primary border border-border">
              PDF (.pdf)
            </span>
          </div>
          <h4 className="font-bold text-sm text-foreground mb-1">Scoped PDF Report</h4>
          <p className="text-xs text-muted-foreground mb-4">Generate a printable summary report for all zones or a company</p>
          <Link
            to="/export/pdf"
            className="w-full justify-center inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg px-4 py-2 text-sm text-white"
            style={{ background: brand.orange, borderColor: brand.orange }}
          >
            {Icon.file} Configure PDF Export
          </Link>
        </Card>
      </div>
        </div>
      </div>
    </>
  );
}
