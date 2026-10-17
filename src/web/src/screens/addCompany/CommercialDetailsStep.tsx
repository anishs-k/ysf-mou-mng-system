/**
 * Purpose: Wizard step 2 - Agreement Details (start date and tenure, with the end
 * date auto-calculated, plus the MoU PDF drop zone), the Payment Schedule, and the
 * add/remove list of commercial charges agreed in the MoU.
 */

import type { ChangeEvent } from "react";

import { ATTENDANCE_CYCLES, CHARGE_BASES, CHARGE_FREQUENCIES, CHARGE_HEADS } from "../../data/addCompanyOptions.ts";
import { Field, SelectInput, TextInput } from "../../ui/form.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Card, SectionTitle } from "../../ui/primitives.tsx";
import type { StepFormProps } from "./formState.ts";

/** Last day of the tenure: start plus `months` months, less one day; null until both are usable. */
function mouEndDate(start: string, tenure: string): string | null {
  const months = Number(tenure);
  if (start === "" || !Number.isFinite(months) || months <= 0) return null;
  const date = new Date(`${start}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  date.setMonth(date.getMonth() + months);
  date.setDate(date.getDate() - 1);
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

interface CommercialDetailsStepProps extends StepFormProps {
  /** Ids of the charge rows currently shown. */
  readonly charges: readonly number[];
  readonly onAddCharge: () => void;
  readonly onRemoveCharge: (id: number) => void;
}

export function CommercialDetailsStep({ values, onChange, charges, onAddCharge, onRemoveCharge }: CommercialDetailsStepProps) {
  const set = (key: string) => (value: string) => onChange(key, value);
  const endDate = mouEndDate(values["mouStart"] ?? "", values["tenure"] ?? "");

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <SectionTitle>Agreement Details</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Field label="MoU Start Date" required>
            <TextInput type="date" value={values["mouStart"] ?? ""} onChange={set("mouStart")} />
          </Field>
          <Field label="MoU Tenure (months)" required>
            <TextInput type="number" placeholder="12" value={values["tenure"] ?? ""} onChange={set("tenure")} />
          </Field>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">MoU End Date</label>
            <div
              className={`h-10 px-3 rounded-lg border flex items-center text-sm font-semibold transition-all ${
                endDate === null ? "border-border bg-muted/50 text-muted-foreground" : "border-[#1B5FAE] bg-[#E8F0FB] text-[#1B5FAE]"
              }`}
            >
              {endDate === null ? (
                "Auto-calculated"
              ) : (
                <span className="flex items-center gap-2">
                  <Icon name="calendar" className="w-4 h-4 shrink-0" />
                  {endDate}
                </span>
              )}
            </div>
          </div>
          <div className="lg:col-span-3 flex flex-col items-center justify-center">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1 text-center">
              Upload MoU PDF <span className="text-red-500">*</span>
            </label>
            <div className="w-full max-w-md border-2 border-dashed border-border rounded-xl p-10 flex flex-col items-center justify-center hover:border-primary transition-colors cursor-pointer">
              <div className="mb-3 text-[#1B5FAE]">
                <Icon name="upload" />
              </div>
              <p className="text-sm font-semibold text-foreground text-center">Drop PDF here or click to browse</p>
              <p className="text-xs text-muted-foreground mt-1 text-center">PDF up to 10 MB</p>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle>Payment Schedule</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <Field label="Attendance Cycle" required className="md:col-span-1">
            <div className="relative">
              <select
                value={values["attendanceCycle"] ?? ""}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange("attendanceCycle", event.target.value)}
                className="w-full h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Select…</option>
                {ATTENDANCE_CYCLES.map((cycle) => (
                  <option key={cycle.value} value={cycle.value}>
                    {cycle.label}
                  </option>
                ))}
              </select>
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
                <Icon name="chevronDown" className="w-4 h-4" strokeWidth={2} />
              </span>
            </div>
          </Field>
          <Field label="Stipend Date" required>
            <TextInput placeholder="Day of month (e.g. 5)" value={values["stipendDate"] ?? ""} onChange={set("stipendDate")} />
          </Field>
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle>Commercial as per MoU</SectionTitle>
        <div className="space-y-3">
          {charges.map((id) => (
            <div key={id} className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end">
              <Field>
                <SelectInput options={CHARGE_HEADS} value={values[`charge${id}Head`] ?? ""} onChange={set(`charge${id}Head`)} />
              </Field>
              <Field>
                <TextInput type="number" placeholder="Amount (₹)" value={values[`charge${id}Amount`] ?? ""} onChange={set(`charge${id}Amount`)} />
              </Field>
              <Field>
                <SelectInput options={CHARGE_FREQUENCIES} value={values[`charge${id}Frequency`] ?? ""} onChange={set(`charge${id}Frequency`)} />
              </Field>
              <Field>
                <SelectInput options={CHARGE_BASES} value={values[`charge${id}Basis`] ?? ""} onChange={set(`charge${id}Basis`)} />
              </Field>
              <button
                type="button"
                onClick={() => onRemoveCharge(id)}
                className="h-10 text-muted-foreground hover:text-red-500 transition-colors flex items-center gap-1 text-xs font-semibold"
              >
                <Icon name="close" className="w-4 h-4" strokeWidth={2} />
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={onAddCharge}
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
