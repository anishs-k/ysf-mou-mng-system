/**
 * Purpose: The Zone Dashboard - one card per zone with its company count, Active /
 * Expiring / Expired MoUs and active-rate bar. Clicking a card selects it and
 * opens, below the grid, that zone's company table (each company's first MoU);
 * clicking it again or "Close" hides the table.
 */

import { useEffect, useRef, useState } from "react";

import { ZONE_STATS, zoneCompanyRows } from "../data/zoneStats.ts";
import type { ZoneStat } from "../data/zoneStats.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge } from "../ui/primitives.tsx";
import { BRAND, statusTone } from "../ui/theme.ts";

const DETAIL_HEADINGS = ["#", "Company Name", "Plant", "Scheme", "MoU Code", "Expires", "Status"];

export function ZoneDashboardScreen() {
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);
  const selected = ZONE_STATS.find((stat) => stat.zone === selectedZone);

  useEffect(() => {
    if (selectedZone) detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [selectedZone]);

  return (
    <ScreenFrame title="Zone Dashboard" subtitle="MoU statistics across all zones" contentClassName="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {ZONE_STATS.map((stat) => {
          const isSelected = stat.zone === selectedZone;
          return (
            <button
              key={stat.zone}
              type="button"
              onClick={() => setSelectedZone(isSelected ? null : stat.zone)}
              className={`text-left w-full rounded-xl p-5 transition-all duration-150 hover:shadow-md active:scale-[0.98] ${isSelected ? "ring-2 ring-[#1B5FAE] ring-offset-1" : ""} glass-card`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-sm text-[#0D2E5A]">{stat.zone}</h3>
                <Badge text={`${stat.companies} companies`} tone={isSelected ? "info" : "default"} />
              </div>
              <ZoneCounts stat={stat} valueClass="mono font-bold text-xl" cellClass="" gridClass="grid grid-cols-3 gap-2 text-center" />
              <div className="mt-4 h-2 bg-border rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all bg-[#39B54A]" style={{ width: `${stat.activeRate}%` }} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-xs text-muted-foreground font-semibold">{stat.activeRate}% active rate</p>
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
          <ZoneDetail stat={selected} onClose={() => setSelectedZone(null)} />
        </div>
      )}
    </ScreenFrame>
  );
}

interface ZoneCountsProps {
  readonly stat: ZoneStat;
  readonly gridClass: string;
  readonly cellClass: string;
  readonly valueClass: string;
}

function ZoneCounts({ stat, gridClass, cellClass, valueClass }: ZoneCountsProps) {
  const counts = [
    { label: "Active", value: stat.active, colour: "text-[#39B54A]" },
    { label: "Expiring", value: stat.expiring, colour: "text-amber-600" },
    { label: "Expired", value: stat.expired, colour: "text-red-600" },
  ];
  return (
    <div className={gridClass}>
      {counts.map((count) => (
        <div key={count.label} className={cellClass || undefined}>
          <p className={`${valueClass} ${count.colour}`}>{count.value}</p>
          <p className="text-xs text-muted-foreground font-semibold">{count.label}</p>
        </div>
      ))}
    </div>
  );
}

function ZoneDetail({ stat, onClose }: { readonly stat: ZoneStat; readonly onClose: () => void }) {
  const rows = zoneCompanyRows(stat.zone);
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <span style={{ color: BRAND.blue }}>
            <Icon name="map" />
          </span>
          <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: BRAND.navy }}>
            {stat.zone}
            <span className="ml-2 text-xs font-normal text-muted-foreground normal-case tracking-normal">({stat.companies} companies)</span>
          </h3>
        </div>
        <button type="button" onClick={onClose} className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1">
          <Icon name="close" className="w-4 h-4" strokeWidth={2} /> Close
        </button>
      </div>
      <ZoneCounts
        stat={stat}
        gridClass="grid grid-cols-3 divide-x divide-border border-b border-border"
        cellClass="px-5 py-3 text-center"
        valueClass="mono font-bold text-lg"
      />
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
            {rows.map(({ company, mou }, index) => (
              <tr key={company} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 text-xs text-muted-foreground mono">{index + 1}</td>
                <td className="px-4 py-3 font-semibold text-foreground text-xs max-w-[220px] truncate">{company}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">{mou ? mou.plant : "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {mou ? <Badge text={mou.scheme} tone="info" /> : <span className="text-xs text-muted-foreground">—</span>}
                </td>
                <td className="px-4 py-3 text-xs mono text-muted-foreground whitespace-nowrap">{mou ? mou.code : "—"}</td>
                <td className="px-4 py-3 text-xs mono text-muted-foreground whitespace-nowrap">{mou ? mou.expires : "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {mou ? <Badge text={mou.status} tone={statusTone(mou.status)} /> : <span className="text-xs text-muted-foreground">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
