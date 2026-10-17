/**
 * Purpose: The Export Data screen - zone/scheme/company/status/date filters with a
 * live "N records match" count, an Export button that downloads the matching rows
 * as MoU_Export.csv, and the three report cards. Like the prototype, the date
 * fields are captured but do not narrow the sample, and the card buttons are inert.
 */

import { useMemo, useState } from "react";

import { SCHEMES } from "../data/addCompanyOptions.ts";
import { EXPORT_COMPANY_OPTIONS, EXPORT_RECORDS, EXPORT_REPORTS, EXPORT_STATUS_OPTIONS } from "../data/exportData.ts";
import type { ExportRecord } from "../data/exportData.ts";
import { ZONE_NAMES } from "../data/mous.ts";
import { Field, SelectInput, TextInput } from "../ui/form.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge, Button, Card, SectionTitle } from "../ui/primitives.tsx";
import { BRAND } from "../ui/theme.ts";

interface Filters {
  readonly zone: string;
  readonly scheme: string;
  readonly company: string;
  readonly status: string;
  readonly from: string;
  readonly to: string;
}

/** Lets Excel read the CSV as UTF-8, as the prototype's file does. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);

const NO_FILTERS: Filters = { zone: "", scheme: "", company: "", status: "", from: "", to: "" };

/** An empty choice or an "All …" option leaves that filter open. */
function accepts(choice: string, value: string): boolean {
  return choice === "" || choice.startsWith("All") || choice === value;
}

function matches(record: ExportRecord, filters: Filters): boolean {
  return (
    accepts(filters.zone, record.zone) &&
    accepts(filters.scheme, record.scheme) &&
    accepts(filters.company, record.company) &&
    accepts(filters.status, record.status)
  );
}

function downloadCsv(records: readonly ExportRecord[]): void {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const header = ["Company", "Zone", "Scheme", "MoU Code", "Start Date", "End Date", "Status"];
  const rows = records.map((r) => [r.company, r.zone, r.scheme, r.code, r.start, r.end, r.status]);
  const csv = [header, ...rows].map((row) => row.map(quote).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([BYTE_ORDER_MARK + csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "MoU_Export.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ExportScreen() {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const matching = useMemo(() => EXPORT_RECORDS.filter((record) => matches(record, filters)), [filters]);
  const set = (key: keyof Filters) => (value: string) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <ScreenFrame
      title="Export Data"
      subtitle="Download MoU reports in various formats"
      contentClassName="p-4 md:p-6 max-w-3xl mx-auto space-y-4 md:space-y-5"
    >
      <Card className="p-6">
        <SectionTitle>Export Filters</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Zone">
            <SelectInput options={["All Zones", ...ZONE_NAMES]} value={filters.zone} onChange={set("zone")} />
          </Field>
          <Field label="Scheme">
            <SelectInput options={["All Schemes", ...SCHEMES]} value={filters.scheme} onChange={set("scheme")} />
          </Field>
          <Field label="Company">
            <SelectInput options={["All Companies", ...EXPORT_COMPANY_OPTIONS]} value={filters.company} onChange={set("company")} />
          </Field>
          <Field label="Status">
            <SelectInput options={EXPORT_STATUS_OPTIONS} value={filters.status} onChange={set("status")} />
          </Field>
          <Field label="From Date">
            <TextInput type="date" value={filters.from} onChange={set("from")} />
          </Field>
          <Field label="To Date">
            <TextInput type="date" value={filters.to} onChange={set("to")} />
          </Field>
        </div>
        <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">{matching.length} records match current filters</p>
          <Button variant="accent" onClick={() => downloadCsv(matching)}>
            <Icon name="download" />
            Export Filtered Data
          </Button>
        </div>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        {EXPORT_REPORTS.map((report) => (
          <Card key={report.title} className="p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div style={{ color: BRAND.blue }}>
                <Icon name="download" />
              </div>
              <Badge text={report.format} />
            </div>
            <h4 className="font-bold text-sm text-foreground mb-1">{report.title}</h4>
            <p className="text-xs text-muted-foreground mb-4">{report.caption}</p>
            <Button size="sm" className="w-full justify-center">
              <Icon name="download" />
              Download
            </Button>
          </Card>
        ))}
      </div>
    </ScreenFrame>
  );
}
