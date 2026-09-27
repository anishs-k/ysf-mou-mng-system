/**
 * Purpose: SPEC-12's read-only Zone Wise Dashboard - the per-zone summary
 * table, the zone x scheme matrix (section 2.2), scheme/status filters
 * applied consistently to both (section 2.3), and drill-down (section 2.4):
 * clicking a zone name or a count opens the matching MOU list below, each
 * row linking to the Existing Company view; the "Expiring ≤ 90 days" figure
 * instead links straight to SPEC-08's alert list filtered to that zone,
 * since that list is the authoritative view of expiring agreements.
 */

import { MOU_STATUS_OPTIONS, SCHEME_OPTIONS } from "@mou/domain";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import type { ZoneDashboardResponse, ZoneDrillDownRow } from "../api/client.ts";
import { fetchZoneDashboard, fetchZoneDrillDown } from "../api/client.ts";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring";

interface DrillDownRequest {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly status?: string;
  readonly label: string;
}

export function ZoneWiseDashboardPage() {
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [scheme, setScheme] = useState("");
  const [status, setStatus] = useState("");
  const [data, setData] = useState<ZoneDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [drillDownRequest, setDrillDownRequest] = useState<DrillDownRequest | null>(null);
  const [drillDownRows, setDrillDownRows] = useState<readonly ZoneDrillDownRow[]>([]);

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
    setDrillDownRequest({ zoneId, zoneName, status: rowStatus, label });
    try {
      setDrillDownRows(await fetchZoneDrillDown(zoneId, { scheme, zoneStatus: rowStatus ?? status }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the drill-down list");
    }
  }

  if (data === null) {
    return (
      <>
        <Topbar title="Zone Wise Dashboard" subtitle="MoU statistics across all zones" onOpenMenu={openMobileMenu} />
        <div className="p-4 md:p-6 flex-1 overflow-y-auto">
          {error !== null && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        </div>
      </>
    );
  }

  const noCompanies = data.totals.companies === 0;

  return (
    <>
      <Topbar title="Zone Wise Dashboard" subtitle="MoU statistics across all zones" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl">
      {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mb-6 flex flex-wrap gap-4 glass-card rounded-xl p-4">
        <div>
          <label htmlFor="zoneScheme" className="block text-sm font-medium text-gray-700">
            Scheme
          </label>
          <select id="zoneScheme" value={scheme} onChange={(event) => setScheme(event.target.value)} className={INPUT_CLASS}>
            <option value="">All schemes</option>
            {SCHEME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="zoneStatus" className="block text-sm font-medium text-gray-700">
            MoU Status
          </label>
          <select id="zoneStatus" value={status} onChange={(event) => setStatus(event.target.value)} className={INPUT_CLASS}>
            <option value="">All statuses</option>
            {MOU_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {noCompanies ? (
        <p className="text-sm text-gray-600">No companies recorded yet.</p>
      ) : (
        <>
          <div className="mb-6 overflow-x-auto glass-card rounded-xl p-4">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Summary</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-500">
                  <th className="py-1 font-medium">Zone</th>
                  <th className="py-1 font-medium">Companies</th>
                  <th className="py-1 font-medium">Plants</th>
                  <th className="py-1 font-medium">MoUs</th>
                  <th className="py-1 font-medium">Active</th>
                  <th className="py-1 font-medium">Expired</th>
                  <th className="py-1 font-medium">New</th>
                  <th className="py-1 font-medium">Expiring ≤ 90 days</th>
                </tr>
              </thead>
              <tbody>
                {data.zones.map((zone) => (
                  <tr key={zone.zoneId} className="border-b border-gray-100">
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => void openDrillDown(zone.zoneId, zone.zoneName, `${zone.zoneName} — all companies`)}
                        className="font-medium hover:underline" style={{ color: "#1B5FAE" }}
                      >
                        {zone.zoneName}
                      </button>
                    </td>
                    <td className="py-1">{zone.companies}</td>
                    <td className="py-1">{zone.plants}</td>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => void openDrillDown(zone.zoneId, zone.zoneName, `${zone.zoneName} — MoUs`)}
                        className="hover:underline" style={{ color: "#1B5FAE" }}
                      >
                        {zone.mous}
                      </button>
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => void openDrillDown(zone.zoneId, zone.zoneName, `${zone.zoneName} — Active`, "ACTIVE")}
                        className="hover:underline" style={{ color: "#1B5FAE" }}
                      >
                        {zone.active}
                      </button>
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => void openDrillDown(zone.zoneId, zone.zoneName, `${zone.zoneName} — Expired`, "EXPIRED")}
                        className="hover:underline" style={{ color: "#1B5FAE" }}
                      >
                        {zone.expired}
                      </button>
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        onClick={() => void openDrillDown(zone.zoneId, zone.zoneName, `${zone.zoneName} — New`, "NEW")}
                        className="hover:underline" style={{ color: "#1B5FAE" }}
                      >
                        {zone.new}
                      </button>
                    </td>
                    <td className="py-1">
                      <Link
                        to={`/alerts?zoneId=${zone.zoneId}&days=90`}
                        className="hover:underline" style={{ color: "#1B5FAE" }}
                      >
                        {zone.expiringSoon}
                      </Link>
                    </td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1">Total</td>
                  <td className="py-1">{data.totals.companies}</td>
                  <td className="py-1">{data.totals.plants}</td>
                  <td className="py-1">{data.totals.mous}</td>
                  <td className="py-1">{data.totals.active}</td>
                  <td className="py-1">{data.totals.expired}</td>
                  <td className="py-1">{data.totals.new}</td>
                  <td className="py-1">{data.totals.expiringSoon}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mb-6 overflow-x-auto glass-card rounded-xl p-4">
            <h2 className="mb-3 text-lg font-semibold text-gray-900">Scheme Breakdown</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-500">
                  <th className="py-1 font-medium">Zone</th>
                  {data.matrix.schemes.map((schemeKey) => (
                    <th key={schemeKey} className="py-1 font-medium">
                      {SCHEME_OPTIONS.find((option) => option.value === schemeKey)?.label ?? schemeKey}
                    </th>
                  ))}
                  <th className="py-1 font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.matrix.rows.map((row) => (
                  <tr key={row.zoneId} className="border-b border-gray-100">
                    <td className="py-1">{row.zoneName}</td>
                    {data.matrix.schemes.map((schemeKey) => (
                      <td key={schemeKey} className="py-1">
                        {row.counts[schemeKey] ?? 0}
                      </td>
                    ))}
                    <td className="py-1 font-medium">{row.rowTotal}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-1">Total</td>
                  {data.matrix.schemes.map((schemeKey) => (
                    <td key={schemeKey} className="py-1">
                      {data.matrix.columnTotals[schemeKey] ?? 0}
                    </td>
                  ))}
                  <td className="py-1">{data.matrix.grandTotal}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {drillDownRequest !== null && (
        <div className="glass-card rounded-xl p-4">
          <h2 className="mb-3 text-lg font-semibold text-gray-900">{drillDownRequest.label}</h2>
          {drillDownRows.length === 0 ? (
            <p className="text-sm text-gray-600">No matching MoUs.</p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-gray-500">
                  <th className="py-1 font-medium">Company</th>
                  <th className="py-1 font-medium">Plant</th>
                  <th className="py-1 font-medium">Scheme</th>
                  <th className="py-1 font-medium">Status</th>
                  <th className="py-1 font-medium">End Date</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {drillDownRows.map((row) => (
                  <tr key={row.mouId} className="border-b border-gray-100">
                    <td className="py-1">
                      {row.companyName} ({row.generatedCode})
                    </td>
                    <td className="py-1">{row.plantName ?? "—"}</td>
                    <td className="py-1">{row.scheme}</td>
                    <td className="py-1">{row.status}</td>
                    <td className="py-1">{row.endDate}</td>
                    <td className="py-1 text-right">
                      <Link
                        to={`/companies?zoneId=${drillDownRequest.zoneId}&companyId=${row.companyId}`}
                        className="font-medium hover:underline" style={{ color: "#1B5FAE" }}
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
        </div>
      </div>
    </>
  );
}
