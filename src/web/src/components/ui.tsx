/**
 * Purpose: SPEC-14's shared presentational primitives, ported from
 * `figma_code/src/App.tsx`'s `Badge`/`Btn`/`Card`/`SecTitle`. Deliberately
 * does NOT port Figma's `Input`/`Select` wrappers - every existing page's
 * native `<input>`/`<select>` elements carry the `id`/`htmlFor` pairing
 * dozens of Playwright tests locate via `getByLabel(...)`, and these two
 * components are purely presentational with no such structure to preserve.
 */

import type { ReactNode } from "react";

// eslint-disable-next-line react-refresh/only-export-components -- a plain constant, not a component
export const brand = {
  blue: "#1B5FAE",
  orange: "#F26522",
  green: "#39B54A",
  navy: "#0D2E5A",
};

export function Badge({
  text,
  variant = "default",
}: {
  readonly text: string;
  readonly variant?: "default" | "success" | "warning" | "danger" | "info" | "orange";
}) {
  const map: Record<string, string> = {
    default: "bg-secondary text-primary border border-border",
    success: "bg-green-50 text-green-700 border border-green-200",
    warning: "bg-amber-50 text-amber-700 border border-amber-200",
    danger: "bg-red-50 text-red-700 border border-red-200",
    info: "bg-blue-50 text-blue-700 border border-blue-200",
    orange: "bg-orange-50 text-orange-700 border border-orange-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold mono ${map[variant]}`}>
      {text}
    </span>
  );
}

export function Btn({
  children,
  onClick,
  type = "button",
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
}: {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly type?: "button" | "submit";
  readonly variant?: "primary" | "secondary" | "ghost" | "danger" | "orange";
  readonly size?: "sm" | "md" | "lg";
  readonly className?: string;
  readonly disabled?: boolean;
}) {
  const base =
    "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg";
  const variants: Record<string, string> = {
    primary: "bg-primary text-white border-primary hover:bg-blue-800 active:scale-95",
    orange: "bg-accent text-white border-accent hover:bg-orange-600 active:scale-95",
    secondary: "bg-secondary text-primary border-border hover:bg-blue-100",
    ghost: "bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground",
    danger: "bg-red-600 text-white border-red-600 hover:bg-red-700",
  };
  const sizes: Record<string, string> = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-sm" };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${variants[variant]} ${sizes[size]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
    >
      {children}
    </button>
  );
}

export function Card({ children, className = "" }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={`glass-card rounded-xl ${className}`}>{children}</div>;
}

export function SecTitle({ children }: { readonly children: ReactNode }) {
  return (
    <h3
      className="font-semibold text-sm text-foreground pb-3 mb-4 border-b border-border flex items-center gap-2 uppercase tracking-wide"
      style={{ color: brand.navy }}
    >
      {children}
    </h3>
  );
}
