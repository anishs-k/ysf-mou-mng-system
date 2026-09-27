/**
 * Purpose: SPEC-07's 3-page read-only view flow - Overview, Commercial Details
 * (view only) and Payroll Details (view only). Every field here is
 * display-only; there is no draft, no save, and every endpoint it calls is a
 * GET. Zone carries from Page 1 into Pages 2/3 and is never re-selected
 * (section 4 step 1) - the scheme is the only choice Page 2 makes, and it is
 * scoped to the schemes this company + plant actually has an MOU for
 * (section 4.1), not the full SPEC-01 enum.
 *
 * Accepts optional `?zoneId=&companyId=` query parameters so another screen
 * (SPEC-08's alert list, and later SPEC-11/12/13) can link straight to a
 * specific company's overview instead of leaving the visitor to reselect it.
 *
 * UI aligned with Figma v3 — glass cards, grid info display, styled tables.
 */

import { SCHEME_LABELS } from "@mou/domain";
import { useEffect, useState } from "react";
import { useOutletContext, useSearchParams } from "react-router-dom";

import type {
  CompanyListItem,
  CompanyMouOption,
  CompanyOverview,
  MouCommercialDetail,
  MouPayrollDetail,
  ZoneOption,
} from "../api/client.ts";
import {
  fetchCompanyMous,
  fetchCompanyOverview,
  fetchMouCommercial,
  fetchMouPayroll,
  fetchZoneCompanies,
  fetchZones,
  mouPrintUrl,
} from "../api/client.ts";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Badge, Btn, Card, SecTitle } from "../components/ui.tsx";

const SELECT_CLASS =
  "block w-full h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground";

const STATUS_LABEL: Record<MouCommercialDetail["status"], string> = {
  NEW: "● New",
  ACTIVE: "✓ Active",
  EXPIRED: "✕ Expired",
};

const STATUS_VARIANT: Record<MouCommercialDetail["status"], "info" | "success" | "danger"> = {
  NEW: "info",
  ACTIVE: "success",
  EXPIRED: "danger",
};

function StatusBadge({ status }: { readonly status: MouCommercialDetail["status"] }) {
  return <Badge text={STATUS_LABEL[status]} variant={STATUS_VARIANT[status]} />;
}

function amountText(value: string | null): string {
  return value === null ? "—" : value;
}

/** Reusable info row for the overview grid */
function InfoCell({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">{value || "—"}</p>
    </div>
  );
}

export function ExistingCompanyPage() {
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [zones, setZones] = useState<readonly ZoneOption[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [companies, setCompanies] = useState<readonly CompanyListItem[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [plantId, setPlantId] = useState("");

  const [mous, setMous] = useState<readonly CompanyMouOption[]>([]);
  const [scheme, setScheme] = useState("");
  const [commercial, setCommercial] = useState<MouCommercialDetail | null>(null);
  const [payroll, setPayroll] = useState<MouPayrollDetail | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load zones"));
  }, []);

  useEffect(() => {
    const linkedZoneId = searchParams.get("zoneId");
    const linkedCompanyId = searchParams.get("companyId");
    if (linkedZoneId === null || linkedCompanyId === null) {
      return;
    }
    void (async () => {
      await handleZoneChange(linkedZoneId);
      await handleCompanyChange(linkedCompanyId);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleZoneChange(id: string) {
    setZoneId(id);
    setCompanyId("");
    setOverview(null);
    setCompanies([]);
    if (id === "") {
      return;
    }
    try {
      setCompanies(await fetchZoneCompanies(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load companies");
    }
  }

  async function handleCompanyChange(id: string) {
    setCompanyId(id);
    setOverview(null);
    if (id === "") {
      return;
    }
    try {
      const data = await fetchCompanyOverview(id);
      setOverview(data);
      setPlantId(data.plants[0]?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load company");
    }
  }

  async function loadMou(mouId: string) {
    try {
      const [c, p] = await Promise.all([fetchMouCommercial(mouId), fetchMouPayroll(mouId)]);
      setCommercial(c);
      setPayroll(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load MOU");
    }
  }

  async function handleNextToCommercial() {
    if (companyId === "") {
      return;
    }
    setError(null);
    try {
      const list = await fetchCompanyMous(companyId, plantId || undefined);
      setMous(list);
      const first = list[0];
      if (list.length > 0 && first !== undefined) {
        setScheme(first.scheme);
        await loadMou(first.mouId);
      } else {
        setScheme("");
        setCommercial(null);
        setPayroll(null);
      }
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schemes");
    }
  }

  async function handleSchemeChange(nextScheme: string) {
    setScheme(nextScheme);
    const match = mous.find((m) => m.scheme === nextScheme);
    if (match !== undefined) {
      await loadMou(match.mouId);
    }
  }

  /* Breadcrumb */
  const stepLabels = ["Select Company", "Commercial Details", "Payroll Details"];

  return (
    <>
      <Topbar title="Existing Company" subtitle="Review a company's MoU, commercial and payroll details" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-5">
          {error !== null && (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {/* Breadcrumb */}
          <nav className="flex items-center gap-2 text-xs font-semibold">
            {stepLabels.map((label, i) => {
              const stepNum = (i + 1) as 1 | 2 | 3;
              const isCurrent = step === stepNum;
              const isPast = step > stepNum;
              return (
                <span key={label} className="flex items-center gap-2">
                  {i > 0 && <span className="text-muted-foreground">›</span>}
                  <button
                    type="button"
                    disabled={!isPast}
                    onClick={() => isPast && setStep(stepNum)}
                    className={`${
                      isCurrent
                        ? "text-[#1B5FAE]"
                        : isPast
                          ? "text-foreground hover:underline cursor-pointer"
                          : "text-muted-foreground cursor-default"
                    }`}
                  >
                    {label}
                  </button>
                </span>
              );
            })}
          </nav>

          {step === 1 && (
            <Card className="p-6">
              <SecTitle>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                Select Company
              </SecTitle>
              <div className="grid sm:grid-cols-2 gap-4 mb-4">
                <div>
                  <label htmlFor="viewZone" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                    Zone
                  </label>
                  <select id="viewZone" value={zoneId} onChange={(event) => void handleZoneChange(event.target.value)} className={SELECT_CLASS}>
                    <option value="">Select zone</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="viewCompany" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                    Company Name
                  </label>
                  <select id="viewCompany" value={companyId} disabled={zoneId === ""} onChange={(event) => void handleCompanyChange(event.target.value)} className={SELECT_CLASS}>
                    <option value="">{zoneId === "" ? "Select a zone first" : "Select company"}</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {overview !== null && (
                <div className="rounded-xl bg-muted/40 border border-border p-5 mb-4">
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <InfoCell label="Company Name" value={overview.companyName} />
                    <InfoCell label="GST Number" value={overview.gstNumber} />
                    {overview.plants.length > 1 ? (
                      <div>
                        <label htmlFor="viewPlant" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          Plant
                        </label>
                        <select
                          id="viewPlant"
                          value={plantId}
                          onChange={(event) => setPlantId(event.target.value)}
                          className={`${SELECT_CLASS} mt-1`}
                        >
                          {overview.plants.map((p) => (
                            <option key={p.id} value={p.id}>{p.plantName}</option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <InfoCell label="Plant" value={overview.plants[0]?.plantName ?? "—"} />
                    )}
                    <InfoCell label="HR Contact" value={`${overview.hrContactName} (${overview.hrContactNumber})`} />
                    <InfoCell label="Finance Head" value={`${overview.financeHeadContactName} (${overview.financeHeadContactNumber})`} />
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Btn variant="primary" disabled={overview === null} onClick={() => void handleNextToCommercial()}>
                  Next →
                </Btn>
              </div>
            </Card>
          )}

          {step === 2 && (
            <Card className="p-6">
              <SecTitle>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
                Commercial Details
              </SecTitle>

              <div className="mb-4">
                <label htmlFor="viewScheme" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                  Scheme
                </label>
                <select id="viewScheme" value={scheme} onChange={(event) => void handleSchemeChange(event.target.value)} className={`${SELECT_CLASS} max-w-xs`}>
                  {mous.map((m) => (
                    <option key={m.mouId} value={m.scheme}>
                      {SCHEME_LABELS[m.scheme as keyof typeof SCHEME_LABELS] ?? m.scheme}
                    </option>
                  ))}
                </select>
              </div>

              {mous.length === 0 && <p className="text-sm text-muted-foreground">No MoUs recorded for this company.</p>}

              {commercial !== null && (
                <div className="space-y-5">
                  {/* Status + dates strip */}
                  <div className="flex flex-wrap items-center gap-3 rounded-lg bg-muted/40 border border-border px-4 py-3">
                    <StatusBadge status={commercial.status} />
                    <span className="mono text-xs text-muted-foreground">
                      {commercial.mouStartDate} → {commercial.endDate}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Tenure: {String(commercial.tenureValue)} {commercial.tenureUnit}
                    </span>
                  </div>

                  {/* Info grid */}
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <InfoCell label="Attendance Cycle" value={commercial.attendanceCycle} />
                    <InfoCell label="Stipend Date" value={commercial.stipendDate !== null ? String(commercial.stipendDate) : "—"} />
                    <InfoCell label="MoU ID" value={commercial.mouId} />
                  </div>

                  {/* Charges table */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Charges</h3>
                    <div className="overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-muted/40 border-b border-border">
                            <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item</th>
                            <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commercial.charges.map((charge) => (
                            <tr key={charge.itemKey} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 text-xs text-foreground">{charge.label}</td>
                              <td className="px-4 py-2.5 text-right mono text-xs font-semibold">{amountText(charge.amount)}</td>
                            </tr>
                          ))}
                          {commercial.otherItems.map((other, index) => (
                            <tr key={index} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                              <td className="px-4 py-2.5 text-xs text-foreground">
                                {other.label} <Badge text={other.itemType} variant="default" />
                              </td>
                              <td className="px-4 py-2.5 text-right mono text-xs font-semibold">{other.amount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Document info */}
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">MoU Document</h3>
                    {commercial.document !== undefined ? (
                      <div className="flex items-center gap-3 rounded-lg bg-muted/40 border border-border px-4 py-3">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-muted-foreground shrink-0">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{commercial.document.originalFilename}</p>
                          <p className="text-xs text-muted-foreground">
                            Uploaded {new Date(commercial.document.uploadedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No document uploaded.</p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    <Btn variant="secondary" size="sm">
                      <a href={mouPrintUrl(commercial.mouId)} target="_blank" rel="noreferrer" className="no-underline text-inherit flex items-center gap-1">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <polyline points="6 9 6 2 18 2 18 9" />
                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                          <rect x="6" y="14" width="12" height="8" />
                        </svg>
                        Print
                      </a>
                    </Btn>
                    <Btn variant="secondary" size="sm">
                      <a href={`/agreements/history?mouId=${commercial.mouId}`} className="no-underline text-inherit flex items-center gap-1">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        Agreement History
                      </a>
                    </Btn>
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-5 border-t border-border mt-5">
                <Btn variant="ghost" onClick={() => setStep(1)}>← Back</Btn>
                <Btn variant="primary" disabled={commercial === null} onClick={() => setStep(3)}>Next →</Btn>
              </div>
            </Card>
          )}

          {step === 3 && payroll !== null && (
            <Card className="p-6">
              <SecTitle>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <line x1="12" y1="1" x2="12" y2="23" />
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
                Payroll Details
              </SecTitle>

              <div className="flex items-center gap-3 mb-4">
                <Badge text={payroll.scheme} variant="info" />
              </div>

              {/* Trainee Categories */}
              <div className="mb-5">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  Trainee Categories
                </h3>
                {payroll.traineeCategories.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {payroll.traineeCategories.map((category) => (
                      <Badge key={category} text={category} variant="default" />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No trainee categories recorded.</p>
                )}
              </div>

              {payroll.allowances.length === 0 && payroll.deductions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payroll items configured for this scheme.</p>
              ) : (
                <div className="grid md:grid-cols-2 gap-5">
                  {/* Allowances */}
                  {payroll.allowances.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Allowances
                      </h3>
                      <div className="rounded-lg border border-border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/40 border-b border-border">
                              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payroll.allowances.map((item) => (
                              <tr key={item.itemKey} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-2.5 text-xs text-foreground">{item.label}</td>
                                <td className="px-4 py-2.5 text-right mono text-xs font-semibold">{item.amount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {/* Deductions */}
                  {payroll.deductions.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                        Deductions
                      </h3>
                      <div className="rounded-lg border border-border overflow-hidden">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-muted/40 border-b border-border">
                              <th className="px-4 py-2 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Item</th>
                              <th className="px-4 py-2 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wide">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {payroll.deductions.map((item) => (
                              <tr key={item.itemKey} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                                <td className="px-4 py-2.5 text-xs text-foreground">{item.label}</td>
                                <td className="px-4 py-2.5 text-right mono text-xs font-semibold">{item.amount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-start pt-5 border-t border-border mt-5">
                <Btn variant="ghost" onClick={() => setStep(2)}>← Back</Btn>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
