/**
 * Purpose: SPEC-08's alert list - every unacknowledged current-MOU expiry
 * alert, newest first, with threshold/zone/scheme/acknowledged filters and an
 * Acknowledge action (ADMIN/DATA_ENTRY only, enforced again on the server).
 * Each row links to the Existing Company view via its zoneId/companyId query
 * parameters (SPEC-07's deep-link support). SPEC-14 restyles the list and
 * adds a Renew shortcut per row (D90) - plain navigation to Upload MOU PDF,
 * no query-string prefill, since that page does not accept one.
 */

import { SCHEME_LABELS } from "@mou/domain";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import type { AlertFilters, AlertRow, EnumOption, ZoneOption } from "../api/client.ts";
import { acknowledgeAlert, fetchAlerts, fetchEnums, fetchZones } from "../api/client.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Badge, Card } from "../components/ui.tsx";

const AUTHORING_ROLES: readonly string[] = ["ADMIN", "DATA_ENTRY"];

function statusVariant(status: string): "info" | "success" | "danger" {
  if (status === "ACTIVE") return "success";
  if (status === "EXPIRED") return "danger";
  return "info";
}

export function AlertsPage() {
  const { user } = useAuth();
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const canAcknowledge = user !== null && AUTHORING_ROLES.includes(user.role);

  const [alerts, setAlerts] = useState<readonly AlertRow[]>([]);
  const [zones, setZones] = useState<readonly ZoneOption[]>([]);
  const [schemes, setSchemes] = useState<readonly EnumOption[]>([]);
  const [days, setDays] = useState<AlertFilters["days"]>("all");
  const [zoneId, setZoneId] = useState("");
  const [scheme, setScheme] = useState("");
  const [acknowledged, setAcknowledged] = useState<AlertFilters["acknowledged"]>("false");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchZones(), fetchEnums()])
      .then(([zonesData, enumsData]) => {
        if (!cancelled) {
          setZones(zonesData);
          setSchemes(enumsData.schemes);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const currentFilters = { days, zoneId: zoneId || undefined, scheme: scheme || undefined, acknowledged };

  // Re-fetches on every filter change and after an acknowledge action, in a
  // plain .then()/.catch() chain rather than an intermediate named async
  // function, so the effect below never calls a function react-hooks flags
  // as "setting state" from an effect body.
  async function load() {
    try {
      setAlerts(await fetchAlerts(currentFilters));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load alerts");
    }
  }

  useEffect(() => {
    let cancelled = false;
    fetchAlerts(currentFilters)
      .then((rows) => {
        if (!cancelled) setAlerts(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load alerts");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, zoneId, scheme, acknowledged]);

  async function handleAcknowledge(alertId: string) {
    try {
      await acknowledgeAlert(alertId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to acknowledge");
    }
  }

  return (
    <>
      <Topbar title="MoU Expiry Alerts" subtitle="Agreements expiring in the next 30, 60 or 90 days" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Threshold Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <button
            type="button"
            onClick={() => setDays((prev) => (prev === "30" ? "all" : "30"))}
            className={`glass-card rounded-xl p-3 border-l-4 border-l-red-500 flex items-center justify-between text-left transition-all cursor-pointer ${
              days === "30" ? "ring-2 ring-red-400 bg-red-50/60" : ""
            }`}
          >
            <div>
              <p className="text-xs font-bold text-red-600">Critical (≤ 30 days)</p>
              <p className="text-xs text-muted-foreground mt-0.5">Immediate action required</p>
            </div>
            <span className="text-lg font-bold mono text-red-600">
              {alerts.filter((a) => a.daysRemaining <= 30).length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDays((prev) => (prev === "60" ? "all" : "60"))}
            className={`glass-card rounded-xl p-3 border-l-4 border-l-amber-500 flex items-center justify-between text-left transition-all cursor-pointer ${
              days === "60" ? "ring-2 ring-amber-400 bg-amber-50/60" : ""
            }`}
          >
            <div>
              <p className="text-xs font-bold text-amber-600">Warning (31 – 60 days)</p>
              <p className="text-xs text-muted-foreground mt-0.5">Begin internal renewal</p>
            </div>
            <span className="text-lg font-bold mono text-amber-600">
              {alerts.filter((a) => a.daysRemaining > 30 && a.daysRemaining <= 60).length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setDays((prev) => (prev === "90" ? "all" : "90"))}
            className={`glass-card rounded-xl p-3 border-l-4 border-l-blue-500 flex items-center justify-between text-left transition-all cursor-pointer ${
              days === "90" ? "ring-2 ring-blue-400 bg-blue-50/60" : ""
            }`}
          >
            <div>
              <p className="text-xs font-bold text-blue-600">Notice (61 – 90 days)</p>
              <p className="text-xs text-muted-foreground mt-0.5">Schedule discussion</p>
            </div>
            <span className="text-lg font-bold mono text-blue-600">
              {alerts.filter((a) => a.daysRemaining > 60 && a.daysRemaining <= 90).length}
            </span>
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-3">
          <select
            aria-label="Threshold"
            value={days}
            onChange={(event) => setDays(event.target.value as AlertFilters["days"])}
            className="rounded-lg border border-border px-3 py-1.5 text-sm bg-white"
          >
            <option value="all">All thresholds</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
          </select>
          <select
            aria-label="Zone"
            value={zoneId}
            onChange={(event) => setZoneId(event.target.value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All zones</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>
                {z.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Scheme"
            value={scheme}
            onChange={(event) => setScheme(event.target.value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm bg-white"
          >
            <option value="">All schemes</option>
            {schemes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            aria-label="Acknowledged"
            value={acknowledged}
            onChange={(event) => setAcknowledged(event.target.value as AlertFilters["acknowledged"])}
            className="rounded-lg border border-border px-3 py-1.5 text-sm bg-white"
          >
            <option value="false">Unacknowledged</option>
            <option value="true">Acknowledged</option>
            <option value="all">All</option>
          </select>
        </div>

        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alerts match these filters.</p>
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="p-2.5">Company</th>
                    <th className="p-2.5">Code</th>
                    <th className="p-2.5">Zone</th>
                    <th className="p-2.5">Plant</th>
                    <th className="p-2.5">Scheme</th>
                    <th className="p-2.5">Start</th>
                    <th className="p-2.5">End</th>
                    <th className="p-2.5">Days Remaining</th>
                    <th className="p-2.5">Threshold</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => (
                    <tr key={alert.alertId} className="border-t border-border hover:bg-muted/30 transition-colors">
                      <td className="p-2.5 font-semibold text-foreground">{alert.companyName}</td>
                      <td className="p-2.5 mono text-muted-foreground">{alert.generatedCode}</td>
                      <td className="p-2.5 text-muted-foreground">{alert.zoneName}</td>
                      <td className="p-2.5 text-muted-foreground">{alert.plantName}</td>
                      <td className="p-2.5">
                        <Badge text={SCHEME_LABELS[alert.scheme as keyof typeof SCHEME_LABELS] ?? alert.scheme} variant="info" />
                      </td>
                      <td className="p-2.5 mono text-muted-foreground">{alert.mouStartDate}</td>
                      <td className="p-2.5 mono text-muted-foreground">{alert.endDate}</td>
                      <td className="p-2.5">
                        <span className={`mono font-bold text-sm ${alert.daysRemaining <= 30 ? "text-red-600" : alert.daysRemaining <= 60 ? "text-amber-600" : "text-blue-600"}`}>
                          {alert.daysRemaining}d
                        </span>
                      </td>
                      <td className="p-2.5 mono text-muted-foreground">{alert.thresholdDays}</td>
                      <td className="p-2.5">
                        <Badge text={alert.status} variant={statusVariant(alert.status)} />
                      </td>
                      <td className="p-2.5">
                        <div className="flex gap-3">
                          <Link
                            to={`/companies?zoneId=${alert.zoneId}&companyId=${alert.companyId}`}
                            className="font-semibold hover:underline"
                            style={{ color: "#1B5FAE" }}
                          >
                            Open
                          </Link>
                          {canAcknowledge && (
                            <Link to="/upload-mou" className="font-semibold hover:underline" style={{ color: "#F26522" }}>
                              Renew
                            </Link>
                          )}
                          {canAcknowledge && alert.acknowledgedAt === null && (
                            <button
                              type="button"
                              onClick={() => void handleAcknowledge(alert.alertId)}
                              className="font-semibold text-muted-foreground hover:underline hover:text-foreground"
                            >
                              Acknowledge
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  );
}
