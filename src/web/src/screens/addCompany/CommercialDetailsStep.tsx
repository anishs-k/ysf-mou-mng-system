/**
 * Purpose: Wizard step 2 - Agreement Details (start date, tenure in months (D157),
 * the end date from @mou/domain's computeEndDate, and the required signed MoU PDF,
 * uploaded to the draft as soon as it is picked), the Payment Schedule, and the
 * add/remove charge rows. A row's head is one of the API's fixed commercial items
 * (each usable once) or "Other" with its own label and Allowance/Deduction type.
 */

import { ATTENDANCE_CYCLES, computeEndDate } from "@mou/domain";
import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";

import { formatCalendarDate } from "../../ui/format.ts";
import { Field, SelectInput, TextInput } from "../../ui/form.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Card, SectionTitle } from "../../ui/primitives.tsx";
import { ErrorText, HiddenLabel, WarningText } from "./fields.tsx";
import type { ChargeRow, CommercialForm, WizardReference } from "./formState.ts";
import { OTHER_HEAD, blankChargeRow } from "./formState.ts";
import type { CommercialValidation } from "./validation.ts";
import { invalidBorder } from "./validation.ts";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The last day of the tenure, or null until the start date and the months are both usable. */
function mouEndDate(commercial: CommercialForm): string | null {
  const tenure = Number(commercial.tenureValue);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(commercial.mouStartDate) || !Number.isInteger(tenure) || tenure <= 0) return null;
  try {
    return computeEndDate(commercial.mouStartDate, tenure, "MONTHS");
  } catch {
    return null;
  }
}

interface CommercialDetailsStepProps {
  readonly commercial: CommercialForm;
  readonly onChange: (patch: Partial<CommercialForm>) => void;
  readonly charges: readonly ChargeRow[];
  readonly onChargesChange: (rows: readonly ChargeRow[]) => void;
  /** Empty until Save & Continue has been pressed once (the start-date warning shows at once). */
  readonly errors: CommercialValidation;
  readonly reference: WizardReference;
  readonly onPickFile: (file: File) => void;
  readonly uploading: boolean;
  readonly uploadError: string | null;
}

export function CommercialDetailsStep({
  commercial,
  onChange,
  charges,
  onChargesChange,
  errors,
  reference,
  onPickFile,
  uploading,
  uploadError,
}: CommercialDetailsStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { enums } = reference;
  const set = (key: keyof CommercialForm) => (value: string) => onChange({ [key]: value });
  const endDate = mouEndDate(commercial);
  const cycles = ATTENDANCE_CYCLES.includes(commercial.attendanceCycle) || commercial.attendanceCycle === ""
    ? ATTENDANCE_CYCLES
    : [...ATTENDANCE_CYCLES, commercial.attendanceCycle];

  const updateRow = (id: number, patch: Partial<ChargeRow>) =>
    onChargesChange(charges.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  /** A fixed head already used by another row is not offered again. */
  const headOptions = (row: ChargeRow) =>
    enums.commercialItems
      .filter((item) => item.key === OTHER_HEAD || item.key === row.head || !charges.some((other) => other.head === item.key))
      .map((item) => ({ value: item.key, label: item.label }));

  const pick = (file: File | undefined) => {
    if (file !== undefined) onPickFile(file);
  };
  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  };

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <SectionTitle>Agreement Details</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="MoU Start Date" htmlFor="mou-start" required>
            <TextInput
              id="mou-start"
              type="date"
              value={commercial.mouStartDate}
              onChange={set("mouStartDate")}
              className={invalidBorder(errors.fields.mouStartDate)}
            />
            <ErrorText message={errors.fields.mouStartDate} />
            <WarningText message={errors.startDateWarning} />
          </Field>
          <Field label="MoU Tenure (Months)" htmlFor="mou-tenure" required>
            <TextInput
              id="mou-tenure"
              type="number"
              placeholder="12"
              value={commercial.tenureValue}
              onChange={set("tenureValue")}
              className={`w-full ${invalidBorder(errors.fields.tenureValue)}`}
            />
            <ErrorText message={errors.fields.tenureValue} />
          </Field>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">MoU End Date</label>
            <div
              data-testid="mou-end-date"
              className={`h-10 px-3 rounded-lg border flex items-center text-sm font-semibold transition-all ${
                endDate === null ? "border-border bg-muted/50 text-muted-foreground" : "border-[#1B5FAE] bg-[#E8F0FB] text-[#1B5FAE]"
              }`}
            >
              {endDate === null ? (
                "Auto-calculated"
              ) : (
                <span className="flex items-center gap-2">
                  <Icon name="calendar" className="w-4 h-4 shrink-0" />
                  {formatCalendarDate(endDate)}
                </span>
              )}
            </div>
          </div>
          <div className="lg:col-span-3 flex flex-col items-center justify-center">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1 text-center">
              Upload MoU PDF <span className="text-red-500">*</span>
            </label>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                pick(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            {commercial.mouDocument !== undefined && !uploading ? (
              <div className="w-full max-w-md rounded-xl border p-4 bg-green-50 border-green-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                  <Icon name="file" className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-green-900 truncate">{commercial.mouDocument.originalFilename}</p>
                  <p className="text-xs text-green-700 mt-0.5">{formatSize(commercial.mouDocument.fileSizeBytes)} · Uploaded</p>
                </div>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="text-xs font-semibold text-[#1B5FAE] hover:underline shrink-0"
                >
                  Replace
                </button>
              </div>
            ) : (
              <div
                onClick={() => inputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`w-full max-w-md border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center transition-colors cursor-pointer ${
                  dragging ? "border-[#1B5FAE] bg-[#E8F0FB]" : errors.fields.mouDocument !== undefined ? "border-red-400" : "border-border hover:border-primary"
                }`}
              >
                <div className={`mb-3 text-[#1B5FAE] ${uploading ? "animate-pulse" : ""}`}>
                  <Icon name="upload" />
                </div>
                <p className="text-sm font-semibold text-foreground text-center">
                  {uploading ? "Uploading…" : "Drop PDF here or click to browse"}
                </p>
                <p className="text-xs text-muted-foreground mt-1 text-center">PDF up to 10 MB</p>
              </div>
            )}
            <div className="mt-1 text-center">
              <ErrorText message={uploadError ?? errors.fields.mouDocument} />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle>Payment Schedule</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <Field label="Attendance Cycle" htmlFor="attendance-cycle" required className="md:col-span-1">
            <SelectInput id="attendance-cycle" options={cycles} value={commercial.attendanceCycle} onChange={set("attendanceCycle")} />
            <ErrorText message={errors.fields.attendanceCycle} />
          </Field>
          <Field label="Stipend Date" htmlFor="stipend-date" required>
            <TextInput
              id="stipend-date"
              placeholder="Day of month (e.g. 5)"
              value={commercial.stipendDate}
              onChange={set("stipendDate")}
              className={invalidBorder(errors.fields.stipendDate)}
            />
            <ErrorText message={errors.fields.stipendDate} />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle>Commercial as per MoU</SectionTitle>
        <div className="space-y-3">
          {charges.map((row, index) => {
            const n = index + 1;
            const rowErrors = errors.rows[row.id] ?? {};
            const isOther = row.head === OTHER_HEAD;
            return (
              <div key={row.id} className="space-y-1">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-start">
                  <div>
                    <HiddenLabel htmlFor={`charge-${row.id}-head`}>{`Charge head ${n}`}</HiddenLabel>
                    <SelectInput
                      id={`charge-${row.id}-head`}
                      options={headOptions(row)}
                      value={row.head}
                      placeholder="Charge head…"
                      onChange={(head) => updateRow(row.id, { head, period: "", basis: "", label: "", itemType: "" })}
                    />
                  </div>
                  <div>
                    <HiddenLabel htmlFor={`charge-${row.id}-amount`}>{`Charge amount ${n}`}</HiddenLabel>
                    <TextInput
                      id={`charge-${row.id}-amount`}
                      type="number"
                      placeholder="Amount (₹)"
                      value={row.amount}
                      onChange={(amount) => updateRow(row.id, { amount })}
                      className={`w-full ${invalidBorder(rowErrors.amount)}`}
                    />
                  </div>
                  {isOther ? (
                    <>
                      <div>
                        <HiddenLabel htmlFor={`charge-${row.id}-label`}>{`Charge name ${n}`}</HiddenLabel>
                        <TextInput
                          id={`charge-${row.id}-label`}
                          placeholder="Charge name"
                          value={row.label}
                          onChange={(label) => updateRow(row.id, { label })}
                          className={`w-full ${invalidBorder(rowErrors.label)}`}
                        />
                      </div>
                      <div>
                        <HiddenLabel htmlFor={`charge-${row.id}-type`}>{`Charge type ${n}`}</HiddenLabel>
                        <SelectInput
                          id={`charge-${row.id}-type`}
                          options={enums.itemTypes}
                          value={row.itemType}
                          placeholder="Allowance / Deduction…"
                          onChange={(itemType) => updateRow(row.id, { itemType })}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <HiddenLabel htmlFor={`charge-${row.id}-period`}>{`Charge frequency ${n}`}</HiddenLabel>
                        <SelectInput
                          id={`charge-${row.id}-period`}
                          options={enums.commercialPeriods}
                          value={row.period}
                          placeholder="Frequency…"
                          onChange={(period) => updateRow(row.id, { period })}
                        />
                      </div>
                      <div>
                        <HiddenLabel htmlFor={`charge-${row.id}-basis`}>{`Charge basis ${n}`}</HiddenLabel>
                        <SelectInput
                          id={`charge-${row.id}-basis`}
                          options={enums.commercialBases}
                          value={row.basis}
                          placeholder="Basis…"
                          onChange={(basis) => updateRow(row.id, { basis })}
                        />
                      </div>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => onChargesChange(charges.filter((other) => other.id !== row.id))}
                    className="h-10 text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-1 text-xs font-semibold"
                  >
                    <Icon name="close" className="w-4 h-4" strokeWidth={2} />
                    Remove
                  </button>
                </div>
                <ErrorText
                  message={[rowErrors.head, rowErrors.amount, rowErrors.label, rowErrors.itemType, rowErrors.period, rowErrors.basis]
                    .filter((message) => message !== undefined)
                    .join(" · ") || undefined}
                />
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => onChargesChange([...charges, blankChargeRow()])}
            className="inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary border-border hover:bg-blue-100 px-3 py-1.5 text-xs"
          >
            <Icon name="plus" className="w-4 h-4" strokeWidth={2.2} />
            Add Charge
          </button>
        </div>
      </Card>
    </div>
  );
}
