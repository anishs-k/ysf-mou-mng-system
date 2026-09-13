/**
 * Purpose: SPEC-11's read-only Agreement History screen - a version list
 * (current + every past `agreement_history` row), a detail view per version,
 * and a compare between any two. Reached either from the Dashboard (its own
 * cascading Zone/Company/Plant/Scheme selectors, section 2.1) or via a
 * `?mouId=` deep link from the Existing Company commercial page (SPEC-07
 * section 4), which skips the selectors entirely - the same pattern SPEC-08's
 * alert list already uses to link into `ExistingCompanyPage`.
 */

import { COMMERCIAL_FIXED_ITEM_KEYS, COMMERCIAL_ITEM_BY_KEY, PAYROLL_FIXED_ITEM_KEYS, PAYROLL_ITEM_BY_KEY } from "@mou/domain";
import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";

import type { DiffRow, HistoryDetail, HistoryRow } from "../api/client.ts";
import { fetchAgreementHistory, fetchHistoryCompare, fetchHistoryDetail, historyProofDownloadUrl } from "../api/client.ts";
import { useCascadingSelectors } from "../hooks/useCascadingSelectors.ts";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { brand } from "../components/ui.tsx";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring";

function amountText(value: string | undefined): string {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? "—" : trimmed;
}

function DetailView({ detail }: { readonly detail: HistoryDetail }) {
  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <p>
          <span className="font-medium">MOU Start Date:</span> {detail.commercial.mouStartDate}
        </p>
        <p>
          <span className="font-medium">Tenure:</span> {detail.commercial.tenureValue} {detail.commercial.tenureUnit}
        </p>
        <p>
          <span className="font-medium">Attendance Cycle:</span> {detail.commercial.attendanceCycle}
        </p>
        <p>
          <span className="font-medium">Stipend Date:</span> {detail.commercial.stipendDate}
        </p>
      </div>

      <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Charges</h3>
      <table className="w-full text-left">
        <tbody>
          {COMMERCIAL_FIXED_ITEM_KEYS.map((key) => (
            <tr key={key} className="border-b border-gray-100">
              <td className="py-1">{COMMERCIAL_ITEM_BY_KEY[key].label}</td>
              <td className="py-1 text-right">{amountText(detail.commercial.charges[key])}</td>
            </tr>
          ))}
          {detail.commercial.otherItems.map((row, index) => (
            <tr key={index} className="border-b border-gray-100">
              <td className="py-1">
                {row.label} ({row.itemType})
              </td>
              <td className="py-1 text-right">{row.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Trainee Categories</h3>
      {detail.payroll.traineeCategories.length > 0 ? (
        <ul className="list-inside list-disc">
          {detail.payroll.traineeCategories.map((category) => (
            <li key={category}>{category}</li>
          ))}
        </ul>
      ) : (
        <p className="text-gray-600">None recorded.</p>
      )}

      <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Payroll Items</h3>
      <table className="w-full text-left">
        <tbody>
          {PAYROLL_FIXED_ITEM_KEYS.map((key) => {
            const answer = detail.payroll.items[key];
            return (
              <tr key={key} className="border-b border-gray-100">
                <td className="py-1">{PAYROLL_ITEM_BY_KEY[key].label}</td>
                <td className="py-1 text-right">
                  {answer?.isApplicable === true ? `Yes (${amountText(answer.amount)})` : "No"}
                </td>
              </tr>
            );
          })}
          {detail.payroll.otherItems.map((row, index) => (
            <tr key={index} className="border-b border-gray-100">
              <td className="py-1">
                {row.label} ({row.itemType})
              </td>
              <td className="py-1 text-right">{row.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AgreementHistoryPage() {
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  // mouId is seeded once from the URL this page was opened with (a deep
  // link skips the cascading selectors entirely), the same lazy-initializer
  // pattern this page established before this hook existed.
  const {
    zones,
    zoneId,
    companies,
    companyId,
    plants,
    plantId,
    mous,
    mouId,
    setMouId,
    handleZoneChange,
    handleCompanyChange,
    handlePlantChange,
  } = useCascadingSelectors({
    onError: (message) => setError(message),
    initialMouId: searchParams.get("mouId") ?? "",
  });

  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [rows, setRows] = useState<readonly HistoryRow[]>([]);
  const [detail, setDetail] = useState<HistoryDetail | null>(null);
  const [detailLabel, setDetailLabel] = useState("");

  const [compareFrom, setCompareFrom] = useState("");
  const [compareTo, setCompareTo] = useState("current");
  const [compareResult, setCompareResult] = useState<{ fromLabel: string; toLabel: string; rows: readonly DiffRow[] } | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (mouId === "") {
      return;
    }
    let cancelled = false;
    fetchAgreementHistory(mouId)
      .then(({ currentVersion: version, rows: historyRows }) => {
        if (cancelled) return;
        setError(null);
        setCurrentVersion(version);
        setRows(historyRows);
        setCompareFrom(historyRows.length > 0 ? (historyRows[historyRows.length - 1]?.historyId ?? "current") : "current");
        setCompareTo("current");
        setCompareResult(null);
        setDetail(null);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load history");
      });
    return () => {
      cancelled = true;
    };
  }, [mouId]);

  async function viewDetail(historyId: string, label: string) {
    setError(null);
    try {
      setDetail(await fetchHistoryDetail(mouId, historyId));
      setDetailLabel(label);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load version");
    }
  }

  async function handleCompare() {
    setError(null);
    setShowAll(false);
    try {
      setCompareResult(await fetchHistoryCompare(mouId, compareFrom, compareTo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to compare versions");
    }
  }

  const compareOptions = [...rows.map((r) => ({ value: r.historyId, label: `Version ${r.version}` })), { value: "current", label: "Current" }];

  return (
    <>
      <Topbar title="Agreement History" subtitle="Every past version of an agreement, with the reason" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl">
          {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          {mouId === "" && (
            <div className="space-y-4 glass-card rounded-xl p-6">
              <div>
                <label htmlFor="historyZone" className="block text-sm font-medium text-gray-700">
                  Zone
                </label>
                <select id="historyZone" value={zoneId} onChange={(event) => void handleZoneChange(event.target.value)} className={INPUT_CLASS}>
                  <option value="">Select zone</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="historyCompany" className="block text-sm font-medium text-gray-700">
                  Company
                </label>
                <select
                  id="historyCompany"
                  value={companyId}
                  disabled={zoneId === ""}
                  onChange={(event) => void handleCompanyChange(event.target.value)}
                  className={`${INPUT_CLASS} disabled:bg-gray-100`}
                >
                  <option value="">{zoneId === "" ? "Select a zone first" : "Select company"}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="historyPlant" className="block text-sm font-medium text-gray-700">
                  Company Plant
                </label>
                <select
                  id="historyPlant"
                  value={plantId}
                  disabled={companyId === ""}
                  onChange={(event) => void handlePlantChange(event.target.value)}
                  className={`${INPUT_CLASS} disabled:bg-gray-100`}
                >
                  <option value="">{companyId === "" ? "Select a company first" : "Select plant"}</option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.plantName}
                    </option>
                  ))}
                </select>
              </div>
              {mous.length > 1 && (
                <div>
                  <label htmlFor="historyScheme" className="block text-sm font-medium text-gray-700">
                    Scheme
                  </label>
                  <select id="historyScheme" value={mouId} onChange={(event) => setMouId(event.target.value)} className={INPUT_CLASS}>
                    <option value="">Select scheme</option>
                    {mous.map((m) => (
                      <option key={m.mouId} value={m.mouId}>
                        {m.scheme}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {mouId !== "" && currentVersion !== null && (
            <div className="space-y-6">
              <div className="glass-card rounded-xl p-6">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">Versions</h2>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-gray-500">
                      <th className="py-1 font-medium">Version</th>
                      <th className="py-1 font-medium">Changed On</th>
                      <th className="py-1 font-medium">Changed By</th>
                      <th className="py-1 font-medium">Reason</th>
                      <th className="py-1 font-medium">Remark</th>
                      <th className="py-1 font-medium">Proof</th>
                      <th className="py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="py-1">{currentVersion}</td>
                      <td className="py-1">—</td>
                      <td className="py-1">—</td>
                      <td className="py-1">Current</td>
                      <td className="py-1">—</td>
                      <td className="py-1">—</td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          onClick={() => void viewDetail("current", "Current")}
                          className="font-medium hover:underline" style={{ color: "#1B5FAE" }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-3 text-gray-600">
                          No amendments recorded for this agreement.
                        </td>
                      </tr>
                    )}
                    {rows.map((r) => (
                      <tr key={r.historyId} className="border-b border-gray-100">
                        <td className="py-1">{r.version}</td>
                        <td className="py-1">{new Date(r.editedAt ?? "").toLocaleString()}</td>
                        <td className="py-1">{r.editedByUsername}</td>
                        <td className="py-1">{r.editReasonLabel}</td>
                        <td className="py-1">{r.remark ?? "—"}</td>
                        <td className="py-1">
                          {r.hasProof ? (
                            <a
                              href={historyProofDownloadUrl(mouId, r.historyId)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium hover:underline" style={{ color: "#1B5FAE" }}
                            >
                              Download
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-1 text-right">
                          <button
                            type="button"
                            onClick={() => void viewDetail(r.historyId, `Version ${r.version}`)}
                            className="font-medium hover:underline" style={{ color: "#1B5FAE" }}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {detail !== null && (
                <div className="glass-card rounded-xl p-6">
                  <h2 className="mb-3 text-lg font-semibold text-gray-900">{detailLabel}</h2>
                  <DetailView detail={detail} />
                </div>
              )}

              <div className="glass-card rounded-xl p-6">
                <h2 className="mb-3 text-lg font-semibold text-gray-900">Compare</h2>
                <div className="flex flex-wrap items-end gap-4">
                  <div>
                    <label htmlFor="compareFrom" className="block text-sm font-medium text-gray-700">
                      From
                    </label>
                    <select id="compareFrom" value={compareFrom} onChange={(event) => setCompareFrom(event.target.value)} className={INPUT_CLASS}>
                      {compareOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="compareTo" className="block text-sm font-medium text-gray-700">
                      To
                    </label>
                    <select id="compareTo" value={compareTo} onChange={(event) => setCompareTo(event.target.value)} className={INPUT_CLASS}>
                      {compareOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleCompare()}
                    className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                    style={{ background: brand.blue }}
                  >
                    Compare
                  </button>
                </div>

                {compareResult !== null && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-gray-600">
                        {compareResult.fromLabel} → {compareResult.toLabel}
                      </p>
                      <label className="flex items-center gap-1 text-sm text-gray-700">
                        <input type="checkbox" checked={showAll} onChange={(event) => setShowAll(event.target.checked)} />
                        Show all fields
                      </label>
                    </div>
                    {(() => {
                      const visible = showAll ? compareResult.rows : compareResult.rows.filter((r) => r.changed);
                      if (visible.length === 0) {
                        return <p className="text-sm text-gray-600">No differences between these versions.</p>;
                      }
                      return (
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr className="text-xs uppercase text-gray-500">
                              <th className="py-1 font-medium">Field</th>
                              <th className="py-1 font-medium">Old Value</th>
                              <th className="py-1 font-medium">New Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map((r) => (
                              <tr key={r.field} className="border-b border-gray-100">
                                <td className="py-1">{r.field}</td>
                                <td className="py-1 text-gray-500">{r.oldValue}</td>
                                <td className={`py-1 ${r.changed ? "font-medium" : ""}`}>{r.newValue}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
