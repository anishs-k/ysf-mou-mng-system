/**
 * Purpose: The Add New Company wizard - four steps (Company Details, Commercial
 * Details, Payroll, Review & Save) under a progress stepper, wired to the draft API.
 * Each Save & Continue runs that step's @mou/domain rules (step 1 also the server's
 * GST / duplicate check) and persists the draft; the PDF uploads to the draft; the
 * last step submits it and shows the generated MoU code. A saved draft is offered
 * for resume on arrival. AppShell already refuses VIEWERs on this path. SPEC-22:
 * a Manual / Bulk switch on top; Bulk Upload hides the whole wizard for BulkUploadPanel.
 */

import { formatMoUDisplayCode } from "@mou/domain";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import type { Draft } from "../api/client.ts";
import {
  ApiError,
  deleteDraft,
  fetchEnums,
  fetchZones,
  getDraft,
  saveDraft,
  submitCompany,
  uploadMouDocument,
  validatePage1,
} from "../api/client.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Button } from "../ui/primitives.tsx";
import type { EntryMode } from "./addCompany/BulkUploadPanel.tsx";
import { BulkUploadPanel, EntryModeSwitch } from "./addCompany/BulkUploadPanel.tsx";
import { CommercialDetailsStep } from "./addCompany/CommercialDetailsStep.tsx";
import { CompanyDetailsStep } from "./addCompany/CompanyDetailsStep.tsx";
import type { CommercialForm, CompanyForm, WizardForm, WizardReference } from "./addCompany/formState.ts";
import { NO_REFERENCE, emptyForm, fromDraftPayload, toDraftPayload, toPage1 } from "./addCompany/formState.ts";
import { PayrollStep } from "./addCompany/PayrollStep.tsx";
import { RegisteredState } from "./addCompany/RegisteredState.tsx";
import { ReviewStep } from "./addCompany/ReviewStep.tsx";
import { Stepper } from "./addCompany/Stepper.tsx";
import type { CompanyErrors, CommercialValidation, PayrollValidation } from "./addCompany/validation.ts";
import { hasErrors, validateCommercialStep, validateCompanyStep, validatePayrollStep } from "./addCompany/validation.ts";

const STEPS = ["Company Details", "Commercial Details", "Payroll", "Review & Save"] as const;
const LAST_STEP = STEPS.length - 1;
/** The draft API knows pages 1-3; the Review step is stored as page 3. */
const draftPage = (step: number): number => Math.min(step + 1, 3);

const BACK_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-4 py-2 text-sm";
const ALERT_CLASS = "rounded-lg px-4 py-3 mb-4 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]";

const FIX_FIELDS = "Fix the highlighted fields to continue.";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const NO_COMMERCIAL_ERRORS = { fields: {}, rows: {} } as const;
const NO_PAYROLL_ERRORS: PayrollValidation = { categories: undefined, cards: {} };
const NOT_ATTEMPTED: readonly boolean[] = [false, false, false];

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error && error.message !== "" ? error.message : fallback;
}

/** The browser's own check before the server's %PDF header check. */
function fileProblem(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Only PDF files can be uploaded.";
  if (file.size > MAX_FILE_BYTES) return "The file must be 10 MB or smaller.";
  return null;
}

function stringErrors(errors: Readonly<Record<string, unknown>> | undefined): CompanyErrors {
  return Object.fromEntries(Object.entries(errors ?? {}).filter(([, value]) => typeof value === "string"));
}

function ResumeDraftBanner({ onResume, onDiscard, disabled }: { readonly onResume: () => void; readonly onDiscard: () => void; readonly disabled: boolean }) {
  return (
    <div className="glass-card rounded-xl p-4 mb-4 md:mb-6 flex flex-col sm:flex-row sm:items-center gap-3 border-l-4" style={{ borderColor: "#1B5FAE" }}>
      <div className="flex-1">
        <p className="text-sm font-bold" style={{ color: "#0D2E5A" }}>
          You have an unsaved company draft
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">Resume where you left off, or discard it and start a new company.</p>
      </div>
      <div className="flex gap-2 shrink-0">
        <Button size="sm" variant="ghost" onClick={onDiscard}>
          Discard
        </Button>
        <Button size="sm" onClick={onResume} disabled={disabled}>
          Resume
        </Button>
      </div>
    </div>
  );
}

export function AddCompanyScreen() {
  const navigate = useNavigate();
  const [reference, setReference] = useState<WizardReference>(NO_REFERENCE);
  const [form, setForm] = useState<WizardForm>(emptyForm);
  const [step, setStep] = useState(0);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  /** Errors stay hidden on a step until its Save & Continue has been pressed once. */
  const [attempted, setAttempted] = useState<readonly boolean[]>(NOT_ATTEMPTED);
  const [serverErrors, setServerErrors] = useState<CompanyErrors>({});
  const [serverWarnings, setServerWarnings] = useState<CompanyErrors>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [mode, setMode] = useState<EntryMode>("manual");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchEnums(), fetchZones()])
      .then(([enums, zones]) => {
        if (!cancelled) setReference({ enums, zones });
      })
      .catch(() => {
        if (!cancelled) setBanner("Could not load the form options. Refresh the page to try again.");
      });
    getDraft()
      .then((draft) => {
        if (!cancelled && draft !== null) setPendingDraft(draft);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const companyCheck = useMemo(() => validateCompanyStep(form.company), [form.company]);
  const commercialCheck = useMemo(() => validateCommercialStep(form), [form]);
  const payrollCheck = useMemo(() => validatePayrollStep(form), [form]);

  const companyErrors: CompanyErrors = attempted[0] === true ? { ...companyCheck.errors, ...serverErrors } : {};
  const commercialErrors: CommercialValidation =
    attempted[1] === true ? commercialCheck : { ...NO_COMMERCIAL_ERRORS, startDateWarning: commercialCheck.startDateWarning };
  const payrollErrors = attempted[2] === true ? payrollCheck : NO_PAYROLL_ERRORS;

  const markAttempted = (index: number) =>
    setAttempted((current) => current.map((value, position) => value || position === index));

  const updateCompany = (patch: Partial<CompanyForm>) => {
    // Editing step 1 invalidates the server's GST / duplicate verdict.
    setServerErrors({});
    setServerWarnings({});
    setForm((current) => ({ ...current, company: { ...current.company, ...patch } }));
  };
  const updateCommercial = (patch: Partial<CommercialForm>) =>
    setForm((current) => ({ ...current, commercial: { ...current.commercial, ...patch } }));
  const update = <K extends keyof WizardForm>(key: K) => (value: WizardForm[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  /** Saves the whole form as the user's draft; the draft row is upserted per user. */
  async function persist(currentPage: number): Promise<string> {
    const result = await saveDraft(toDraftPayload(form), currentPage);
    setDraftId(result.id);
    // A draft offered for resume has just been overwritten.
    setPendingDraft(null);
    return result.id;
  }

  async function uploadFile(file: File) {
    setUploadError(null);
    const problem = fileProblem(file);
    if (problem !== null) {
      setUploadError(problem);
      return;
    }
    setUploading(true);
    try {
      const id = draftId ?? (await persist(draftPage(step)));
      const meta = await uploadMouDocument(id, file);
      setForm((current) => ({ ...current, commercial: { ...current.commercial, mouDocument: meta } }));
    } catch (error) {
      setUploadError(messageOf(error, "Upload failed"));
    } finally {
      setUploading(false);
    }
  }

  async function checkCompanyOnServer(): Promise<boolean> {
    const server = await validatePage1(toPage1(form.company));
    setServerErrors(server.errors as CompanyErrors);
    setServerWarnings(server.warnings as CompanyErrors);
    return !hasErrors(server.errors);
  }

  async function save() {
    try {
      const id = await persist(3);
      const result = await submitCompany(id);
      setDraftId(null);
      setSavedCode(formatMoUDisplayCode(result.generatedCode));
    } catch (error) {
      setBanner(messageOf(error, "Save failed"));
      if (!(error instanceof ApiError) || error.status !== 422) return;
      // "Page N is not valid": the same rules run here, so marking that step shows its fields.
      const page = /Page (\d)/.exec(error.message)?.[1];
      if (page !== undefined) {
        const index = Number(page) - 1;
        if (index === 0) setServerErrors(stringErrors(error.errors));
        markAttempted(index);
        setStep(index);
      } else if (/PDF/.test(error.message)) {
        updateCommercial({ mouDocument: undefined });
        markAttempted(1);
        setStep(1);
      }
    }
  }

  async function next() {
    setBanner(null);
    if (step === LAST_STEP) {
      setBusy(true);
      await save();
      setBusy(false);
      return;
    }
    markAttempted(step);
    const stepHasErrors = [
      hasErrors(companyCheck.errors),
      hasErrors(commercialCheck.fields) || hasErrors(commercialCheck.rows),
      hasErrors(payrollCheck),
    ][step];
    if (stepHasErrors === true) {
      setBanner(FIX_FIELDS);
      return;
    }
    setBusy(true);
    try {
      if (step === 0 && !(await checkCompanyOnServer())) {
        setBanner(FIX_FIELDS);
        return;
      }
      await persist(draftPage(step + 1));
      setStep(step + 1);
    } catch (error) {
      setBanner(messageOf(error, "Could not save the draft"));
    } finally {
      setBusy(false);
    }
  }

  function back() {
    setBanner(null);
    setStep(step - 1);
  }

  async function cancel() {
    if (draftId !== null) await deleteDraft(draftId).catch(() => undefined);
    navigate("/");
  }

  function resume() {
    if (pendingDraft === null) return;
    setForm(fromDraftPayload(pendingDraft.payload, reference.enums.commercialItems.map((item) => item.key)));
    setDraftId(pendingDraft.id);
    setStep(Math.min(Math.max(pendingDraft.currentPage - 1, 0), LAST_STEP - 1));
    setAttempted(NOT_ATTEMPTED);
    setServerErrors({});
    setServerWarnings({});
    setPendingDraft(null);
  }

  function discard() {
    if (pendingDraft !== null) void deleteDraft(pendingDraft.id).catch(() => undefined);
    setPendingDraft(null);
  }

  function restart() {
    setForm(emptyForm());
    setStep(0);
    setDraftId(null);
    setAttempted(NOT_ATTEMPTED);
    setServerErrors({});
    setServerWarnings({});
    setUploadError(null);
    setBanner(null);
    setSavedCode(null);
  }

  if (savedCode !== null) {
    return <RegisteredState mouCode={savedCode} onAddAnother={restart} onDashboard={() => navigate("/")} />;
  }

  const frame = (children: ReactNode) => (
    <ScreenFrame
      title="Add New Company"
      subtitle="Register a company for MoU / Apprenticeship scheme"
      contentClassName="p-4 md:p-6 max-w-5xl mx-auto"
    >
      <EntryModeSwitch mode={mode} onChange={setMode} />
      {children}
    </ScreenFrame>
  );

  // SPEC-22 section 2: bulk mode shows nothing of the wizard. Its state is kept,
  // so switching back to Manual Entry resumes where the user was.
  if (mode === "bulk") {
    return frame(<BulkUploadPanel />);
  }

  return frame(
    <>
      {pendingDraft !== null && (
        <ResumeDraftBanner onResume={resume} onDiscard={discard} disabled={reference === NO_REFERENCE} />
      )}
      <Stepper steps={STEPS} current={step} />
      {banner !== null && (
        <div role="alert" className={ALERT_CLASS}>
          {banner}
        </div>
      )}
      {step === 0 && (
        <CompanyDetailsStep
          company={form.company}
          onChange={updateCompany}
          errors={companyErrors}
          warnings={{ ...companyCheck.warnings, ...serverWarnings }}
          reference={reference}
        />
      )}
      {step === 1 && (
        <CommercialDetailsStep
          commercial={form.commercial}
          onChange={updateCommercial}
          charges={form.charges}
          onChargesChange={update("charges")}
          errors={commercialErrors}
          reference={reference}
          onPickFile={(file) => void uploadFile(file)}
          uploading={uploading}
          uploadError={uploadError}
        />
      )}
      {step === 2 && (
        <PayrollStep
          categories={form.categories}
          onCategoriesChange={update("categories")}
          errors={payrollErrors}
        />
      )}
      {step === LAST_STEP && <ReviewStep form={form} reference={reference} />}
      <div className="flex items-center justify-between mt-6 pt-4">
        <button type="button" className={BACK_BUTTON} disabled={busy} onClick={() => (step === 0 ? void cancel() : back())}>
          {step === 0 ? "← Cancel" : "← Back"}
        </button>
        {step < LAST_STEP ? (
          <Button onClick={() => void next()} disabled={busy || uploading}>
            {busy ? "Saving…" : "Save & Continue →"}
          </Button>
        ) : (
          <Button variant="accent" onClick={() => void next()} disabled={busy}>
            <Icon name="check" className="w-4 h-4" strokeWidth={2.5} />
            {busy ? "Saving…" : "Generate Code & Save"}
          </Button>
        )}
      </div>
    </>,
  );
}
