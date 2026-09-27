/**
 * Purpose: SPEC-12's read-only Zone Wise Dashboard - the per-zone summary
 * table, the zone x scheme matrix (section 2.2), scheme/status filters
 * applied consistently to both (section 2.3), and drill-down (section 2.4):
 * clicking a zone name or a count opens the matching MOU list below, each
 * row linking to the Existing Company view; the "Expiring ≤ 90 days" figure
 * instead links straight to SPEC-08's alert list filtered to that zone,
 * since that list is the authoritative view of expiring agreements.
 *
 * UI aligned with Figma v3 — zone cards grid with active/expiring/expired
 * counts, progress bars, and styled drill-down table.
 */

import { MOU_STATUS_OPTIONS, SCHEME_OPTIONS } from "@mou/domain";
import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import type { ZoneDashboardResponse, ZoneDrillDownRow } from "../api/client.ts";
import { fetchZoneDashboard, fetchZoneDrillDown } from "../api/client.ts";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Badge, Card, brand } from "../components/ui.tsx";

interface DrillDownRequest {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly status?: string;
  readonly label: string;
}

function statusVariant(s: string): "success" | "warning" | "danger" | "info" | "default" {
  if (s === "ACTIVE") return "success";
  if (s === "EXPIRED") return "danger";
  if (s === "NEW") return "info";
  return "default";
}

export function ZoneWiseDashboardPage() {
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [scheme, setScheme] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<ZoneDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string | null>(null);

  const [drillDownRequest, setDrillDownRequest] = useState<DrillDownRequest | null>(null);
  const [drillDownRows, setDrillDownRows] = useState<readonly ZoneDrillDownRow[]>([]);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchZoneDashboard({ scheme, zoneStatus: status })
      .then((response) => {
        if (!cancelled) {
          setError(null);
          setData(response);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load the zone dashboard");
      });
    return () => {
      cancelled = true;
    };
  }, [scheme, status]);

  async function openDrillDown(zoneId: string, zoneName: string, label: string, rowStatus?: string) {
    setError(null);
    setSelectedZone(zoneId);
    setDrillDownRequest({ zoneId, zoneName, status: rowStatus, label });
    try {
      setDrillDownRows(await fetchZoneDrillDown(zoneId, { scheme, zoneStatus: rowStatus ?? status }));
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the drill-down list");
    }
  }

  if (data === null) {
    return (
      <>
        <Topbar title="Zone Dashboard" subtitle="MoU statistics across all zones" onOpenMenu={openMobileMenu} />
        <div className="p-4 md:p-6 flex-1 overflow-y-auto">
          {error !== null && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        </div>
      </>
    );
  }

  const noCompanies = data.totals.companies === 0;

  return (
    <>
      <Topbar title="Zone Dashboard" subtitle="MoU statistics across all zones" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 space-y-4 md:space-y-5 flex-1 overflow-y-auto">
        {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div>
              <label htmlFor="zoneScheme" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Scheme
              </label>
              <select
                id="zoneScheme"
                value={scheme}
                onChange={(event) => setScheme(event.target.value)}
                className="mt-1 block w-full h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All schemes</option>
                {SCHEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="zoneStatus" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                MoU Status
              </label>
              <select
                id="zoneStatus"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                className="mt-1 block w-full h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">All statuses</option>
                {MOU_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {noCompanies ? (
          <p className="text-sm text-muted-foreground">No companies recorded yet.</p>
        ) : (
          <>
            {/* Zone Cards Grid */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.zones.map((zone) => {
                const isSelected = selectedZone === zone.zoneId;
                const activeRate = zone.companies > 0 ? Math.round((zone.active / zone.companies) * 100) : 0;
                return (
                  <button
                    key={zone.zoneId}
                    type="button"
                    onClick={() => void openDrillDown(zone.zoneId, zone.zoneName, `${zone.zoneName} — all companies`)}
                    className={`text-left w-full rounded-xl p-5 transition-all duration-150 hover:shadow-md active:scale-[0.98] glass-card ${
                      isSelected ? "ring-2 ring-[#1B5FAE] ring-offset-1" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-sm" style={{ color: brand.navy }}>
                        {zone.zoneName}
                      </h3>
                      <Badge text={`${zone.companies} companies`} variant={isSelected ? "info" : "default"} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="mono font-bold text-xl text-[#39B54A]">{zone.active}</p>
                        <p className="text-xs text-muted-foreground font-semibold">Active</p>
                      </div>
                      <div>
                        <p className="mono font-bold text-xl text-amber-600">{zone.expiringSoon}</p>
                        <p className="text-xs text-muted-foreground font-semibold">Expiring</p>
                      </div>
                      <div>
                        <p className="mono font-bold text-xl text-red-600">{zone.expired}</p>
                        <p className="text-xs text-muted-foreground font-semibold">Expired</p>
                      </div>
                    </div>
                    <div className="mt-4 h-2 bg-border rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all bg-[#39B54A]"
                        style={{ width: `${activeRate}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <p className="text-xs text-muted-foreground font-semibold">{activeRate}% active rate</p>
                      {isSelected && (
                        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: brand.orange }}>
                          ▼ showing below
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Scheme Breakdown Table */}
            <Card className="overflow-hidden">
              <div className="px-5 pt-5 pb-3 border-b border-border">
                <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: brand.navy }}>
                  Scheme Breakdown
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Zone
                      </th>
                      {data.matrix.schemes.map((schemeKey) => (
                        <th
                          key={schemeKey}
                          className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                        >
                          {SCHEME_OPTIONS.find((option) => option.value === schemeKey)?.label ?? schemeKey}
                        </th>
                      ))}
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.matrix.rows.map((row) => (
                      <tr key={row.zoneId} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-foreground text-xs">{row.zoneName}</td>
                        {data.matrix.schemes.map((schemeKey) => (
                          <td key={schemeKey} className="px-4 py-3 text-muted-foreground text-xs mono">
                            {row.counts[schemeKey] ?? 0}
                          </td>
                        ))}
                        <td className="px-4 py-3 font-semibold text-foreground text-xs mono">{row.rowTotal}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/40 font-semibold">
                      <td className="px-4 py-3 text-foreground text-xs">Total</td>
                      {data.matrix.schemes.map((schemeKey) => (
                        <td key={schemeKey} className="px-4 py-3 text-foreground text-xs mono">
                          {data.matrix.columnTotals[schemeKey] ?? 0}
                        </td>
                      ))}
                      <td className="px-4 py-3 text-foreground text-xs mono">{data.matrix.grandTotal}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}

        {/* Zone Detail Drill-Down */}
        {drillDownRequest !== null && (
          <div ref={detailRef}>
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" style={{ color: brand.blue }}>
                    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                    <line x1="9" y1="3" x2="9" y2="18" />
                    <line x1="15" y1="6" x2="15" y2="21" />
                  </svg>
                  <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: brand.navy }}>
                    {drillDownRequest.zoneName}
                    <span className="ml-2 text-xs font-normal text-muted-foreground normal-case tracking-normal">
                      ({drillDownRows.length} {drillDownRows.length === 1 ? "record" : "records"})
                    </span>
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedZone(null);
                    setDrillDownRequest(null);
                  }}
                  className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                  Close
                </button>
              </div>

              {drillDownRows.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground text-center">No matching MoUs.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {["#", "Company", "Plant", "Scheme", "MoU Code", "End Date", "Status", ""].map((h) => (
                          <th
                            key={h}
                            className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap"
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {drillDownRows.map((row, i) => (
                        <tr key={row.mouId} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-xs text-muted-foreground mono">{i + 1}</td>
                          <td className="px-4 py-3 font-semibold text-foreground text-xs max-w-[220px] truncate">
                            {row.companyName}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                            {row.plantName ?? "—"}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge text={row.scheme} variant="info" />
                          </td>
                          <td className="px-4 py-3 text-xs mono font-bold" style={{ color: brand.blue }}>
                            {row.generatedCode}
                          </td>
                          <td className="px-4 py-3 text-xs mono text-muted-foreground whitespace-nowrap">
                            {row.endDate}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge text={row.status} variant={statusVariant(row.status)} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              to={`/companies?zoneId=${drillDownRequest.zoneId}&companyId=${row.companyId}`}
                              className="font-semibold text-xs hover:underline"
                              style={{ color: brand.blue }}
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
