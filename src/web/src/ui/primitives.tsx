/**
 * Purpose: The small building blocks every cloned screen is composed from - the
 * glass card, the uppercase section title, status/scheme badges and the button.
 * Each one fixes the exact utility classes of the design in one place, so screens
 * cannot drift from it independently.
 */

import type { ReactNode } from "react";

import { BRAND } from "./theme.ts";
import type { BadgeTone } from "./theme.ts";

export function Card({ children, className = "" }: { readonly children: ReactNode; readonly className?: string }) {
  return <div className={`glass-card rounded-xl ${className}`}>{children}</div>;
}

export function SectionTitle({ children }: { readonly children: ReactNode }) {
  return (
    <h3
      className="font-semibold text-sm text-foreground pb-3 mb-4 border-b border-border flex items-center gap-2 uppercase tracking-wide"
      style={{ color: BRAND.navy }}
    >
      {children}
    </h3>
  );
}

const BADGE_TONES: Record<BadgeTone, string> = {
  default: "bg-secondary text-primary border border-border",
  success: "bg-green-50 text-green-700 border border-green-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  danger: "bg-red-50  text-red-700  border border-red-200",
  info: "bg-blue-50 text-blue-700  border border-blue-200",
};

export function Badge({ text, tone = "default" }: { readonly text: string; readonly tone?: BadgeTone }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold mono ${BADGE_TONES[tone]}`}>
      {text}
    </span>
  );
}

const BUTTON_VARIANTS = {
  primary: "bg-primary   text-white       border-primary   hover:bg-blue-800",
  accent: "bg-accent    text-white       border-accent    hover:bg-orange-600",
  outline: "bg-white     text-primary     border-primary   hover:bg-blue-50",
  ghost: "bg-transparent text-muted-foreground border-transparent hover:bg-muted",
} as const;

const BUTTON_SIZES = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
} as const;

interface ButtonProps {
  readonly children: ReactNode;
  readonly onClick?: () => void;
  readonly variant?: keyof typeof BUTTON_VARIANTS;
  readonly size?: keyof typeof BUTTON_SIZES;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly type?: "button" | "submit";
}

export function Button({
  children,
  onClick,
  variant = "primary",
  size = "md",
  className = "",
  disabled = false,
  type = "button",
}: ButtonProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg ${BUTTON_VARIANTS[variant]} active:scale-95 ${BUTTON_SIZES[size]} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className}`}
    >
      {children}
    </button>
  );
}
