/**
 * Purpose: The Dashboard - five KPI tiles, the Quick Actions list beside the
 * Recent Activity table, and the expiring-MoUs banner. KPI figures come from
 * GET /api/dashboard/summary and the activity rows from
 * GET /api/dashboard/recent-activity; tiles and actions navigate to the
 * matching screens.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchDashboardSummary, fetchRecentActivity } from "../api/client.ts";
import type { DashboardSummary, RecentActivityRow } from "../api/client.ts";
import { canOpenPath } from "../ui/access.ts";
import { PENDING_FIGURE, formatTimestamp, mouStatusLabel, schemeLabel } from "../ui/format.ts";
import { Icon } from "../ui/Icon.tsx";
import type { IconName } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge, Button, Card, SectionTitle } from "../ui/primitives.tsx";
import { useSession } from "../ui/session.ts";
import { BRAND, statusTone } from "../ui/theme.ts";

const RECENT_ACTIVITY_LIMIT = 5;
const LOAD_ERROR = "Could not load dashboard data. Please refresh the page.";

interface Kpi {
  readonly value: number | string;
  readonly label: string;
  readonly caption: string;
  readonly iconClass: string;
  readonly valueClass: string;
  readonly path: string;
}

interface QuickAction {
  readonly label: string;
  readonly caption: string;
  readonly icon: IconName;
  readonly iconClass: string;
  readonly strokeWidth?: number;
  readonly path: string;
  readonly look: "primary" | "plain" | "alert";
}

const ACTION_LOOKS = {
  primary: { button: "text-white border-transparent bg-[#1B5FAE]", icon: "text-white" },
  plain: { button: "bg-white text-foreground border-border", icon: "text-[#1B5FAE]" },
  alert: { button: "text-amber-800 border-amber-200 bg-[#FFF0E8]", icon: "text-amber-700" },
} as const;

function formatToday(): string {
  return new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function DashboardScreen() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<readonly RecentActivityRow[] | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchDashboardSummary(), fetchRecentActivity(RECENT_ACTIVITY_LIMIT)])
      .then(([nextSummary, nextActivity]) => {
        if (cancelled) return;
        setSummary(nextSummary);
        setActivity(nextActivity);
      })
      .catch(() => {
        if (!cancelled) setLoadError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const figure = (pick: (loaded: DashboardSummary) => number) => (summary === null ? PENDING_FIGURE : pick(summary));
  const expiring = figure((loaded) => loaded.expiringSoon);

  const kpis: readonly Kpi[] = [
    { value: figure((loaded) => loaded.totalCompanies), label: "Total Companies", caption: "Registered companies", iconClass: "bg-[#E8F0FB] text-[#1B5FAE]", valueClass: "text-[#1B5FAE]", path: "/companies" },
    { value: figure((loaded) => loaded.activeMou), label: "Active MoUs", caption: "Currently active", iconClass: "bg-[#E8F8EA] text-[#39B54A]", valueClass: "text-[#39B54A]", path: "/companies" },
    { value: expiring, label: "Expiring Soon", caption: "Within 90 days", iconClass: "bg-[#FEF3C7] text-[#D97706]", valueClass: "text-[#D97706]", path: "/alerts" },
    { value: figure((loaded) => loaded.expired), label: "Expired", caption: "Needs renewal", iconClass: "bg-[#FEE2E2] text-[#DC2626]", valueClass: "text-[#DC2626]", path: "/alerts" },
    { value: figure((loaded) => loaded.pendingReview), label: "Pending Review", caption: "Awaiting sign-off", iconClass: "bg-[#FFF0E8] text-[#F26522]", valueClass: "text-[#F26522]", path: "/companies" },
  ];

  const allActions: readonly QuickAction[] = [
    { label: "Add New Company", caption: "Register a new MoU company", icon: "plus", iconClass: "w-4 h-4", strokeWidth: 2.2, path: "/companies/new", look: "primary" },
    { label: "Search Company", caption: "View existing MoU details", icon: "search", iconClass: "w-4 h-4", path: "/companies", look: "plain" },
    { label: "Edit Agreement", caption: "Amend or update an MoU", icon: "edit", iconClass: "w-4 h-4", path: "/agreements/edit", look: "plain" },
    { label: "Upload MoU PDF", caption: "Attach signed documents", icon: "upload", iconClass: "w-5 h-5", path: "/upload-mou", look: "plain" },
    { label: "Expiry Alerts", caption: `${expiring} MoUs expiring soon`, icon: "bell", iconClass: "w-5 h-5", path: "/alerts", look: "alert" },
    { label: "Agreement History", caption: "View all past agreements", icon: "history", iconClass: "w-5 h-5", path: "/agreements/history", look: "plain" },
    { label: "Export Data", caption: "Download Excel / PDF report", icon: "download", iconClass: "w-5 h-5", path: "/export", look: "plain" },
  ];
  const actions = user === null ? [] : allActions.filter((action) => canOpenPath(user, action.path));

  return (
    <ScreenFrame title="Dashboard" subtitle={`Good morning, ${user?.username ?? ""} · ${formatToday()}`}>
      {loadError !== "" && (
        <div role="alert" className="rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
          {loadError}
        </div>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => navigate(kpi.path)}
            className="glass-kpi rounded-xl p-4 text-left transition-all duration-150 hover:shadow-md active:scale-[0.98] w-full"
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${kpi.iconClass}`}>
              <Icon name="grid" />
            </div>
            <p className={`font-bold text-2xl mono ${kpi.valueClass}`}>{kpi.value}</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{kpi.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{kpi.caption}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        <Card className="p-4 lg:p-5 lg:col-span-1">
          <SectionTitle>Quick Actions</SectionTitle>
          <div className="flex flex-col gap-2">
            {actions.map((action) => {
              const look = ACTION_LOOKS[action.look];
              return (
                <button
                  key={action.label}
                  type="button"
                  onClick={() => navigate(action.path)}
                  className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-150 text-left hover:opacity-90 active:scale-[0.98] ${look.button}`}
                >
                  <span className={`shrink-0 ${look.icon}`}>
                    <Icon name={action.icon} className={action.iconClass} strokeWidth={action.strokeWidth} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{action.label}</p>
                    <p className="text-xs opacity-60">{action.caption}</p>
                  </div>
                  <span className="ml-auto opacity-50">
                    <Icon name="chevronRight" className="w-4 h-4" strokeWidth={2} />
                  </span>
                </button>
              );
            })}
          </div>
        </Card>

        <Card className="lg:col-span-2 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
            <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: BRAND.navy }}>
              Recent Activity
            </h3>
            <button
              type="button"
              onClick={() => navigate("/companies")}
              className="text-xs font-semibold hover:underline"
              style={{ color: BRAND.orange }}
            >
              View all →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Company", "Zone", "Plant", "Scheme", "Status", "Updated"].map((heading) => (
                    <th key={heading} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activity !== null && activity.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-xs text-muted-foreground">
                      No recent activity
                    </td>
                  </tr>
                )}
                {activity?.map((row) => {
                  const status = mouStatusLabel(row.status);
                  return (
                    <tr key={`${row.type}-${row.occurredAt}-${row.company}`} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-semibold text-foreground text-xs max-w-[150px] truncate">{row.company}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{row.zone}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{row.plant ?? PENDING_FIGURE}</td>
                      <td className="px-4 py-3">
                        <Badge text={schemeLabel(row.scheme)} tone="info" />
                      </td>
                      <td className="px-4 py-3">
                        <Badge text={status} tone={statusTone(status)} />
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs mono">{formatTimestamp(row.occurredAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="glass-alert rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-3 flex-1">
          <div className="shrink-0" style={{ color: BRAND.orange }}>
            <Icon name="warning" />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: BRAND.navy }}>
              {expiring} MoUs expiring within 90 days
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Review and initiate renewals to avoid compliance gaps.</p>
          </div>
        </div>
        <Button variant="accent" size="sm" className="w-full sm:w-auto justify-center" onClick={() => navigate("/alerts")}>
          View Expiring MoUs
        </Button>
      </div>
    </ScreenFrame>
  );
}
