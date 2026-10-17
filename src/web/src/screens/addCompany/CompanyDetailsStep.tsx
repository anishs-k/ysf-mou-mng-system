/**
 * Purpose: Wizard step 1 - Basic Information (scheme with its toggleable guideline
 * card, zone, sector, company identity and tax numbers), the Registered Address and
 * the HR / Finance / Purchase contacts.
 */

import { useState } from "react";

import { COMPANY_TYPES, REGISTRATION_TYPES, SCHEMES, SCHEME_GUIDELINES, SECTORS } from "../../data/addCompanyOptions.ts";
import { ZONE_NAMES } from "../../data/mous.ts";
import { Field, SelectInput, TextInput } from "../../ui/form.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Card, SectionTitle } from "../../ui/primitives.tsx";
import type { StepFormProps, TextFieldSpec } from "./formState.ts";

const ADDRESS_FIELDS: readonly TextFieldSpec[] = [
  { key: "address1", label: "Address Line 1", placeholder: "Street, Building No.", required: true, className: "lg:col-span-2" },
  { key: "address2", label: "Address Line 2", placeholder: "Area, Locality", className: "lg:col-span-2" },
  { key: "city", label: "City", placeholder: "Mumbai", required: true },
  { key: "district", label: "District", placeholder: "Mumbai Suburban" },
  { key: "pin", label: "PIN Code", placeholder: "400001", required: true, hint: "State will auto-fill" },
  { key: "state", label: "State", placeholder: "Maharashtra" },
];

const CONTACT_FIELDS: readonly TextFieldSpec[] = [
  { key: "hrName", label: "HR Contact Name", placeholder: "Full name", required: true },
  { key: "hrPhone", label: "HR Contact Number", placeholder: "+91 98765 43210", required: true, type: "tel" },
  { key: "hrEmail", label: "HR Email ID", placeholder: "hr@company.com", required: true, type: "email" },
  { key: "hrEmailConfirm", label: "Confirm HR Email ID", placeholder: "hr@company.com", required: true, type: "email", hint: "Must match HR Email ID" },
  { key: "financeName", label: "Finance Head Name", placeholder: "Full name" },
  { key: "financePhone", label: "Finance Head Contact", placeholder: "+91 98765 43211", type: "tel" },
  { key: "financeEmail", label: "Finance Email ID", placeholder: "finance@company.com", type: "email" },
  { key: "financeEmailConfirm", label: "Confirm Finance Email ID", placeholder: "finance@company.com", type: "email", hint: "Must match Finance Email ID" },
  { key: "purchaseName", label: "Purchase Name", placeholder: "Enter purchase contact name" },
  { key: "purchasePhone", label: "Purchase Number", placeholder: "Enter purchase contact number", type: "tel" },
  { key: "purchaseEmail", label: "Purchase Email ID", placeholder: "purchase@company.com", type: "email" },
  { key: "purchaseEmailConfirm", label: "Confirm Purchase Email ID", placeholder: "purchase@company.com", type: "email", hint: "Must match Purchase Email ID" },
];

function TextFields({ fields, values, onChange }: StepFormProps & { readonly fields: readonly TextFieldSpec[] }) {
  return fields.map((field) => (
    <Field key={field.key} label={field.label} required={field.required} hint={field.hint} className={field.className}>
      <TextInput
        type={field.type}
        placeholder={field.placeholder}
        value={values[field.key] ?? ""}
        onChange={(value) => onChange(field.key, value)}
      />
    </Field>
  ));
}

function SchemeGuidelines({ scheme, onClose }: { readonly scheme: string; readonly onClose: () => void }) {
  const guideline = SCHEME_GUIDELINES[scheme];
  if (guideline === undefined) return null;
  const tiles = [
    ["Eligibility", guideline.eligibility],
    ["Duration", guideline.duration],
    ["Stipend", guideline.stipend],
    ["Key Benefit", guideline.keyBenefit],
  ] as const;
  return (
    <div className="mt-5 rounded-xl border-l-4 p-4 space-y-3" style={{ borderColor: "#1B5FAE", background: "rgba(27, 95, 174, 0.06)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: "#1B5FAE" }}>
            {scheme} — Scheme Guidelines
          </p>
          <p className="text-sm font-semibold" style={{ color: "#0D2E5A" }}>
            {guideline.fullName}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted transition-colors text-xs"
        >
          <Icon name="close" className="w-4 h-4" strokeWidth={2} />
        </button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {tiles.map(([title, text]) => (
          <div key={title} className="bg-white/70 rounded-lg p-2.5 border border-border">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{title}</p>
            <p className="text-xs font-semibold text-foreground leading-snug">{text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CompanyDetailsStep({ values, onChange }: StepFormProps) {
  const [showGuidelines, setShowGuidelines] = useState(true);
  const scheme = values["scheme"] ?? "";
  const set = (key: string) => (value: string) => onChange(key, value);

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <SectionTitle>Basic Information</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Scheme<span className="text-red-500 ml-0.5">*</span>
              </label>
              {scheme !== "" && (
                <button
                  type="button"
                  title="View scheme guidelines"
                  onClick={() => setShowGuidelines((shown) => !shown)}
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border transition-colors shrink-0 ${
                    showGuidelines ? "bg-[#1B5FAE] border-[#1B5FAE] text-white" : "border-[#1B5FAE] text-[#1B5FAE] hover:bg-[#E8F0FB]"
                  }`}
                >
                  i
                </button>
              )}
            </div>
            <SelectInput
              options={SCHEMES}
              value={scheme}
              onChange={(value) => {
                onChange("scheme", value);
                setShowGuidelines(true);
              }}
            />
          </div>
          <Field label="Zone" required>
            <SelectInput options={ZONE_NAMES} value={values["zone"] ?? ""} onChange={set("zone")} />
          </Field>
          <Field label="Sector" required>
            <SelectInput options={SECTORS} value={values["sector"] ?? ""} onChange={set("sector")} />
          </Field>
          <Field label="Company Name" required className="lg:col-span-1">
            <TextInput placeholder="e.g. Tata Consultancy Services" value={values["companyName"] ?? ""} onChange={set("companyName")} />
          </Field>
          <Field label="Company Type" required>
            <SelectInput options={COMPANY_TYPES} value={values["companyType"] ?? ""} onChange={set("companyType")} />
          </Field>
          <Field label="Plant / Location" required>
            <TextInput placeholder="e.g. Pune Plant A" value={values["plant"] ?? ""} onChange={set("plant")} />
          </Field>
          <div className="flex flex-col gap-1">
            <Field label="Registration Type" required>
              <SelectInput options={REGISTRATION_TYPES} value={values["registrationType"] ?? ""} onChange={set("registrationType")} />
            </Field>
          </div>
          <Field label="GST Number" hint="Auto-validated format">
            <TextInput placeholder="22AAAAA0000A1Z5" value={values["gst"] ?? ""} onChange={set("gst")} />
          </Field>
          <Field label="TAN Number">
            <TextInput placeholder="BLRM12345B" value={values["tan"] ?? ""} onChange={set("tan")} />
          </Field>
        </div>
        {scheme !== "" && showGuidelines && <SchemeGuidelines scheme={scheme} onClose={() => setShowGuidelines(false)} />}
      </Card>

      <Card className="p-6">
        <SectionTitle>Registered Address</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <TextFields fields={ADDRESS_FIELDS} values={values} onChange={onChange} />
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle>Contact Information</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TextFields fields={CONTACT_FIELDS} values={values} onChange={onChange} />
        </div>
      </Card>
    </div>
  );
}
