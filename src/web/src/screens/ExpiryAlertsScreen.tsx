/**
 * Purpose: The MoU Expiry Alerts screen - three KPI tiles that toggle a filter
 * (30 days / 60 days / renewal upload pending), the expiring-MoUs table with a CSV
 * export of the visible rows, and the detail dialog behind each row's eye button.
 * Renew and "Initiate Renewal" lead to the Upload MoU screen.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { EXPIRY_ALERTS } from "../data/expiryAlerts.ts";
import type { ExpiryAlert } from "../data/expiryAlerts.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge } from "../ui/primitives.tsx";
import { BRAND } from "../ui/theme.ts";

type AlertFilter = "30" | "60" | "pending";

interface FilterTile {
  readonly id: AlertFilter;
  readonly label: string;
  readonly heading: string;
  readonly valueClass: string;
  readonly activeClass: string;
  readonly matches: (alert: ExpiryAlert) => boolean;
}

const FILTER_TILES: readonly FilterTile[] = [
  { id: "30", label: "Expiring in 30 days", heading: "Expiring within 30 Days", valueClass: "text-[#DC2626]", activeClass: "ring-2 ring-red-400 bg-[#FEE2E2]", matches: (alert) => alert.daysLeft <= 30 },
  { id: "60", label: "Expiring in 60 days", heading: "Expiring within 60 Days", valueClass: "text-[#D97706]", activeClass: "ring-2 ring-amber-400 bg-[#FEF3C7]", matches: (alert) => alert.daysLeft <= 60 },
  { id: "pending", label: "Renewal Upload Pending", heading: "Renewal Upload Pending", valueClass: "text-[#1B5FAE]", activeClass: "ring-2 ring-blue-400 bg-[#DBEAFE]", matches: (alert) => alert.status === "Pending" },
];

const TABLE_HEADINGS = ["Company", "Zone", "MoU Code", "Expiry Date", "Days Left", "Status", "Action"];
const CSV_HEADER = ["Company", "Zone", "Plant", "MoU Code", "Scheme", "Expiry Date", "Days Left", "HR Contact", "Status"];
/** Excel needs the BOM to read the "·" in the HR contact as UTF-8. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const SECONDARY_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary border-border hover:bg-blue-100";
const ACCENT_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-accent text-white border-accent hover:bg-orange-600 active:scale-95";

function daysLeftClass(days: number): string {
  if (days <= 30) return "text-red-600";
  if (days <= 60) return "text-amber-600";
  return "text-blue-600";
}

function csvLine(cells: readonly string[]): string {
  return cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",");
}

function exportCsv(rows: readonly ExpiryAlert[]): void {
  const lines = [
    csvLine(CSV_HEADER),
    ...rows.map((row) =>
      csvLine([row.company, row.zone, row.plant, row.code, row.scheme, row.expires, String(row.daysLeft), row.hrContact, row.status]),
    ),
  ];
  const blob = new Blob([BYTE_ORDER_MARK + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "MoU_Expiry_Alerts.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ExpiryAlertsScreen() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<AlertFilter | null>(null);
  const [selected, setSelected] = useState<ExpiryAlert | null>(null);

  const activeTile = FILTER_TILES.find((tile) => tile.id === filter);
  const rows = activeTile ? EXPIRY_ALERTS.filter(activeTile.matches) : EXPIRY_ALERTS;
  const goToUpload = () => navigate("/upload-mou");

  return (
    <ScreenFrame title="MoU Expiry Alerts" subtitle="Upcoming expirations requiring action" contentClassName="p-4 md:p-6 space-y-4 md:space-y-5">
      <div className="grid sm:grid-cols-3 gap-4">
        {FILTER_TILES.map((tile) => {
          const isActive = tile.id === filter;
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => setFilter(isActive ? null : tile.id)}
              className={`glass-kpi rounded-xl p-5 text-left transition-all duration-200 hover:shadow-lg active:scale-[0.98] ${isActive ? tile.activeClass : ""}`}
            >
              <p className={`font-bold text-3xl mono ${tile.valueClass}`}>{EXPIRY_ALERTS.filter(tile.matches).length}</p>
              <p className="text-sm font-semibold text-foreground mt-1">{tile.label}</p>
              {isActive && (
                <p className="text-xs mt-1.5 font-semibold" style={{ color: BRAND.orange }}>
                  ● Filtered — click to clear
                </p>
              )}
            </button>
          );
        })}
      </div>

      <div className="glass-card rounded-xl">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <div className="flex items-center gap-3">
            <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: BRAND.navy }}>
              {activeTile ? activeTile.heading : "All Expiring MoUs"}
            </h3>
            <span className="mono text-xs font-bold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{rows.length}</span>
          </div>
          <button type="button" onClick={() => exportCsv(rows)} className={`${SECONDARY_BUTTON} px-3 py-1.5 text-xs`}>
            <Icon name="download" />
            Export Excel
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {TABLE_HEADINGS.map((heading) => (
                  <th key={heading} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.code} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground text-xs">{row.company}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{row.zone}</td>
                  <td className="px-4 py-3 mono text-xs font-bold text-[#1B5FAE]">{row.code}</td>
                  <td className="px-4 py-3 mono text-xs">{row.expires}</td>
                  <td className="px-4 py-3">
                    <span className={`mono font-bold text-sm ${daysLeftClass(row.daysLeft)}`}>{row.daysLeft}d</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge text={row.status} tone={row.status === "Pending" ? "info" : "warning"} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button type="button" onClick={goToUpload} className={`${ACCENT_BUTTON} px-3 py-1.5 text-xs`}>
                        Renew
                      </button>
                      <button
                        type="button"
                        aria-label={`View ${row.company}`}
                        onClick={() => setSelected(row)}
                        className="inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-3 py-1.5 text-xs"
                      >
                        <Icon name="eye" className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && <AlertDialog alert={selected} onClose={() => setSelected(null)} onRenew={goToUpload} />}
    </ScreenFrame>
  );
}

interface AlertDialogProps {
  readonly alert: ExpiryAlert;
  readonly onClose: () => void;
  readonly onRenew: () => void;
}

function AlertDialog({ alert, onClose, onRenew }: AlertDialogProps) {
  const critical = alert.daysLeft <= 30;
  const banner = critical
    ? { background: "#FEE2E2", borderColor: "#FECACA", color: "#B91C1C", label: "Critical" }
    : { background: "#FEF3C7", borderColor: "#FDE68A", color: "#92400E", label: "Attention" };
  const fields: readonly (readonly [string, string])[] = [
    ["Zone", alert.zone],
    ["Plant", alert.plant],
    ["Scheme", alert.scheme],
    ["Status", alert.status],
    ["HR Contact", alert.hrContact],
    ["Expiry Date", alert.expires],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(13, 46, 90, 0.45)" }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={alert.company}
        className="glass-modal rounded-2xl w-full max-w-lg overflow-hidden"
      >
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div>
            <h2 className="font-bold text-base" style={{ color: BRAND.navy }}>
              {alert.company}
            </h2>
            <p className="mono text-xs font-semibold mt-0.5" style={{ color: BRAND.blue }}>
              {alert.code}
            </p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors shrink-0 ml-4"
          >
            <Icon name="close" className="w-4 h-4" strokeWidth={2} />
          </button>
        </div>
        <div
          className="mx-6 mt-5 rounded-xl px-4 py-3 flex items-center gap-3 border"
          style={{ background: banner.background, borderColor: banner.borderColor }}
        >
          <span style={{ color: banner.color }}>
            <Icon name="warning" />
          </span>
          <div>
            <p className="text-sm font-bold" style={{ color: banner.color }}>
              {banner.label} — Expires in {alert.daysLeft} days
            </p>
            <p className="text-xs mt-0.5" style={{ color: banner.color }}>
              Expiry date: {alert.expires}
            </p>
          </div>
        </div>
        <div className="p-6 grid grid-cols-2 gap-x-6 gap-y-4">
          {fields.map(([label, value]) => (
            <div key={label}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{label}</p>
              <p className="text-sm font-semibold text-foreground">{value}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-3 px-6 pb-6 pt-2">
          <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} px-4 py-2 text-sm flex-1 justify-center`}>
            Close
          </button>
          <button type="button" onClick={onRenew} className={`${ACCENT_BUTTON} px-4 py-2 text-sm flex-1 justify-center`}>
            <Icon name="upload" /> Initiate Renewal
          </button>
        </div>
      </div>
    </div>
  );
}
