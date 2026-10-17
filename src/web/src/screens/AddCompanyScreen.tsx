/**
 * Purpose: The Add New Company wizard - a four-step flow (Company Details,
 * Commercial Details, Payroll, Review & Save) under a progress stepper. The screen
 * owns every typed value so Back/Next keep them; saving shows the registered state.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { GENERATED_MOU_CODE } from "../data/addCompanyOptions.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Button } from "../ui/primitives.tsx";
import { CommercialDetailsStep } from "./addCompany/CommercialDetailsStep.tsx";
import { CompanyDetailsStep } from "./addCompany/CompanyDetailsStep.tsx";
import type { FormValues } from "./addCompany/formState.ts";
import { PayrollStep } from "./addCompany/PayrollStep.tsx";
import { RegisteredState } from "./addCompany/RegisteredState.tsx";
import { ReviewStep } from "./addCompany/ReviewStep.tsx";
import { Stepper } from "./addCompany/Stepper.tsx";

const STEPS = ["Company Details", "Commercial Details", "Payroll", "Review & Save"] as const;
const LAST_STEP = STEPS.length - 1;

const BACK_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-4 py-2 text-sm";

export function AddCompanyScreen() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [saved, setSaved] = useState(false);
  const [values, setValues] = useState<FormValues>({});
  const [charges, setCharges] = useState<readonly number[]>([1]);
  const [categories, setCategories] = useState<readonly number[]>([1]);
  const [nextId, setNextId] = useState(2);

  const setValue = (key: string, value: string) => setValues((current) => ({ ...current, [key]: value }));
  /** Appends a fresh row id to a charge or category list. */
  const appendRow = (setList: (update: (list: readonly number[]) => readonly number[]) => void) => {
    const id = nextId;
    setNextId(id + 1);
    setList((list) => [...list, id]);
  };

  const restart = () => {
    setValues({});
    setCharges([1]);
    setCategories([1]);
    setStep(0);
    setSaved(false);
  };

  if (saved) {
    return <RegisteredState mouCode={GENERATED_MOU_CODE} onAddAnother={restart} onDashboard={() => navigate("/")} />;
  }

  return (
    <ScreenFrame
      title="Add New Company"
      subtitle="Register a company for MoU / Apprenticeship scheme"
      contentClassName="p-4 md:p-6 max-w-5xl mx-auto"
    >
      <Stepper steps={STEPS} current={step} />
      {step === 0 && <CompanyDetailsStep values={values} onChange={setValue} />}
      {step === 1 && (
        <CommercialDetailsStep
          values={values}
          onChange={setValue}
          charges={charges}
          onAddCharge={() => appendRow(setCharges)}
          onRemoveCharge={(id) => setCharges((list) => list.filter((item) => item !== id))}
        />
      )}
      {step === 2 && (
        <PayrollStep
          values={values}
          onChange={setValue}
          categories={categories}
          onAddCategory={() => appendRow(setCategories)}
          onRemoveCategory={(id) => setCategories((list) => list.filter((item) => item !== id))}
        />
      )}
      {step === LAST_STEP && <ReviewStep />}
      <div className="flex items-center justify-between mt-6 pt-4">
        <button type="button" className={BACK_BUTTON} onClick={() => (step === 0 ? navigate("/") : setStep(step - 1))}>
          {step === 0 ? "← Cancel" : "← Back"}
        </button>
        {step < LAST_STEP ? (
          <Button onClick={() => setStep(step + 1)}>Save &amp; Continue →</Button>
        ) : (
          <Button variant="accent" onClick={() => setSaved(true)}>
            <Icon name="check" className="w-4 h-4" strokeWidth={2.5} />
            Generate Code &amp; Save
          </Button>
        )}
      </div>
    </ScreenFrame>
  );
}
