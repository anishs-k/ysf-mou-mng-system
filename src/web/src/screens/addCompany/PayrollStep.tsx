/**
 * Purpose: Wizard step 3 - one card per trainee category (name, qualification,
 * stipend rate; at least one, names unique). D158: the step asks nothing else -
 * no fixed payroll items and no Other payroll rows; the server saves PF, ESI and
 * TDS with their statutory defaults (D148), and Edit Agreement is where they change.
 * SPEC-31: an optional Other Payroll Terms card - the amount recovered when a
 * trainee leaves (with a note) and who pays the education fee.
 */

import { EDUCATION_FEE_PAYER_OPTIONS, isEducationFeePayerShown } from "@mou/domain";
import type { Organisation } from "@mou/domain";
import type { ChangeEvent } from "react";

import { Field, SelectInput, TextInput } from "../../ui/form.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Card, SectionTitle } from "../../ui/primitives.tsx";
import { ErrorText } from "./fields.tsx";
import type { CategoryCard, PayrollTermsForm } from "./formState.ts";
import { blankCategory } from "./formState.ts";
import type { PayrollValidation } from "./validation.ts";
import { invalidBorder } from "./validation.ts";

const INPUT_CLASS =
  "h-10 px-3 border border-border rounded-lg text-sm bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all";

const CATEGORY_FIELDS = [
  { field: "name", label: "Trainee Category", placeholder: "e.g. ITI Graduate, Diploma…", type: "text", required: true },
  { field: "qualification", label: "Qualification", placeholder: "e.g. 10th Pass, B.Tech…", type: "text", required: false },
  { field: "stipendRate", label: "Stipend Rate (₹)", placeholder: "e.g. 8000", type: "number", required: false },
] as const;

interface PayrollStepProps {
  readonly categories: readonly CategoryCard[];
  readonly onCategoriesChange: (cards: readonly CategoryCard[]) => void;
  readonly terms: PayrollTermsForm;
  readonly onTermsChange: (terms: PayrollTermsForm) => void;
  /** Empty until Save & Continue has been pressed once. */
  readonly errors: PayrollValidation;
  /** SPEC-34: YSF or YSI; "Education Fee Paid By" is asked for YSI only. */
  readonly organisation: Organisation | "";
}

/** SPEC-31: the optional payroll terms below the category cards. */
function PayrollTerms({
  terms,
  onChange,
  errors,
  showFeePayer,
}: {
  readonly terms: PayrollTermsForm;
  readonly onChange: (terms: PayrollTermsForm) => void;
  readonly errors: PayrollValidation["terms"];
  readonly showFeePayer: boolean;
}) {
  const set = (key: keyof PayrollTermsForm) => (value: string) => onChange({ ...terms, [key]: value });
  return (
    <Card className="p-6">
      <SectionTitle>Other Payroll Terms</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        <Field label="Left Trainee Recovery (₹)" htmlFor="left-trainee-amount" hint="Recovered when a trainee leaves">
          <TextInput
            id="left-trainee-amount"
            type="number"
            placeholder="e.g. 500"
            value={terms.leftTraineeAmount}
            onChange={set("leftTraineeAmount")}
            className={invalidBorder(errors.leftTraineeAmount)}
          />
          <ErrorText message={errors.leftTraineeAmount} />
        </Field>
        <Field label="Left Trainee Recovery Note" htmlFor="left-trainee-note" hint="Up to 500 characters">
          <TextInput
            id="left-trainee-note"
            placeholder="e.g. Deducted from the last stipend"
            value={terms.leftTraineeNote}
            onChange={set("leftTraineeNote")}
            className={invalidBorder(errors.leftTraineeNote)}
          />
          <ErrorText message={errors.leftTraineeNote} />
        </Field>
        {/* SPEC-34: a YSI question - shown for YSF only if a value is left over to clear. */}
        {(showFeePayer || terms.educationFeePayer !== "") && (
          <Field label="Education Fee Paid By" htmlFor="education-fee-payer">
            <SelectInput id="education-fee-payer" options={EDUCATION_FEE_PAYER_OPTIONS} value={terms.educationFeePayer} onChange={set("educationFeePayer")} />
            <ErrorText message={errors.educationFeePayer} />
          </Field>
        )}
      </div>
    </Card>
  );
}

export function PayrollStep({ categories, onCategoriesChange, terms, onTermsChange, errors, organisation }: PayrollStepProps) {
  const updateCard = (id: number, patch: Partial<CategoryCard>) =>
    onCategoriesChange(categories.map((card) => (card.id === id ? { ...card, ...patch } : card)));

  return (
    <div className="space-y-5">
      {categories.map((card, index) => {
        const cardErrors = errors.cards[card.id] ?? {};
        return (
          <Card key={card.id} className="p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "#0D2E5A" }}>
                Trainee Category {index + 1}
              </p>
              {categories.length > 1 && (
                <button
                  type="button"
                  aria-label={`Remove trainee category ${index + 1}`}
                  onClick={() => onCategoriesChange(categories.filter((other) => other.id !== card.id))}
                  className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors shrink-0"
                >
                  <Icon name="close" className="w-4 h-4" strokeWidth={2} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {CATEGORY_FIELDS.map((spec) => {
                const id = `category-${card.id}-${spec.field}`;
                const error = cardErrors[spec.field];
                return (
                  <div key={spec.field} className="flex flex-col gap-1">
                    <label htmlFor={id} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {spec.label}
                      {spec.required && <span className="text-red-500 ml-0.5">*</span>}
                    </label>
                    <input
                      id={id}
                      type={spec.type}
                      placeholder={spec.placeholder}
                      value={card[spec.field]}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => updateCard(card.id, { [spec.field]: event.target.value })}
                      className={`${INPUT_CLASS} ${invalidBorder(error)}`}
                    />
                    <ErrorText message={error} />
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
      <ErrorText message={errors.categories} />
      <button
        type="button"
        onClick={() => onCategoriesChange([...categories, blankCategory()])}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-dashed border-[#1B5FAE]/40 text-sm font-bold text-[#1B5FAE] hover:bg-[#E8F0FB] hover:border-[#1B5FAE] transition-all"
      >
        <Icon name="plus" className="w-4 h-4" strokeWidth={2.2} />
        Add New Category
      </button>
      <PayrollTerms showFeePayer={isEducationFeePayerShown(organisation === "" ? undefined : organisation)} terms={terms} onChange={onTermsChange} errors={errors.terms} />
    </div>
  );
}
