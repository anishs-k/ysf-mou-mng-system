/**
 * Purpose: The Edit Agreement screen. A zone -> company -> plant -> scheme cascade
 * (each select appears once the previous one is chosen) and OK open the agreement:
 * summary strip, reason for amendment with mandatory proof upload, previous/new value
 * tabs with a review diff, and the prototype's proof-missing and success modals.
 */

import { useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { SCHEMES } from "../data/addCompanyOptions.ts";
import { ZONE_COMPANIES } from "../data/companies.ts";
import { MOUS, ZONE_NAMES } from "../data/mous.ts";
import type { MouRecord } from "../data/mous.ts";
import { Field } from "../ui/form.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge, Button, Card, SectionTitle } from "../ui/primitives.tsx";
import { BRAND, statusTone } from "../ui/theme.ts";

const REASONS = ["Communication from HR", "Addendum in Agreement", "Change in Statutory Compliance"] as const;
type Reason = (typeof REASONS)[number];

const TABS = ["Company Details", "Commercial Details", "Payroll Details", "Review Changes"] as const;
type Tab = (typeof TABS)[number];
type FieldTab = Exclude<Tab, "Review Changes">;

interface EditableField {
  readonly label: string;
  readonly previous: string;
}

/** The prototype opens the first MoU row of the chosen company, whatever zone/plant/scheme was picked. */
function agreementOf(company: string): MouRecord | undefined {
  return MOUS.find((mou) => mou.company === company);
}

/** MoUs run 24 months, so the start date is the expiry date two years earlier. */
function startDateOf(expires: string): string {
  return expires.replace(/(\d{4})$/, (year) => String(Number(year) - 2));
}

function fieldsOf(record: MouRecord): Readonly<Record<FieldTab, readonly EditableField[]>> {
  return {
    "Company Details": [
      { label: "Company Name", previous: record.company },
      { label: "Zone", previous: record.zone },
      { label: "Plant", previous: record.plant },
      { label: "MoU Code", previous: record.code },
      { label: "Status", previous: record.status },
      { label: "Expiry Date", previous: record.expires },
    ],
    "Commercial Details": [
      { label: "Scheme", previous: record.scheme },
      { label: "MoU Start Date", previous: startDateOf(record.expires) },
      { label: "MoU End Date", previous: record.expires },
      { label: "Tenure (months)", previous: "24" },
      { label: "Attendance Cycle", previous: "Monthly" },
      { label: "Admin Charges", previous: "₹450/month" },
    ],
    "Payroll Details": [
      { label: "Attendance Bonus", previous: "₹500/month" },
      { label: "Conveyance", previous: "₹300/month" },
      { label: "HRA", previous: "₹800/month" },
      { label: "PF Deduction", previous: "12%" },
      { label: "ESI Deduction", previous: "0.75%" },
    ],
  };
}

const SECONDARY_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary border-border hover:bg-blue-100";
const GHOST_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground";

interface AgreementSelectProps {
  readonly label: string;
  readonly widthClass: string;
  readonly options: readonly string[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** This screen's selects omit `text-foreground`, unlike the shared SelectInput. */
function AgreementSelect({ label, widthClass, options, value, onChange }: AgreementSelectProps) {
  return (
    <Field label={label} required className={widthClass}>
      <div className="relative">
        <select
          value={value}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
          className="w-full h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">Select…</option>
          {options.map((option, index) => (
            <option key={index}>{option}</option>
          ))}
        </select>
        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
          <Icon name="chevronDown" className="w-4 h-4" strokeWidth={2} />
        </span>
      </div>
    </Field>
  );
}

function SummaryItem({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</p>
      {children}
    </div>
  );
}

function ModalFrame({ children }: { readonly children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">{children}</div>;
}

interface AgreementEditorProps {
  readonly record: MouRecord;
}

function AgreementEditor({ record }: AgreementEditorProps) {
  const navigate = useNavigate();
  const proofInput = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState<Reason | null>(null);
  const [proof, setProof] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Company Details");
  const [values, setValues] = useState<Readonly<Record<string, string>>>({});
  const [modal, setModal] = useState<"none" | "proof" | "success">("none");

  const fields = fieldsOf(record);
  const changes = (Object.values(fields) as readonly (readonly EditableField[])[])
    .flat()
    .filter((field) => (values[field.label] ?? "") !== "");

  const submit = () => setModal(reason !== null && proof === null ? "proof" : "success");

  return (
    <>
      <Card className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            ["Company Name", record.company],
            ["Plant", record.plant],
            ["Zone", record.zone],
            ["Agreement Code", record.code],
            ["Current Version", "V1.0"],
          ].map(([label, value]) => (
            <SummaryItem key={label} label={label ?? ""}>
              <p className="text-xs font-semibold text-foreground truncate">{value}</p>
            </SummaryItem>
          ))}
          <SummaryItem label="Status">
            <Badge text={record.status} tone={statusTone(record.status)} />
          </SummaryItem>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>Reason for Amendment</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {REASONS.map((option) => {
            const active = option === reason;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setReason(option)}
                className={`flex items-center gap-2 p-3 rounded-lg border text-sm font-semibold text-left transition-all ${
                  active ? "border-[#1B5FAE] bg-[#E8F0FB] text-[#1B5FAE]" : "border-border bg-white text-muted-foreground hover:bg-muted"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    active ? "border-[#1B5FAE] bg-[#1B5FAE]" : "border-border"
                  }`}
                >
                  {active && <span className="w-1.5 h-1.5 rounded-full bg-white block" />}
                </span>
                {option}
              </button>
            );
          })}
        </div>
        {reason !== null && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Upload Supporting Proof <span className="text-red-500">*</span>
            </p>
            <input
              ref={proofInput}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(event: ChangeEvent<HTMLInputElement>) => setProof(event.target.files?.[0]?.name ?? null)}
            />
            {proof === null ? (
              <button
                type="button"
                onClick={() => proofInput.current?.click()}
                className="w-full border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 hover:border-primary transition-colors text-muted-foreground hover:text-foreground"
              >
                <span>
                  <Icon name="upload" />
                </span>
                <span className="text-sm font-semibold">Click to upload proof (PDF, JPG, PNG · max 10 MB)</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50 border border-green-200">
                <span className="text-green-600">
                  <Icon name="file" className="w-4 h-4" />
                </span>
                <span className="text-sm font-semibold text-green-900 truncate flex-1">{proof}</span>
                <button
                  type="button"
                  onClick={() => {
                    setProof(null);
                    if (proofInput.current !== null) proofInput.current.value = "";
                  }}
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                >
                  <Icon name="close" className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="flex border-b border-border overflow-x-auto">
          {TABS.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setTab(name)}
              className="px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px"
              style={name === tab ? { borderColor: BRAND.orange, color: BRAND.orange } : { borderColor: "transparent", color: "#5A7AA8" }}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === "Review Changes" ? (
            <div>
              {changes.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No changes have been made yet.</p>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    {["Field", "Previous", "New Value"].map((heading) => (
                      <p key={heading} className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {heading}
                      </p>
                    ))}
                  </div>
                  {changes.map((field) => (
                    <div key={field.label} className="grid grid-cols-3 gap-4 items-start py-2 border-b border-border last:border-0 text-sm">
                      <p className="font-semibold text-foreground text-xs">{field.label}</p>
                      <p className="mono text-muted-foreground line-through text-xs">{field.previous}</p>
                      <p className="mono font-bold text-xs" style={{ color: BRAND.blue }}>
                        {values[field.label]}
                      </p>
                    </div>
                  ))}
                  {reason !== null && (
                    <div className="mt-2 pt-3 border-t border-border flex items-center gap-2 text-xs">
                      <span className="font-semibold text-muted-foreground uppercase tracking-wider">Reason:</span>
                      <Badge text={reason} tone="info" />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Previous Value</p>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">New Value</p>
              </div>
              {fields[tab].map((field) => (
                <div key={field.label} className="grid grid-cols-2 gap-4 items-center py-2 border-b border-border last:border-0">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{field.label}</p>
                    <p className="text-sm font-semibold text-foreground mono bg-muted/60 px-2.5 py-1.5 rounded-lg">{field.previous}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{field.label}</p>
                    <input
                      placeholder={`Enter new ${field.label.toLowerCase()}`}
                      value={values[field.label] ?? ""}
                      onChange={(event: ChangeEvent<HTMLInputElement>) =>
                        setValues((current) => ({ ...current, [field.label]: event.target.value }))
                      }
                      className="w-full h-9 px-2.5 border border-border rounded-lg text-sm bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="flex items-center justify-between pt-2 pb-4">
        <div className="flex gap-2">
          <button type="button" className={`${SECONDARY_BUTTON} px-3 py-1.5 text-xs`}>
            Save Draft
          </button>
          <button type="button" onClick={() => navigate("/")} className={`${GHOST_BUTTON} px-3 py-1.5 text-xs`}>
            Cancel
          </button>
        </div>
        <Button variant="accent" onClick={submit}>
          <Icon name="check" className="w-4 h-4" strokeWidth={2.5} />
          Save & Submit
        </Button>
      </div>

      {modal === "proof" && (
        <ModalFrame>
          <div className="glass-modal rounded-2xl w-full max-w-xs overflow-hidden">
            <div className="h-1.5 bg-red-500" />
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-3 text-red-500">
                <Icon name="warning" />
              </div>
              <h3 className="font-bold text-sm mb-1" style={{ color: BRAND.navy }}>
                Proof Not Uploaded
              </h3>
              <p className="text-xs text-muted-foreground mb-5">
                Supporting proof is mandatory for <strong>{reason}</strong>.
              </p>
              <Button
                className="w-full justify-center"
                onClick={() => {
                  setModal("none");
                  proofInput.current?.click();
                }}
              >
                Upload Proof
              </Button>
            </div>
          </div>
        </ModalFrame>
      )}

      {modal === "success" && (
        <ModalFrame>
          <div className="glass-modal rounded-2xl w-full max-w-sm overflow-hidden">
            <div className="h-1.5" style={{ background: `linear-gradient(to right, ${BRAND.blue}, ${BRAND.green})` }} />
            <div className="p-7 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-white" style={{ background: BRAND.green }}>
                <Icon name="check" className="w-8 h-8" strokeWidth={3} />
              </div>
              <h3 className="font-bold text-lg mb-1" style={{ color: BRAND.navy }}>
                Agreement Updated Successfully
              </h3>
              <div className="grid grid-cols-3 gap-3 mt-5 mb-6 text-left">
                {[
                  ["Agreement Version", "V2.0"],
                  ["Reason", reason ?? "Addendum in Agreement"],
                  ["Effective Date", new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })],
                ].map(([label, value]) => (
                  <div key={label} className="bg-muted/60 rounded-lg p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
                    <p className="text-xs font-bold text-foreground">{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setModal("none")} className={`${SECONDARY_BUTTON} px-4 py-2 text-sm flex-1 justify-center`}>
                  View Agreement
                </button>
                <Button className="flex-1 justify-center" onClick={() => navigate("/")}>
                  Go to Dashboard
                </Button>
              </div>
            </div>
          </div>
        </ModalFrame>
      )}
    </>
  );
}

interface Selection {
  readonly zone: string;
  readonly company: string;
  readonly plant: string;
  readonly scheme: string;
}

const EMPTY_SELECTION: Selection = { zone: "", company: "", plant: "", scheme: "" };

export function EditAgreementScreen() {
  const navigate = useNavigate();
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);
  const [opened, setOpened] = useState<{ readonly record: MouRecord; readonly key: number } | null>(null);
  const { zone, company, plant, scheme } = selection;
  const record = company === "" ? undefined : agreementOf(company);

  // Choosing any select clears the ones after it and closes the opened agreement.
  const choose = (next: Selection) => {
    setSelection(next);
    setOpened(null);
  };

  return (
    <ScreenFrame
      title="Edit Agreement"
      subtitle="Amend or update an existing MoU record"
      contentClassName="p-4 md:p-6 max-w-5xl mx-auto space-y-4 md:space-y-5"
    >
      <nav className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <button type="button" onClick={() => navigate("/")} className="hover:underline" style={{ color: BRAND.blue }}>
          Dashboard
        </button>
        <span>
          <Icon name="chevronRight" className="w-4 h-4" strokeWidth={2} />
        </span>
        <span>Company</span>
        <span>
          <Icon name="chevronRight" className="w-4 h-4" strokeWidth={2} />
        </span>
        <span style={{ color: BRAND.navy }}>Edit Agreement</span>
      </nav>

      <Card className="p-5">
        <SectionTitle>Select Agreement</SectionTitle>
        <div className="flex flex-wrap gap-3 items-end">
          <AgreementSelect
            label="Zone"
            widthClass="min-w-[140px]"
            options={ZONE_NAMES}
            value={zone}
            onChange={(value) => choose({ ...EMPTY_SELECTION, zone: value })}
          />
          {zone !== "" && (
            <AgreementSelect
              label="Company"
              widthClass="min-w-[180px]"
              options={ZONE_COMPANIES[zone] ?? []}
              value={company}
              onChange={(value) => choose({ ...EMPTY_SELECTION, zone, company: value })}
            />
          )}
          {record !== undefined && (
            <AgreementSelect
              label="Plant"
              widthClass="min-w-[150px]"
              options={[record.plant === "" ? record.company : record.plant]}
              value={plant}
              onChange={(value) => choose({ zone, company, plant: value, scheme: "" })}
            />
          )}
          {plant !== "" && (
            <AgreementSelect
              label="Scheme"
              widthClass="min-w-[140px]"
              options={SCHEMES}
              value={scheme}
              onChange={(value) => choose({ zone, company, plant, scheme: value })}
            />
          )}
          {scheme !== "" && record !== undefined && (
            <Button onClick={() => setOpened({ record, key: Date.now() })}>OK</Button>
          )}
        </div>
      </Card>

      {opened !== null && <AgreementEditor key={opened.key} record={opened.record} />}
    </ScreenFrame>
  );
}
