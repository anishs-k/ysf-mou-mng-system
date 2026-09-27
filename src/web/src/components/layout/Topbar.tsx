/**
 * Purpose: SPEC-14's per-page header (D93), ported from
 * `figma_code/src/App.tsx`'s `Topbar`. Every page passes its own
 * `title`/`subtitle` (replacing that page's former ad-hoc `<h1>`) plus
 * `onOpenMenu` from `useOutletContext()` (`AppShell.tsx` owns the mobile
 * drawer's open state). The bell navigates to `/alerts`; the search box
 * navigates to `/search?q=` on Enter (D87) - both real routes, neither a new
 * feature.
 */

import { useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../icons.tsx";
import { brand } from "../ui.tsx";

export function Topbar({
  title,
  subtitle,
  onOpenMenu,
}: {
  readonly title: string;
  readonly subtitle?: string;
  readonly onOpenMenu: () => void;
}) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") {
      return;
    }
    const trimmed = query.trim();
    navigate(trimmed === "" ? "/search" : `/search?q=${encodeURIComponent(trimmed)}`);
  }

  return (
    <header className="flex items-center justify-between px-4 md:px-6 glass-topbar shrink-0 gap-3" style={{ minHeight: 64 }}>
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="lg:hidden shrink-0 w-9 h-9 flex items-center justify-center text-muted-foreground hover:bg-muted rounded-lg transition-colors"
        >
          {Icon.menu}
        </button>
        <div className="min-w-0">
          <h1 className="font-bold text-sm md:text-base leading-tight truncate" style={{ color: brand.navy }}>
            {title}
          </h1>
          {subtitle !== undefined && <p className="text-xs text-muted-foreground hidden sm:block truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="relative hidden sm:block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{Icon.search}</span>
          <input
            type="text"
            aria-label="Search"
            placeholder="Search…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="w-36 md:w-56 h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-muted placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:bg-white focus:w-48 md:focus:w-64 transition-all"
          />
        </div>
        <button
          onClick={() => navigate("/alerts")}
          aria-label="MoU Expiry Alerts"
          className="relative w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
        >
          {Icon.bell}
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border border-white" style={{ background: brand.orange }} />
        </button>
      </div>
    </header>
  );
}
