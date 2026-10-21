/**
 * Purpose: The Agreement History screen's per-MoU "Version history" dialog (SPEC-11)
 * in the design's glass-modal style - the version list (current + every
 * agreement_history row, with proof downloads), the commercial / payroll detail of
 * a chosen version, and a compare of any two versions showing the changed fields.
 * Logic carried over from the pre-Figma pages/AgreementHistoryPage.tsx.
 */

import {
  COMMERCIAL_FIXED_ITEM_KEYS,
  COMMERCIAL_ITEM_BY_KEY,
  PAYROLL_FIXED_ITEM_KEYS,
  PAYROLL_ITEM_BY_KEY,
  TENURE_UNIT_LABELS,
  payrollAnswerText,
} from "@mou/domain";
import type { TenureUnit } from "@mou/domain";
import { useEffect, useState } from "react";

import {
  fetchAgreementHistory,
  fetchHistoryCompare,
  fetchHistoryDetail,
  fetchMouCommercial,
  historyProofDownloadUrl,
} from "../../api/client.ts";
import type { CompareResponse, HistoryDetail, HistoryListResponse } from "../../api/client.ts";
import { SelectInput } from "../../ui/form.tsx";
import { PENDING_FIGURE, formatCalendarDate, formatTimestamp } from "../../ui/format.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Badge, Button } from "../../ui/primitives.tsx";
import { BRAND } from "../../ui/theme.ts";

const TH_CLASS = "px-3 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide";
const TD_CLASS = "px-3 py-2 text-xs";
const LINK_BUTTON = "text-xs font-semibold hover:underline";
const SECONDARY_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary border-border hover:bg-blue-100 px-4 py-2 text-sm";
const CURRENT = "current";

interface VersionHistoryDialogProps {
  readonly mouId: string;
  /** Shown under the title when known (opened from a row); a deep link has none. */
  readonly companyName?: string;
  readonly onClose: () => void;
}

function present(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? PENDING_FIGURE : trimmed;
}

function SubHeading({ children }: { readonly children: string }) {
  return <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-4 mb-2">{children}</p>;
}

function Line({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 border-b border-border text-xs">
      <span className="font-medium text-foreground">{label}</span>
      <span className="mono text-muted-foreground text-right">{value}</span>
    </div>
  );
}

function VersionDetail({ title, detail }: { readonly title: string; readonly detail: HistoryDetail }) {
  const { commercial, payroll } = detail;
  const tenureUnit = TENURE_UNIT_LABELS[commercial.tenureUnit as TenureUnit] ?? commercial.tenureUnit;
  return (
    <div className="rounded-xl border border-border p-4">
      <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: BRAND.navy }}>
        {title}
      </h3>
      <div className="grid sm:grid-cols-2 gap-x-6">
        <Line label="MoU Start" value={formatCalendarDate(commercial.mouStartDate)} />
        <Line label="Tenure" value={`${commercial.tenureValue} ${tenureUnit}`} />
        <Line label="Attendance Cycle" value={present(commercial.attendanceCycle)} />
        <Line label="Stipend Date" value={present(commercial.stipendDate)} />
      </div>
      <SubHeading>Charges</SubHeading>
      {COMMERCIAL_FIXED_ITEM_KEYS.map((key) => (
        <Line key={key} label={COMMERCIAL_ITEM_BY_KEY[key].label} value={present(commercial.charges[key])} />
      ))}
      {commercial.otherItems.map((item, index) => (
        <Line key={index} label={`${item.label} (${item.itemType})`} value={present(item.amount)} />
      ))}
      <SubHeading>Trainee Categories</SubHeading>
      <p className="text-xs text-foreground">
        {payroll.traineeCategories.length === 0 ? "None recorded" : payroll.traineeCategories.join(", ")}
      </p>
      <SubHeading>Payroll Items</SubHeading>
      {PAYROLL_FIXED_ITEM_KEYS.map((key) => {
        const { label, valueKind } = PAYROLL_ITEM_BY_KEY[key];
        return <Line key={key} label={label} value={payrollAnswerText(valueKind, payroll.items[key])} />;
      })}
      {payroll.otherItems.map((item, index) => (
        <Line key={index} label={`${item.label} (${item.itemType})`} value={present(item.amount)} />
      ))}
    </div>
  );
}

export function VersionHistoryDialog({ mouId, companyName, onClose }: VersionHistoryDialogProps) {
  const [code, setCode] = useState("");
  const [history, setHistory] = useState<HistoryListResponse | null>(null);
  const [detail, setDetail] = useState<{ readonly title: string; readonly detail: HistoryDetail } | null>(null);
  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState(CURRENT);
  const [comparison, setComparison] = useState<CompareResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchAgreementHistory(mouId), fetchMouCommercial(mouId)])
      .then(([list, commercial]) => {
        if (cancelled) return;
        setHistory(list);
        setCode(commercial.generatedCode);
        setCompareFrom(list.rows[list.rows.length - 1]?.historyId ?? CURRENT);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the version history.");
      });
    return () => {
      cancelled = true;
    };
  }, [mouId]);

  async function view(historyId: string, title: string) {
    setError("");
    try {
      setDetail({ title, detail: await fetchHistoryDetail(mouId, historyId) });
    } catch {
      setError("Could not load this version.");
    }
  }

  async function compare() {
    setError("");
    try {
      setComparison(await fetchHistoryCompare(mouId, compareFrom, compareTo));
    } catch {
      setError("Could not compare these versions.");
    }
  }

  const rows = history?.rows ?? [];
  const versionOptions = [
    ...rows.map((row) => ({ value: row.historyId, label: `Version ${row.version}` })),
    { value: CURRENT, label: "Current" },
  ];
  const changed = comparison?.rows.filter((row) => row.changed) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(13, 46, 90, 0.45)" }}>
      <div role="dialog" aria-modal="true" aria-label="Version history" className="glass-modal rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between p-6 border-b border-border">
          <div>
            <h2 className="font-bold text-base" style={{ color: BRAND.navy }}>
              Version history
            </h2>
            <p className="mono text-xs font-semibold mt-0.5" style={{ color: BRAND.blue }}>
              {code === "" ? PENDING_FIGURE : code}
              {companyName !== undefined && <span className="text-muted-foreground font-medium"> · {companyName}</span>}
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

        <div className="p-6 space-y-5">
          {error !== "" && (
            <div role="alert" className="rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
              {error}
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["Version", "Edited On", "Edited By", "Reason", "Remark", "Proof", ""].map((heading) => (
                    <th key={heading} className={TH_CLASS}>
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history !== null && (
                  <tr className="border-b border-border">
                    <td className={`${TD_CLASS} mono font-bold`}>{history.currentVersion}</td>
                    <td className={TD_CLASS}>{PENDING_FIGURE}</td>
                    <td className={TD_CLASS}>{PENDING_FIGURE}</td>
                    <td className={TD_CLASS}>
                      <Badge text="Current" tone="success" />
                    </td>
                    <td className={TD_CLASS}>{PENDING_FIGURE}</td>
                    <td className={TD_CLASS}>{PENDING_FIGURE}</td>
                    <td className={`${TD_CLASS} text-right`}>
                      <button type="button" aria-label="View Current" onClick={() => void view(CURRENT, "Current")} className={LINK_BUTTON} style={{ color: BRAND.blue }}>
                        View
                      </button>
                    </td>
                  </tr>
                )}
                {history !== null && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-center text-xs text-muted-foreground">
                      No amendments recorded for this agreement.
                    </td>
                  </tr>
                )}
                {rows.map((row) => (
                  <tr key={row.historyId} className="border-b border-border last:border-0">
                    <td className={`${TD_CLASS} mono font-bold`}>{row.version}</td>
                    <td className={`${TD_CLASS} mono`}>{row.editedAt === null ? PENDING_FIGURE : formatTimestamp(row.editedAt)}</td>
                    <td className={TD_CLASS}>{row.editedByUsername ?? PENDING_FIGURE}</td>
                    <td className={TD_CLASS}>{row.editReasonLabel}</td>
                    <td className={TD_CLASS}>{row.remark ?? PENDING_FIGURE}</td>
                    <td className={TD_CLASS}>
                      {row.hasProof ? (
                        <a href={historyProofDownloadUrl(mouId, row.historyId)} target="_blank" rel="noreferrer" className={LINK_BUTTON} style={{ color: BRAND.blue }}>
                          Download
                        </a>
                      ) : (
                        PENDING_FIGURE
                      )}
                    </td>
                    <td className={`${TD_CLASS} text-right`}>
                      <button
                        type="button"
                        aria-label={`View Version ${row.version}`}
                        onClick={() => void view(row.historyId, `Version ${row.version}`)}
                        className={LINK_BUTTON}
                        style={{ color: BRAND.blue }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {detail !== null && <VersionDetail title={detail.title} detail={detail.detail} />}

          {rows.length > 0 && (
            <div className="rounded-xl border border-border p-4">
              <h3 className="font-bold text-sm uppercase tracking-wide mb-3" style={{ color: BRAND.navy }}>
                Compare Versions
              </h3>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                <div className="flex-1">
                  <SelectInput ariaLabel="Compare from" options={versionOptions} value={compareFrom} onChange={setCompareFrom} />
                </div>
                <div className="flex-1">
                  <SelectInput ariaLabel="Compare to" options={versionOptions} value={compareTo} onChange={setCompareTo} />
                </div>
                <Button size="sm" onClick={() => void compare()} disabled={compareFrom === "" || compareTo === ""}>
                  Compare
                </Button>
              </div>
              {comparison !== null && (
                <div className="mt-4">
                  <p className="text-xs text-muted-foreground mb-2">
                    {comparison.fromLabel} → {comparison.toLabel}
                  </p>
                  {changed.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No differences between these versions.</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border bg-muted/40">
                          {["Field", "Old Value", "New Value"].map((heading) => (
                            <th key={heading} className={TH_CLASS}>
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {changed.map((row) => (
                          <tr key={row.field} className="border-b border-border last:border-0">
                            <td className={`${TD_CLASS} font-medium`}>{row.field}</td>
                            <td className={`${TD_CLASS} text-muted-foreground`}>{row.oldValue}</td>
                            <td className={`${TD_CLASS} font-semibold`}>{row.newValue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex px-6 pb-6">
          <button type="button" onClick={onClose} className={`${SECONDARY_BUTTON} flex-1 justify-center`}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
