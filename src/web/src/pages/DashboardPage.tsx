/**
 * Purpose: The Dashboard Home of SPEC-02 section 3 - the landing screen after login.
 * It renders the entry points the signed-in role is allowed to see, driven entirely
 * by the shared list in dashboard/entry-points.ts so the layout and the tests cannot
 * drift apart. Destinations whose spec has not landed yet stay visible but disabled,
 * which section 3.1 requires so the dashboard never has to be rebuilt.
 *
 * SPEC-14 restyles this page to match `figma_code`'s DashboardPage and adds the
 * KPI row (D84) and Recent Activity table (D86), both wired to the two new
 * read-only endpoints in §5 - nothing here is faked or hardcoded.
 *
 * The SPEC-08 section 5 badge - a live count of current MOUs within 90 days of
 * expiry, not a count of mou_alert rows - is fetched once on mount and shown on
 * the "MOU Expiry Alerts" entry point once that destination is available.
 */

import { useEffect, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import { fetchAlertsCount, fetchDashboardSummary, fetchRecentActivity } from "../api/client.ts";
import type { DashboardSummary, RecentActivityRow } from "../api/client.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { ENTRY_ICON, Icon } from "../components/icons.tsx";
import { Badge, Card, SecTitle, brand } from "../components/ui.tsx";
import { visibleEntryPoints } from "../dashboard/entry-points.ts";
import type { DashboardEntryPoint } from "../dashboard/entry-points.ts";

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
    { label: "Active MOU", value: summary.activeMou, delta: "Currently active", iconCls: "bg-[#E8F8EA] text-[#39B54A]", valCls: "text-[#39B54A]" },
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

function EntryPointCard({ entry, badgeCount }: { entry: DashboardEntryPoint; badgeCount: number | null }) {
  const icon = Icon[ENTRY_ICON[entry.id] ?? "file"];
  const heading = (
    <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
      {/* Isolated in its own leaf element so getByText(label, { exact: true })
          still matches the label alone even once the badge sibling below adds
          its own text - otherwise the two text nodes concatenate into one
          "own text" on the shared parent. */}
      <span>{entry.label}</span>
      {entry.available && entry.id === "expiry-alerts" && badgeCount !== null && badgeCount > 0 && (
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
          {badgeCount}
        </span>
      )}
    </span>
  );

  if (!entry.available) {
    return (
      <li aria-disabled="true" className="rounded-lg border border-dashed border-border bg-muted/40 p-4">
        {heading}
        <p className="mt-1 text-xs text-muted-foreground">{entry.description}</p>
        <p className="mt-2 text-xs text-muted-foreground">Coming soon · {entry.spec}</p>
      </li>
    );
  }

  return (
    <li>
      <Link to={entry.path} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-white transition-all duration-150 hover:border-[#1B5FAE] hover:shadow-md">
        <span className="shrink-0" style={{ color: brand.blue }}>
          {icon}
        </span>
        <div className="min-w-0">
          {heading}
          <p className="mt-0.5 text-xs text-muted-foreground truncate">{entry.description}</p>
        </div>
        <span className="ml-auto opacity-50 shrink-0">{Icon.chevR}</span>
      </Link>
    </li>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [alertsCount, setAlertsCount] = useState<number | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [activity, setActivity] = useState<readonly RecentActivityRow[]>([]);

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

  // RequireAuth guarantees a user, so this is only here to satisfy the type.
  if (user === null) {
    return null;
  }

  const entryPoints = visibleEntryPoints(user.role);
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <Topbar title="Dashboard" subtitle={`Good day, ${user.username} · ${today}`} onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 flex-1 overflow-y-auto">
        {summary !== null && (
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
            {kpiTiles(summary).map((tile) => (
              <div key={tile.label} className="glass-kpi rounded-xl p-4 text-left">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${tile.iconCls}`}>{Icon.grid}</div>
                <p className={`font-bold text-2xl mono ${tile.valCls}`}>{tile.value}</p>
                <p className="text-xs font-semibold text-foreground mt-0.5">{tile.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{tile.delta}</p>
              </div>
            ))}
          </div>
        )}

        <Card className="overflow-hidden">
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

        <Card className="p-4 lg:p-5">
          <SecTitle>Choose a task</SecTitle>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entryPoints.map((entry) => (
              <EntryPointCard key={entry.id} entry={entry} badgeCount={alertsCount} />
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
