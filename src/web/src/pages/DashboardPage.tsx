/**
 * Purpose: The Dashboard Home of SPEC-02 section 3 - the landing screen after login.
 * It renders the entry points the signed-in role is allowed to see, driven entirely
 * by the shared list in dashboard/entry-points.ts so the layout and the tests cannot
 * drift apart.
 *
 * SPEC-18 / SPEC-14 restyles this page to match Figma v3:
 * 1. Interactive 5-tile KPI row with expandable drill-down table.
 * 2. 2-column split layout: Left (1/3 Quick Actions stack) + Right (2/3 Recent Activity feed).
 * 3. Bottom persistent Expiring MoUs alert banner with CTA to /alerts.
 * 4. Full task grid maintaining accessible entry points for all roles.
 */

import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { fetchAlertsCount, fetchDashboardSummary, fetchRecentActivity, fetchSearch } from "../api/client.ts";
import type { DashboardSummary, RecentActivityRow, SearchRow } from "../api/client.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Icon } from "../components/icons.tsx";
import { Badge, Card, SecTitle, brand } from "../components/ui.tsx";
import { visibleEntryPoints } from "../dashboard/entry-points.ts";

interface KpiTile {
  readonly label: string;
  readonly value: number;
  readonly delta: string;
  readonly iconCls: string;
  readonly valCls: string;
}

function kpiTiles(summary: DashboardSummary): readonly KpiTile[] {
  return [
    { label: "Total Companies", value: summary.totalCompanies, delta: "Registered companies", iconCls: "bg-[#E8F0FB] text-[#1B5FAE]", valCls: "text-[#1B5FAE]" },
    { label: "Active MoUs", value: summary.activeMou, delta: "Currently active", iconCls: "bg-[#E8F8EA] text-[#39B54A]", valCls: "text-[#39B54A]" },
    { label: "Expiring Soon", value: summary.expiringSoon, delta: "Within 90 days", iconCls: "bg-[#FEF3C7] text-[#D97706]", valCls: "text-[#D97706]" },
    { label: "Expired", value: summary.expired, delta: "Needs renewal", iconCls: "bg-[#FEE2E2] text-[#DC2626]", valCls: "text-[#DC2626]" },
    { label: "Pending Review", value: summary.pendingReview, delta: "Awaiting sign-off", iconCls: "bg-[#FFF0E8] text-[#F26522]", valCls: "text-[#F26522]" },
  ];
}

function statusVariant(status: string | null): "success" | "warning" | "info" {
  if (status === "ACTIVE") return "success";
  if (status === "EXPIRED") return "warning";
  return "info";
}

function formatOccurredAt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

interface QuickActionConfig {
  readonly id: string;
  readonly label: string;
  readonly desc: string;
  readonly path: string;
  readonly icon: React.ReactNode;
  readonly cls: string;
  readonly iconCls: string;
  readonly isExpiryAlert?: boolean;
}

const QUICK_ACTIONS: readonly QuickActionConfig[] = [
  {
    id: "add-company",
    label: "Add New Company",
    desc: "Register a new MoU company",
    path: "/companies/new",
    icon: Icon.plus,
    cls: "text-white border-transparent bg-[#1B5FAE]",
    iconCls: "text-white",
  },
  {
    id: "existing-company",
    label: "Search Company",
    desc: "View existing MoU details",
    path: "/companies",
    icon: Icon.search,
    cls: "bg-white text-foreground border-border",
    iconCls: "text-[#1B5FAE]",
  },
  {
    id: "edit-agreement",
    label: "Edit Agreement",
    desc: "Amend or update an MoU",
    path: "/agreements/edit",
    icon: Icon.edit,
    cls: "bg-white text-foreground border-border",
    iconCls: "text-[#1B5FAE]",
  },
  {
    id: "upload-mou",
    label: "Upload MoU PDF",
    desc: "Attach signed documents",
    path: "/upload-mou",
    icon: Icon.upload,
    cls: "bg-white text-foreground border-border",
    iconCls: "text-[#1B5FAE]",
  },
  {
    id: "expiry-alerts",
    label: "Expiry Alerts",
    desc: "MoUs expiring soon",
    path: "/alerts",
    icon: Icon.bell,
    cls: "text-amber-800 border-amber-200 bg-[#FFF0E8]",
    iconCls: "text-amber-700",
    isExpiryAlert: true,
  },
  {
    id: "agreement-history",
    label: "Agreement History",
    desc: "View all past agreements",
    path: "/agreements/history",
    icon: Icon.history,
    cls: "bg-white text-foreground border-border",
    iconCls: "text-[#1B5FAE]",
  },
  {
    id: "export-excel",
    label: "Export Data",
    desc: "Download Excel / PDF report",
    path: "/export/excel",
    icon: Icon.download,
    cls: "bg-white text-foreground border-border",
    iconCls: "text-[#1B5FAE]",
  },
];

export function DashboardPage() {
  const { user } = useAuth();
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [alertsCount, setAlertsCount] = useState<number | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<readonly RecentActivityRow[]>([]);
  const [activeKpi, setActiveKpi] = useState<string | null>(null);
  const [kpiRows, setKpiRows] = useState<readonly SearchRow[]>([]);
  const [kpiLoading, setKpiLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAlertsCount()
      .then((count) => {
        if (!cancelled) setAlertsCount(count);
      })
      .catch(() => {
        if (!cancelled) setAlertsCount(null);
      });
    fetchDashboardSummary()
      .then((value) => {
        if (!cancelled) setSummary(value);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      });
    fetchRecentActivity(8)
      .then((rows) => {
        if (!cancelled) setActivity(rows);
      })
      .catch(() => {
        if (!cancelled) setActivity([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (activeKpi === null) {
      setKpiRows([]);
      return;
    }
    let cancelled = false;
    setKpiLoading(true);
    const filterStatus =
      activeKpi === "Active MoUs" ? "ACTIVE" : activeKpi === "Expired" ? "EXPIRED" : undefined;

    fetchSearch({ status: filterStatus }, 1)
      .then((res) => {
        if (!cancelled) {
          setKpiRows(res.rows);
        }
      })
      .catch(() => {
        if (!cancelled) setKpiRows([]);
      })
      .finally(() => {
        if (!cancelled) setKpiLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeKpi]);

  // RequireAuth guarantees a user, so this is only here to satisfy the type.
  if (user === null) {
    return null;
  }

  const entryPoints = visibleEntryPoints(user.role);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const expiringCount = summary?.expiringSoon ?? alertsCount ?? 0;

  const visibleQuickActions = QUICK_ACTIONS.filter((qa) =>
    entryPoints.some((ep) => ep.id === qa.id),
  ).map((qa) => ({
    ...qa,
    desc: qa.isExpiryAlert ? `${expiringCount} MoUs expiring soon` : qa.desc,
  }));

  return (
    <>
      <Topbar title="Dashboard" subtitle={`Good day, ${user.username} · ${today}`} onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 flex-1 overflow-y-auto">
        {summary !== null && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
            {kpiTiles(summary).map((tile) => {
              const isActive = activeKpi === tile.label;
              return (
                <button
                  key={tile.label}
                  type="button"
                  onClick={() => setActiveKpi(isActive ? null : tile.label)}
                  className={`glass-kpi rounded-xl p-4 text-left transition-all duration-150 hover:shadow-md active:scale-[0.98] w-full cursor-pointer ${
                    isActive ? "ring-2 ring-blue-500 ring-offset-1" : ""
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${tile.iconCls}`}>{Icon.grid}</div>
                  <p className={`font-bold text-2xl mono ${tile.valCls}`}>{tile.value}</p>
                  <p className="text-xs font-semibold text-foreground mt-0.5">{tile.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{tile.delta}</p>
                  {isActive && (
                    <p className="text-[10px] font-bold mt-2 uppercase tracking-wide" style={{ color: brand.orange }}>
                      ▼ showing below
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* KPI drill-down table */}
        {activeKpi !== null && (
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
              <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: brand.navy }}>
                {activeKpi}
                <span className="ml-2 text-xs font-normal text-muted-foreground normal-case tracking-normal">
                  ({kpiRows.length} record{kpiRows.length !== 1 ? "s" : ""})
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setActiveKpi(null)}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer"
              >
                <span className="w-4 h-4">{Icon.x}</span> Close
              </button>
            </div>
            <div className="overflow-x-auto">
              {kpiLoading ? (
                <div className="p-8 text-center text-xs text-muted-foreground">Loading records…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {["#", "Company", "Zone", "Plant", "Scheme", "MoU Code", "Expires", "Status"].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {kpiRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-xs text-muted-foreground">
                          No records found.
                        </td>
                      </tr>
                    ) : (
                      kpiRows.map((r, i) => (
                        <tr key={r.mouId} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 text-xs text-muted-foreground mono">{i + 1}</td>
                          <td className="px-4 py-3 font-semibold text-foreground text-xs max-w-[180px] truncate">
                            <Link to={`/companies?zoneId=${r.zoneId}&companyId=${r.companyId}`} className="hover:underline">
                              {r.companyName}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{r.zoneName}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{r.plantName ?? "—"}</td>
                          <td className="px-4 py-3">
                            <Badge text={r.scheme} variant="info" />
                          </td>
                          <td className="px-4 py-3 text-xs mono text-muted-foreground whitespace-nowrap">{r.generatedCode}</td>
                          <td className="px-4 py-3 text-xs mono text-muted-foreground whitespace-nowrap">{r.endDate}</td>
                          <td className="px-4 py-3">
                            <Badge text={r.status} variant={statusVariant(r.status)} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        )}

        {/* Middle row: Quick Actions (1 col) + Recent Activity (2 cols) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
          <Card className="p-4 lg:p-5 lg:col-span-1">
            <SecTitle>Quick Actions</SecTitle>
            <div className="flex flex-col gap-2">
              {visibleQuickActions.map((qa) => (
                <Link
                  key={qa.id}
                  to={qa.path}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-150 text-left hover:opacity-90 active:scale-[0.98] ${qa.cls}`}
                >
                  <span className={`shrink-0 ${qa.iconCls}`}>{qa.icon}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{qa.label}</p>
                    <p className="text-xs opacity-75 truncate">{qa.desc}</p>
                  </div>
                  <span className="ml-auto opacity-50 shrink-0">{Icon.chevR}</span>
                </Link>
              ))}
            </div>
          </Card>

          <Card className="lg:col-span-2 overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
              <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: brand.navy }}>
                Recent Activity
              </h3>
              <Link to="/agreements/history" className="text-xs font-semibold hover:underline" style={{ color: brand.orange }}>
                View all →
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40">
                    {["Company", "Zone", "Plant", "Scheme", "Status", "Updated"].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {activity.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-xs text-muted-foreground">
                        No recent activity.
                      </td>
                    </tr>
                  ) : (
                    activity.map((row, index) => (
                      <tr key={index} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-semibold text-foreground text-xs max-w-[150px] truncate">{row.company}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{row.zone}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{row.plant ?? "—"}</td>
                        <td className="px-4 py-3">{row.scheme !== null && <Badge text={row.scheme} variant="info" />}</td>
                        <td className="px-4 py-3">{row.status !== null && <Badge text={row.status} variant={statusVariant(row.status)} />}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs mono">{formatOccurredAt(row.occurredAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Alert banner */}
        <div className="glass-alert rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1">
            <div style={{ color: brand.orange }} className="shrink-0">
              {Icon.alert}
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: brand.navy }}>
                {expiringCount} MoUs expiring within 30 days
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Review and initiate renewals to avoid compliance gaps.
              </p>
            </div>
          </div>
          <Link
            to="/alerts"
            className="w-full sm:w-auto justify-center inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg px-3 py-1.5 text-xs text-white"
            style={{ background: brand.orange, borderColor: brand.orange }}
          >
            View Expiring MoUs
          </Link>
        </div>
      </div>
    </>
  );
}
