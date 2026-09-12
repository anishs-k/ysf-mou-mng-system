/**
 * Purpose: Wizard Page 3, the SPEC-06 Payroll Details form - scheme selection,
 * repeatable trainee categories, the Yes/No + amount answer for all 22 fixed
 * payroll items (rendered from the payrollItems catalogue, never hardcoded,
 * same AC1 ethos as Pages 1 and 2), and repeatable "Other" rows. Rule checking
 * lives in @mou/domain's validatePayrollDetails; this component only renders
 * the errors it is handed and the "N of 22 answered" progress count AC2 asks
 * for. Switching an item from Yes to No clears its amount locally (AC4) -
 * the pure validator does not need to re-derive that UI rule.
 */

import { PAYROLL_FIXED_ITEM_KEYS } from "@mou/domain";
import type { PayrollDetailErrors } from "@mou/domain";

import type { EnumOption, PayrollItemOption } from "../../api/client.ts";

export interface OtherPayrollRowInput {
  label: string;
  amount: string;
  itemType: string;
}

/** undefined means "not yet answered" - distinct from an explicit No. */
export interface PayrollItemAnswerInput {
  isApplicable: boolean | undefined;
  amount: string;
}

export interface Page3Data {
  scheme: string;
  traineeCategories: string[];
  /** Keyed by the 22 fixed PayrollItemKeys. */
  items: Record<string, PayrollItemAnswerInput>;
  otherItems: OtherPayrollRowInput[];
}

function emptyItems(): Record<string, PayrollItemAnswerInput> {
  const items: Record<string, PayrollItemAnswerInput> = {};
  for (const key of PAYROLL_FIXED_ITEM_KEYS) {
    items[key] = { isApplicable: undefined, amount: "" };
  }
  return items;
}

/** Every field starts blank; all 22 items start unanswered. */
// eslint-disable-next-line react-refresh/only-export-components -- a constant, not a component
export const EMPTY_PAGE3: Page3Data = {
  scheme: "",
  traineeCategories: [],
  items: emptyItems(),
  otherItems: [],
};

const INPUT_CLASS =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
}

function Field({ id, label, value, onChange, error }: FieldProps) {
  const invalid = error !== undefined && error !== "";
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        className={`${INPUT_CLASS} ${invalid ? "border-red-500" : ""}`}
      />
      {invalid && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface Page3Props {
  readonly data: Page3Data;
  readonly onChange: (data: Page3Data) => void;
  readonly errors: PayrollDetailErrors;
  readonly schemes: readonly EnumOption[];
  readonly payrollItems: readonly PayrollItemOption[];
  readonly itemTypes: readonly EnumOption[];
}

export function Page3({ data, onChange, errors, schemes, payrollItems, itemTypes }: Page3Props) {
  const setScheme = (scheme: string): void => {
    onChange({ ...data, scheme });
  };

  const addCategory = (): void => {
    onChange({ ...data, traineeCategories: [...data.traineeCategories, ""] });
  };

  const removeCategory = (index: number): void => {
    onChange({ ...data, traineeCategories: data.traineeCategories.filter((_, i) => i !== index) });
  };

  const setCategory = (index: number, value: string): void => {
    onChange({
      ...data,
      traineeCategories: data.traineeCategories.map((category, i) => (i === index ? value : category)),
    });
  };

  const setItemApplicable = (key: string, isApplicable: boolean): void => {
    const current = data.items[key] ?? { isApplicable: undefined, amount: "" };
    if (current.isApplicable === isApplicable) {
      return;
    }
    onChange({
      ...data,
      // AC4: switching to No clears the amount, so a value entered under Yes
      // can never be persisted once the answer is No.
      items: { ...data.items, [key]: { isApplicable, amount: isApplicable ? current.amount : "" } },
    });
  };

  const setItemAmount = (key: string, amount: string): void => {
    const current = data.items[key] ?? { isApplicable: undefined, amount: "" };
    onChange({ ...data, items: { ...data.items, [key]: { ...current, amount } } });
  };

  const addOtherRow = (): void => {
    onChange({ ...data, otherItems: [...data.otherItems, { label: "", amount: "", itemType: "" }] });
  };

  const removeOtherRow = (index: number): void => {
    onChange({ ...data, otherItems: data.otherItems.filter((_, i) => i !== index) });
  };

  const setOtherRow = (index: number, patch: Partial<OtherPayrollRowInput>): void => {
    onChange({
      ...data,
      otherItems: data.otherItems.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  };

  const fixedItems = payrollItems
    .filter((item) => item.itemType !== null)
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);

  // AC2: how many of the 22 items remain unanswered.
  const unansweredCount = fixedItems.filter((item) => data.items[item.key]?.isApplicable === undefined).length;

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">Payroll Details</h2>

      <div>
        <label htmlFor="scheme" className="block text-sm font-medium text-gray-700">
          Scheme
        </label>
        <select
          id="scheme"
          value={data.scheme}
          onChange={(event) => setScheme(event.target.value)}
          aria-invalid={errors.scheme !== undefined}
          className={`${INPUT_CLASS} ${errors.scheme !== undefined ? "border-red-500" : ""}`}
        >
          <option value="">Select scheme</option>
          {schemes.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errors.scheme !== undefined && <p className="mt-1 text-xs text-red-600">{errors.scheme}</p>}
      </div>

      <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Trainee Category
      </h3>
      {errors.traineeCategories !== undefined && (
        <p className="text-xs text-red-600">{errors.traineeCategories}</p>
      )}
      <div className="space-y-2">
        {data.traineeCategories.map((category, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="flex-1">
              <Field
                id={`trainee-category-${index}`}
                label="Category"
                value={category}
                onChange={(value) => setCategory(index, value)}
                error={errors.traineeCategoryRows?.[index]}
              />
            </div>
            <button
              type="button"
              onClick={() => removeCategory(index)}
              className="mt-6 h-9 rounded-md border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addCategory}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Add Trainee Category
        </button>
      </div>

      <div className="flex items-center justify-between pt-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Payroll Items</h3>
        <span className="text-sm text-gray-600">
          {fixedItems.length - unansweredCount} of {fixedItems.length} answered
          {unansweredCount > 0 && ` — ${unansweredCount} remaining`}
        </span>
      </div>

      <div className="space-y-3">
        {fixedItems.map((item) => {
          const answer = data.items[item.key] ?? { isApplicable: undefined, amount: "" };
          const error = errors.items?.[item.key];
          return (
            <div key={item.key} className="rounded-md border border-gray-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-700">{item.label}</span>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name={`applicable-${item.key}`}
                      checked={answer.isApplicable === true}
                      onChange={() => setItemApplicable(item.key, true)}
                    />
                    Yes
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="radio"
                      name={`applicable-${item.key}`}
                      checked={answer.isApplicable === false}
                      onChange={() => setItemApplicable(item.key, false)}
                    />
                    No
                  </label>
                </div>
              </div>
              {answer.isApplicable === true && (
                <input
                  id={`amount-${item.key}`}
                  aria-label={`${item.label} amount`}
                  type="text"
                  value={answer.amount}
                  onChange={(event) => setItemAmount(item.key, event.target.value)}
                  aria-invalid={error !== undefined}
                  className={`${INPUT_CLASS} ${error !== undefined ? "border-red-500" : ""}`}
                />
              )}
              {error !== undefined && <p className="mt-1 text-xs text-red-600">{error}</p>}
            </div>
          );
        })}
      </div>

      <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Other</h3>
      <div className="space-y-3">
        {data.otherItems.map((row, index) => {
          const rowErrors = errors.otherItems?.[index];
          return (
            <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_auto] md:items-start">
              <Field
                id={`other-label-${index}`}
                label="Label"
                value={row.label}
                onChange={(value) => setOtherRow(index, { label: value })}
                error={rowErrors?.label}
              />
              <Field
                id={`other-amount-${index}`}
                label="Amount"
                value={row.amount}
                onChange={(value) => setOtherRow(index, { amount: value })}
                error={rowErrors?.amount}
              />
              <div>
                <label htmlFor={`other-type-${index}`} className="block text-sm font-medium text-gray-700">
                  Type
                </label>
                <select
                  id={`other-type-${index}`}
                  value={row.itemType}
                  onChange={(event) => setOtherRow(index, { itemType: event.target.value })}
                  aria-invalid={rowErrors?.itemType !== undefined}
                  className={`${INPUT_CLASS} ${rowErrors?.itemType !== undefined ? "border-red-500" : ""}`}
                >
                  <option value="">Select…</option>
                  {itemTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {rowErrors?.itemType !== undefined && (
                  <p className="mt-1 text-xs text-red-600">{rowErrors.itemType}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeOtherRow(index)}
                className="mt-1 h-9 rounded-md border border-gray-300 px-3 text-sm text-gray-600 hover:bg-gray-50 md:mt-6"
              >
                Remove
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={addOtherRow}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Add Other payroll item
        </button>
      </div>
    </div>
  );
}
