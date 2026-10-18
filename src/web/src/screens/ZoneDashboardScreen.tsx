/**
 * Purpose: The Zone Dashboard - one card per zone with its company count, Active /
 * Expiring / Expired MoUs and active-rate bar, from GET /api/dashboard/zone-wise.
 * Clicking a card selects it and opens, below the grid, that zone's company table:
 * every company of the zone (GET /api/zones/:id/companies) with its first MoU from
 * the zone drill-down, or dashes when it has none. Clicking again or "Close" hides it.
 */

import { useEffect, useRef, useState } from "react";

import { fetchZoneCompanies, fetchZoneDashboard, fetchZoneDrillDown } from "../api/client.ts";
import type { ZoneDrillDownRow, ZoneSummaryRow } from "../api/client.ts";
import { PENDING_FIGURE, displayStatus, formatCalendarDate, schemeLabel } from "../ui/format.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge } from "../ui/primitives.tsx";
import { BRAND, statusTone } from "../ui/theme.ts";

const DETAIL_HEADINGS = ["#", "Company Name", "Plant", "Scheme", "MoU Code", "Expires", "Status"];
const LOAD_ERROR = "Could not load zone data. Please refresh the page.";
const DETAIL_ERROR = "Could not load this zone's companies. Please try again.";

interface ZoneCompanyRow {
  readonly companyId: string;
  readonly company: string;
  /** The company's first MoU in the drill-down, or undefined when it has none. */
  readonly mou: ZoneDrillDownRow | undefined;
}

/** Active MoUs per company as a rounded percentage - it can exceed 100%, as in the design. */
function activeRate(zone: ZoneSummaryRow): number {
  return zone.companies > 0 ? Math.round((zone.active / zone.companies) * 100) : 0;
}

export function ZoneDashboardScreen() {
  const [zones, setZones] = useState<readonly ZoneSummaryRow[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const selected = zones?.find((zone) => zone.zoneId === selectedZoneId);

  useEffect(() => {
    let cancelled = false;
    fetchZoneDashboard()
      .then((dashboard) => {
        if (!cancelled) setZones(dashboard.zones);
      })
      .catch(() => {
        if (!cancelled) setLoadError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedZoneId) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedZoneId]);

  return (
    <ScreenFrame title="Zone Dashboard" subtitle="MoU statistics across all zones" contentClassName="p-4 md:p-6 space-y-4 md:space-y-5">
      {loadError !== "" && (
        <div role="alert" className="rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
          {loadError}
        </div>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {zones?.map((zone) => {
          const isSelected = zone.zoneId === selectedZoneId;
          const rate = activeRate(zone);
          return (
            <button
              key={zone.zoneId}
              type="button"
              data-zone-id={zone.zoneId}
              onClick={() => setSelectedZoneId(isSelected ? null : zone.zoneId)}
              className={`text-left w-full rounded-xl p-5 transition-all duration-150 hover:shadow-md active:scale-[0.98] ${isSelected ? "ring-2 ring-[#1B5FAE] ring-offset-1" : ""} glass-card`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm text-[#0D2E5A]">{zone.zoneName}</h3>
                <Badge text={`${zone.companies} companies`} tone={isSelected ? "info" : "default"} />
              </div>
              <ZoneCounts zone={zone} valueClass="mono font-bold text-xl" cellClass="" gridClass="grid grid-cols-3 gap-2 text-center" />
              <div className="mt-4 h-2 bg-border rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all bg-[#39B54A]" style={{ width: `${rate}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground font-semibold">{rate}% active rate</p>
                {isSelected && (
                  <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: BRAND.orange }}>
                    ▼ showing below
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div ref={detailRef}>
          <ZoneDetail key={selected.zoneId} zone={selected} onClose={() => setSelectedZoneId(null)} />
        </div>
      )}
    </ScreenFrame>
  );
}

interface ZoneCountsProps {
  readonly zone: ZoneSummaryRow;
  readonly gridClass: string;
  readonly cellClass: string;
  readonly valueClass: string;
}

function ZoneCounts({ zone, gridClass, cellClass, valueClass }: ZoneCountsProps) {
  const counts = [
    { label: "Active", value: zone.active, colour: "text-[#39B54A]" },
    { label: "Expiring", value: zone.expiringSoon, colour: "text-amber-600" },
    { label: "Expired", value: zone.expired, colour: "text-red-600" },
  ];
  return (
    <div className={gridClass}>
      {counts.map((count) => (
        <div key={count.label} className={cellClass || undefined}>
          <p data-testid={`count-${count.label.toLowerCase()}`} className={`${valueClass} ${count.colour}`}>
            {count.value}
          </p>
          <p className="text-xs text-muted-foreground font-semibold">{count.label}</p>
        </div>
      ))}
    </div>
  );
}

/** Every company once, sorted by name, each with its first drill-down MoU. */
function mergeRows(
  companies: readonly { readonly id: string; readonly name: string }[],
  mous: readonly ZoneDrillDownRow[],
): readonly ZoneCompanyRow[] {
  const names = new Map(companies.map((company) => [company.id, company.name]));
  for (const mou of mous) {
    if (!names.has(mou.companyId)) names.set(mou.companyId, mou.companyName);
  }
  return [...names.entries()]
    .map(([companyId, company]) => ({ companyId, company, mou: mous.find((mou) => mou.companyId === companyId) }))
    .sort((a, b) => a.company.localeCompare(b.company));
}

function ZoneDetail({ zone, onClose }: { readonly zone: ZoneSummaryRow; readonly onClose: () => void }) {
  const [rows, setRows] = useState<readonly ZoneCompanyRow[] | null>(null);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchZoneCompanies(zone.zoneId), fetchZoneDrillDown(zone.zoneId)])
      .then(([companies, mous]) => {
        if (!cancelled) setRows(mergeRows(companies, mous));
      })
      .catch(() => {
        if (!cancelled) setLoadError(DETAIL_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [zone.zoneId]);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <span style={{ color: BRAND.blue }}>
            <Icon name="map" />
          </span>
          <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: BRAND.navy }}>
            {zone.zoneName}
            <span className="ml-2 text-xs font-normal text-muted-foreground normal-case tracking-normal">({zone.companies} companies)</span>
          </h3>
        </div>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
          <Icon name="close" className="w-4 h-4" strokeWidth={2} /> Close
        </button>
      </div>
      <ZoneCounts
        zone={zone}
        gridClass="grid grid-cols-3 divide-x divide-border border-b border-border"
        cellClass="px-5 py-3 text-center"
        valueClass="mono font-bold text-lg"
      />
      {loadError !== "" && (
        <div role="alert" className="m-4 rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
          {loadError}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {DETAIL_HEADINGS.map((heading) => (
                <th key={heading} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows !== null && rows.length === 0 && (
              <tr>
                <td colSpan={DETAIL_HEADINGS.length} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  No companies in this zone
                </td>
              </tr>
            )}
            {rows?.map(({ companyId, company, mou }, index) => {
              const status = mou ? displayStatus(mou.status, mou.endDate) : PENDING_FIGURE;
              return (
                <tr key={companyId} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 text-xs text-muted-foreground mono">{index + 1}</td>
                  <td className="px-4 py-3 font-semibold text-foreground text-xs max-w-[220px] truncate">{company}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{mou?.plantName ?? PENDING_FIGURE}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {mou ? <Badge text={schemeLabel(mou.scheme)} tone="info" /> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs mono text-muted-foreground whitespace-nowrap">{mou ? mou.generatedCode : PENDING_FIGURE}</td>
                  <td className="px-4 py-3 text-xs mono text-muted-foreground whitespace-nowrap">{mou ? formatCalendarDate(mou.endDate) : PENDING_FIGURE}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {mou ? <Badge text={status} tone={statusTone(status)} /> : <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
