/**
 * Purpose: Wizard Page 1, the SPEC-04 Company Details form - the twenty fields of
 * section 2 in diagram order. Every dropdown is fed from /api/enums and
 * /api/zones (AC1) so no option list is hardcoded here. The Mobile/LAN branch of
 * section 3 is a single choice governing both contacts: switching it warns and
 * then clears both numbers, so a LAN number can never be persisted as a mobile.
 * Rule checking itself lives in @mou/domain; this component only renders the
 * errors and warnings it is handed, which keeps the browser and the server in
 * step without duplicating a single rule.
 */

import type { CompanyDetails } from "@mou/domain";

import type { EnumOption, ZoneOption } from "../../api/client.ts";

export type Page1Data = CompanyDetails;

export type Page1Messages = Partial<Record<keyof Page1Data, string>>;

/** Every field starts blank; Page 1 has no meaningful defaults. */
// eslint-disable-next-line react-refresh/only-export-components -- a constant, not a component
export const EMPTY_PAGE1: Page1Data = {
  companyType: "",
  companyName: "",
  registrationType: "",
  tanNumber: "",
  gstNumber: "",
  zoneId: "",
  plantName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  pinCode: "",
  state: "",
  district: "",
  hrContactName: "",
  financeHeadContactName: "",
  contactType: "MOBILE",
  hrContactNumber: "",
  financeHeadContactNumber: "",
  hrEmail: "",
  confirmHrEmail: "",
  financeEmail: "",
  confirmFinanceEmail: "",
};

interface Page1Props {
  readonly data: Page1Data;
  readonly onChange: (data: Page1Data) => void;
  readonly errors: Page1Messages;
  readonly warnings: Page1Messages;
  readonly companyTypes: readonly EnumOption[];
  readonly registrationTypes: readonly EnumOption[];
  readonly contactTypes: readonly EnumOption[];
  readonly zones: readonly ZoneOption[];
}

const INPUT_CLASS =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
  readonly warning?: string | undefined;
  readonly placeholder?: string | undefined;
  readonly type?: "text" | "email";
  readonly onPaste?: React.ClipboardEventHandler<HTMLInputElement> | undefined;
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  warning,
  placeholder,
  type = "text",
  onPaste,
}: FieldProps) {
  const invalid = error !== undefined && error !== "";
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onPaste={onPaste}
        placeholder={placeholder}
        aria-invalid={invalid}
        className={`${INPUT_CLASS} ${invalid ? "border-red-500" : ""}`}
      />
      {invalid && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {warning !== undefined && warning !== "" && (
        <p className="mt-1 text-xs text-amber-600">{warning}</p>
      )}
    </div>
  );
}

interface SelectProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly EnumOption[];
  readonly error?: string | undefined;
  readonly placeholder?: string;
}

function Select({ id, label, value, onChange, options, error, placeholder }: SelectProps) {
  const invalid = error !== undefined && error !== "";
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        className={`${INPUT_CLASS} ${invalid ? "border-red-500" : ""}`}
      >
        <option value="">{placeholder ?? "Select…"}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {invalid && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export function Page1({
  data,
  onChange,
  errors,
  warnings,
  companyTypes,
  registrationTypes,
  contactTypes,
  zones,
}: Page1Props) {
  const set = (field: keyof Page1Data, value: string): void => {
    onChange({ ...data, [field]: value });
  };

  /**
   * Section 3: one Contact Type governs both contacts, and switching it after
   * numbers have been typed warns and then clears them. Clearing is what stops
   * a LAN number being carried over and saved as a mobile number.
   */
  const switchContactType = (next: string): void => {
    if (next === data.contactType) {
      return;
    }
    const hasContent =
      data.hrContactNumber.trim() !== "" || data.financeHeadContactNumber.trim() !== "";
    if (
      hasContent &&
      !window.confirm("Changing the contact type will clear both numbers. Continue?")
    ) {
      return;
    }
    onChange({
      ...data,
      contactType: next,
      hrContactNumber: "",
      financeHeadContactNumber: "",
    });
  };

  const numberHint = data.contactType === "LAN" ? "LAN number" : "10-digit mobile number";

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">Company Details</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Select
          id="companyType"
          label="Company Type"
          value={data.companyType}
          onChange={(value) => set("companyType", value)}
          options={companyTypes}
          error={errors.companyType}
          placeholder="Select company type"
        />
        <Field
          id="companyName"
          label="Company Name"
          value={data.companyName}
          onChange={(value) => set("companyName", value)}
          error={errors.companyName}
        />
        <Select
          id="registrationType"
          label="Registration Type"
          value={data.registrationType}
          onChange={(value) => set("registrationType", value)}
          options={registrationTypes}
          error={errors.registrationType}
          placeholder="Select registration type"
        />
        {/* TAN and GST are uppercased on entry (section 2). */}
        <Field
          id="tanNumber"
          label="TAN Number"
          value={data.tanNumber}
          onChange={(value) => set("tanNumber", value.toUpperCase())}
          error={errors.tanNumber}
          placeholder="ABCD12345E"
        />
        <Field
          id="gstNumber"
          label="GST Number"
          value={data.gstNumber}
          onChange={(value) => set("gstNumber", value.toUpperCase())}
          error={errors.gstNumber}
          warning={warnings.gstNumber}
          placeholder="27AAPFU0939F1ZV"
        />
        <div>
          <label htmlFor="zoneId" className="block text-sm font-medium text-gray-700">
            Zone
          </label>
          <select
            id="zoneId"
            value={data.zoneId}
            onChange={(event) => set("zoneId", event.target.value)}
            aria-invalid={errors.zoneId !== undefined}
            className={`${INPUT_CLASS} ${errors.zoneId !== undefined ? "border-red-500" : ""}`}
          >
            <option value="">Select zone</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name} ({zone.code})
              </option>
            ))}
          </select>
          {errors.zoneId !== undefined && (
            <p className="mt-1 text-xs text-red-600">{errors.zoneId}</p>
          )}
        </div>
        <Field
          id="plantName"
          label="Company Plant"
          value={data.plantName}
          onChange={(value) => set("plantName", value)}
          error={errors.plantName}
        />
      </div>

      <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Address</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          id="addressLine1"
          label="Address Line 1"
          value={data.addressLine1}
          onChange={(value) => set("addressLine1", value)}
          error={errors.addressLine1}
        />
        <Field
          id="addressLine2"
          label="Address Line 2"
          value={data.addressLine2}
          onChange={(value) => set("addressLine2", value)}
          error={errors.addressLine2}
        />
        <Field
          id="city"
          label="City"
          value={data.city}
          onChange={(value) => set("city", value)}
          error={errors.city}
        />
        <Field
          id="pinCode"
          label="PIN Code"
          value={data.pinCode}
          onChange={(value) => set("pinCode", value)}
          error={errors.pinCode}
          placeholder="411001"
        />
        <Field
          id="state"
          label="State"
          value={data.state}
          onChange={(value) => set("state", value)}
          error={errors.state}
        />
        <Field
          id="district"
          label="District"
          value={data.district}
          onChange={(value) => set("district", value)}
          error={errors.district}
        />
      </div>

      <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">Contacts</h3>
      <fieldset>
        <legend className="block text-sm font-medium text-gray-700">
          HR and Finance Head Contact Type
        </legend>
        <div className="mt-2 flex gap-6">
          {contactTypes.map((option) => (
            <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="radio"
                name="contactType"
                value={option.value}
                checked={data.contactType === option.value}
                onChange={() => switchContactType(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        {errors.contactType !== undefined && (
          <p className="mt-1 text-xs text-red-600">{errors.contactType}</p>
        )}
      </fieldset>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          id="hrContactName"
          label="HR Contact Name"
          value={data.hrContactName}
          onChange={(value) => set("hrContactName", value)}
          error={errors.hrContactName}
        />
        <Field
          id="financeHeadContactName"
          label="Finance Head Contact Name"
          value={data.financeHeadContactName}
          onChange={(value) => set("financeHeadContactName", value)}
          error={errors.financeHeadContactName}
        />
        <Field
          id="hrContactNumber"
          label="HR Contact Number"
          value={data.hrContactNumber}
          onChange={(value) => set("hrContactNumber", value)}
          error={errors.hrContactNumber}
          placeholder={numberHint}
        />
        <Field
          id="financeHeadContactNumber"
          label="Finance Head Contact Number"
          value={data.financeHeadContactNumber}
          onChange={(value) => set("financeHeadContactNumber", value)}
          error={errors.financeHeadContactNumber}
          placeholder={numberHint}
        />
        <Field
          id="hrEmail"
          label="HR Email ID"
          type="email"
          value={data.hrEmail}
          onChange={(value) => set("hrEmail", value)}
          error={errors.hrEmail}
        />
        <Field
          id="confirmHrEmail"
          label="Confirm HR Email ID"
          type="email"
          value={data.confirmHrEmail}
          onChange={(value) => set("confirmHrEmail", value)}
          error={errors.confirmHrEmail}
          // Section 4.1: paste is blocked because the field exists to catch a
          // typing mistake, and pasting the same typo defeats it.
          onPaste={(event) => event.preventDefault()}
        />
        <Field
          id="financeEmail"
          label="Finance Email ID"
          type="email"
          value={data.financeEmail}
          onChange={(value) => set("financeEmail", value)}
          error={errors.financeEmail}
        />
        <Field
          id="confirmFinanceEmail"
          label="Confirm Finance Email ID"
          type="email"
          value={data.confirmFinanceEmail}
          onChange={(value) => set("confirmFinanceEmail", value)}
          error={errors.confirmFinanceEmail}
          onPaste={(event) => event.preventDefault()}
        />
      </div>
    </div>
  );
}
