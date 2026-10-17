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
  "w-full h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white text-foreground appearance-none focus:outline-none focus:ring-2 focus:ring-ring";

interface FieldProps {
  readonly label?: string;
  readonly required?: boolean;
  readonly hint?: string;
  /** Extra wrapper classes, e.g. a grid span or a width. */
  readonly className?: string;
  readonly children: ReactNode;
}

export function Field({ label, required = false, hint, className = "", children }: FieldProps) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label !== undefined && (
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
  readonly type?: "text" | "email" | "tel" | "date" | "number";
  readonly placeholder?: string;
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly className?: string;
}

export function TextInput({ type = "text", placeholder, value, onChange, className = "" }: TextInputProps) {
  return (
    <input
      type={type}
      placeholder={placeholder}
      value={value}
      onChange={onChange === undefined ? undefined : (event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
      className={`${INPUT_CLASS} ${className}`}
    />
  );
}

interface SelectInputProps {
  readonly options: readonly string[];
  readonly value?: string;
  readonly onChange?: (value: string) => void;
  readonly placeholder?: string;
}

export function SelectInput({ options, value, onChange, placeholder = "Select…" }: SelectInputProps) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange === undefined ? undefined : (event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value)}
        className={SELECT_CLASS}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
        <Icon name="chevronDown" className="w-4 h-4" strokeWidth={2} />
      </span>
    </div>
  );
}
