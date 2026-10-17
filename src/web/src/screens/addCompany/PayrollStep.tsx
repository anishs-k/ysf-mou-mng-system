/**
 * Purpose: Wizard step 3 - one card per trainee category (category, qualification,
 * stipend rate); categories can be added, and removed while more than one exists.
 */

import type { ChangeEvent } from "react";

import { Icon } from "../../ui/Icon.tsx";
import { Card } from "../../ui/primitives.tsx";
import type { StepFormProps } from "./formState.ts";

const INPUT_CLASS =
  "h-10 px-3 border border-border rounded-lg text-sm bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all";

const CATEGORY_FIELDS = [
  { suffix: "Category", label: "Trainee Category", placeholder: "e.g. ITI Graduate, Diploma…", type: "text" },
  { suffix: "Qualification", label: "Qualification", placeholder: "e.g. 10th Pass, B.Tech…", type: "text" },
  { suffix: "Stipend", label: "Stipend Rate (₹)", placeholder: "e.g. 8000", type: "number" },
] as const;

interface PayrollStepProps extends StepFormProps {
  /** Ids of the trainee-category cards currently shown. */
  readonly categories: readonly number[];
  readonly onAddCategory: () => void;
  readonly onRemoveCategory: (id: number) => void;
}

export function PayrollStep({ values, onChange, categories, onAddCategory, onRemoveCategory }: PayrollStepProps) {
  return (
    <div className="space-y-5">
      {categories.map((id, index) => (
        <Card key={id} className="p-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-bold uppercase tracking-wide" style={{ color: "#0D2E5A" }}>
              Trainee Category {index + 1}
            </p>
            {categories.length > 1 && (
              <button
                type="button"
                onClick={() => onRemoveCategory(id)}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors shrink-0"
              >
                <Icon name="close" className="w-4 h-4" strokeWidth={2} />
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
            {CATEGORY_FIELDS.map((field) => {
              const key = `category${id}${field.suffix}`;
              return (
                <div key={field.suffix} className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {field.label}
                    <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={values[key] ?? ""}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(key, event.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      <button
        type="button"
        onClick={onAddCategory}
        className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-xl border-2 border-dashed border-[#1B5FAE]/40 text-sm font-bold text-[#1B5FAE] hover:bg-[#E8F0FB] hover:border-[#1B5FAE] transition-all"
      >
        <Icon name="plus" className="w-4 h-4" strokeWidth={2.2} />
        Add New Category
      </button>
    </div>
  );
}
