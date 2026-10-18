/**
 * Purpose: The Edit Agreement screen (ADMIN only; AppShell guards the route). A
 * zone -> company -> plant -> scheme cascade of real ids (each select appears once
 * the previous one is chosen) and OK open the agreement: a summary strip from the
 * MoU's commercial detail and history version, the SPEC-10 reason gate (proof
 * required only for Communication from HR) that fetches the edit token as soon as
 * the reason and any required proof are chosen, the previous/new value tabs
 * (screens/editAgreement), a review diff, Save Draft (kept in this browser only,
 * per MoU and version), and Save & Submit, which applies the edit as a new version.
 * Keeps the prototype's proof and success modals.
 */

import {
  EDIT_AGREEMENT_REASON_LABELS,
  EDIT_AGREEMENT_REASON_OPTIONS,
  computeAgreementDiff,
  validateCommercialDetails,
  validatePayrollDetails,
} from "@mou/domain";
import type { CommercialDetailErrors, EditAgreementReason, PayrollDetailErrors } from "@mou/domain";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { applyEdit, fetchAgreementHistory, fetchEnums, fetchMouCommercial, requestEditToken } from "../api/client.ts";
import type {
  CommercialItemOption,
  EditTokenResponse,
  EditableCommercial,
  EditablePayroll,
  EnumOption,
  MouCommercialDetail,
  PayrollItemOption,
} from "../api/client.ts";
import { useCascadingSelectors } from "../hooks/useCascadingSelectors.ts";
import { PENDING_FIGURE, displayStatus, formatCalendarDate, schemeLabel, todayIso } from "../ui/format.ts";
import { Field } from "../ui/form.tsx";
import type { SelectOption } from "../ui/form.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge, Button, Card, SectionTitle } from "../ui/primitives.tsx";
import { BRAND, statusTone } from "../ui/theme.ts";
import { CommercialTab, CompanyDetailsTab, PayrollTab, ReviewTab } from "./editAgreement/EditTabs.tsx";

const TABS = ["Company Details", "Commercial Details", "Payroll Details", "Review Changes"] as const;
type Tab = (typeof TABS)[number];

const LOAD_ERROR = "Could not load this agreement. Please try again.";
const FIX_ERRORS = "Some values are not valid. Fix the highlighted fields before reviewing.";
const NO_CHANGES = "No changes have been made yet.";

const SECONDARY_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary border-border hover:bg-blue-100";
const GHOST_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground";
const ALERT_CLASS = "rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]";

interface AgreementSelectProps {
  readonly id: string;
  readonly label: string;
  readonly widthClass: string;
  readonly options: readonly SelectOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** This screen's selects omit `text-foreground`, unlike the shared SelectInput. */
function AgreementSelect({ id, label, widthClass, options, value, onChange }: AgreementSelectProps) {
  return (
    <Field label={label} htmlFor={id} required className={widthClass}>
      <div className="relative">
        <select
          id={id}
          value={value}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
          className="w-full h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Select…</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
          <Icon name="chevronDown" className="w-4 h-4" strokeWidth={2} />
        </span>
      </div>
    </Field>
  );
}

function SummaryItem({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      {children}
    </div>
  );
}

function ModalFrame({ children }: { readonly children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">{children}</div>;
}

/** The agreement's names, taken from the cascade lists it was chosen from. */
interface AgreementNames {
  readonly company: string;
  readonly zone: string;
  readonly plant: string;
}

interface Loaded {
  readonly detail: MouCommercialDetail;
  readonly version: number;
  readonly charges: readonly CommercialItemOption[];
  readonly payrollItems: readonly PayrollItemOption[];
  readonly itemTypes: readonly EnumOption[];
}

function hasErrors(errors: object): boolean {
  return Object.keys(errors).length > 0;
}

/**
 * Save Draft has no API: the unsubmitted edits live in this browser only. A draft
 * is tied to the version it was edited from, so once the MoU has moved on its
 * baseline is stale and it is discarded rather than replayed over newer values.
 */
interface EditDraft {
  readonly version: number;
  readonly commercial: EditableCommercial;
  readonly payroll: EditablePayroll;
}

const draftKey = (mouId: string): string => `mou-edit-draft:${mouId}`;

function loadDraft(mouId: string, version: number): EditDraft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(mouId));
    if (raw === null) return null;
    const draft = JSON.parse(raw) as EditDraft;
    if (draft.version === version) return draft;
    window.localStorage.removeItem(draftKey(mouId));
    return null;
  } catch {
    return null;
  }
}

function saveDraft(mouId: string, draft: EditDraft): boolean {
  try {
    window.localStorage.setItem(draftKey(mouId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

function clearDraft(mouId: string): void {
  try {
    window.localStorage.removeItem(draftKey(mouId));
  } catch {
    // Storage is unavailable, so there is no draft to clear.
  }
}

function AgreementEditor({ mouId, names }: { readonly mouId: string; readonly names: AgreementNames }) {
  const navigate = useNavigate();
  const proofInput = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [reason, setReason] = useState<EditAgreementReason | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [edit, setEdit] = useState<EditTokenResponse | null>(null);
  const [commercial, setCommercial] = useState<EditableCommercial | null>(null);
  const [payroll, setPayroll] = useState<EditablePayroll | null>(null);
  const [commercialErrors, setCommercialErrors] = useState<CommercialDetailErrors>({});
  const [payrollErrors, setPayrollErrors] = useState<PayrollDetailErrors>({});
  const [tab, setTab] = useState<Tab>("Company Details");
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<{ readonly version: number; readonly on: string } | null>(null);
  const [modal, setModal] = useState<"none" | "proof" | "success">("none");
  const [draftSaved, setDraftSaved] = useState(false);
  /** The version the values being edited came from; a token for it keeps them. */
  const editedVersion = useRef<number | null>(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchMouCommercial(mouId), fetchAgreementHistory(mouId), fetchEnums()])
      .then(([detail, history, enums]) => {
        if (cancelled) return;
        const byOrder = <T extends { readonly itemType: string | null; readonly displayOrder: number }>(items: readonly T[]) =>
          items.filter((item) => item.itemType !== null).sort((a, b) => a.displayOrder - b.displayOrder);
        setLoaded({
          detail,
          version: history.currentVersion,
          charges: byOrder(enums.commercialItems),
          payrollItems: byOrder(enums.payrollItems),
          itemTypes: enums.itemTypes,
        });
      })
      .catch(() => {
        if (!cancelled) setError(LOAD_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [mouId]);

  const proofRequired = reason === "COMMUNICATION_FROM_HR";
  const reasonLabel = reason === null ? PENDING_FIGURE : EDIT_AGREEMENT_REASON_LABELS[reason];
  const changes =
    edit !== null && commercial !== null && payroll !== null
      ? computeAgreementDiff({ commercial: edit.commercial, payroll: edit.payroll }, { commercial, payroll }).filter((row) => row.changed)
      : [];

  // The reason gate with no Start Editing step: once the reason (and, for
  // Communication from HR, its proof) is chosen, the edit token is fetched in the
  // background. Changing either fetches a fresh token so the one applied always
  // matches what is on screen; edits already made on the same version survive it.
  const unlock = (nextReason: EditAgreementReason, nextProof: File | null) => {
    // Only the latest request may update the screen; an earlier one is stale.
    const request = ++latestRequest.current;
    if (nextReason === "COMMUNICATION_FROM_HR" && nextProof === null) {
      setEdit(null);
      setRequesting(false);
      return;
    }
    setRequesting(true);
    setError("");
    requestEditToken(mouId, nextReason, "", nextProof)
      .then((response) => {
        if (request !== latestRequest.current) return;
        if (editedVersion.current !== response.version) {
          const draft = loadDraft(mouId, response.version);
          setCommercial(draft?.commercial ?? response.commercial);
          setPayroll(draft?.payroll ?? response.payroll);
          setDraftSaved(draft !== null);
          editedVersion.current = response.version;
        }
        setEdit(response);
      })
      .catch((requestError: unknown) => {
        if (request === latestRequest.current) {
          setError(requestError instanceof Error ? requestError.message : "Could not start the edit.");
        }
      })
      .finally(() => {
        if (request === latestRequest.current) setRequesting(false);
      });
  };

  const chooseReason = (value: EditAgreementReason) => {
    if (value === reason) return;
    setReason(value);
    unlock(value, proof);
  };

  const chooseProof = (file: File | null) => {
    setProof(file);
    if (reason !== null) unlock(reason, file);
  };

  const editCommercial = (value: EditableCommercial) => {
    setCommercial(value);
    setDraftSaved(false);
  };
  const editPayroll = (value: EditablePayroll) => {
    setPayroll(value);
    setDraftSaved(false);
  };

  const keepDraft = () => {
    if (edit === null || commercial === null || payroll === null) return;
    if (saveDraft(mouId, { version: edit.version, commercial, payroll })) setDraftSaved(true);
    else setError("Could not save the draft in this browser.");
  };

  /** Runs the domain rules; on failure shows the first tab with an error. */
  const validate = (): boolean => {
    if (commercial === null || payroll === null) return false;
    const commercialResult = validateCommercialDetails(commercial, todayIso());
    const payrollResult = validatePayrollDetails(payroll);
    setCommercialErrors(commercialResult.errors);
    setPayrollErrors(payrollResult.errors);
    if (hasErrors(commercialResult.errors)) setTab("Commercial Details");
    else if (hasErrors(payrollResult.errors)) setTab("Payroll Details");
    const valid = !hasErrors(commercialResult.errors) && !hasErrors(payrollResult.errors);
    setError(valid ? "" : FIX_ERRORS);
    return valid;
  };

  const openTab = (name: Tab) => {
    if (name === "Review Changes" && edit !== null && !validate()) return;
    setTab(name);
  };

  const submit = () => {
    if (proofRequired && proof === null) {
      setModal("proof");
      return;
    }
    if (edit === null || commercial === null || payroll === null || !validate()) return;
    if (changes.length === 0) {
      setError(NO_CHANGES);
      return;
    }
    setApplying(true);
    applyEdit(mouId, edit.token, edit.version, commercial, payroll)
      .then((result) => {
        if (result.ok) {
          clearDraft(mouId);
          setApplied({ version: result.version, on: formatCalendarDate(todayIso()) });
          setModal("success");
        } else {
          setError(result.status === 409 ? `${result.message}. Reopen the agreement and try again.` : result.message);
        }
      })
      .catch(() => setError("Could not save the agreement. Please try again."))
      .finally(() => setApplying(false));
  };

  if (loaded === null) {
    return error === "" ? null : (
      <div role="alert" className={ALERT_CLASS}>
        {error}
      </div>
    );
  }

  const status = displayStatus(loaded.detail.status, loaded.detail.endDate);
  const locked = edit === null || commercial === null || payroll === null;

  return (
    <>
      <Card className="p-4">
        <div data-testid="agreement-summary" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            ["Company Name", names.company],
            ["Plant", names.plant],
            ["Zone", names.zone],
            ["Agreement Code", loaded.detail.generatedCode],
            ["Current Version", `V${loaded.version}`],
          ].map(([label, value]) => (
            <SummaryItem key={label} label={label ?? ""}>
              <p className="text-xs font-semibold text-foreground truncate">{value}</p>
            </SummaryItem>
          ))}
          <SummaryItem label="Status">
            <Badge text={status} tone={statusTone(status)} />
          </SummaryItem>
        </div>
      </Card>

      {error !== "" && (
        <div role="alert" className={ALERT_CLASS}>
          {error}
        </div>
      )}

      <Card className="p-5">
        <SectionTitle>Reason for Amendment</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {EDIT_AGREEMENT_REASON_OPTIONS.map((option) => {
            const active = option.value === reason;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => chooseReason(option.value)}
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-semibold text-left transition-all ${
                  active ? "border-[#1B5FAE] bg-[#E8F0FB] text-[#1B5FAE]" : "border-border bg-white text-muted-foreground hover:bg-muted"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    active ? "border-[#1B5FAE] bg-[#1B5FAE]" : "border-border"
                  }`}
                >
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
        {reason !== null && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Upload Supporting Proof {proofRequired ? <span className="text-red-500">*</span> : "(optional)"}
            </p>
            <input
              ref={proofInput}
              data-testid="proof-input"
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              className="hidden"
              onChange={(event: ChangeEvent<HTMLInputElement>) => chooseProof(event.target.files?.[0] ?? null)}
            />
            {proof === null ? (
              <button
                type="button"
                onClick={() => proofInput.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 hover:border-primary transition-colors text-muted-foreground hover:text-foreground"
              >
                <span>
                  <Icon name="upload" />
                </span>
                <span className="text-sm font-semibold">Click to upload proof (PDF, JPG, PNG · max 10 MB)</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                <span className="text-green-600">
                  <Icon name="file" className="w-4 h-4" />
                </span>
                <span className="text-sm font-semibold text-green-900 truncate flex-1">{proof.name}</span>
                <button
                  type="button"
                  aria-label="Remove proof"
                  onClick={() => {
                    chooseProof(null);
                    if (proofInput.current !== null) proofInput.current.value = "";
                  }}
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Icon name="close" className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex border-b border-border overflow-x-auto">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => openTab(name)}
              className="px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px"
              style={name === tab ? { borderColor: BRAND.orange, color: BRAND.orange } : { borderColor: "transparent", color: "#5A7AA8" }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === "Company Details" ? (
            <CompanyDetailsTab
              info={{
                company: names.company,
                zone: names.zone,
                plant: names.plant,
                code: loaded.detail.generatedCode,
                status,
                endDate: loaded.detail.endDate,
              }}
            />
          ) : locked ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {requesting
                ? "Unlocking these fields…"
                : proofRequired && proof === null
                  ? "Upload the supporting proof to unlock these fields."
                  : "Choose a reason for the amendment to unlock these fields."}
            </p>
          ) : tab === "Commercial Details" ? (
            <CommercialTab
              scheme={edit.payroll.scheme}
              previous={edit.commercial}
              value={commercial}
              errors={commercialErrors}
              charges={loaded.charges}
              itemTypes={loaded.itemTypes}
              onChange={editCommercial}
            />
          ) : tab === "Payroll Details" ? (
            <PayrollTab
              previous={edit.payroll}
              value={payroll}
              errors={payrollErrors}
              items={loaded.payrollItems}
              itemTypes={loaded.itemTypes}
              onChange={editPayroll}
            />
          ) : (
            <ReviewTab changes={changes} reasonLabel={reasonLabel} />
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between pt-2 pb-4">
        <div className="flex gap-2">
          <button
            type="button"
            disabled={locked}
            onClick={keepDraft}
            className={`${SECONDARY_BUTTON} px-3 py-1.5 text-xs ${locked ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {draftSaved ? "Draft Saved" : "Save Draft"}
          </button>
          <button type="button" onClick={() => navigate("/")} className={`${GHOST_BUTTON} px-3 py-1.5 text-xs`}>
            Cancel
          </button>
        </div>
        <Button variant="accent" disabled={reason === null || requesting || applying} onClick={submit}>
          <Icon name="check" className="w-4 h-4" strokeWidth={2.5} />
          {applying ? "Saving…" : "Save & Submit"}
        </Button>
      </div>

      {modal === "proof" && (
        <ModalFrame>
          <div className="glass-modal rounded-2xl w-full max-w-xs overflow-hidden">
            <div className="h-1.5 bg-red-500" />
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3 text-red-500">
                <Icon name="warning" />
              </div>
              <h3 className="font-bold text-sm mb-1" style={{ color: BRAND.navy }}>
                Proof Not Uploaded
              </h3>
              <p className="text-xs text-muted-foreground mb-5">
                Supporting proof is mandatory for <strong>{reasonLabel}</strong>.
              </p>
              <Button
                className="w-full justify-center"
                onClick={() => {
                  setModal("none");
                  proofInput.current?.click();
                }}
              >
                Upload Proof
              </Button>
            </div>
          </div>
        </ModalFrame>
      )}

      {modal === "success" && applied !== null && (
        <ModalFrame>
          <div className="glass-modal rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="h-1.5" style={{ background: `linear-gradient(to right, ${BRAND.blue}, ${BRAND.green})` }} />
            <div className="p-7 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-white" style={{ background: BRAND.green }}>
                <Icon name="check" className="w-8 h-8" strokeWidth={3} />
              </div>
              <h3 className="font-bold text-lg mb-1" style={{ color: BRAND.navy }}>
                Agreement Updated Successfully
              </h3>
              <div className="grid grid-cols-3 gap-3 mt-5 mb-6 text-left">
                {[
                  ["Agreement Version", `V${applied.version}`],
                  ["Reason", reasonLabel],
                  ["Effective Date", applied.on],
                ].map(([label, value]) => (
                  <div key={label} className="bg-muted/60 rounded-lg p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
                    <p className="text-xs font-bold text-foreground">{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => navigate(`/agreements/history?mouId=${mouId}`)}
                  className={`${SECONDARY_BUTTON} px-4 py-2 text-sm flex-1 justify-center`}
                >
                  View Agreement
                </button>
                <Button className="flex-1 justify-center" onClick={() => navigate("/")}>
                  Go to Dashboard
                </Button>
              </div>
            </div>
          </div>
        </ModalFrame>
      )}
    </>
  );
}

export function EditAgreementScreen() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<{ readonly mouId: string; readonly names: AgreementNames; readonly key: number } | null>(null);
  const cascade = useCascadingSelectors({ onError: setError });
  const { zones, zoneId, companies, companyId, plants, plantId, mous, mouId } = cascade;

  // Choosing any select clears the ones after it (the hook) and closes the opened agreement.
  const choose = (change: () => unknown) => {
    setOpened(null);
    setError("");
    void change();
  };

  const open = () => {
    const nameOf = <T,>(items: readonly T[], match: (item: T) => boolean, name: (item: T) => string) => {
      const found = items.find(match);
      return found === undefined ? PENDING_FIGURE : name(found);
    };
    setOpened({
      mouId,
      key: Date.now(),
      names: {
        company: nameOf(companies, (company) => company.id === companyId, (company) => company.name),
        zone: nameOf(zones, (zone) => zone.id === zoneId, (zone) => zone.name),
        plant: nameOf(plants, (plant) => plant.id === plantId, (plant) => plant.plantName),
      },
    });
  };

  return (
    <ScreenFrame
      title="Edit Agreement"
      subtitle="Amend or update an existing MoU record"
      // Shrink-to-fit like Figma until an agreement opens; then full width, so the
      // layout no longer narrows on tabs whose rows happen to be short.
      contentClassName={`p-4 md:p-6 ${opened === null ? "" : "w-full"} max-w-5xl mx-auto space-y-4 md:space-y-5`}
    >
      <nav className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <button type="button" onClick={() => navigate("/")} className="hover:underline" style={{ color: BRAND.blue }}>
          Dashboard
        </button>
        <span>
          <Icon name="chevronRight" className="w-4 h-4" strokeWidth={2} />
        </span>
        <span>Company</span>
        <span>
          <Icon name="chevronRight" className="w-4 h-4" strokeWidth={2} />
        </span>
        <span style={{ color: BRAND.navy }}>Edit Agreement</span>
      </nav>

      {error !== "" && (
        <div role="alert" className={ALERT_CLASS}>
          {error}
        </div>
      )}

      <Card className="p-5">
        <SectionTitle>Select Agreement</SectionTitle>
        <div className="flex flex-wrap gap-3 items-end">
          <AgreementSelect
            id="edit-zone"
            label="Zone"
            widthClass="min-w-[140px]"
            options={zones.map((zone) => ({ value: zone.id, label: zone.name }))}
            value={zoneId}
            onChange={(value) => choose(() => cascade.handleZoneChange(value))}
          />
          {zoneId !== "" && (
            <AgreementSelect
              id="edit-company"
              label="Company"
              widthClass="min-w-[180px]"
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
              value={companyId}
              onChange={(value) => choose(() => cascade.handleCompanyChange(value))}
            />
          )}
          {companyId !== "" && (
            <AgreementSelect
              id="edit-plant"
              label="Plant"
              widthClass="min-w-[150px]"
              options={plants.map((plant) => ({ value: plant.id, label: plant.plantName }))}
              value={plantId}
              onChange={(value) => choose(() => cascade.handlePlantChange(value))}
            />
          )}
          {plantId !== "" && mous.length > 0 && (
            <AgreementSelect
              id="edit-scheme"
              label="Scheme"
              widthClass="min-w-[140px]"
              options={mous.map((mou) => ({ value: mou.mouId, label: schemeLabel(mou.scheme) }))}
              value={mouId}
              onChange={(value) => choose(() => cascade.setMouId(value))}
            />
          )}
          {mouId !== "" && <Button onClick={open}>OK</Button>}
        </div>
        {plantId !== "" && mous.length === 0 && (
          <p className="mt-3 text-xs text-muted-foreground">No MoUs are recorded for this company plant.</p>
        )}
      </Card>

      {opened !== null && <AgreementEditor key={opened.key} mouId={opened.mouId} names={opened.names} />}
    </ScreenFrame>
  );
}
