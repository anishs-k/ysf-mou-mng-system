/**
 * Purpose: The form controls every cloned form screen shares - the labelled field
 * wrapper (uppercase label, red required star, optional hint) and the text, date
 * and select inputs with the prototype's exact classes - so Add Company, Upload,
 * Edit, Export and History cannot drift from one another.
 */

import type { ChangeEvent, ReactNode } from "react";

import { Icon } from "./Icon.tsx";

const INPUT_CLASS =
  "h-10 px-3 border border-border rounded-lg text-sm bg-white text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-all";

const SELECT_CLASS =
  "w-full h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed";

interface FieldProps {
  readonly label?: string;
  /** The id of the control the label names, so it can be found by its label. */
  readonly htmlFor?: string;
  readonly required?: boolean;
  readonly hint?: string;
  /** Extra wrapper classes, e.g. a grid span or a width. */
  readonly className?: string;
  readonly children: ReactNode;
}

export function Field({ label, htmlFor, required = false, hint, className = "", children }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label !== undefined && (
        <label htmlFor={htmlFor} className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      {children}
      {hint !== undefined && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

interface TextInputProps {
  readonly id?: string;
  /** Names a control that has no visible label, e.g. a bare filter-bar date. */
  readonly ariaLabel?: string;
  readonly type?: "text" | "email" | "tel" | "date" | "number" | "password";
  readonly placeholder?: string;
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly className?: string;
}

export function TextInput({ id, ariaLabel, type = "text", placeholder, value, onChange, className = "" }: TextInputProps) {
  return (
    <input
      id={id}
      aria-label={ariaLabel}
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange === undefined ? undefined : (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      className={`${INPUT_CLASS} ${className}`}
    />
  );
}

/** An option whose submitted value (an id or enum code) differs from the text shown. */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface SelectInputProps {
  /** Plain strings are both value and label; `{ value, label }` options keep them apart. */
  readonly options: readonly string[] | readonly SelectOption[];
  readonly id?: string;
  /** Names a select that has no visible label, e.g. in a bare filter bar. */
  readonly ariaLabel?: string;
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}

function toOption(option: string | SelectOption): SelectOption {
  return typeof option === "string" ? { value: option, label: option } : option;
}

export function SelectInput({ options, id, ariaLabel, value, onChange, placeholder = "Select…", disabled = false }: SelectInputProps) {
  return (
    <div className="relative">
      <select
        id={id}
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={onChange === undefined ? undefined : (event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">{placeholder}</option>
        {options.map(toOption).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
        <Icon name="chevronDown" className="w-4 h-4" strokeWidth={2} />
      </span>
    </div>
  );
}
