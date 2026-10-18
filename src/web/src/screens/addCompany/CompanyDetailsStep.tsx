/**
 * Purpose: Wizard step 1 - Basic Information (scheme with its toggleable guideline
 * card, zone, sector, company identity and tax numbers), the Registered Address and
 * the contacts: HR and Finance Head with the shared Mobile/LAN toggle, the one
 * official HR & Finance email the API stores, and the optional purchase contact.
 * Every option list comes from /api/enums and /api/zones.
 */

import { SCHEME_GUIDELINES } from "@mou/domain";
import type { Scheme } from "@mou/domain";
import { useState } from "react";

import { Field, SelectInput, TextInput } from "../../ui/form.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Card, SectionTitle } from "../../ui/primitives.tsx";
import { ErrorText, ToggleGroup, WarningText } from "./fields.tsx";
import type { CompanyForm, WizardReference } from "./formState.ts";
import type { CompanyErrors } from "./validation.ts";
import { invalidBorder } from "./validation.ts";

type CompanyKey = keyof CompanyForm;

interface TextFieldSpec {
  readonly key: CompanyKey;
  readonly label: string;
  readonly placeholder: string;
  readonly required?: boolean;
  readonly type?: "text" | "email" | "tel";
  readonly hint?: string;
  readonly className?: string;
  /** TAN and GST are stored upper case. */
  readonly upper?: boolean;
}

const ADDRESS_FIELDS: readonly TextFieldSpec[] = [
  { key: "addressLine1", label: "Address Line 1", placeholder: "Street, Building No.", required: true, className: "lg:col-span-2" },
  { key: "addressLine2", label: "Address Line 2", placeholder: "Area, Locality", className: "lg:col-span-2" },
  { key: "city", label: "City", placeholder: "Mumbai", required: true },
  { key: "district", label: "District", placeholder: "Mumbai Suburban", required: true },
  { key: "pinCode", label: "PIN Code", placeholder: "400001", required: true, hint: "6 digits" },
  { key: "state", label: "State", placeholder: "Maharashtra", required: true },
];

const MOBILE_PLACEHOLDER = "10-digit mobile, e.g. 9876543210";
const LAN_PLACEHOLDER = "STD code and number, e.g. 020-24567890";

function contactFields(contactType: string): readonly TextFieldSpec[] {
  const numberPlaceholder = contactType === "LAN" ? LAN_PLACEHOLDER : MOBILE_PLACEHOLDER;
  return [
    { key: "hrContactNumber", label: "HR Contact Number", placeholder: numberPlaceholder, required: true, type: "tel" },
    { key: "financeHeadContactNumber", label: "Finance Head Contact", placeholder: numberPlaceholder, required: true, type: "tel" },
    { key: "officialEmail", label: "Official Email ID (HR & Finance)", placeholder: "hr@company.com", required: true, type: "email" },
    { key: "confirmEmail", label: "Confirm Official Email ID", placeholder: "hr@company.com", required: true, type: "email", hint: "Must match Official Email ID" },
    { key: "purchaseName", label: "Purchase Name", placeholder: "Enter purchase contact name" },
    { key: "purchaseNumber", label: "Purchase Number", placeholder: "Enter purchase contact number", type: "tel" },
    { key: "purchaseEmail", label: "Purchase Email ID", placeholder: "purchase@company.com", type: "email" },
    { key: "purchaseEmailConfirm", label: "Confirm Purchase Email ID", placeholder: "purchase@company.com", type: "email", hint: "Must match Purchase Email ID" },
  ];
}

interface CompanyDetailsStepProps {
  readonly company: CompanyForm;
  readonly onChange: (patch: Partial<CompanyForm>) => void;
  /** Empty until Save & Continue has been pressed once. */
  readonly errors: CompanyErrors;
  readonly warnings: CompanyErrors;
  readonly reference: WizardReference;
}

function TextFields({
  fields,
  company,
  onChange,
  errors,
}: Pick<CompanyDetailsStepProps, "company" | "onChange" | "errors"> & { readonly fields: readonly TextFieldSpec[] }) {
  return fields.map((field) => {
    const id = `company-${field.key}`;
    const error = errors[field.key];
    return (
      <Field key={field.key} label={field.label} htmlFor={id} required={field.required} hint={field.hint} className={field.className}>
        <TextInput
          id={id}
          type={field.type}
          placeholder={field.placeholder}
          value={company[field.key]}
          onChange={(value) => onChange({ [field.key]: field.upper === true ? value.toUpperCase() : value })}
          className={invalidBorder(error)}
        />
        <ErrorText message={error} />
      </Field>
    );
  });
}

function SchemeGuidelines({ scheme, label, onClose }: { readonly scheme: string; readonly label: string; readonly onClose: () => void }) {
  const guideline = SCHEME_GUIDELINES[scheme as Scheme] as (typeof SCHEME_GUIDELINES)[Scheme] | undefined;
  if (guideline === undefined) return null;
  const tiles = [
    ["Eligibility", guideline.eligibility],
    ["Duration", guideline.duration],
    ["Stipend", guideline.stipend],
    ["Key Benefit", guideline.benefit],
  ] as const;
  return (
    <div className="mt-5 rounded-xl border-l-4 p-4 space-y-3" style={{ borderColor: "#1B5FAE", background: "rgba(27, 95, 174, 0.06)" }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider mb-0.5" style={{ color: "#1B5FAE" }}>
            {label} — Scheme Guidelines
          </p>
          <p className="text-sm font-semibold" style={{ color: "#0D2E5A" }}>
            {guideline.tagline}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close guidelines"
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

export function CompanyDetailsStep({ company, onChange, errors, warnings, reference }: CompanyDetailsStepProps) {
  const [showGuidelines, setShowGuidelines] = useState(true);
  const { enums, zones } = reference;
  const scheme = company.scheme;
  const schemeLabel = enums.schemes.find((option) => option.value === scheme)?.label ?? scheme;
  const set = (key: CompanyKey) => (value: string) => onChange({ [key]: value });

  /** Section 3: one choice governs both numbers, so switching it clears them. */
  const setContactType = (contactType: string) => {
    if (contactType === company.contactType) return;
    onChange({ contactType, hrContactNumber: "", financeHeadContactNumber: "" });
  };

  const select = (key: CompanyKey, label: string, options: readonly { value: string; label: string }[], className = "") => (
    <Field label={label} htmlFor={`company-${key}`} required className={className}>
      <SelectInput id={`company-${key}`} options={options} value={company[key]} onChange={set(key)} />
      <ErrorText message={errors[key]} />
    </Field>
  );
  const text = (spec: TextFieldSpec) => <TextFields fields={[spec]} company={company} onChange={onChange} errors={errors} />;

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <SectionTitle>Basic Information</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <label htmlFor="company-scheme" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
              id="company-scheme"
              options={enums.schemes}
              value={scheme}
              onChange={(value) => {
                onChange({ scheme: value });
                setShowGuidelines(true);
              }}
            />
            <ErrorText message={errors.scheme} />
          </div>
          {select("zoneId", "Zone", zones.map((zone) => ({ value: zone.id, label: zone.name })))}
          {select("sector", "Sector", enums.sectors)}
          {text({ key: "companyName", label: "Company Name", placeholder: "e.g. Tata Consultancy Services", required: true })}
          {select("companyType", "Company Type", enums.companyTypes)}
          {text({ key: "plantName", label: "Plant / Location", placeholder: "e.g. Pune Plant A", required: true })}
          {select("registrationType", "Registration Type", enums.registrationTypes)}
          <div className="flex flex-col gap-1">
            {text({ key: "gstNumber", label: "GST Number", placeholder: "22AAAAA0000A1Z5", required: true, hint: "15 characters, upper case", upper: true })}
            <WarningText message={warnings.gstNumber} />
          </div>
          {text({ key: "tanNumber", label: "TAN Number", placeholder: "BLRM12345B", required: true, hint: "4 letters, 5 digits, 1 letter", upper: true })}
        </div>
        {scheme !== "" && showGuidelines && (
          <SchemeGuidelines scheme={scheme} label={schemeLabel} onClose={() => setShowGuidelines(false)} />
        )}
      </Card>

      <Card className="p-6">
        <SectionTitle>Registered Address</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <TextFields fields={ADDRESS_FIELDS} company={company} onChange={onChange} errors={errors} />
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle>Contact Information</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {text({ key: "hrContactName", label: "HR Contact Name", placeholder: "Full name", required: true })}
          {text({ key: "financeHeadContactName", label: "Finance Head Name", placeholder: "Full name", required: true })}
          <Field label="Contact Type" required hint="Applies to both the HR and Finance Head numbers" className="md:col-span-2">
            <ToggleGroup
              name="Contact Type"
              options={enums.contactTypes}
              value={company.contactType}
              onChange={setContactType}
            />
            <ErrorText message={errors.contactType} />
          </Field>
          <TextFields fields={contactFields(company.contactType)} company={company} onChange={onChange} errors={errors} />
        </div>
      </Card>
    </div>
  );
}
