/**
 * Purpose: SPEC-10's Edit Agreement flow - cascading Zone/Company/Plant/Scheme
 * selection, a reason gate that locks every field until a reason (and, for
 * "Communication from HR", a proof file) is on record, the edit form itself,
 * a review screen listing every changed field old -> new, and Apply. ADMIN
 * only (section 6); a DATA_ENTRY or VIEWER who types this URL directly sees
 * "Not available", the same client-side guard `AddCompanyPage.tsx` and
 * `UploadMouPage.tsx` already use.
 *
 * Reuses `validateCommercialDetails`/`validatePayrollDetails` unchanged from
 * SPEC-05/06 for local feedback before Review - the server re-runs the exact
 * same functions, so a form that passes here cannot fail there for a rule
 * reason (only staleness/no-changes are checked only on the server).
 */

import {
  COMMERCIAL_FIXED_ITEM_KEYS,
  EDIT_AGREEMENT_REASON_OPTIONS,
  PAYROLL_FIXED_ITEM_KEYS,
  validateCommercialDetails,
  validatePayrollDetails,
} from "@mou/domain";
import type { CommercialDetailErrors, PayrollDetailErrors } from "@mou/domain";
import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { brand } from "../components/ui.tsx";
import type {
  CommercialItemOption,
  CompanyListItem,
  CompanyMouOption,
  CompanyPlantOption,
  EditableCommercial,
  EditableOtherItem,
  EditablePayroll,
  EnumOption,
  PayrollItemOption,
  ZoneOption,
} from "../api/client.ts";
import {
  applyEdit,
  fetchCompanyMous,
  fetchCompanyPlants,
  fetchEnums,
  fetchZoneCompanies,
  fetchZones,
  requestEditToken,
} from "../api/client.ts";
import { useAuth } from "../auth/AuthContext.tsx";

const INPUT_CLASS =
  "mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring";

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

  push("MOU Start Date", original.commercial.mouStartDate, edited.commercial.mouStartDate);
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

  const [zones, setZones] = useState<readonly ZoneOption[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [companies, setCompanies] = useState<readonly CompanyListItem[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [plants, setPlants] = useState<readonly CompanyPlantOption[]>([]);
  const [plantId, setPlantId] = useState("");
  const [mous, setMous] = useState<readonly CompanyMouOption[]>([]);
  const [mouId, setMouId] = useState("");

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

  const [applying, setApplying] = useState(false);
  const [appliedVersion, setAppliedVersion] = useState<number | null>(null);

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load zones"));
    fetchEnums()
      .then((enums) => {
        setCommercialItems(enums.commercialItems);
        setPayrollItems(enums.payrollItems);
        setItemTypes(enums.itemTypes);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load reference data"));
  }, []);

  async function handleZoneChange(nextZoneId: string) {
    setZoneId(nextZoneId);
    setCompanyId("");
    setPlants([]);
    setPlantId("");
    setMous([]);
    setMouId("");
    setCompanies([]);
    if (nextZoneId === "") return;
    try {
      setCompanies(await fetchZoneCompanies(nextZoneId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load companies");
    }
  }

  async function handleCompanyChange(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setPlantId("");
    setMous([]);
    setMouId("");
    setPlants([]);
    if (nextCompanyId === "") return;
    try {
      setPlants(await fetchCompanyPlants(nextCompanyId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plants");
    }
  }

  async function handlePlantChange(nextPlantId: string) {
    setPlantId(nextPlantId);
    setMous([]);
    setMouId("");
    if (nextPlantId === "" || companyId === "") return;
    try {
      const list = await fetchCompanyMous(companyId, nextPlantId);
      setMous(list);
      const only = list.length === 1 ? list[0] : undefined;
      if (only !== undefined) {
        setMouId(only.mouId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schemes");
    }
  }

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
    setZoneId("");
    setCompanies([]);
    setCompanyId("");
    setPlants([]);
    setPlantId("");
    setMous([]);
    setMouId("");
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
        <div className="mx-auto max-w-2xl rounded-xl bg-white p-8 shadow-sm border border-border">
          <h1 className="text-base font-medium text-foreground">Not available</h1>
          <p className="mt-1 text-sm text-muted-foreground">Your role ({user.role}) does not have access to this screen.</p>
        </div>
      </div>
    );
  }

  const canContinueReason = reason !== "" && (reason !== "COMMUNICATION_FROM_HR" || proof !== null);
  const fixedCharges = commercialItems.filter((item) => item.itemType !== null).slice().sort((a, b) => a.displayOrder - b.displayOrder);
  const fixedPayrollItems = payrollItems.filter((item) => item.itemType !== null).slice().sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <>
      <Topbar title="Edit Agreement" subtitle="Amend a saved agreement after stating a reason" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl">
          {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          {step === "select" && (
        <div className="space-y-4 glass-card rounded-xl p-6">
          <div>
            <label htmlFor="editZone" className="block text-sm font-medium text-gray-700">
              Zone
            </label>
            <select
              id="editZone"
              value={zoneId}
              onChange={(event) => void handleZoneChange(event.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">Select zone</option>
              {zones.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="editCompany" className="block text-sm font-medium text-gray-700">
              Company
            </label>
            <select
              id="editCompany"
              value={companyId}
              disabled={zoneId === ""}
              onChange={(event) => void handleCompanyChange(event.target.value)}
              className={`${INPUT_CLASS} disabled:bg-gray-100`}
            >
              <option value="">{zoneId === "" ? "Select a zone first" : "Select company"}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.generatedCode})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="editPlant" className="block text-sm font-medium text-gray-700">
              Company Plant
            </label>
            <select
              id="editPlant"
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
              <label htmlFor="editScheme" className="block text-sm font-medium text-gray-700">
                Scheme
              </label>
              <select
                id="editScheme"
                value={mouId}
                onChange={(event) => setMouId(event.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Select scheme</option>
                {mous.map((m) => (
                  <option key={m.mouId} value={m.mouId}>
                    {m.scheme}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={mouId === ""}
              onClick={proceedToReason}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: brand.blue }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === "reason" && (
        <div className="space-y-4 glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900">Why are you editing this agreement?</h2>
          <div>
            <label htmlFor="editReason" className="block text-sm font-medium text-gray-700">
              Reason
            </label>
            <select
              id="editReason"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setProof(null);
              }}
              className={INPUT_CLASS}
            >
              <option value="">Select a reason</option>
              {EDIT_AGREEMENT_REASON_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {reason === "COMMUNICATION_FROM_HR" && (
            <div>
              <label htmlFor="editProof" className="block text-sm font-medium text-gray-700">
                Proof
              </label>
              <input
                id="editProof"
                type="file"
                accept="application/pdf,image/png,image/jpeg"
                onChange={(event) => setProof(event.target.files?.[0] ?? null)}
                className="mt-1 block w-full text-sm text-gray-700"
              />
            </div>
          )}

          <div>
            <label htmlFor="editRemark" className="block text-sm font-medium text-gray-700">
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

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep("select")}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!canContinueReason || requesting}
              onClick={() => void handleRequestEdit()}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: brand.blue }}
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {step === "edit" && commercial !== null && payroll !== null && (
        <div className="space-y-6 glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900">Commercial Details</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="mouStartDate" className="block text-sm font-medium text-gray-700">
                MOU Start Date
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
                <label htmlFor="tenureValue" className="block text-sm font-medium text-gray-700">
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
                <label htmlFor="tenureUnit" className="block text-sm font-medium text-gray-700">
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
              <label htmlFor="attendanceCycle" className="block text-sm font-medium text-gray-700">
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
              <label htmlFor="stipendDate" className="block text-sm font-medium text-gray-700">
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

          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Commercial Charges</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {fixedCharges.map((item) => (
              <div key={item.key}>
                <label htmlFor={`charge-${item.key}`} className="block text-sm font-medium text-gray-700">
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

          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Other Charges</h3>
          <OtherItemsEditor
            items={commercial.otherItems}
            onChange={(items) => setCommercial({ ...commercial, otherItems: items })}
            itemTypes={itemTypes}
          />

          <h2 className="pt-4 text-lg font-semibold text-gray-900">Payroll Details</h2>
          <p className="text-sm text-gray-600">Scheme: {payroll.scheme} (not editable)</p>

          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Trainee Categories</h3>
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

          <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Payroll Items</h3>
          <div className="space-y-3">
            {fixedPayrollItems.map((item) => {
              const answer = payroll.items[item.key] ?? { isApplicable: undefined, amount: "" };
              return (
                <div key={item.key} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[2fr_1fr_1fr]">
                  <span className="text-sm text-gray-700">{item.label}</span>
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

          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Other Payroll Items</h3>
          <OtherItemsEditor
            items={payroll.otherItems}
            onChange={(items) => setPayroll({ ...payroll, otherItems: items })}
            itemTypes={itemTypes}
          />

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep("reason")}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Back
            </button>
            <button
              type="button"
              onClick={proceedToReview}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ background: brand.blue }}
            >
              Review changes
            </button>
          </div>
        </div>
      )}

      {step === "review" && original !== null && commercial !== null && payroll !== null && (
        <div className="space-y-4 glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900">Review Changes</h2>
          {(() => {
            const diff = computeDiff(original, { commercial, payroll }, commercialItems, payrollItems);
            if (diff.length === 0) {
              return <p className="text-sm text-gray-600">No changes to apply.</p>;
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
                  {diff.map((row) => (
                    <tr key={row.field} className="border-b border-gray-100">
                      <td className="py-1">{row.field}</td>
                      <td className="py-1 text-gray-500">{row.oldValue}</td>
                      <td className="py-1 font-medium">{row.newValue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          })()}

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep("edit")}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
            >
              Back
            </button>
            <button
              type="button"
              disabled={applying}
              onClick={() => void handleApply()}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: brand.blue }}
            >
              Apply
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="space-y-4 glass-card rounded-xl p-6">
          <h2 className="text-lg font-semibold text-gray-900">Edit Applied</h2>
          <p className="text-sm text-gray-600">The agreement is now at version {appliedVersion}.</p>
          <button
            type="button"
            onClick={startAnother}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
              style={{ background: brand.blue }}
          >
            Edit another agreement
          </button>
        </div>
      )}
        </div>
      </div>
    </>
  );
}
