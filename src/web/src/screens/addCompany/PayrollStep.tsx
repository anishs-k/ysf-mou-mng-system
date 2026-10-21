/**
 * Purpose: Wizard step 3 - one card per trainee category (name, qualification,
 * stipend rate; at least one, names unique). D158: the step asks nothing else -
 * no fixed payroll items and no Other payroll rows; the server saves PF, ESI and
 * TDS with their statutory defaults (D148), and Edit Agreement is where they change.
 */

import type { ChangeEvent } from "react";

import { Icon } from "../../ui/Icon.tsx";
import { Card } from "../../ui/primitives.tsx";
import { ErrorText } from "./fields.tsx";
import type { CategoryCard } from "./formState.ts";
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
  /** Empty until Save & Continue has been pressed once. */
  readonly errors: PayrollValidation;
}

export function PayrollStep({ categories, onCategoriesChange, errors }: PayrollStepProps) {
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
    </div>
  );
}
