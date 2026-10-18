/**
 * Purpose: The MoU Expiry Alerts screen - three KPI tiles that toggle a filter
 * (30 days / 60 days / unacknowledged), the expiring-MoUs table with a CSV export of
 * the visible rows, and the detail dialog behind each row's eye button. Rows come
 * from GET /api/alerts/expiring (every threshold, acknowledged or not), folded to one
 * per MoU; the dialog loads the HR contact from the company overview and lets ADMIN /
 * DATA_ENTRY acknowledge. Renew and "Initiate Renewal" open Upload MoU for the MoU.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { acknowledgeAlert, acknowledgeMouAlerts, fetchAlerts, fetchCompanyOverview } from "../api/client.ts";
import type { AlertRow, CompanyOverview } from "../api/client.ts";
import { canAuthor, canOpenPath } from "../ui/access.ts";
import { EXPIRING_SOON_DAYS, PENDING_FIGURE, formatCalendarDate, mouStatusLabel, schemeLabel } from "../ui/format.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge } from "../ui/primitives.tsx";
import { useSession } from "../ui/session.ts";
import { BRAND, statusTone } from "../ui/theme.ts";

type AlertFilter = "30" | "60" | "unacknowledged";

/** One MoU's alerts folded into the row the table shows. */
interface MouAlert {
  readonly mouId: string;
  readonly companyId: string;
  readonly company: string;
  readonly zone: string;
  readonly plant: string;
  readonly code: string;
  readonly scheme: string;
  readonly endDate: string;
  readonly daysLeft: number;
  readonly status: string;
  /** Unacknowledged mou_alert rows to acknowledge by id. */
  readonly openAlertIds: readonly string[];
  /** True when the MoU is listed with no mou_alert row yet; acknowledged by MoU id. */
  readonly openWithoutAlertRow: boolean;
}

function isUnacknowledged(alert: MouAlert): boolean {
  return alert.openAlertIds.length > 0 || alert.openWithoutAlertRow;
}

interface FilterTile {
  readonly id: AlertFilter;
  readonly label: string;
  readonly heading: string;
  readonly valueClass: string;
  readonly activeClass: string;
  readonly matches: (alert: MouAlert) => boolean;
}

const FILTER_TILES: readonly FilterTile[] = [
  { id: "30", label: "Expiring in 30 days", heading: "Expiring within 30 Days", valueClass: "text-[#DC2626]", activeClass: "ring-2 ring-red-400 bg-[#FEE2E2]", matches: (alert) => alert.daysLeft >= 0 && alert.daysLeft <= 30 },
  { id: "60", label: "Expiring in 60 days", heading: "Expiring within 60 Days", valueClass: "text-[#D97706]", activeClass: "ring-2 ring-amber-400 bg-[#FEF3C7]", matches: (alert) => alert.daysLeft >= 0 && alert.daysLeft <= 60 },
  { id: "unacknowledged", label: "Unacknowledged", heading: "Unacknowledged Alerts", valueClass: "text-[#1B5FAE]", activeClass: "ring-2 ring-blue-400 bg-[#DBEAFE]", matches: isUnacknowledged },
];

const TABLE_HEADINGS = ["Company", "Zone", "MoU Code", "Expiry Date", "Days Left", "Status", "Action"];
const CSV_HEADER = ["Company", "Zone", "Plant", "MoU Code", "Scheme", "Expiry Date", "Days Left", "Status", "Acknowledged"];
/** Excel needs the BOM to read non-ASCII text as UTF-8. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const LOAD_ERROR = "Could not load expiry alerts. Please refresh the page.";
const ACKNOWLEDGE_ERROR = "Could not acknowledge this alert. Please try again.";

const SECONDARY_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary border-border hover:bg-blue-100";
const ACCENT_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-accent text-white border-accent hover:bg-orange-600 active:scale-95";

/** "Expiring" inside the window, otherwise the API's own status. */
function statusOf(row: AlertRow): string {
  return row.daysRemaining >= 0 && row.daysRemaining <= EXPIRING_SOON_DAYS ? "Expiring" : mouStatusLabel(row.status);
}

/** Folds the API rows to one per MoU, nearest expiry first; harmless when they already are. */
function foldByMou(rows: readonly AlertRow[]): readonly MouAlert[] {
  const byMou = new Map<string, MouAlert>();
  for (const row of rows) {
    const known = byMou.get(row.mouId);
    const open = row.acknowledgedAt === null;
    const openAlertIds = [...(known?.openAlertIds ?? []), ...(open && row.alertId !== null ? [row.alertId] : [])];
    const openWithoutAlertRow = (known?.openWithoutAlertRow ?? false) || (open && row.alertId === null);
    const nearest = known === undefined || row.daysRemaining < known.daysLeft;
    byMou.set(row.mouId, {
      mouId: row.mouId,
      companyId: row.companyId,
      company: row.companyName,
      zone: row.zoneName,
      plant: row.plantName,
      code: row.generatedCode,
      scheme: schemeLabel(row.scheme),
      endDate: nearest ? row.endDate : known.endDate,
      daysLeft: nearest ? row.daysRemaining : known.daysLeft,
      status: nearest ? statusOf(row) : known.status,
      openAlertIds,
      openWithoutAlertRow,
    });
  }
  return [...byMou.values()].sort((a, b) => a.daysLeft - b.daysLeft);
}

function daysLeftClass(days: number): string {
  if (days <= 30) return "text-red-600";
  if (days <= 60) return "text-amber-600";
  return "text-blue-600";
}

function csvLine(cells: readonly string[]): string {
  return cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",");
}

function exportCsv(rows: readonly MouAlert[]): void {
  const lines = [
    csvLine(CSV_HEADER),
    ...rows.map((row) =>
      csvLine([
        row.company,
        row.zone,
        row.plant,
        row.code,
        row.scheme,
        formatCalendarDate(row.endDate),
        String(row.daysLeft),
        row.status,
        isUnacknowledged(row) ? "No" : "Yes",
      ]),
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

async function acknowledge(alert: MouAlert): Promise<void> {
  await Promise.all([
    ...alert.openAlertIds.map((alertId) => acknowledgeAlert(alertId)),
    ...(alert.openWithoutAlertRow ? [acknowledgeMouAlerts(alert.mouId)] : []),
  ]);
}

export function ExpiryAlertsScreen() {
  const navigate = useNavigate();
  const { user } = useSession();
  const [alerts, setAlerts] = useState<readonly MouAlert[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<AlertFilter | null>(null);
  const [selectedMouId, setSelectedMouId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAlerts({ days: "all", acknowledged: "all" })
      .then((rows) => {
        if (cancelled) return;
        setAlerts(foldByMou(rows));
        setLoadError("");
      })
      .catch(() => {
        if (!cancelled) setLoadError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const all = alerts ?? [];
  const activeTile = FILTER_TILES.find((tile) => tile.id === filter);
  const rows = activeTile ? all.filter(activeTile.matches) : all;
  const selected = all.find((alert) => alert.mouId === selectedMouId);
  const canRenew = user !== null && canOpenPath(user, "/upload-mou");
  const canAcknowledge = user !== null && canAuthor(user.role);
  const goToUpload = (mouId: string) => navigate(`/upload-mou?mouId=${mouId}`);

  return (
    <ScreenFrame title="MoU Expiry Alerts" subtitle="Upcoming expirations requiring action" contentClassName="p-4 md:p-6 space-y-4 md:space-y-5">
      {loadError !== "" && (
        <div role="alert" className="rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
          {loadError}
        </div>
      )}
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
              <p className={`font-bold text-3xl mono ${tile.valueClass}`}>{alerts === null ? PENDING_FIGURE : all.filter(tile.matches).length}</p>
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
              {alerts !== null && rows.length === 0 && (
                <tr>
                  <td colSpan={TABLE_HEADINGS.length} className="px-4 py-6 text-center text-xs text-muted-foreground">
                    No MoUs need attention
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.mouId} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground text-xs">{row.company}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{row.zone}</td>
                  <td className="px-4 py-3 mono text-xs font-bold text-[#1B5FAE]">{row.code}</td>
                  <td className="px-4 py-3 mono text-xs">{formatCalendarDate(row.endDate)}</td>
                  <td className="px-4 py-3">
                    <span className={`mono font-bold text-sm ${daysLeftClass(row.daysLeft)}`}>{row.daysLeft}d</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <Badge text={row.status} tone={statusTone(row.status)} />
                      {isUnacknowledged(row) && <Badge text="Unacknowledged" tone="info" />}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {canRenew && (
                        <button type="button" onClick={() => goToUpload(row.mouId)} className={`${ACCENT_BUTTON} px-3 py-1.5 text-xs`}>
                          Renew
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`View ${row.company}`}
                        onClick={() => setSelectedMouId(row.mouId)}
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

      {selected && (
        <AlertDialog
          alert={selected}
          onClose={() => setSelectedMouId(null)}
          onRenew={canRenew ? () => goToUpload(selected.mouId) : undefined}
          onAcknowledge={canAcknowledge && isUnacknowledged(selected) ? () => acknowledge(selected) : undefined}
          onAcknowledged={() => setReloadKey((key) => key + 1)}
        />
      )}
    </ScreenFrame>
  );
}

interface AlertDialogProps {
  readonly alert: MouAlert;
  readonly onClose: () => void;
  /** Absent for a role that cannot upload. */
  readonly onRenew: (() => void) | undefined;
  /** Absent when the role cannot acknowledge or nothing is left to acknowledge. */
  readonly onAcknowledge: (() => Promise<void>) | undefined;
  readonly onAcknowledged: () => void;
}

function AlertDialog({ alert, onClose, onRenew, onAcknowledge, onAcknowledged }: AlertDialogProps) {
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchCompanyOverview(alert.companyId)
      .then((loaded) => {
        if (!cancelled) setOverview(loaded);
      })
      // Without the overview the HR contact simply stays a dash.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [alert.companyId]);

  const runAcknowledge = (action: () => Promise<void>) => {
    setAcknowledging(true);
    setActionError("");
    action()
      .then(onAcknowledged)
      .catch(() => setActionError(ACKNOWLEDGE_ERROR))
      .finally(() => setAcknowledging(false));
  };

  const critical = alert.daysLeft <= 30;
  const banner = critical
    ? { background: "#FEE2E2", borderColor: "#FECACA", color: "#B91C1C", label: "Critical" }
    : { background: "#FEF3C7", borderColor: "#FDE68A", color: "#92400E", label: "Attention" };
  const expiryText = alert.daysLeft >= 0 ? `Expires in ${alert.daysLeft} days` : `Expired ${-alert.daysLeft} days ago`;
  const hrContact = overview === null ? PENDING_FIGURE : `${overview.hrContactName} · ${overview.hrContactNumber}`;
  const fields: readonly (readonly [string, string])[] = [
    ["Zone", alert.zone],
    ["Plant", alert.plant],
    ["Scheme", alert.scheme],
    ["Status", alert.status],
    ["HR Contact", hrContact],
    ["Expiry Date", formatCalendarDate(alert.endDate)],
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
              {banner.label} — {expiryText}
            </p>
            <p className="text-xs mt-0.5" style={{ color: banner.color }}>
              Expiry date: {formatCalendarDate(alert.endDate)}
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
        {actionError !== "" && (
          <div role="alert" className="mx-6 mb-2 rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
            {actionError}
          </div>
        )}
        <div className="flex gap-3 px-6 pb-6 pt-2">
          <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} px-4 py-2 text-sm flex-1 justify-center`}>
            Close
          </button>
          {onAcknowledge !== undefined && (
            <button
              type="button"
              disabled={acknowledging}
              onClick={() => runAcknowledge(onAcknowledge)}
              className={`${SECONDARY_BUTTON} px-4 py-2 text-sm flex-1 justify-center ${acknowledging ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <Icon name="check" className="w-4 h-4" strokeWidth={2.5} /> Acknowledge
            </button>
          )}
          {onRenew !== undefined && (
            <button type="button" onClick={onRenew} className={`${ACCENT_BUTTON} px-4 py-2 text-sm flex-1 justify-center`}>
              <Icon name="upload" /> Initiate Renewal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
