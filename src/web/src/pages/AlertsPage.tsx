/**
 * Purpose: SPEC-08's alert list — Figma v3 aligned UI with summary KPI cards
 * (30d/60d/pending), styled table with Renew/View/Acknowledge actions.
 */

import { SCHEME_LABELS } from "@mou/domain";
import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import type { AlertFilters, AlertRow, EnumOption, ZoneOption } from "../api/client.ts";
import { acknowledgeAlert, fetchAlerts, fetchEnums, fetchZones } from "../api/client.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Badge, Btn, Card, brand } from "../components/ui.tsx";

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

  // Summary KPI cards config
  const kpiCards: {
    label: string;
    filterKey: AlertFilters["days"];
    count: number;
    baseCls: string;
    activeCls: string;
    valCls: string;
  }[] = [
    {
      label: "Expiring in 30 days",
      filterKey: "30",
      count: alerts.filter((a) => a.daysRemaining <= 30).length,
      baseCls: "bg-[#FEF2F2] border-[#FECACA]",
      activeCls: "ring-2 ring-red-400 bg-[#FEE2E2]",
      valCls: "text-[#DC2626]",
    },
    {
      label: "Expiring in 60 days",
      filterKey: "60",
      count: alerts.filter((a) => a.daysRemaining <= 60).length,
      baseCls: "bg-[#FFFBEB] border-[#FDE68A]",
      activeCls: "ring-2 ring-amber-400 bg-[#FEF3C7]",
      valCls: "text-[#D97706]",
    },
    {
      label: "Expiring in 90 days",
      filterKey: "90",
      count: alerts.filter((a) => a.daysRemaining <= 90).length,
      baseCls: "bg-[#EFF6FF] border-[#BFDBFE]",
      activeCls: "ring-2 ring-blue-400 bg-[#DBEAFE]",
      valCls: "text-[#1B5FAE]",
    },
  ];

  const tableTitle =
    days === "30"
      ? "Expiring within 30 Days"
      : days === "60"
        ? "Expiring within 60 Days"
        : days === "90"
          ? "Expiring within 90 Days"
          : "All Expiring MoUs";

  return (
    <>
      <Topbar title="MoU Expiry Alerts" subtitle="Upcoming expirations requiring action" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 space-y-4 md:space-y-5 flex-1 overflow-y-auto">
        {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        {/* Summary KPI Cards */}
        <div className="grid sm:grid-cols-3 gap-4">
          {kpiCards.map((k) => {
            const isActive = days === k.filterKey;
            return (
              <button
                key={k.label}
                type="button"
                onClick={() => setDays((prev) => (prev === k.filterKey ? "all" : k.filterKey))}
                className={`glass-kpi rounded-xl p-5 text-left transition-all duration-200 hover:shadow-lg active:scale-[0.98] ${
                  isActive ? k.activeCls : ""
                }`}
              >
                <p className={`font-bold text-3xl mono ${k.valCls}`}>{k.count}</p>
                <p className="text-sm font-semibold text-foreground mt-1">{k.label}</p>
                {isActive && (
                  <p className="text-xs mt-1.5 font-semibold" style={{ color: brand.orange }}>
                    ● Filtered — click to clear
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <select
              aria-label="Threshold"
              value={days}
              onChange={(event) => setDays(event.target.value as AlertFilters["days"])}
              className="h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
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
              className="h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="false">Unacknowledged</option>
              <option value="true">Acknowledged</option>
              <option value="all">All</option>
            </select>
          </div>
        </Card>

        {/* Alert Table */}
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">No alerts match these filters.</p>
        ) : (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: brand.navy }}>
                  {tableTitle}
                </h3>
                <span className="mono text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                  {alerts.length}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["Company", "Zone", "MoU Code", "Scheme", "Expiry Date", "Days Left", "Status", "Action"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide"
                        >
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert) => (
                    <tr
                      key={alert.alertId}
                      className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-foreground text-xs">{alert.companyName}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{alert.zoneName}</td>
                      <td className="px-4 py-3 mono text-xs font-bold text-[#1B5FAE]">{alert.generatedCode}</td>
                      <td className="px-4 py-3">
                        <Badge
                          text={SCHEME_LABELS[alert.scheme as keyof typeof SCHEME_LABELS] ?? alert.scheme}
                          variant="info"
                        />
                      </td>
                      <td className="px-4 py-3 mono text-xs">{alert.endDate}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`mono font-bold text-sm ${
                            alert.daysRemaining <= 30
                              ? "text-red-600"
                              : alert.daysRemaining <= 60
                                ? "text-amber-600"
                                : "text-blue-600"
                          }`}
                        >
                          {alert.daysRemaining}d
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge text={alert.status} variant={statusVariant(alert.status)} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <Btn variant="orange" size="sm">
                            <Link to="/upload-mou" className="text-white no-underline">
                              Renew
                            </Link>
                          </Btn>
                          <Link
                            to={`/companies?zoneId=${alert.zoneId}&companyId=${alert.companyId}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg border border-border text-foreground hover:bg-muted transition-colors"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </Link>
                          {canAcknowledge && alert.acknowledgedAt === null && (
                            <button
                              type="button"
                              onClick={() => void handleAcknowledge(alert.alertId)}
                              className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:underline hover:text-foreground"
                            >
                              Ack
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
