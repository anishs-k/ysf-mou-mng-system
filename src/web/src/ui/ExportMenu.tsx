/**
 * Purpose: The one Export button every record export uses. Clicking it opens a
 * small menu with the two choices the client asked for - "Only MoU" (the MoU in
 * the client's MOU TEMPLATE layout) or "Full Details" (company, contacts,
 * commercial and payroll) - and hands the choice to the screen's own exporter.
 * The menu is portalled to <body> with fixed positioning under the button, so a
 * card's overflow or stacking can never hide it. Closes on a choice, a click
 * outside, Escape, scrolling or resizing.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { ExportView } from "../api/client.ts";
import { Icon } from "./Icon.tsx";

const CHOICES: readonly { readonly view: ExportView; readonly label: string; readonly hint: string }[] = [
  { view: "mou", label: "Only MoU", hint: "MoU details as in the MOU sheet" },
  { view: "full", label: "Full Details", hint: "Company, contacts, commercial and payroll" },
];

const MENU_WIDTH = 256;
const GAP = 4;

interface ExportMenuProps {
  /** e.g. "Export PDF" / "Export Excel" / "Download". */
  readonly label: string;
  readonly busy: boolean;
  readonly disabled?: boolean;
  readonly onPick: (view: ExportView) => void;
  /** The trigger's classes, so each screen keeps its own button look. */
  readonly className: string;
  /** Line the menu up with the button's right edge (default) or its left. */
  readonly align?: "left" | "right";
}

interface Position {
  readonly top: number;
  readonly left: number;
}

export function ExportMenu({ label, busy, disabled = false, onPick, className, align = "right" }: ExportMenuProps) {
  const [position, setPosition] = useState<Position | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = position !== null;

  /** Below the button, kept inside the window horizontally. */
  const place = (): Position | null => {
    const rect = trigger.current?.getBoundingClientRect();
    if (rect === undefined) return null;
    const preferred = align === "right" ? rect.right - MENU_WIDTH : rect.left;
    const left = Math.min(Math.max(8, preferred), window.innerWidth - MENU_WIDTH - 8);
    return { top: rect.bottom + GAP, left };
  };

  // Flip above the button when the menu would run off the bottom of the window.
  useLayoutEffect(() => {
    if (!open || menu.current === null || trigger.current === null) return;
    const height = menu.current.offsetHeight;
    const rect = trigger.current.getBoundingClientRect();
    if (rect.bottom + GAP + height > window.innerHeight && rect.top - GAP - height > 0) {
      setPosition((current) => (current === null ? null : { ...current, top: rect.top - GAP - height }));
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setPosition(null);
    const outside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!trigger.current?.contains(target) && !menu.current?.contains(target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={className}
        disabled={disabled || busy}
        aria-busy={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setPosition(open ? null : place())}
      >
        {busy ? (
          <span aria-hidden="true" className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
        ) : (
          <Icon name="download" />
        )}
        {busy ? "Exporting…" : label}
        {!busy && <Icon name="chevronDown" className="w-3.5 h-3.5" strokeWidth={2} />}
      </button>
      {position !== null &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            className="fixed z-[1000] rounded-lg border border-border bg-white shadow-xl py-1"
            style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          >
            {CHOICES.map((choice) => (
              <button
                key={choice.view}
                type="button"
                role="menuitem"
                className="w-full text-left px-3 py-2 hover:bg-[#E8F0FB] transition-colors"
                onClick={() => {
                  setPosition(null);
                  onPick(choice.view);
                }}
              >
                <span className="block text-sm font-semibold text-foreground">{choice.label}</span>
                <span className="block text-xs text-muted-foreground">{choice.hint}</span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
