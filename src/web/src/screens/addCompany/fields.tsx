/**
 * Purpose: The small controls the wizard steps share beyond ui/form.tsx - the red
 * field message, the amber advisory note, a visually hidden label for the compact charge / payroll rows, and the pill
 * toggle group (Mobile/LAN, Yes/No) exposed as an accessible radiogroup.
 */

export function ErrorText({ message }: { readonly message: string | undefined }) {
  if (message === undefined) return null;
  return <p className="text-xs font-medium text-red-600">{message}</p>;
}

export function WarningText({ message }: { readonly message: string | undefined }) {
  if (message === undefined) return null;
  return <p className="text-xs font-medium text-amber-600">{message}</p>;
}

export function HiddenLabel({ htmlFor, children }: { readonly htmlFor: string; readonly children: string }) {
  return (
    <label htmlFor={htmlFor} className="sr-only">
      {children}
    </label>
  );
}

interface ToggleOption {
  readonly value: string;
  readonly label: string;
}

interface ToggleGroupProps {
  /** The group's accessible name. */
  readonly name: string;
  readonly options: readonly ToggleOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly size?: "sm" | "md";
  /** Look of the chosen pill, e.g. green for Yes. Defaults to brand blue. */
  readonly activeClass?: (value: string) => string;
}

const BLUE_ACTIVE = "bg-[#1B5FAE] border-[#1B5FAE] text-white";

export function ToggleGroup({ name, options, value, onChange, size = "md", activeClass = () => BLUE_ACTIVE }: ToggleGroupProps) {
  const pad = size === "sm" ? "px-3 py-1 text-xs" : "px-4 h-10 text-sm";
  return (
    <div role="radiogroup" aria-label={name} className="inline-flex rounded-lg gap-1.5">
      {options.map((option) => {
        const chosen = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={chosen}
            onClick={() => onChange(option.value)}
            className={`${pad} rounded-lg border font-semibold transition-colors ${
              chosen ? activeClass(option.value) : "bg-white border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
