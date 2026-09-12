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
import { useSearchParams } from "react-router-dom";

import type { ExportJobStatus, SearchFilters, ZoneOption } from "../api/client.ts";
import { exportDownloadUrl, fetchExportJob, fetchZones, startExcelExport } from "../api/client.ts";

const INPUT_CLASS =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";
const POLL_INTERVAL_MS = 1500;

export function ExportExcelPage() {
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
    <div className="mx-auto max-w-3xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Export Excel</h1>

      {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-sm text-gray-600">
          With no filter set, the export includes every company and MOU you may see.
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
              MOU Status
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
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Start Export
        </button>

        {job !== null && (
          <div className="rounded-md bg-gray-50 p-3 text-sm">
            {job.status === "pending" && <p className="text-gray-700">Preparing your export…</p>}
            {job.status === "failed" && <p className="text-red-700">The export failed. Please try again.</p>}
            {job.status === "ready" && (
              <a href={exportDownloadUrl(job.jobId)} className="font-medium text-blue-600 hover:underline">
                Download workbook
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
