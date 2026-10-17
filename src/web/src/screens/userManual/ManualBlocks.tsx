/**
 * Purpose: The small content blocks the manual's sections are built from - numbered
 * steps, striped term tables, field lists, tip/warning callouts, the export report
 * list, language chips and FAQ cards - each with the design's exact classes.
 */

import type { FaqItem, ReportRow, TermRow, TermTableLook } from "../../data/userManual.ts";
import { BRAND } from "../../ui/theme.ts";

const stripe = (index: number): string => (index % 2 === 0 ? "bg-white/40" : "bg-white/20");

export function StepList({ steps, tight = false }: { readonly steps: readonly string[]; readonly tight?: boolean }) {
  return (
    <div className={`space-y-2 ${tight ? "mb-3" : "mb-4"}`}>
      {steps.map((step, index) => (
        <div key={step} className="flex gap-3 items-start">
          <span
            className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5"
            style={{ background: BRAND.blue }}
          >
            {index + 1}
          </span>
          <p className="text-sm text-foreground leading-relaxed">{step}</p>
        </div>
      ))}
    </div>
  );
}

const TERM_LOOKS: Record<TermTableLook, { readonly table: string; readonly row: string; readonly term: string }> = {
  kpi: { table: "mb-3", row: "py-2.5", term: "font-semibold text-xs w-32 shrink-0" },
  tabs: { table: "mb-3", row: "py-2.5", term: "font-semibold text-xs w-24 shrink-0" },
  expiry: { table: "mb-4", row: "py-3", term: "font-bold text-xs w-40 shrink-0" },
};

export function TermTable({ look, rows }: { readonly look: TermTableLook; readonly rows: readonly TermRow[] }) {
  const classes = TERM_LOOKS[look];
  return (
    <div className={`glass-card rounded-xl overflow-hidden ${classes.table}`}>
      {rows.map((row, index) => (
        <div key={row.term} className={`flex gap-3 px-4 ${classes.row} ${stripe(index)}`}>
          <span className={classes.term} style={{ color: row.color ?? BRAND.navy }}>
            {row.term}
          </span>
          <span className="text-xs text-muted-foreground">{row.text}</span>
        </div>
      ))}
    </div>
  );
}

export function FieldList({ title, rows }: { readonly title?: string; readonly rows: readonly TermRow[] }) {
  return (
    <div className="glass-card rounded-xl p-4 mb-4">
      {title !== undefined && (
        <p className="text-xs font-bold mb-2" style={{ color: BRAND.navy }}>
          {title}
        </p>
      )}
      {rows.map((row) => (
        <div key={row.term} className="flex gap-2 py-1.5 border-b border-border last:border-0">
          <span className="shrink-0 text-xs font-bold min-w-[140px]" style={{ color: BRAND.navy }}>
            {row.term}
          </span>
          <span className="text-xs text-muted-foreground">{row.text}</span>
        </div>
      ))}
    </div>
  );
}

const TIP_TONES = {
  info: { emoji: "\u{1F4A1}", background: "rgba(27, 95, 174, 0.07)", color: BRAND.navy },
  warning: { emoji: "⚠️", background: "rgba(242, 101, 34, 0.08)", color: BRAND.orange },
} as const;

export function Tip({ tone, text }: { readonly tone: keyof typeof TIP_TONES; readonly text: string }) {
  const look = TIP_TONES[tone];
  return (
    <div className="flex gap-2 items-start px-3 py-2 rounded-lg text-xs" style={{ background: look.background }}>
      <span className="text-lg leading-none mt-[-2px]">{look.emoji}</span>
      <span style={{ color: look.color }}>{text}</span>
    </div>
  );
}

export function ReportList({ rows }: { readonly rows: readonly ReportRow[] }) {
  return (
    <div className="glass-card rounded-xl overflow-hidden mb-4">
      {rows.map((row, index) => (
        <div key={row.name} className={`flex flex-col sm:flex-row gap-1 sm:gap-3 px-4 py-3 ${stripe(index)}`}>
          <div className="sm:w-48 shrink-0">
            <p className="text-xs font-semibold" style={{ color: BRAND.navy }}>
              {row.name}
            </p>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: "rgba(27, 95, 174, 0.1)", color: BRAND.blue }}
            >
              {row.format}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">{row.text}</span>
        </div>
      ))}
    </div>
  );
}

export function LanguageChips({ title, languages }: { readonly title: string; readonly languages: readonly string[] }) {
  return (
    <div className="glass-card rounded-xl p-4 mb-3">
      <p className="text-xs font-bold mb-2" style={{ color: BRAND.navy }}>
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {languages.map((language) => (
          <span key={language} className="px-2 py-0.5 rounded text-xs border border-border bg-white/60">
            {language}
          </span>
        ))}
      </div>
    </div>
  );
}

export function FaqList({ items }: { readonly items: readonly FaqItem[] }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.question} className="glass-card rounded-xl p-4">
          <p className="text-sm font-semibold mb-1" style={{ color: BRAND.navy }}>
            {item.question}
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">{item.answer}</p>
        </div>
      ))}
    </div>
  );
}
