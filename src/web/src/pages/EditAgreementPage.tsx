/**
 * Purpose: SPEC-10's Edit Agreement flow - cascading Zone/Company/Plant/Scheme
 * selection, a reason gate that locks every field until a reason (and, for
 * "Communication from HR", a proof file) is on record, the edit form itself,
 * a review screen listing every changed field old -> new, and Apply. ADMIN
 * only (section 6).
 *
 * UI aligned with Figma v3 — breadcrumb, styled cards, radio-style reason
 * selection, tabbed editor, review diff with strikethrough.
 */

import {
  COMMERCIAL_FIXED_ITEM_KEYS,
  EDIT_AGREEMENT_REASON_OPTIONS,
  PAYROLL_FIXED_ITEM_KEYS,
  SCHEME_LABELS,
  validateCommercialDetails,
  validatePayrollDetails,
} from "@mou/domain";
import type { CommercialDetailErrors, PayrollDetailErrors } from "@mou/domain";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Badge, Btn, Card, SecTitle, brand } from "../components/ui.tsx";
import type {
  CommercialItemOption,
  EditableCommercial,
  EditableOtherItem,
  EditablePayroll,
  EnumOption,
  PayrollItemOption,
} from "../api/client.ts";
import { applyEdit, fetchEnums, requestEditToken } from "../api/client.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import { useCascadingSelectors } from "../hooks/useCascadingSelectors.ts";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring";

const SELECT_CLASS =
  "block w-full h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground";

type Step = "select" | "reason" | "edit" | "review" | "done";

interface DiffRow {
  readonly field: string;
  readonly oldValue: string;
  readonly newValue: string;
}

function otherItemsKey(items: readonly EditableOtherItem[]): string {
  return JSON.stringify([...items].sort((a, b) => a.label.localeCompare(b.label)));
}

function amountText(value: string): string {
  return value.trim() === "" ? "—" : value;
}

function computeDiff(
  original: { commercial: EditableCommercial; payroll: EditablePayroll },
  edited: { commercial: EditableCommercial; payroll: EditablePayroll },
  commercialItems: readonly CommercialItemOption[],
  payrollItems: readonly PayrollItemOption[],
): DiffRow[] {
  const rows: DiffRow[] = [];
  const push = (field: string, oldValue: string, newValue: string): void => {
    if (oldValue !== newValue) {
      rows.push({ field, oldValue, newValue });
    }
  };

  push("MoU Start Date", original.commercial.mouStartDate, edited.commercial.mouStartDate);
  push(
    "Tenure",
    `${original.commercial.tenureValue} ${original.commercial.tenureUnit}`,
    `${edited.commercial.tenureValue} ${edited.commercial.tenureUnit}`,
  );
  push("Attendance Cycle", original.commercial.attendanceCycle, edited.commercial.attendanceCycle);
  push("Stipend Date", original.commercial.stipendDate, edited.commercial.stipendDate);

  for (const key of COMMERCIAL_FIXED_ITEM_KEYS) {
    const label = commercialItems.find((item) => item.key === key)?.label ?? key;
    push(label, amountText(original.commercial.charges[key] ?? ""), amountText(edited.commercial.charges[key] ?? ""));
  }
  push(
    "Other Charges",
    otherItemsKey(original.commercial.otherItems),
    otherItemsKey(edited.commercial.otherItems),
  );

  push(
    "Trainee Categories",
    [...original.payroll.traineeCategories].sort().join(", "),
    [...edited.payroll.traineeCategories].sort().join(", "),
  );

  for (const key of PAYROLL_FIXED_ITEM_KEYS) {
    const label = payrollItems.find((item) => item.key === key)?.label ?? key;
    const oldAnswer = original.payroll.items[key];
    const newAnswer = edited.payroll.items[key];
    const oldText = oldAnswer?.isApplicable === true ? `Yes (${amountText(oldAnswer.amount)})` : "No";
    const newText = newAnswer?.isApplicable === true ? `Yes (${amountText(newAnswer.amount)})` : "No";
    push(label, oldText, newText);
  }
  push(
    "Other Payroll Items",
    otherItemsKey(original.payroll.otherItems),
    otherItemsKey(edited.payroll.otherItems),
  );

  return rows;
}

function OtherItemsEditor({
  items,
  onChange,
  itemTypes,
}: {
  readonly items: EditableOtherItem[];
  readonly onChange: (items: EditableOtherItem[]) => void;
  readonly itemTypes: readonly EnumOption[];
}) {
  return (
    <div className="space-y-2">
      {items.map((row, index) => (
        <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_auto]">
          <input
            aria-label={`Other item ${index + 1} label`}
            value={row.label}
            onChange={(event) =>
              onChange(items.map((r, i) => (i === index ? { ...r, label: event.target.value } : r)))
            }
            className={INPUT_CLASS}
            placeholder="Label"
          />
          <input
            aria-label={`Other item ${index + 1} amount`}
            value={row.amount}
            onChange={(event) =>
              onChange(items.map((r, i) => (i === index ? { ...r, amount: event.target.value } : r)))
            }
            className={INPUT_CLASS}
            placeholder="Amount"
          />
          <select
            aria-label={`Other item ${index + 1} type`}
            value={row.itemType}
            onChange={(event) =>
              onChange(items.map((r, i) => (i === index ? { ...r, itemType: event.target.value } : r)))
            }
            className={INPUT_CLASS}
          >
            <option value="">Select…</option>
            {itemTypes.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="mt-1 h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-muted"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...items, { label: "", amount: "", itemType: "" }])}
        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
      >
        Add row
      </button>
    </div>
  );
}

export function EditAgreementPage() {
  const { user } = useAuth();
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [step, setStep] = useState<Step>("select");
  const [error, setError] = useState<string | null>(null);

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
    reset: resetSelectors,
  } = useCascadingSelectors({ onError: (message) => setError(message) });

  const [commercialItems, setCommercialItems] = useState<readonly CommercialItemOption[]>([]);
  const [payrollItems, setPayrollItems] = useState<readonly PayrollItemOption[]>([]);
  const [itemTypes, setItemTypes] = useState<readonly EnumOption[]>([]);

  const [reason, setReason] = useState("");
  const [remark, setRemark] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [requesting, setRequesting] = useState(false);

  const [token, setToken] = useState("");
  const [loadedVersion, setLoadedVersion] = useState(0);
  const [original, setOriginal] = useState<{ commercial: EditableCommercial; payroll: EditablePayroll } | null>(null);
  const [commercial, setCommercial] = useState<EditableCommercial | null>(null);
  const [payroll, setPayroll] = useState<EditablePayroll | null>(null);
  const [commercialErrors, setCommercialErrors] = useState<CommercialDetailErrors>({});
  const [payrollErrors, setPayrollErrors] = useState<PayrollDetailErrors>({});

  const [editTab, setEditTab] = useState<"commercial" | "payroll">("commercial");
  const [applying, setApplying] = useState(false);
  const [appliedVersion, setAppliedVersion] = useState<number | null>(null);

  useEffect(() => {
    fetchEnums()
      .then((enums) => {
        setCommercialItems(enums.commercialItems);
        setPayrollItems(enums.payrollItems);
        setItemTypes(enums.itemTypes);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load reference data"));
  }, []);

  function proceedToReason() {
    if (mouId === "") return;
    setError(null);
    setReason("");
    setRemark("");
    setProof(null);
    setStep("reason");
  }

  async function handleRequestEdit() {
    setError(null);
    setRequesting(true);
    try {
      const response = await requestEditToken(mouId, reason, remark, proof);
      setToken(response.token);
      setLoadedVersion(response.version);
      setOriginal({ commercial: response.commercial, payroll: response.payroll });
      setCommercial(response.commercial);
      setPayroll(response.payroll);
      setCommercialErrors({});
      setPayrollErrors({});
      setEditTab("commercial");
      setStep("edit");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start the edit");
    } finally {
      setRequesting(false);
    }
  }

  function proceedToReview() {
    if (commercial === null || payroll === null) return;
    const commercialValidation = validateCommercialDetails(commercial, new Date().toISOString().slice(0, 10));
    const payrollValidation = validatePayrollDetails(payroll);
    setCommercialErrors(commercialValidation.errors);
    setPayrollErrors(payrollValidation.errors);
    if (
      Object.keys(commercialValidation.errors).length > 0 ||
      Object.keys(payrollValidation.errors).length > 0
    ) {
      return;
    }
    setError(null);
    setStep("review");
  }

  async function handleApply() {
    if (commercial === null || payroll === null) return;
    setError(null);
    setApplying(true);
    try {
      const result = await applyEdit(mouId, token, loadedVersion, commercial, payroll);
      if (result.ok) {
        setAppliedVersion(result.version);
        setStep("done");
      } else if (result.status === 409) {
        setError(result.message);
      } else {
        setError(result.message);
      }
    } finally {
      setApplying(false);
    }
  }

  function startAnother() {
    setStep("select");
    resetSelectors();
    setToken("");
    setOriginal(null);
    setCommercial(null);
    setPayroll(null);
    setAppliedVersion(null);
    setError(null);
  }

  if (user !== null && user.role !== "ADMIN") {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-2xl glass-card rounded-xl p-8">
          <h1 className="text-base font-medium text-foreground">Not available</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your role ({user.role}) does not have access to this screen.</p>
        </div>
      </div>
    );
  }

  const canContinueReason = reason !== "" && (reason !== "COMMUNICATION_FROM_HR" || proof !== null);
  const fixedCharges = commercialItems.filter((item) => item.itemType !== null).slice().sort((a, b) => a.displayOrder - b.displayOrder);
  const fixedPayrollItems = payrollItems.filter((item) => item.itemType !== null).slice().sort((a, b) => a.displayOrder - b.displayOrder);

  /* Breadcrumb */
  const stepLabels: { key: Step; label: string }[] = [
    { key: "select", label: "Select Agreement" },
    { key: "reason", label: "Reason" },
    { key: "edit", label: "Edit" },
    { key: "review", label: "Review" },
  ];
  const stepOrder: Step[] = ["select", "reason", "edit", "review", "done"];
  const currentIdx = stepOrder.indexOf(step);

  return (
    <>
      <Topbar title="Edit Agreement" subtitle="Amend or update an existing MoU record" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-5">
          {error !== null && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          {/* Breadcrumb */}
          {step !== "done" && (
            <nav className="flex items-center gap-2 text-xs font-semibold">
              {stepLabels.map((s, i) => {
                const sIdx = stepOrder.indexOf(s.key);
                const isCurrent = step === s.key;
                const isPast = currentIdx > sIdx;
                return (
                  <span key={s.key} className="flex items-center gap-2">
                    {i > 0 && <span className="text-muted-foreground">›</span>}
                    <span
                      className={`flex items-center gap-1.5 ${
                        isCurrent ? "text-[#1B5FAE]" : isPast ? "text-foreground" : "text-muted-foreground"
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                          isCurrent
                            ? "bg-[#1B5FAE] text-white"
                            : isPast
                              ? "bg-green-100 text-green-700"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isPast ? "✓" : i + 1}
                      </span>
                      {s.label}
                    </span>
                  </span>
                );
              })}
            </nav>
          )}

          {/* Step: Select Agreement */}
          {step === "select" && (
            <Card className="p-6">
              <SecTitle>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                Select Agreement
              </SecTitle>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="editZone" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Zone</label>
                  <select id="editZone" value={zoneId} onChange={(event) => void handleZoneChange(event.target.value)} className={SELECT_CLASS}>
                    <option value="">Select zone</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="editCompany" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Company</label>
                  <select id="editCompany" value={companyId} disabled={zoneId === ""} onChange={(event) => void handleCompanyChange(event.target.value)} className={SELECT_CLASS}>
                    <option value="">{zoneId === "" ? "Select a zone first" : "Select company"}</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="editPlant" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Company Plant</label>
                  <select id="editPlant" value={plantId} disabled={companyId === ""} onChange={(event) => void handlePlantChange(event.target.value)} className={SELECT_CLASS}>
                    <option value="">{companyId === "" ? "Select a company first" : "Select plant"}</option>
                    {plants.map((p) => (
                      <option key={p.id} value={p.id}>{p.plantName}</option>
                    ))}
                  </select>
                </div>
                {mous.length > 1 && (
                  <div>
                    <label htmlFor="editScheme" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Scheme</label>
                    <select id="editScheme" value={mouId} onChange={(event) => setMouId(event.target.value)} className={SELECT_CLASS}>
                      <option value="">Select scheme</option>
                      {mous.map((m) => (
                        <option key={m.mouId} value={m.mouId}>
                          {SCHEME_LABELS[m.scheme as keyof typeof SCHEME_LABELS] ?? m.scheme}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex justify-end mt-5 pt-4 border-t border-border">
                <Btn variant="primary" disabled={mouId === ""} onClick={proceedToReason}>
                  Next →
                </Btn>
              </div>
            </Card>
          )}

          {/* Step: Reason */}
          {step === "reason" && (
            <Card className="p-6">
              <SecTitle>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
                Reason for Amendment
              </SecTitle>

              {/* Reason radio-style cards */}
              <div className="grid sm:grid-cols-3 gap-3 mb-5">
                {EDIT_AGREEMENT_REASON_OPTIONS.map((option) => {
                  const isSelected = reason === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setReason(option.value);
                        setProof(null);
                      }}
                      className={`text-left rounded-xl border-2 p-4 transition-all duration-150 ${
                        isSelected
                          ? "border-[#1B5FAE] bg-blue-50 ring-1 ring-[#1B5FAE]"
                          : "border-border hover:border-[#1B5FAE]/50 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <div
                          className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                            isSelected ? "border-[#1B5FAE]" : "border-border"
                          }`}
                        >
                          {isSelected && <div className="w-2 h-2 rounded-full bg-[#1B5FAE]" />}
                        </div>
                        <span className="text-sm font-semibold text-foreground">{option.label}</span>
                      </div>
                    </button>
                  );
                })}
              </div>

              {reason === "COMMUNICATION_FROM_HR" && (
                <div className="mb-4">
                  <label htmlFor="editProof" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                    Proof Document
                  </label>
                  <input
                    id="editProof"
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    onChange={(event) => setProof(event.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-foreground"
                  />
                </div>
              )}

              <div className="mb-4">
                <label htmlFor="editRemark" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                  Remark (optional)
                </label>
                <textarea
                  id="editRemark"
                  value={remark}
                  onChange={(event) => setRemark(event.target.value)}
                  maxLength={500}
                  rows={3}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="flex justify-between pt-4 border-t border-border">
                <Btn variant="ghost" onClick={() => setStep("select")}>← Back</Btn>
                <Btn variant="primary" disabled={!canContinueReason || requesting} onClick={() => void handleRequestEdit()}>
                  {requesting ? "Loading…" : "Continue →"}
                </Btn>
              </div>
            </Card>
          )}

          {/* Step: Edit */}
          {step === "edit" && commercial !== null && payroll !== null && (
            <Card className="p-6">
              <SecTitle>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                Edit Agreement
              </SecTitle>

              {/* Tab bar */}
              <div className="flex gap-1 mb-5 border-b border-border">
                {(["commercial", "payroll"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setEditTab(tab)}
                    className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors border-b-2 -mb-px ${
                      editTab === tab
                        ? "border-[#1B5FAE] text-[#1B5FAE]"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "commercial" ? "Commercial Details" : "Payroll Details"}
                  </button>
                ))}
              </div>

              {/* Commercial tab */}
              {editTab === "commercial" && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label htmlFor="mouStartDate" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                        MoU Start Date
                      </label>
                      <input
                        id="mouStartDate"
                        value={commercial.mouStartDate}
                        onChange={(event) => setCommercial({ ...commercial, mouStartDate: event.target.value })}
                        aria-invalid={commercialErrors.mouStartDate !== undefined}
                        className={INPUT_CLASS}
                      />
                      {commercialErrors.mouStartDate !== undefined && (
                        <p className="mt-1 text-xs text-red-600">{commercialErrors.mouStartDate}</p>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label htmlFor="tenureValue" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          Tenure
                        </label>
                        <input
                          id="tenureValue"
                          value={commercial.tenureValue}
                          onChange={(event) => setCommercial({ ...commercial, tenureValue: event.target.value })}
                          aria-invalid={commercialErrors.tenureValue !== undefined}
                          className={INPUT_CLASS}
                        />
                      </div>
                      <div>
                        <label htmlFor="tenureUnit" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          Unit
                        </label>
                        <select
                          id="tenureUnit"
                          value={commercial.tenureUnit}
                          onChange={(event) => setCommercial({ ...commercial, tenureUnit: event.target.value })}
                          className={INPUT_CLASS}
                        >
                          <option value="MONTHS">Months</option>
                          <option value="YEARS">Years</option>
                        </select>
                      </div>
                    </div>
                    {(commercialErrors.tenureValue !== undefined || commercialErrors.tenureUnit !== undefined) && (
                      <p className="-mt-3 text-xs text-red-600 md:col-start-2">
                        {commercialErrors.tenureValue ?? commercialErrors.tenureUnit}
                      </p>
                    )}
                    <div>
                      <label htmlFor="attendanceCycle" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                        Attendance Cycle
                      </label>
                      <input
                        id="attendanceCycle"
                        value={commercial.attendanceCycle}
                        onChange={(event) => setCommercial({ ...commercial, attendanceCycle: event.target.value })}
                        aria-invalid={commercialErrors.attendanceCycle !== undefined}
                        className={INPUT_CLASS}
                      />
                      {commercialErrors.attendanceCycle !== undefined && (
                        <p className="mt-1 text-xs text-red-600">{commercialErrors.attendanceCycle}</p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="stipendDate" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                        Stipend Date
                      </label>
                      <input
                        id="stipendDate"
                        value={commercial.stipendDate}
                        onChange={(event) => setCommercial({ ...commercial, stipendDate: event.target.value })}
                        aria-invalid={commercialErrors.stipendDate !== undefined}
                        className={INPUT_CLASS}
                      />
                      {commercialErrors.stipendDate !== undefined && (
                        <p className="mt-1 text-xs text-red-600">{commercialErrors.stipendDate}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Commercial Charges</h3>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      {fixedCharges.map((item) => (
                        <div key={item.key}>
                          <label htmlFor={`charge-${item.key}`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                            {item.label}
                          </label>
                          <input
                            id={`charge-${item.key}`}
                            value={commercial.charges[item.key] ?? ""}
                            onChange={(event) =>
                              setCommercial({ ...commercial, charges: { ...commercial.charges, [item.key]: event.target.value } })
                            }
                            placeholder="Leave blank if not applicable"
                            aria-invalid={commercialErrors.charges?.[item.key] !== undefined}
                            className={INPUT_CLASS}
                          />
                          {commercialErrors.charges?.[item.key] !== undefined && (
                            <p className="mt-1 text-xs text-red-600">{commercialErrors.charges[item.key]}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Other Charges</h3>
                    <OtherItemsEditor
                      items={commercial.otherItems}
                      onChange={(items) => setCommercial({ ...commercial, otherItems: items })}
                      itemTypes={itemTypes}
                    />
                  </div>
                </div>
              )}

              {/* Payroll tab */}
              {editTab === "payroll" && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3">
                    <Badge text={payroll.scheme} variant="info" />
                    <span className="text-xs text-muted-foreground">(not editable)</span>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Trainee Categories</h3>
                    <div className="space-y-2">
                      {payroll.traineeCategories.map((category, index) => (
                        <div key={index} className="flex gap-2">
                          <input
                            aria-label={`Trainee category ${index + 1}`}
                            value={category}
                            onChange={(event) =>
                              setPayroll({
                                ...payroll,
                                traineeCategories: payroll.traineeCategories.map((c, i) => (i === index ? event.target.value : c)),
                              })
                            }
                            className={INPUT_CLASS}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setPayroll({
                                ...payroll,
                                traineeCategories: payroll.traineeCategories.filter((_, i) => i !== index),
                              })
                            }
                            className="mt-1 h-9 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:bg-muted"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setPayroll({ ...payroll, traineeCategories: [...payroll.traineeCategories, ""] })}
                        className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                      >
                        Add category
                      </button>
                      {payrollErrors.traineeCategories !== undefined && (
                        <p className="text-xs text-red-600">{payrollErrors.traineeCategories}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Payroll Items</h3>
                    <div className="space-y-3">
                      {fixedPayrollItems.map((item) => {
                        const answer = payroll.items[item.key] ?? { isApplicable: undefined, amount: "" };
                        return (
                          <div key={item.key} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[2fr_1fr_1fr]">
                            <span className="text-sm text-foreground">{item.label}</span>
                            <div className="flex gap-4 text-sm">
                              <label className="flex items-center gap-1">
                                <input
                                  type="radio"
                                  name={`item-${item.key}`}
                                  checked={answer.isApplicable === true}
                                  onChange={() =>
                                    setPayroll({
                                      ...payroll,
                                      items: { ...payroll.items, [item.key]: { isApplicable: true, amount: answer.amount } },
                                    })
                                  }
                                />
                                Yes
                              </label>
                              <label className="flex items-center gap-1">
                                <input
                                  type="radio"
                                  name={`item-${item.key}`}
                                  checked={answer.isApplicable === false}
                                  onChange={() =>
                                    setPayroll({
                                      ...payroll,
                                      items: { ...payroll.items, [item.key]: { isApplicable: false, amount: "" } },
                                    })
                                  }
                                />
                                No
                              </label>
                            </div>
                            {answer.isApplicable === true && (
                              <input
                                aria-label={`${item.label} amount`}
                                value={answer.amount}
                                onChange={(event) =>
                                  setPayroll({
                                    ...payroll,
                                    items: { ...payroll.items, [item.key]: { isApplicable: true, amount: event.target.value } },
                                  })
                                }
                                className={INPUT_CLASS}
                              />
                            )}
                            {payrollErrors.items?.[item.key] !== undefined && (
                              <p className="text-xs text-red-600 md:col-span-3">{payrollErrors.items[item.key]}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Other Payroll Items</h3>
                    <OtherItemsEditor
                      items={payroll.otherItems}
                      onChange={(items) => setPayroll({ ...payroll, otherItems: items })}
                      itemTypes={itemTypes}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-between pt-5 border-t border-border mt-5">
                <Btn variant="ghost" onClick={() => setStep("reason")}>← Back</Btn>
                <Btn variant="primary" onClick={proceedToReview}>
                  Review Changes →
                </Btn>
              </div>
            </Card>
          )}

          {/* Step: Review */}
          {step === "review" && original !== null && commercial !== null && payroll !== null && (
            <Card className="p-6">
              <SecTitle>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <polyline points="9 11 12 14 22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                Review Changes
              </SecTitle>
              {(() => {
                const diff = computeDiff(original, { commercial, payroll }, commercialItems, payrollItems);
                if (diff.length === 0) {
                  return <p className="text-sm text-muted-foreground">No changes to apply.</p>;
                }
                return (
                  <div className="overflow-x-auto rounded-lg border border-border">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Field</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">Previous Value</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diff.map((row) => (
                          <tr key={row.field} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                            <td className="px-4 py-3 text-xs font-semibold text-foreground">{row.field}</td>
                            <td className="px-4 py-3 text-xs text-muted-foreground line-through">{row.oldValue}</td>
                            <td className="px-4 py-3 text-xs font-bold" style={{ color: brand.blue }}>{row.newValue}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}

              <div className="flex justify-between pt-5 border-t border-border mt-5">
                <Btn variant="ghost" onClick={() => setStep("edit")}>← Back</Btn>
                <Btn variant="primary" disabled={applying} onClick={() => void handleApply()}>
                  {applying ? "Applying…" : "Apply Changes"}
                </Btn>
              </div>
            </Card>
          )}

          {/* Step: Done */}
          {step === "done" && (
            <Card className="p-6 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-foreground mb-1">Edit Applied Successfully</h2>
              <p className="text-sm text-muted-foreground mb-5">The agreement is now at version {appliedVersion}.</p>
              <Btn variant="primary" onClick={startAnother}>
                Edit another agreement
              </Btn>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
