/**
 * Purpose: The User Manual's "Contents" rail - one button per section. The active
 * item is the one last clicked (the design has no scroll-spy); clicking scrolls the
 * content pane to that section.
 */

import { BRAND } from "../../ui/theme.ts";

interface ManualTocProps {
  readonly items: readonly { readonly id: string; readonly title: string }[];
  readonly activeId: string;
  readonly onSelect: (id: string) => void;
}

export function ManualToc({ items, activeId, onSelect }: ManualTocProps) {
  return (
    <nav
      className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border overflow-y-auto py-4 px-2"
      style={{ background: "rgba(255, 255, 255, 0.55)", backdropFilter: "blur(16px)" }}
    >
      <p className="px-3 mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND.orange }}>
        Contents
      </p>
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className={`text-left px-3 py-2 rounded-lg text-xs font-medium mb-0.5 transition-all ${
              active ? "text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            style={active ? { background: BRAND.blue } : undefined}
          >
            {item.title}
          </button>
        );
      })}
    </nav>
  );
}
