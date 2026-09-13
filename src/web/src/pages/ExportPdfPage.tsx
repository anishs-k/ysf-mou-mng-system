/**
 * Purpose: SPEC-13's Export PDF screen - a scope choice (All Zones, or one
 * Company's Plant via the same cascading selectors SPEC-09 introduced),
 * Export disabled until the company scope is fully resolved (AC10), and a
 * poll-until-ready status shared with the Excel export's own pattern.
 */

import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import type { ExportJobStatus } from "../api/client.ts";
import { exportDownloadUrl, fetchExportJob, startPdfExport } from "../api/client.ts";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Card, brand } from "../components/ui.tsx";
import { useCascadingSelectors } from "../hooks/useCascadingSelectors.ts";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring";
const POLL_INTERVAL_MS = 1500;

export function ExportPdfPage() {
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [scope, setScope] = useState<"all_zones" | "company">("all_zones");

  const [job, setJob] = useState<ExportJobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // The zone-fetch failure has always been silent here (notifyOnZoneError:
  // false preserves that exact .catch(() => undefined) behaviour); this page
  // has no fourth (scheme) cascade level, so plantId is set directly rather
  // than through handlePlantChange.
  const {
    zones,
    zoneId,
    companies,
    companyId,
    plants,
    plantId,
    setPlantId,
    handleZoneChange,
    handleCompanyChange,
  } = useCascadingSelectors({
    onError: (message) => setError(message),
    notifyOnZoneError: false,
  });

  useEffect(() => {
    return () => {
      if (pollRef.current !== null) {
        clearInterval(pollRef.current);
      }
    };
  }, []);

  const companyScopeReady = scope === "all_zones" || (zoneId !== "" && companyId !== "" && plantId !== "");

  async function handleStart() {
    setError(null);
    setStarting(true);
    setJob(null);
    try {
      const started = await startPdfExport(
        scope === "all_zones" ? { scope } : { scope, companyId, plantId },
      );
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
      <Topbar title="Export PDF" subtitle="Download a PDF for all zones or a single company" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          <Card className="space-y-4 p-6">
            <div>
              <label htmlFor="pdfScope" className="block text-sm font-medium text-gray-700">
                Scope
              </label>
              <select
                id="pdfScope"
                value={scope}
                onChange={(event) => {
                  setScope(event.target.value as "all_zones" | "company");
                  setJob(null);
                }}
                className={INPUT_CLASS}
              >
                <option value="all_zones">All Zones</option>
                <option value="company">Company / Company&apos;s Plant</option>
              </select>
            </div>

            {scope === "company" && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label htmlFor="pdfZone" className="block text-sm font-medium text-gray-700">
                    Zone
                  </label>
                  <select id="pdfZone" value={zoneId} onChange={(event) => void handleZoneChange(event.target.value)} className={INPUT_CLASS}>
                    <option value="">Select zone</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>
                        {z.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pdfCompany" className="block text-sm font-medium text-gray-700">
                    Company
                  </label>
                  <select
                    id="pdfCompany"
                    value={companyId}
                    disabled={zoneId === ""}
                    onChange={(event) => void handleCompanyChange(event.target.value)}
                    className={`${INPUT_CLASS} disabled:bg-gray-100`}
                  >
                    <option value="">{zoneId === "" ? "Select a zone first" : "Select company"}</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="pdfPlant" className="block text-sm font-medium text-gray-700">
                    Company Plant
                  </label>
                  <select
                    id="pdfPlant"
                    value={plantId}
                    disabled={companyId === ""}
                    onChange={(event) => setPlantId(event.target.value)}
                    className={`${INPUT_CLASS} disabled:bg-gray-100`}
                  >
                    <option value="">{companyId === "" ? "Select a company first" : "Select plant"}</option>
                    {plants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.plantName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            <button
              type="button"
              disabled={starting || !companyScopeReady}
              onClick={() => void handleStart()}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: brand.blue }}
            >
              Export
            </button>

            {job !== null && (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                {job.status === "pending" && <p className="text-muted-foreground">Preparing your export…</p>}
                {job.status === "failed" && <p className="text-red-700">The export failed. Please try again.</p>}
                {job.status === "ready" && (
                  <a href={exportDownloadUrl(job.jobId)} className="font-medium hover:underline" style={{ color: "#1B5FAE" }}>
                    Download PDF
                  </a>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
