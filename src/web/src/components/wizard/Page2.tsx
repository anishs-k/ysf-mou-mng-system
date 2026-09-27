/**
 * Purpose: Wizard Page 2, the SPEC-05 Commercial Details form - MOU dates and
 * tenure with a derived end-date preview, the signed MOU PDF upload, the payment
 * cycle, the 16 fixed charges (rendered from the commercialItems catalogue, never
 * hardcoded, per AC1's pattern from Page 1), and repeatable "Other" rows. Rule
 * checking lives in @mou/domain's validateCommercialDetails; this component only
 * renders the errors and warnings it is handed. The PDF itself is validated and
 * stored by the server at upload time (section 4), so this component's only job
 * around the file is to show what was accepted or why it was not.
 */

import { computeEndDate } from "@mou/domain";
import type { CommercialDetailErrors, CommercialDetailWarnings } from "@mou/domain";

import type { CommercialItemOption, EnumOption, MouDocumentMeta } from "../../api/client.ts";

export interface OtherChargeRowInput {
  label: string;
  amount: string;
  itemType: string;
}

export interface Page2Data {
  mouStartDate: string;
  tenureValue: string;
  tenureUnit: string;
  attendanceCycle: string;
  stipendDate: string;
  charges: Record<string, string>;
  otherItems: OtherChargeRowInput[];
  mouDocument: MouDocumentMeta | undefined;
}

// eslint-disable-next-line react-refresh/only-export-components -- a constant, not a component
export const EMPTY_PAGE2: Page2Data = {
  mouStartDate: "",
  tenureValue: "",
  tenureUnit: "MONTHS",
  attendanceCycle: "",
  stipendDate: "",
  charges: {},
  otherItems: [],
  mouDocument: undefined,
};

const INPUT_CLASS =
  "mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

interface FieldProps {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string | undefined;
  readonly placeholder?: string | undefined;
}

function Field({ id, label, value, onChange, error, placeholder }: FieldProps) {
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
        placeholder={placeholder}
        aria-invalid={invalid}
        className={`${INPUT_CLASS} ${invalid ? "border-red-500" : ""}`}
      />
      {invalid && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

interface Page2Props {
  readonly data: Page2Data;
  readonly onChange: (data: Page2Data) => void;
  readonly errors: CommercialDetailErrors;
  readonly warnings: CommercialDetailWarnings;
  readonly commercialItems: readonly CommercialItemOption[];
  readonly itemTypes: readonly EnumOption[];
  readonly draftId: string | null;
  readonly onUploadDocument: (file: File) => void;
  readonly isUploading: boolean;
  readonly uploadError: string | null;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function Page2({
  data,
  onChange,
  errors,
  warnings,
  commercialItems,
  itemTypes,
  draftId,
  onUploadDocument,
  isUploading,
  uploadError,
}: Page2Props) {
  const set = <K extends keyof Page2Data>(field: K, value: Page2Data[K]): void => {
    onChange({ ...data, [field]: value });
  };

  const setCharge = (key: string, value: string): void => {
    onChange({ ...data, charges: { ...data.charges, [key]: value } });
  };

  const addOtherRow = (): void => {
    onChange({ ...data, otherItems: [...data.otherItems, { label: "", amount: "", itemType: "" }] });
  };

  const removeOtherRow = (index: number): void => {
    onChange({ ...data, otherItems: data.otherItems.filter((_, i) => i !== index) });
  };

  const setOtherRow = (index: number, patch: Partial<OtherChargeRowInput>): void => {
    onChange({
      ...data,
      otherItems: data.otherItems.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    });
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file !== undefined) {
      onUploadDocument(file);
    }
  };

  let endDatePreview: string | undefined;
  const tenureValue = Number(data.tenureValue);
  if (
    data.mouStartDate !== "" &&
    Number.isInteger(tenureValue) &&
    tenureValue > 0 &&
    (data.tenureUnit === "MONTHS" || data.tenureUnit === "YEARS")
  ) {
    try {
      endDatePreview = computeEndDate(data.mouStartDate, tenureValue, data.tenureUnit);
    } catch {
      endDatePreview = undefined;
    }
  }

  const fixedCharges = commercialItems
    .filter((item) => item.itemType !== null)
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-semibold text-gray-900">Commercial Details</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          id="mouStartDate"
          label="MoU Start Date"
          value={data.mouStartDate}
          onChange={(value) => set("mouStartDate", value)}
          error={errors.mouStartDate}
        />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="tenureValue" className="block text-sm font-medium text-gray-700">
              Tenure
            </label>
            <input
              id="tenureValue"
              type="text"
              value={data.tenureValue}
              onChange={(event) => set("tenureValue", event.target.value)}
              aria-invalid={errors.tenureValue !== undefined}
              className={`${INPUT_CLASS} ${errors.tenureValue !== undefined ? "border-red-500" : ""}`}
            />
          </div>
          <div>
            <label htmlFor="tenureUnit" className="block text-sm font-medium text-gray-700">
              Unit
            </label>
            <select
              id="tenureUnit"
              value={data.tenureUnit}
              onChange={(event) => set("tenureUnit", event.target.value)}
              className={INPUT_CLASS}
            >
              <option value="MONTHS">Months</option>
              <option value="YEARS">Years</option>
            </select>
          </div>
        </div>
        {(errors.tenureValue !== undefined || errors.tenureUnit !== undefined) && (
          <p className="-mt-3 text-xs text-red-600 md:col-start-2">
            {errors.tenureValue ?? errors.tenureUnit}
          </p>
        )}
        {warnings.mouStartDate !== undefined && (
          <p className="-mt-3 text-xs text-amber-600">{warnings.mouStartDate}</p>
        )}
        <div>
          <span className="block text-sm font-medium text-gray-700">MoU End Date</span>
          <p className="mt-1 rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {endDatePreview ?? "—"}
          </p>
        </div>
      </div>

      <div>
        <label htmlFor="mouDocument" className="block text-sm font-medium text-gray-700">
          Upload MoU PDF
        </label>
        <input
          id="mouDocument"
          type="file"
          accept="application/pdf"
          disabled={draftId === null || isUploading}
          onChange={handleFileSelected}
          className="mt-1 block w-full text-sm text-gray-700"
        />
        {isUploading && <p className="mt-1 text-xs text-gray-500">Uploading…</p>}
        {data.mouDocument !== undefined && (
          <p className="mt-1 text-xs text-green-700">
            {data.mouDocument.originalFilename} ({formatFileSize(data.mouDocument.fileSizeBytes)})
          </p>
        )}
        {(uploadError !== null || errors.mouDocument !== undefined) && (
          <p className="mt-1 text-xs text-red-600">{uploadError ?? errors.mouDocument}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field
          id="attendanceCycle"
          label="Attendance Cycle"
          value={data.attendanceCycle}
          onChange={(value) => set("attendanceCycle", value)}
          error={errors.attendanceCycle}
        />
        <Field
          id="stipendDate"
          label="Stipend Date"
          value={data.stipendDate}
          onChange={(value) => set("stipendDate", value)}
          error={errors.stipendDate}
          placeholder="Day of month, 1-31"
        />
      </div>

      <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Commercial Charges
      </h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {fixedCharges.map((item) => (
          <Field
            key={item.key}
            id={`charge-${item.key}`}
            label={item.label}
            value={data.charges[item.key] ?? ""}
            onChange={(value) => setCharge(item.key, value)}
            error={errors.charges?.[item.key]}
            placeholder="Leave blank if not applicable"
          />
        ))}
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
          Add Other charge
        </button>
      </div>
    </div>
  );
}
