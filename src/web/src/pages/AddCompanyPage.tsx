/**
 * Purpose: The SPEC-03 wizard container, extended by SPEC-04 to drive the full
 * Page 1. It manages the 3-step flow, draft persistence via the API, and the
 * final save transaction, and on mount it checks for an existing draft and
 * prompts to resume or discard. A VIEWER who types /companies/new directly sees
 * a "Not available" message instead of the wizard, mirroring the role matrix
 * enforced server-side.
 *
 * Page 1 validation runs in two halves: the shared @mou/domain rules are applied
 * on every render so the user sees mistakes as they type, while the checks that
 * need a database (GST uniqueness, duplicate company) are resolved by
 * POST /api/companies/validate-page1 when Next is pressed, which is what
 * SPEC-04 section 4 means by "run on Next". Pages 2 and 3 (SPEC-05/06) need no
 * such server round trip on Next - every rule is pure, and the one thing that
 * does need the server on Page 2, the PDF, is already validated synchronously
 * at upload time. Page 3 diverges from Pages 1/2 in one way: SPEC-06 AC2 wants
 * Save itself disabled while any of the 22 payroll items is unanswered, not
 * just marked with an error on click.
 */

import { validateCommercialDetails, validateCompanyDetails, validatePayrollDetails } from "@mou/domain";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";

import type { CommercialItemOption, EnumOption, PayrollItemOption, ZoneOption } from "../api/client.ts";
import {
  deleteDraft,
  fetchEnums,
  fetchZones,
  getDraft,
  saveDraft,
  submitCompany,
  uploadMouDocument,
  validatePage1,
} from "../api/client.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import {
  EMPTY_PAGE1,
  Page1,
  type Page1Data,
  type Page1Messages,
} from "../components/wizard/Page1.tsx";
import { EMPTY_PAGE2, Page2, type Page2Data } from "../components/wizard/Page2.tsx";
import { EMPTY_PAGE3, Page3, type Page3Data } from "../components/wizard/Page3.tsx";
import { WizardShell } from "../components/wizard/WizardShell.tsx";

const DEFAULT_PAGE1: Page1Data = EMPTY_PAGE1;
const DEFAULT_PAGE2: Page2Data = {
  ...EMPTY_PAGE2,
  mouStartDate: new Date().toISOString().split("T")[0],
};
const DEFAULT_PAGE3: Page3Data = EMPTY_PAGE3;

interface WizardState {
  page1: Page1Data;
  page2: Page2Data;
  page3: Page3Data;
  currentStep: number;
  draftId: string | null;
}

/** Dropdown options, all sourced from the API rather than hardcoded (AC1). */
interface ReferenceData {
  readonly companyTypes: readonly EnumOption[];
  readonly registrationTypes: readonly EnumOption[];
  readonly contactTypes: readonly EnumOption[];
  readonly itemTypes: readonly EnumOption[];
  readonly schemes: readonly EnumOption[];
  readonly commercialItems: readonly CommercialItemOption[];
  readonly payrollItems: readonly PayrollItemOption[];
  readonly zones: readonly ZoneOption[];
}

const NO_REFERENCE: ReferenceData = {
  companyTypes: [],
  registrationTypes: [],
  contactTypes: [],
  itemTypes: [],
  schemes: [],
  commercialItems: [],
  payrollItems: [],
  zones: [],
};

/** Roles that may create or amend agreements — the SPEC-02 section 3.3 matrix. */
const AUTHORING_ROLES: readonly string[] = ["ADMIN", "DATA_ENTRY"];

export function AddCompanyPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { openMobileMenu } = useOutletContext<AppShellContext>();

  const [state, setState] = useState<WizardState>({
    page1: DEFAULT_PAGE1,
    page2: DEFAULT_PAGE2,
    page3: DEFAULT_PAGE3,
    currentStep: 1,
    draftId: null,
  });

  const [loading, setLoading] = useState(true);
  const [reference, setReference] = useState<ReferenceData>(NO_REFERENCE);
  const [referenceLoading, setReferenceLoading] = useState(true);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ companyId: string; generatedCode: string } | null>(null);

  // SPEC-04: server-resolved Page 1 errors, and whether Next has been attempted.
  const [page1ServerErrors, setPage1ServerErrors] = useState<Page1Messages>({});
  const [page1ServerWarnings, setPage1ServerWarnings] = useState<Page1Messages>({});
  const [page1Attempted, setPage1Attempted] = useState(false);

  // SPEC-05: same withhold-until-Next pattern as Page 1, but no server errors
  // to merge in - every Page 2 rule is pure.
  const [page2Attempted, setPage2Attempted] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // SPEC-06: same pattern again for Page 3.
  const [page3Attempted, setPage3Attempted] = useState(false);

  // On mount: check for an existing draft.
  useEffect(() => {
    let cancelled = false;
    getDraft()
      .then((draft) => {
        if (cancelled) return;
        if (draft !== null) {
          setState({
            page1: { ...EMPTY_PAGE1, ...(draft.payload.page1 as Partial<Page1Data> | undefined) },
            page2: { ...DEFAULT_PAGE2, ...(draft.payload.page2 as Partial<Page2Data> | undefined) },
            page3: { ...DEFAULT_PAGE3, ...(draft.payload.page3 as Partial<Page3Data> | undefined) },
            currentStep: draft.currentPage,
            draftId: draft.id,
          });
          setShowResumePrompt(true);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // On mount: load every dropdown's options from the API (AC1).
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchEnums(), fetchZones()])
      .then(([enums, zones]) => {
        if (cancelled) return;
        setReference({
          companyTypes: enums.companyTypes,
          registrationTypes: enums.registrationTypes,
          contactTypes: enums.contactTypes,
          itemTypes: enums.itemTypes,
          schemes: enums.schemes,
          commercialItems: enums.commercialItems,
          payrollItems: enums.payrollItems,
          zones,
        });
        setReferenceLoading(false);
      })
      .catch(() => {
        if (!cancelled) setReferenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The shared rules, recomputed as the user types.
  const localPage1 = useMemo(() => validateCompanyDetails(state.page1), [state.page1]);

  // Errors are held back until the user has pressed Next, so a blank form is not
  // covered in red before they have typed anything (AC9 marks the offending
  // fields at the moment it matters). Warnings are advisory and show at once.
  const page1Errors: Page1Messages = page1Attempted
    ? { ...localPage1.errors, ...page1ServerErrors }
    : {};
  const page1Warnings: Page1Messages = { ...localPage1.warnings, ...page1ServerWarnings };

  // SPEC-05: the same pure-rules-recomputed-on-every-render pattern as Page 1.
  // `today` is read once per render rather than inside the pure validator
  // itself, matching validateCommercialDetails's own `today`-as-argument shape.
  const localPage2 = useMemo(
    () =>
      validateCommercialDetails(
        {
          ...state.page2,
          hasMouDocument: state.page2.mouDocument !== undefined,
        },
        new Date().toISOString().slice(0, 10),
      ),
    [state.page2],
  );
  const page2Errors = page2Attempted ? localPage2.errors : {};

  // SPEC-06: same pure-rules-recomputed-on-every-render pattern again.
  const localPage3 = useMemo(() => validatePayrollDetails(state.page3), [state.page3]);
  const page3Errors = page3Attempted ? localPage3.errors : {};

  // SPEC-02 section 3.3: a VIEWER who types /companies/new directly is refused
  // at the UI level as well as by the server. This guard closes the URL-typing
  // hole. It is placed after all hooks so React's rules of hooks are respected.
  if (user !== null && !AUTHORING_ROLES.includes(user.role)) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-2xl rounded-xl bg-white p-8 shadow-sm border border-border">
          <h1 className="text-base font-medium text-foreground">Not available</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your role ({user.role}) does not have access to this screen.
          </p>
        </div>
      </div>
    );
  }

  /** Editing Page 1 invalidates any server verdict already shown. */
  function updatePage1(page1: Page1Data) {
    setPage1ServerErrors({});
    setPage1ServerWarnings({});
    setState((prev) => ({ ...prev, page1 }));
  }

  function updatePage2(page2: Page2Data) {
    setState((prev) => ({ ...prev, page2 }));
  }

  function updatePage3(page3: Page3Data) {
    setState((prev) => ({ ...prev, page3 }));
  }

  /**
   * Uploaded and validated server-side immediately (SPEC-05 section 4), rather
   * than waiting for Next, so a bad file is caught the moment it is chosen. The
   * draft row is updated by the upload endpoint itself, so an explicit
   * saveDraft is not needed here for the metadata to survive a refresh.
   */
  async function handleUploadDocument(file: File) {
    if (state.draftId === null) {
      return;
    }
    setIsUploadingDocument(true);
    setUploadError(null);
    try {
      const meta = await uploadMouDocument(state.draftId, file);
      setState((prev) => ({ ...prev, page2: { ...prev.page2, mouDocument: meta } }));
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setIsUploadingDocument(false);
    }
  }

  async function persistDraft(nextStep: number, nextState: Partial<WizardState> = {}) {
    const payload = {
      page1: { ...state.page1, ...nextState.page1 },
      page2: { ...state.page2, ...nextState.page2 },
      page3: { ...state.page3, ...nextState.page3 },
    };
    try {
      const result = await saveDraft(payload, nextStep);
      setState((prev) => ({
        ...prev,
        ...nextState,
        currentStep: nextStep,
        draftId: result.id,
      }));
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Failed to save draft");
    }
  }

  /** SPEC-06 AC2: how many of the 22 fixed payroll items are still unanswered. */
  function unansweredPayrollCount(): number {
    return reference.payrollItems.filter(
      (item) => item.itemType !== null && state.page3.items[item.key]?.isApplicable === undefined,
    ).length;
  }

  /**
   * Page 1 and Page 2 leave Next enabled even while the form is incomplete,
   * because SPEC-04 AC9 (and SPEC-05's equivalent) want every offending field
   * marked - a disabled button would only leave the user guessing which field
   * is at fault. The button therefore validates on click instead of blocking
   * the click. Page 3 is the one exception: SPEC-06 AC2 requires Save itself
   * to stay disabled while any of the 22 payroll items is unanswered.
   */
  function canProceed(step: number): boolean {
    switch (step) {
      case 1:
      case 2:
        return true;
      case 3:
        return unansweredPayrollCount() === 0;
      default:
        return false;
    }
  }

  async function handleNext() {
    setSubmitError(null);

    if (state.currentStep === 1) {
      setPage1Attempted(true);

      // Half one: the rules the browser can check alone.
      if (Object.keys(localPage1.errors).length > 0) {
        setPage1ServerErrors({});
        return;
      }

      // Half two: the rules that need the database, "run on Next".
      setIsSubmitting(true);
      try {
        const server = await validatePage1({ ...state.page1 });
        setPage1ServerErrors(server.errors);
        setPage1ServerWarnings(server.warnings);
        if (Object.keys(server.errors).length > 0) {
          return;
        }
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "Could not validate Page 1");
        return;
      } finally {
        setIsSubmitting(false);
      }

      await persistDraft(2);
      return;
    }

    if (state.currentStep === 2) {
      setPage2Attempted(true);
      if (Object.keys(localPage2.errors).length > 0) {
        return;
      }
      await persistDraft(3);
      return;
    }

    // Only step 3 (Save) remains at this point.
    setPage3Attempted(true);
    if (Object.keys(localPage3.errors).length > 0) {
      return;
    }
    // Unlike Pages 1/2, Page 3 has no "Next" transition to persist through -
    // Save is the only action - so the draft's page3 payload is still whatever
    // it was when Page 2's Next ran, before the user touched Page 3 at all.
    // Persist the current state first, then submit.
    await persistDraft(3);
    void handleSave();
  }

  async function handleSave() {
    if (state.draftId === null) {
      setSubmitError("No draft to save");
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const result = await submitCompany(state.draftId);
      setSuccess(result);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleBack() {
    if (state.currentStep > 1) {
      void persistDraft(state.currentStep - 1);
    }
  }

  async function handleCancel() {
    if (state.draftId !== null) {
      try {
        await deleteDraft(state.draftId);
      } catch {
        // Ignore errors on cancel.
      }
    }
    navigate("/");
  }

  function handleDiscardAndRestart() {
    setShowResumePrompt(false);
    setState({
      page1: DEFAULT_PAGE1,
      page2: DEFAULT_PAGE2,
      page3: DEFAULT_PAGE3,
      currentStep: 1,
      draftId: null,
    });
    setPage1Attempted(false);
    setPage1ServerErrors({});
    setPage1ServerWarnings({});
    setPage2Attempted(false);
    setUploadError(null);
    setPage3Attempted(false);
    if (state.draftId !== null) {
      void deleteDraft(state.draftId);
    }
  }

  if (loading || referenceLoading) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }

  if (success !== null) {
    const schemeLabel =
      reference.schemes.find((option) => option.value === state.page3.scheme)?.label ?? state.page3.scheme;
    return (
      <>
        <Topbar title="Add New Company" onOpenMenu={openMobileMenu} />
        <div className="p-4 md:p-6 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-xl border-2 border-green-200 bg-green-50/85 p-6">
              <h2 className="mb-2 text-xl font-bold text-green-800">Company Saved</h2>
              <p className="text-green-700">
                <span className="font-semibold">{state.page1.companyName}</span> ({schemeLabel})
              </p>
              <p className="text-green-700">
                Generated code: <span className="font-mono font-semibold">{success.generatedCode}</span>
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => navigate("/")}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {showResumePrompt && (
        <div className="mx-6 mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm text-blue-800">You have an unsaved draft. Would you like to resume where you left off?</p>
          <div className="mt-2 flex gap-3">
            <button
              onClick={() => setShowResumePrompt(false)}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Resume Draft
            </button>
            <button
              onClick={handleDiscardAndRestart}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Discard and Start New
            </button>
          </div>
        </div>
      )}

      <WizardShell
        currentStep={state.currentStep}
        canProceed={canProceed(state.currentStep)}
        canGoBack={state.currentStep > 1}
        isSubmitting={isSubmitting}
        onNext={handleNext}
        onBack={handleBack}
        onCancel={handleCancel}
      >
        {submitError !== null && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{submitError}</div>
        )}
        {state.currentStep === 1 && (
          <Page1
            data={state.page1}
            onChange={updatePage1}
            errors={page1Errors}
            warnings={page1Warnings}
            companyTypes={reference.companyTypes}
            registrationTypes={reference.registrationTypes}
            contactTypes={reference.contactTypes}
            zones={reference.zones}
          />
        )}
        {state.currentStep === 2 && (
          <Page2
            data={state.page2}
            onChange={updatePage2}
            errors={page2Errors}
            warnings={localPage2.warnings}
            commercialItems={reference.commercialItems}
            itemTypes={reference.itemTypes}
            draftId={state.draftId}
            onUploadDocument={(file) => void handleUploadDocument(file)}
            isUploading={isUploadingDocument}
            uploadError={uploadError}
          />
        )}
        {state.currentStep === 3 && (
          <Page3
            data={state.page3}
            onChange={updatePage3}
            errors={page3Errors}
            schemes={reference.schemes}
            payrollItems={reference.payrollItems}
            itemTypes={reference.itemTypes}
          />
        )}
      </WizardShell>
    </div>
  );
}
