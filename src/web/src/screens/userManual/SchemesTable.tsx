/**
 * Purpose: The striped "Supported Schemes" list of the manual's Overview - scheme
 * code, full name and governing body per row.
 */

import type { SchemeRow } from "../../data/userManual.ts";
import { BRAND } from "../../ui/theme.ts";

export function SchemesTable({ rows }: { readonly rows: readonly SchemeRow[] }) {
  return (
    <div className="glass-card rounded-xl overflow-hidden">
      {rows.map((row, index) => (
        <div key={row.code} className={`flex items-center gap-3 px-4 py-2.5 text-xs ${index % 2 === 0 ? "bg-white/40" : "bg-white/20"}`}>
          <span className="font-bold w-14 shrink-0" style={{ color: BRAND.blue }}>
            {row.code}
          </span>
          <span className="flex-1 text-foreground">{row.name}</span>
          <span className="text-muted-foreground shrink-0">{row.body}</span>
        </div>
      ))}
    </div>
  );
}
