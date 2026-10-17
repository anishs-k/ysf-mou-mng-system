/**
 * Purpose: The Existing Companies screen - a search box with zone, scheme and
 * status filters over the 233 static MoU records, and the record view (Overview,
 * Commercial, Payroll, History and Documents tabs) that opens when a row or its
 * View button is clicked. Filtering happens in memory as the user types or picks.
 */

import { useMemo, useState } from "react";

import {
  PROFILE_ALLOWANCES,
  PROFILE_COMMERCIAL,
  PROFILE_DEDUCTIONS,
  PROFILE_DOCUMENTS,
  PROFILE_HISTORY,
  PROFILE_OVERVIEW,
} from "../data/companyProfile.ts";
import type { LabelledValue } from "../data/companyProfile.ts";
import { SCHEME_OPTIONS } from "../data/agreementHistory.ts";
import { MOUS, ZONE_NAMES } from "../data/mous.ts";
import type { MouRecord } from "../data/mous.ts";
import { Field, SelectInput } from "../ui/form.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge, Button, Card, SectionTitle } from "../ui/primitives.tsx";
import { BRAND, statusTone } from "../ui/theme.ts";

/** The prototype's option lists start with an empty entry after "Select…". */
const ZONE_OPTIONS: readonly string[] = ["", ...ZONE_NAMES];
const SCHEME_FILTER_OPTIONS: readonly string[] = ["", ...SCHEME_OPTIONS];
const STATUS_OPTIONS: readonly string[] = ["Active", "Expiring", "Expired", "Pending"];

const COLUMNS = ["Company", "MoU Code", "Zone", "Plant", "Scheme", "Expires", "Status", ""];
const TH_CLASS = "px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide";
const GHOST_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-3 py-1.5 text-xs  ";
const SECONDARY_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary     border-border    hover:bg-blue-100 px-3 py-1.5 text-xs  ";

const TABS = ["Overview", "Commercial", "Payroll", "History", "Documents"] as const;
type Tab = (typeof TABS)[number];

interface Filters {
  readonly query: string;
  readonly zone: string;
  readonly scheme: string;
  readonly status: string;
}

const NO_FILTERS: Filters = { query: "", zone: "", scheme: "", status: "" };

function matches(mou: MouRecord, filters: Filters): boolean {
  const query = filters.query.trim().toLowerCase();
  if (query !== "" && !mou.company.toLowerCase().includes(query) && !mou.code.toLowerCase().includes(query)) return false;
  if (filters.zone !== "" && mou.zone !== filters.zone) return false;
  if (filters.scheme !== "" && mou.scheme !== filters.scheme) return false;
  return filters.status === "" || mou.status === filters.status;
}

export function ExistingCompaniesScreen() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [selected, setSelected] = useState<MouRecord | null>(null);
  const rows = useMemo(() => MOUS.filter((mou) => matches(mou, filters)), [filters]);
  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch }));

  if (selected !== null) return <CompanyRecord mou={selected} onBack={() => setSelected(null)} />;

  return (
    <ScreenFrame
      title="Existing Companies"
      subtitle="Search, view and manage MoU company records"
      contentClassName="p-4 md:p-6 space-y-4 md:space-y-5"
    >
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
          <div className="relative flex-1 min-w-0 sm:min-w-52">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <Icon name="search" className="w-4 h-4" />
            </span>
            <input
              placeholder="Search by company name, code, GST…"
              value={filters.query}
              onChange={(event) => update({ query: event.target.value })}
              className="w-full h-10 pl-9 pr-3 border border-border rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-3 flex-wrap">
            <Field className="flex-1 sm:w-44">
              <SelectInput options={ZONE_OPTIONS} value={filters.zone} onChange={(zone) => update({ zone })} />
            </Field>
            <Field className="flex-1 sm:w-32">
              <SelectInput options={SCHEME_FILTER_OPTIONS} value={filters.scheme} onChange={(scheme) => update({ scheme })} />
            </Field>
            <Field className="flex-1 sm:w-36">
              <SelectInput options={STATUS_OPTIONS} value={filters.status} onChange={(status) => update({ status })} />
            </Field>
            <button type="button" onClick={() => setFilters(NO_FILTERS)} className={GHOST_BUTTON}>
              Clear
            </button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-border">
          <p className="text-sm font-bold" style={{ color: BRAND.navy }}>
            {rows.length} records found
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {COLUMNS.map((heading) => (
                  <th key={heading} className={TH_CLASS}>
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((mou) => (
                <tr
                  key={mou.id}
                  onClick={() => setSelected(mou)}
                  className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-semibold text-foreground text-xs">{mou.company}</td>
                  <td className="px-4 py-3 mono text-xs font-bold" style={{ color: BRAND.blue }}>
                    {mou.code}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{mou.zone}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{mou.plant}</td>
                  <td className="px-4 py-3">
                    <Badge text={mou.scheme} tone="info" />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs mono">{mou.expires}</td>
                  <td className="px-4 py-3">
                    <Badge text={mou.status} tone={statusTone(mou.status)} />
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected(mou);
                      }}
                      className={GHOST_BUTTON}
                    >
                      <Icon name="eye" className="w-4 h-4" />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </ScreenFrame>
  );
}

function CompanyRecord({ mou, onBack }: { readonly mou: MouRecord; readonly onBack: () => void }) {
  const [tab, setTab] = useState<Tab>("Overview");
  return (
    <ScreenFrame title={mou.company} subtitle={`${mou.code} · ${mou.zone} Zone`} contentClassName="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <button type="button" onClick={onBack} className="text-sm font-semibold hover:underline self-start" style={{ color: BRAND.blue }}>
          ← Back to list
        </button>
        <div className="flex items-center gap-2 flex-wrap sm:flex-1">
          <Badge text={mou.status} tone={statusTone(mou.status)} />
          <Badge text={mou.scheme} tone="info" />
          <div className="sm:ml-auto flex gap-2">
            <button type="button" className={SECONDARY_BUTTON}>
              <Icon name="download" /> Export PDF
            </button>
            <Button variant="accent" size="sm">
              <Icon name="upload" /> Upload MoU
            </Button>
          </div>
        </div>
      </div>

      <div className="flex border-b border-border mb-5 overflow-x-auto">
        {TABS.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setTab(name)}
            className="px-5 py-2.5 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px"
            style={name === tab ? { borderColor: BRAND.orange, color: BRAND.orange } : { borderColor: "transparent", color: "#5A7AA8" }}
          >
            {name}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <DetailGrid
          title="Company Overview"
          items={[
            { label: "Company Type", value: PROFILE_OVERVIEW.companyType },
            { label: "Registration", value: PROFILE_OVERVIEW.registration },
            { label: "GST Number", value: PROFILE_OVERVIEW.gst },
            { label: "TAN Number", value: PROFILE_OVERVIEW.tan },
            { label: "Zone", value: mou.zone },
            { label: "Plant", value: mou.plant },
            { label: "HR Contact", value: PROFILE_OVERVIEW.hrContact },
            { label: "Finance Head", value: PROFILE_OVERVIEW.financeHead },
            { label: "Email", value: PROFILE_OVERVIEW.email },
            { label: "Address", value: PROFILE_OVERVIEW.address },
            { label: "MoU Code", value: mou.code },
            { label: "Expires", value: mou.expires },
          ]}
        />
      )}
      {tab === "Commercial" && (
        <DetailGrid title="Commercial Details" items={[{ label: "Scheme", value: mou.scheme }, ...PROFILE_COMMERCIAL]} />
      )}
      {tab === "Payroll" && <PayrollPanel />}
      {tab === "History" && <HistoryPanel />}
      {tab === "Documents" && <DocumentsPanel />}
    </ScreenFrame>
  );
}

function DetailGrid({ title, items }: { readonly title: string; readonly items: readonly LabelledValue[] }) {
  return (
    <Card className="p-6">
      <SectionTitle>{title}</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-8">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">{item.label}</p>
            <p className="text-sm font-semibold text-foreground">{item.value}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

function PayrollColumn({ title, lines, valueClass, valueColor }: {
  readonly title: string;
  readonly lines: readonly LabelledValue[];
  readonly valueClass: string;
  readonly valueColor?: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{title}</p>
      {lines.map((line) => (
        <div key={line.label} className="flex justify-between py-2 border-b border-border text-sm">
          <span className="font-medium text-foreground">{line.label}</span>
          <span className={valueClass} style={valueColor === undefined ? undefined : { color: valueColor }}>
            {line.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function PayrollPanel() {
  return (
    <Card className="p-6">
      <SectionTitle>Payroll Configuration</SectionTitle>
      <div className="grid md:grid-cols-2 gap-6">
        <PayrollColumn title="Allowances" lines={PROFILE_ALLOWANCES} valueClass="mono font-bold" valueColor={BRAND.green} />
        <PayrollColumn title="Deductions" lines={PROFILE_DEDUCTIONS} valueClass="mono font-bold text-red-600" />
      </div>
    </Card>
  );
}

function HistoryPanel() {
  return (
    <Card>
      <div className="px-5 pt-5 pb-3 border-b border-border">
        <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: BRAND.navy }}>
          Agreement History
        </h3>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-muted/40">
            {["MoU Code", "Start", "End", "Scheme", "Status"].map((heading) => (
              <th key={heading} className={TH_CLASS}>
                {heading}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PROFILE_HISTORY.map((row) => (
            <tr key={row.code} className="border-b border-border last:border-0">
              <td className="px-4 py-3 mono text-xs font-bold" style={{ color: BRAND.blue }}>
                {row.code}
              </td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{row.start}</td>
              <td className="px-4 py-3 text-muted-foreground text-xs">{row.end}</td>
              <td className="px-4 py-3">
                <Badge text={row.scheme} tone="info" />
              </td>
              <td className="px-4 py-3">
                <Badge text={row.status} tone={statusTone(row.status)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

function DocumentsPanel() {
  return (
    <Card className="p-6">
      <SectionTitle>Documents</SectionTitle>
      <div className="space-y-3">
        {PROFILE_DOCUMENTS.map((doc) => (
          <div key={doc.name} className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted transition-colors">
            <div style={{ color: BRAND.blue }}>
              <Icon name="file" className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">{doc.name}</p>
              <p className="text-xs text-muted-foreground">{doc.caption}</p>
            </div>
            <button type="button" className={GHOST_BUTTON}>
              <Icon name="download" />
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}
