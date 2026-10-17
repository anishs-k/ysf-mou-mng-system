/**
 * Purpose: The Agreement History screen - scheme and zone filters (applied as
 * soon as they change, as in the prototype), date pickers, and the table of
 * static agreements. Export Excel downloads the filtered rows as
 * Agreement_History.csv with the same columns the prototype exports.
 */

import { useMemo, useState } from "react";

import { AGREEMENT_HISTORY, SCHEME_OPTIONS } from "../data/agreementHistory.ts";
import type { AgreementHistoryRecord } from "../data/agreementHistory.ts";
import { ZONE_NAMES } from "../data/mous.ts";
import { Field, SelectInput, TextInput } from "../ui/form.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge, Button, Card } from "../ui/primitives.tsx";

const ZONE_OPTIONS: readonly string[] = ["", ...ZONE_NAMES];
const COLUMNS = ["Company", "MoU Code", "Zone", "Scheme", "Start", "End", "Status", ""];
const TH_CLASS = "px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide";
const SECONDARY_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary     border-border    hover:bg-blue-100 px-3 py-1.5 text-xs  ";
const GHOST_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-3 py-1.5 text-xs  ";

/** Excel needs the BOM to read the "·" and "₹" characters as UTF-8. */
const BYTE_ORDER_MARK = String.fromCharCode(0xfeff);
const CSV_HEADER = ["Company", "MoU Code", "Zone", "Plant", "Scheme", "Start Date", "End Date", "Tenure", "HR Contact", "Status"];

function csvLine(cells: readonly string[]): string {
  return cells.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",");
}

function exportCsv(rows: readonly AgreementHistoryRecord[]): void {
  const lines = [
    csvLine(CSV_HEADER),
    ...rows.map((row) =>
      csvLine([row.company, row.code, row.zone, row.plant, row.scheme, row.start, row.end, row.tenure, row.hrContact, row.status]),
    ),
  ];
  const blob = new Blob([BYTE_ORDER_MARK + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Agreement_History.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function AgreementHistoryScreen() {
  const [scheme, setScheme] = useState("");
  const [zone, setZone] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const rows = useMemo(
    () => AGREEMENT_HISTORY.filter((row) => (scheme === "" || row.scheme === scheme) && (zone === "" || row.zone === zone)),
    [scheme, zone],
  );

  return (
    <ScreenFrame title="Agreement History" subtitle="Complete record of all MoU agreements" contentClassName="p-4 md:p-6 space-y-4 md:space-y-5">
      <Card className="p-4">
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-stretch sm:items-end">
          <Field className="flex-1 sm:w-40">
            <SelectInput options={SCHEME_OPTIONS} value={scheme} onChange={setScheme} />
          </Field>
          <Field className="flex-1 sm:w-44">
            <SelectInput options={ZONE_OPTIONS} value={zone} onChange={setZone} />
          </Field>
          <Field className="flex-1 sm:w-40">
            <TextInput type="date" value={from} onChange={setFrom} />
          </Field>
          <Field className="flex-1 sm:w-40">
            <TextInput type="date" value={to} onChange={setTo} />
          </Field>
          <div className="flex gap-2">
            {/* The prototype filters as soon as a select changes; Filter has nothing left to apply. */}
            <Button size="sm">
              <Icon name="search" className="w-4 h-4" />
              Filter
            </Button>
            <button type="button" onClick={() => exportCsv(rows)} className={SECONDARY_BUTTON}>
              <Icon name="download" />
              Export Excel
            </button>
          </div>
        </div>
      </Card>

      <Card>
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
              {rows.map((row) => (
                <tr key={row.code} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground text-xs">{row.company}</td>
                  <td className="px-4 py-3 mono text-xs font-bold text-[#1B5FAE]">{row.code}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{row.zone}</td>
                  <td className="px-4 py-3">
                    <Badge text={row.scheme} tone="info" />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs mono">{row.start}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs mono">{row.end}</td>
                  <td className="px-4 py-3">
                    {/* Unlike the other screens, history marks Expiring agreements red. */}
                    <Badge text={row.status} tone={row.status === "Active" ? "success" : "danger"} />
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" className={GHOST_BUTTON} aria-label={`View ${row.code}`}>
                      <Icon name="eye" className="w-4 h-4" />
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
