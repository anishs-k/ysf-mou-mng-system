/**
 * Purpose: Wizard step 3 - one card per trainee category (name, qualification,
 * stipend rate; at least one, names unique), then the Fixed Payroll Items: every
 * fixed item of /api/enums payrollItems, grouped into allowances and deductions,
 * answered with a compact Yes/No toggle and an amount when Yes, plus repeatable
 * "Other" payroll rows with their own label and Allowance/Deduction type.
 */

import type { ChangeEvent } from "react";

import type { PayrollItemOption } from "../../api/client.ts";
import { SelectInput, TextInput } from "../../ui/form.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Card, SectionTitle } from "../../ui/primitives.tsx";
import { ErrorText, HiddenLabel, ToggleGroup } from "./fields.tsx";
import type { CategoryCard, OtherRow, PayrollAnswer, WizardReference } from "./formState.ts";
import { blankCategory, blankOtherRow } from "./formState.ts";
import type { PayrollValidation } from "./validation.ts";
import { invalidBorder } from "./validation.ts";

const INPUT_CLASS =
  "h-10 px-3 border border-border rounded-lg text-sm bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition-all";

const CATEGORY_FIELDS = [
  { field: "name", label: "Trainee Category", placeholder: "e.g. ITI Graduate, Diploma…", type: "text", required: true },
  { field: "qualification", label: "Qualification", placeholder: "e.g. 10th Pass, B.Tech…", type: "text", required: false },
  { field: "stipendRate", label: "Stipend Rate (₹)", placeholder: "e.g. 8000", type: "number", required: false },
] as const;

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

const yesNoLook = (value: string): string =>
  value === "yes" ? "bg-[#39B54A] border-[#39B54A] text-white" : "bg-[#5A7AA8] border-[#5A7AA8] text-white";

interface PayrollStepProps {
  readonly categories: readonly CategoryCard[];
  readonly onCategoriesChange: (cards: readonly CategoryCard[]) => void;
  readonly answers: Readonly<Record<string, PayrollAnswer>>;
  readonly onAnswersChange: (answers: Readonly<Record<string, PayrollAnswer>>) => void;
  readonly otherRows: readonly OtherRow[];
  readonly onOtherRowsChange: (rows: readonly OtherRow[]) => void;
  /** Empty until Save & Continue has been pressed once. */
  readonly errors: PayrollValidation;
  readonly reference: WizardReference;
}

function PayrollItemRow({
  item,
  answer,
  error,
  onChange,
}: {
  readonly item: PayrollItemOption;
  readonly answer: PayrollAnswer | undefined;
  readonly error: string | undefined;
  readonly onChange: (answer: PayrollAnswer) => void;
}) {
  const choice = answer?.isApplicable === undefined ? "" : answer.isApplicable ? "yes" : "no";
  const amountId = `payroll-${item.key}-amount`;
  return (
    <div className="py-2 border-b border-border last:border-b-0">
      <div className="flex items-center gap-3">
        <p className="flex-1 min-w-0 text-sm font-medium text-foreground">{item.label}</p>
        {answer?.isApplicable === true && (
          <div className="w-28 shrink-0">
            <HiddenLabel htmlFor={amountId}>{`${item.label} amount`}</HiddenLabel>
            <TextInput
              id={amountId}
              type="number"
              placeholder="₹"
              value={answer.amount}
              onChange={(amount) => onChange({ isApplicable: true, amount })}
              className={`w-full h-8! ${invalidBorder(error)}`}
            />
          </div>
        )}
        <ToggleGroup
          name={item.label}
          options={YES_NO}
          value={choice}
          size="sm"
          activeClass={yesNoLook}
          onChange={(value) => onChange({ isApplicable: value === "yes", amount: answer?.amount ?? "" })}
        />
      </div>
      <ErrorText message={error} />
    </div>
  );
}

export function PayrollStep({
  categories,
  onCategoriesChange,
  answers,
  onAnswersChange,
  otherRows,
  onOtherRowsChange,
  errors,
  reference,
}: PayrollStepProps) {
  const { enums } = reference;
  const fixedItems = enums.payrollItems.filter((item) => item.itemType !== null);
  const answered = fixedItems.filter((item) => answers[item.key]?.isApplicable !== undefined).length;
  const groups = [
    { title: "Allowances", items: fixedItems.filter((item) => item.itemType === "ALLOWANCE") },
    { title: "Deductions", items: fixedItems.filter((item) => item.itemType === "DEDUCTION") },
  ];

  const updateCard = (id: number, patch: Partial<CategoryCard>) =>
    onCategoriesChange(categories.map((card) => (card.id === id ? { ...card, ...patch } : card)));
  const updateOther = (id: number, patch: Partial<OtherRow>) =>
    onOtherRowsChange(otherRows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

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

      <Card className="p-6">
        <SectionTitle>Fixed Payroll Items</SectionTitle>
        <p className="text-xs text-muted-foreground -mt-2 mb-4">
          Answer Yes or No for every item and enter the amount when Yes · {answered} of {fixedItems.length} answered
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">{group.title}</p>
              {group.items.map((item) => (
                <PayrollItemRow
                  key={item.key}
                  item={item}
                  answer={answers[item.key]}
                  error={errors.items[item.key]}
                  onChange={(answer) => onAnswersChange({ ...answers, [item.key]: answer })}
                />
              ))}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle>Other Payroll Items</SectionTitle>
        <div className="space-y-3">
          {otherRows.map((row, index) => {
            const n = index + 1;
            const rowErrors = errors.other[row.id] ?? {};
            return (
              <div key={row.id} className="space-y-1">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-start">
                  <div>
                    <HiddenLabel htmlFor={`payroll-other-${row.id}-label`}>{`Other item name ${n}`}</HiddenLabel>
                    <TextInput
                      id={`payroll-other-${row.id}-label`}
                      placeholder="Item name"
                      value={row.label}
                      onChange={(label) => updateOther(row.id, { label })}
                      className={`w-full ${invalidBorder(rowErrors.label)}`}
                    />
                  </div>
                  <div>
                    <HiddenLabel htmlFor={`payroll-other-${row.id}-amount`}>{`Other item amount ${n}`}</HiddenLabel>
                    <TextInput
                      id={`payroll-other-${row.id}-amount`}
                      type="number"
                      placeholder="Amount (₹)"
                      value={row.amount}
                      onChange={(amount) => updateOther(row.id, { amount })}
                      className={`w-full ${invalidBorder(rowErrors.amount)}`}
                    />
                  </div>
                  <div>
                    <HiddenLabel htmlFor={`payroll-other-${row.id}-type`}>{`Other item type ${n}`}</HiddenLabel>
                    <SelectInput
                      id={`payroll-other-${row.id}-type`}
                      options={enums.itemTypes}
                      value={row.itemType}
                      placeholder="Allowance / Deduction…"
                      onChange={(itemType) => updateOther(row.id, { itemType })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onOtherRowsChange(otherRows.filter((other) => other.id !== row.id))}
                    className="h-10 text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-1 text-xs font-semibold"
                  >
                    <Icon name="close" className="w-4 h-4" strokeWidth={2} />
                    Remove
                  </button>
                </div>
                <ErrorText
                  message={[rowErrors.label, rowErrors.amount, rowErrors.itemType].filter((message) => message !== undefined).join(" · ") || undefined}
                />
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => onOtherRowsChange([...otherRows, blankOtherRow()])}
            className="inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary border-border hover:bg-blue-100 px-3 py-1.5 text-xs"
          >
            <Icon name="plus" className="w-4 h-4" strokeWidth={2.2} />
            Add Other Item
          </button>
        </div>
      </Card>
    </div>
  );
}
