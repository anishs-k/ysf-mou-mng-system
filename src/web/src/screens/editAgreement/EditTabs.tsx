/**
 * Purpose: The tab bodies of the Edit Agreement screen in the prototype's
 * "Previous Value | New Value" row layout - Company Details with locked inputs, the typed
 * Commercial and Payroll inputs over the SPEC-10 edit-token values (with the
 * domain validators' messages under each field), and the Review diff from
 * computeAgreementDiff. State lives in EditAgreementScreen; these only render it.
 */

import { TENURE_UNITS, TENURE_UNIT_OPTIONS, computeEndDate } from "@mou/domain";
import type { CommercialDetailErrors, DiffRow, OtherChargeRowErrors, PayrollDetailErrors, TenureUnit } from "@mou/domain";
import type { ChangeEvent, ReactNode } from "react";

import type {
  CommercialItemOption,
  EditableCommercial,
  EditableOtherItem,
  EditablePayroll,
  EnumOption,
  PayrollItemOption,
} from "../../api/client.ts";
import { PENDING_FIGURE, formatCalendarDate, schemeLabel } from "../../ui/format.ts";
import { Badge } from "../../ui/primitives.tsx";
import { BRAND } from "../../ui/theme.ts";

const INPUT_CLASS =
  "w-full h-9 px-2.5 border border-border rounded-lg text-sm bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const SMALL_BUTTON = "h-9 px-3 rounded-lg border border-border text-xs font-semibold text-muted-foreground hover:bg-muted transition-colors";

function textOrDash(value: string): string {
  return value.trim() === "" ? PENDING_FIGURE : value;
}

function otherItemsText(items: readonly EditableOtherItem[], itemTypes: readonly EnumOption[]): string {
  if (items.length === 0) return PENDING_FIGURE;
  const typeLabel = (code: string) => itemTypes.find((option) => option.value === code)?.label ?? code;
  return items.map((item) => `${item.label} (${typeLabel(item.itemType)}): ${item.amount}`).join("; ");
}

export function TableHeadings() {
  return (
    <div className="grid grid-cols-2 gap-4">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Previous Value</p>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New Value</p>
    </div>
  );
}

interface CompareRowProps {
  readonly label: string;
  readonly previous: string;
  readonly error?: string | undefined;
  readonly children: ReactNode;
}

/** One field: its previous value on the left, its input (and any error) on the right. */
function CompareRow({ label, previous, error, children }: CompareRowProps) {
  return (
    <div className="grid grid-cols-2 gap-4 items-center py-2 border-b border-border last:border-0">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
        <p className="text-sm font-semibold text-foreground mono bg-muted/60 px-2.5 py-1.5 rounded-lg break-words">{previous}</p>
      </div>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
        {children}
        {error !== undefined && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}

interface TextFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly type?: "text" | "date" | "number";
}

function TextField({ label, value, onChange, type = "text" }: TextFieldProps) {
  return (
    <input
      type={type}
      aria-label={`New ${label}`}
      placeholder={`Enter new ${label.toLowerCase()}`}
      value={value}
      onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      className={INPUT_CLASS}
    />
  );
}

const LOCKED_TITLE = "This value is not changed through an agreement edit";

/** A Figma new-value input that can never be typed in: the value is locked or derived. */
function LockedInput({ label, value = "", title = LOCKED_TITLE }: { readonly label: string; readonly value?: string; readonly title?: string }) {
  return (
    <input
      disabled
      readOnly
      aria-label={`New ${label}`}
      placeholder={`Enter new ${label.toLowerCase()}`}
      value={value}
      title={title}
      className={`${INPUT_CLASS} cursor-not-allowed`}
    />
  );
}

/** The last day of the tenure, or "" while start date, tenure or unit is not usable. */
function endDateText(commercial: EditableCommercial): string {
  const tenure = Number(commercial.tenureValue);
  const unit = commercial.tenureUnit as TenureUnit;
  if (!Number.isInteger(tenure) || tenure <= 0 || !TENURE_UNITS.includes(unit)) return "";
  try {
    return formatCalendarDate(computeEndDate(commercial.mouStartDate, tenure, unit));
  } catch {
    return "";
  }
}

interface OtherItemsEditorProps {
  readonly title: string;
  readonly previous: readonly EditableOtherItem[];
  readonly items: readonly EditableOtherItem[];
  readonly itemTypes: readonly EnumOption[];
  readonly errors: readonly (OtherChargeRowErrors | undefined)[] | undefined;
  readonly onChange: (items: EditableOtherItem[]) => void;
}

/** The repeatable "Other" rows: label, amount and allowance/deduction type. */
function OtherItemsEditor({ title, previous, items, itemTypes, errors, onChange }: OtherItemsEditorProps) {
  const update = (index: number, patch: Partial<EditableOtherItem>) =>
    onChange(items.map((item, at) => (at === index ? { ...item, ...patch } : item)));
  return (
    <CompareRow label={title} previous={otherItemsText(previous, itemTypes)}>
      <div className="space-y-2">
        {items.map((item, index) => {
          const rowErrors = errors?.[index];
          const message = rowErrors?.label ?? rowErrors?.amount ?? rowErrors?.itemType;
          return (
            <div key={index}>
              <div className="grid grid-cols-[2fr_1fr_1fr_auto] gap-2">
                <input
                  aria-label={`${title} ${index + 1} label`}
                  placeholder="Label"
                  value={item.label}
                  onChange={(event) => update(index, { label: event.target.value })}
                  className={INPUT_CLASS}
                />
                <input
                  aria-label={`${title} ${index + 1} amount`}
                  placeholder="Amount"
                  value={item.amount}
                  onChange={(event) => update(index, { amount: event.target.value })}
                  className={INPUT_CLASS}
                />
                <select
                  aria-label={`${title} ${index + 1} type`}
                  value={item.itemType}
                  onChange={(event) => update(index, { itemType: event.target.value })}
                  className={INPUT_CLASS}
                >
                  <option value="">Type…</option>
                  {itemTypes.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => onChange(items.filter((_, at) => at !== index))} className={SMALL_BUTTON}>
                  Remove
                </button>
              </div>
              {message !== undefined && <p className="mt-1 text-xs text-red-600">{message}</p>}
            </div>
          );
        })}
        <button type="button" onClick={() => onChange([...items, { label: "", amount: "", itemType: "" }])} className={SMALL_BUTTON}>
          + Add row
        </button>
      </div>
    </CompareRow>
  );
}

export interface CompanyInfo {
  readonly company: string;
  readonly zone: string;
  readonly plant: string;
  readonly code: string;
  readonly status: string;
  readonly endDate: string;
}

/**
 * Figma's Previous | New Value rows, but every new-value input stays disabled:
 * SPEC-10 section 4 locks company identity, the MoU code is immutable, and
 * status and expiry are derived, so nothing typed here could ever be saved.
 */
export function CompanyDetailsTab({ info }: { readonly info: CompanyInfo }) {
  const fields: readonly (readonly [string, string])[] = [
    ["Company Name", info.company],
    ["Zone", info.zone],
    ["Plant", info.plant],
    ["MoU Code", info.code],
    ["Status", info.status],
    ["Expiry Date", formatCalendarDate(info.endDate)],
  ];
  return (
    <div className="space-y-3">
      <TableHeadings />
      {fields.map(([label, value]) => (
        <CompareRow key={label} label={label} previous={value}>
          <LockedInput label={label} />
        </CompareRow>
      ))}
    </div>
  );
}

interface CommercialTabProps {
  /** Shown first, as in Figma, but locked: a different scheme is a different MoU (SPEC-10 section 4). */
  readonly scheme: string;
  readonly previous: EditableCommercial;
  readonly value: EditableCommercial;
  readonly errors: CommercialDetailErrors;
  readonly charges: readonly CommercialItemOption[];
  readonly itemTypes: readonly EnumOption[];
  readonly onChange: (value: EditableCommercial) => void;
}

export function CommercialTab({ scheme, previous, value, errors, charges, itemTypes, onChange }: CommercialTabProps) {
  const set = (patch: Partial<EditableCommercial>) => onChange({ ...value, ...patch });
  const unitLabel = (code: string) => TENURE_UNIT_OPTIONS.find((option) => option.value === code)?.label ?? code;
  return (
    <div className="space-y-3">
      <TableHeadings />
      <CompareRow label="Scheme" previous={schemeLabel(scheme)}>
        <LockedInput label="Scheme" />
      </CompareRow>
      <CompareRow label="MoU Start Date" previous={formatCalendarDate(previous.mouStartDate)} error={errors.mouStartDate}>
        <TextField label="MoU Start Date" type="date" value={value.mouStartDate} onChange={(mouStartDate) => set({ mouStartDate })} />
      </CompareRow>
      <CompareRow label="MoU End Date" previous={textOrDash(endDateText(previous))}>
        <LockedInput label="MoU End Date" value={endDateText(value)} title="Calculated from the start date and tenure" />
      </CompareRow>
      <CompareRow
        label="Tenure"
        previous={`${previous.tenureValue} ${unitLabel(previous.tenureUnit)}`}
        error={errors.tenureValue ?? errors.tenureUnit}
      >
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Tenure" type="number" value={value.tenureValue} onChange={(tenureValue) => set({ tenureValue })} />
          <select
            aria-label="New Tenure Unit"
            value={value.tenureUnit}
            onChange={(event) => set({ tenureUnit: event.target.value })}
            className={INPUT_CLASS}
          >
            {TENURE_UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </CompareRow>
      <CompareRow label="Attendance Cycle" previous={textOrDash(previous.attendanceCycle)} error={errors.attendanceCycle}>
        <TextField label="Attendance Cycle" value={value.attendanceCycle} onChange={(attendanceCycle) => set({ attendanceCycle })} />
      </CompareRow>
      <CompareRow label="Stipend Date" previous={textOrDash(previous.stipendDate)} error={errors.stipendDate}>
        <TextField label="Stipend Date" type="number" value={value.stipendDate} onChange={(stipendDate) => set({ stipendDate })} />
      </CompareRow>
      {charges.map((charge) => (
        <CompareRow
          key={charge.key}
          label={charge.label}
          previous={textOrDash(previous.charges[charge.key] ?? "")}
          error={errors.charges?.[charge.key]}
        >
          <TextField
            label={charge.label}
            value={value.charges[charge.key] ?? ""}
            onChange={(amount) => set({ charges: { ...value.charges, [charge.key]: amount } })}
          />
        </CompareRow>
      ))}
      <OtherItemsEditor
        title="Other Charges"
        previous={previous.otherItems}
        items={value.otherItems}
        itemTypes={itemTypes}
        errors={errors.otherItems}
        onChange={(otherItems) => set({ otherItems })}
      />
    </div>
  );
}

interface PayrollTabProps {
  readonly previous: EditablePayroll;
  readonly value: EditablePayroll;
  readonly errors: PayrollDetailErrors;
  readonly items: readonly PayrollItemOption[];
  readonly itemTypes: readonly EnumOption[];
  readonly onChange: (value: EditablePayroll) => void;
}

function answerText(answer: { readonly isApplicable: boolean | undefined; readonly amount: string } | undefined): string {
  if (answer?.isApplicable === true) return `Yes (${textOrDash(answer.amount)})`;
  return answer?.isApplicable === false ? "No" : PENDING_FIGURE;
}

export function PayrollTab({ previous, value, errors, items, itemTypes, onChange }: PayrollTabProps) {
  const set = (patch: Partial<EditablePayroll>) => onChange({ ...value, ...patch });
  const categories = value.traineeCategories;
  return (
    <div className="space-y-3">
      <TableHeadings />
      <CompareRow label="Trainee Categories" previous={previous.traineeCategories.join(", ") || PENDING_FIGURE} error={errors.traineeCategories}>
        <div className="space-y-2">
          {categories.map((category, index) => (
            <div key={index}>
              <div className="flex gap-2">
                <input
                  aria-label={`Trainee category ${index + 1}`}
                  value={category}
                  onChange={(event) => set({ traineeCategories: categories.map((name, at) => (at === index ? event.target.value : name)) })}
                  className={INPUT_CLASS}
                />
                <button type="button" onClick={() => set({ traineeCategories: categories.filter((_, at) => at !== index) })} className={SMALL_BUTTON}>
                  Remove
                </button>
              </div>
              {errors.traineeCategoryRows?.[index] !== undefined && (
                <p className="mt-1 text-xs text-red-600">{errors.traineeCategoryRows[index]}</p>
              )}
            </div>
          ))}
          <button type="button" onClick={() => set({ traineeCategories: [...categories, ""] })} className={SMALL_BUTTON}>
            + Add category
          </button>
        </div>
      </CompareRow>
      {items.map((item) => {
        const answer = value.items[item.key] ?? { isApplicable: undefined, amount: "" };
        const setAnswer = (isApplicable: boolean, amount: string) =>
          set({ items: { ...value.items, [item.key]: { isApplicable, amount } } });
        return (
          <CompareRow key={item.key} label={item.label} previous={answerText(previous.items[item.key])} error={errors.items?.[item.key]}>
            <div className="flex gap-2 items-center">
              {([true, false] as const).map((choice) => {
                const active = answer.isApplicable === choice;
                return (
                  <button
                    key={String(choice)}
                    type="button"
                    aria-pressed={active}
                    aria-label={`${item.label} ${choice ? "Yes" : "No"}`}
                    onClick={() => setAnswer(choice, choice ? answer.amount : "")}
                    className={`h-9 px-3 rounded-lg border text-xs font-semibold transition-all ${
                      active ? "border-[#1B5FAE] bg-[#E8F0FB] text-[#1B5FAE]" : "border-border bg-white text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {choice ? "Yes" : "No"}
                  </button>
                );
              })}
              {answer.isApplicable === true && (
                <TextField label={`${item.label} amount`} value={answer.amount} onChange={(amount) => setAnswer(true, amount)} />
              )}
            </div>
          </CompareRow>
        );
      })}
      <OtherItemsEditor
        title="Other Payroll Items"
        previous={previous.otherItems}
        items={value.otherItems}
        itemTypes={itemTypes}
        errors={errors.otherItems}
        onChange={(otherItems) => set({ otherItems })}
      />
    </div>
  );
}

export function ReviewTab({ changes, reasonLabel }: { readonly changes: readonly DiffRow[]; readonly reasonLabel: string }) {
  if (changes.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-8">No changes have been made yet.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-4">
        {["Field", "Previous", "New Value"].map((heading) => (
          <p key={heading} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {heading}
          </p>
        ))}
      </div>
      {changes.map((row) => (
        <div key={row.field} data-testid="review-row" className="grid grid-cols-3 gap-4 items-start py-2 border-b border-border last:border-0 text-sm">
          <p className="font-semibold text-foreground text-xs">{row.field}</p>
          <p className="mono text-muted-foreground line-through text-xs break-words">{row.oldValue}</p>
          <p className="mono font-bold text-xs break-words" style={{ color: BRAND.blue }}>
            {row.newValue}
          </p>
        </div>
      ))}
      <div className="mt-2 pt-3 border-t border-border flex items-center gap-2 text-xs">
        <span className="font-semibold text-muted-foreground uppercase tracking-wider">Reason:</span>
        <Badge text={reasonLabel} tone="info" />
      </div>
    </div>
  );
}
