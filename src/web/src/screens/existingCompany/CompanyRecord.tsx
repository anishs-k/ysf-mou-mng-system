/**
 * Purpose: The Existing Companies record view of one MoU - header (status, scheme,
 * Export PDF fetching the full record PDF as a Blob and saving it, Upload MoU for
 * ADMIN / DATA_ENTRY) and the five tabs: Overview (company overview), Commercial, Payroll, History (every MoU of
 * the company) and Documents (with download links). The header data loads on
 * open; each other tab fetches its own endpoint when first shown. SPEC-23: the
 * Documents tab adds the company's certificates (CompanyDocumentsSection).
 */

import {
  COMMERCIAL_BASIS_LABELS,
  COMMERCIAL_PERIOD_LABELS,
  COMPANY_TYPE_LABELS,
  ITEM_TYPE_LABELS,
  REGISTRATION_TYPE_LABELS,
  SECTOR_LABELS,
  TENURE_UNIT_LABELS,
  formatPayrollValue,
} from "@mou/domain";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  documentDownloadUrl,
  fetchCompanyAgreements,
  fetchCompanyOverview,
  downloadMouRecordPdf,
  fetchMouCommercial,
  fetchMouDocuments,
  fetchMouPayroll,
} from "../../api/client.ts";
import type { CompanyOverview, MouChargeRow, MouCommercialDetail, MouPayrollItemRow } from "../../api/client.ts";
import { canAuthor } from "../../ui/access.ts";
import { saveBlob } from "../../ui/download.ts";
import {
  PENDING_FIGURE,
  displayStatus,
  formatCalendarDate,
  formatFileSize,
  formatTimestamp,
  schemeLabel,
  stipendDayText,
} from "../../ui/format.ts";
import { Icon } from "../../ui/Icon.tsx";
import { ScreenFrame } from "../../ui/layout/AppShell.tsx";
import { Badge, Button, Card, SectionTitle } from "../../ui/primitives.tsx";
import { useSession } from "../../ui/session.ts";
import { BRAND, statusTone } from "../../ui/theme.ts";
import { CompanyDocumentsSection } from "./CompanyDocumentsSection.tsx";

/** Which MoU to show; `companyName` lets the title appear before the overview loads. */
export interface RecordSelection {
  readonly mouId: string;
  readonly companyId: string;
  readonly companyName?: string;
}

interface LabelledValue {
  readonly label: string;
  readonly value: string;
}

const TH_CLASS = "px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide";
const GHOST_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-3 py-1.5 text-xs  ";
const SECONDARY_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary     border-border    hover:bg-blue-100 disabled:opacity-60 disabled:cursor-wait px-3 py-1.5 text-xs  ";

const TABS = ["Overview", "Commercial", "Payroll", "History", "Documents"] as const;
type Tab = (typeof TABS)[number];

const LOAD_ERROR = "Could not load this record. Please refresh the page.";

/** Loads `fetcher(id)` once per id; `failed` turns true when it rejects. */
function useLoaded<T>(fetcher: (id: string) => Promise<T>, id: string): { readonly data: T | null; readonly failed: boolean } {
  const [state, setState] = useState<{ readonly id: string; readonly data: T | null; readonly failed: boolean }>({
    id: "",
    data: null,
    failed: false,
  });
  useEffect(() => {
    let cancelled = false;
    fetcher(id)
      .then((data) => {
        if (!cancelled) setState({ id, data, failed: false });
      })
      .catch(() => {
        if (!cancelled) setState({ id, data: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [fetcher, id]);
  return state.id === id ? state : { data: null, failed: false };
}

function label(labels: Readonly<Record<string, string>>, code: string | null): string {
  if (code === null || code === "") return PENDING_FIGURE;
  return labels[code] ?? code;
}

function joinPresent(parts: readonly (string | null)[], separator: string): string {
  const present = parts.filter((part): part is string => part !== null && part.trim() !== "");
  return present.length === 0 ? PENDING_FIGURE : present.join(separator);
}

function rupees(amount: string): string {
  return `₹ ${amount}`;
}

function overviewItems(overview: CompanyOverview, commercial: MouCommercialDetail | null): readonly LabelledValue[] {
  const plant = overview.plants.find((candidate) => candidate.id === commercial?.companyPlantId);
  return [
    { label: "Company Type", value: label(COMPANY_TYPE_LABELS, overview.companyType) },
    { label: "Sector", value: label(SECTOR_LABELS, overview.sector) },
    { label: "Registration", value: label(REGISTRATION_TYPE_LABELS, overview.registrationType) },
    { label: "GST Number", value: overview.gstNumber },
    { label: "TAN Number", value: overview.tanNumber },
    { label: "Zone", value: overview.zoneName },
    { label: "Plant", value: plant?.plantName ?? joinPresent(overview.plants.map((candidate) => candidate.plantName), ", ") },
    { label: "HR Contact", value: joinPresent([overview.hrContactName, overview.hrContactNumber], " · ") },
    { label: "HR Email", value: overview.hrEmail },
    { label: "Finance Head", value: joinPresent([overview.financeHeadContactName, overview.financeHeadContactNumber], " · ") },
    { label: "Finance Email", value: overview.financeEmail },
    { label: "Purchase Contact", value: joinPresent([overview.purchaseName, overview.purchaseNumber, overview.purchaseEmail], " · ") },
    {
      label: "Address",
      value: joinPresent(
        [overview.addressLine1, overview.addressLine2, overview.city, overview.district, `${overview.state} - ${overview.pinCode}`],
        ", ",
      ),
    },
    { label: "MoU Code", value: commercial?.generatedCode ?? PENDING_FIGURE },
    { label: "Expires", value: formatCalendarDate(commercial?.endDate) },
  ];
}

function chargeText(charge: MouChargeRow & { readonly amount: string }): string {
  const terms = [label(COMMERCIAL_PERIOD_LABELS, charge.period), label(COMMERCIAL_BASIS_LABELS, charge.basis)].filter(
    (term) => term !== PENDING_FIGURE,
  );
  return [rupees(charge.amount), ...terms].join(" · ");
}

function commercialItems(commercial: MouCommercialDetail): readonly LabelledValue[] {
  const charges = commercial.charges.filter((charge): charge is MouChargeRow & { readonly amount: string } => charge.amount !== null);
  return [
    { label: "Scheme", value: schemeLabel(commercial.scheme) },
    { label: "MoU Start", value: formatCalendarDate(commercial.mouStartDate) },
    { label: "Tenure", value: `${commercial.tenureValue} ${label(TENURE_UNIT_LABELS, commercial.tenureUnit)}` },
    { label: "MoU End", value: formatCalendarDate(commercial.endDate) },
    { label: "Attendance Cycle", value: commercial.attendanceCycle },
    { label: "Stipend Date", value: stipendDayText(commercial.stipendDate) },
    ...charges.map((charge) => ({ label: charge.label, value: chargeText(charge) })),
    ...commercial.otherItems.map((item) => ({
      label: `${item.label} (${label(ITEM_TYPE_LABELS, item.itemType)})`,
      value: rupees(item.amount),
    })),
  ];
}

export function CompanyRecord({ selection, onBack }: { readonly selection: RecordSelection; readonly onBack: () => void }) {
  const navigate = useNavigate();
  const { user } = useSession();
  const [tab, setTab] = useState<Tab>("Overview");
  const overview = useLoaded(fetchCompanyOverview, selection.companyId);
  const commercial = useLoaded(fetchMouCommercial, selection.mouId);
  const failed = overview.failed || commercial.failed;
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const exportPdf = () => {
    setExporting(true);
    setExportError("");
    downloadMouRecordPdf(selection.mouId)
      .then(({ blob, filename }) => saveBlob(blob, filename))
      .catch((reason: unknown) => setExportError(reason instanceof Error ? reason.message : "Export failed."))
      .finally(() => setExporting(false));
  };

  const company = overview.data?.companyName ?? selection.companyName ?? PENDING_FIGURE;
  const mou = commercial.data;
  const status = mou === null ? null : displayStatus(mou.status, mou.endDate);
  const subtitle = `${mou?.generatedCode ?? PENDING_FIGURE} · ${overview.data?.zoneName ?? PENDING_FIGURE} Zone`;

  return (
    <ScreenFrame title={company} subtitle={subtitle} contentClassName="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <button type="button" onClick={onBack} className="text-sm font-semibold hover:underline self-start" style={{ color: BRAND.blue }}>
          ← Back to list
        </button>
        <div className="flex items-center gap-2 flex-wrap sm:flex-1">
          {status !== null && <Badge text={status} tone={statusTone(status)} />}
          {mou !== null && <Badge text={schemeLabel(mou.scheme)} tone="info" />}
          <div className="sm:ml-auto flex gap-2">
            <button type="button" className={SECONDARY_BUTTON} onClick={exportPdf} disabled={exporting} aria-busy={exporting}>
              {exporting ? (
                <span aria-hidden="true" className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
              ) : (
                <Icon name="download" />
              )}
              {exporting ? "Exporting…" : "Export PDF"}
            </button>
            {user !== null && canAuthor(user.role) && (
              <Button variant="accent" size="sm" onClick={() => navigate(`/upload-mou?mouId=${selection.mouId}`)}>
                <Icon name="upload" /> Upload MoU
              </Button>
            )}
          </div>
        </div>
      </div>

      {exportError !== "" && (
        <div role="alert" className="mb-5 rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
          {exportError}
        </div>
      )}
      {failed && (
        <div role="alert" className="mb-5 rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]">
          {LOAD_ERROR}
        </div>
      )}

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

      {tab === "Overview" && overview.data !== null && (
        <DetailGrid title="Company Overview" items={overviewItems(overview.data, mou)} />
      )}
      {tab === "Commercial" && mou !== null && <DetailGrid title="Commercial Details" items={commercialItems(mou)} />}
      {tab === "Payroll" && <PayrollPanel mouId={selection.mouId} />}
      {tab === "History" && <HistoryPanel companyId={selection.companyId} />}
      {tab === "Documents" && (
        <DocumentsPanel mouId={selection.mouId} companyId={selection.companyId} canUpload={user !== null && canAuthor(user.role)} />
      )}
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

function Notice({ text }: { readonly text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function PayrollColumn({ title, lines, valueClass, valueColor }: {
  readonly title: string;
  readonly lines: readonly MouPayrollItemRow[];
  readonly valueClass: string;
  readonly valueColor?: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">{title}</p>
      {lines.length === 0 && <Notice text="None recorded" />}
      {lines.map((line) => (
        <div key={line.itemKey} className="flex justify-between py-2 border-b border-border text-sm">
          <span className="font-medium text-foreground">{line.label}</span>
          <span className={valueClass} style={valueColor === undefined ? undefined : { color: valueColor }}>
            {formatPayrollValue(line.valueKind, line.amount, line.isApplicable)}
          </span>
        </div>
      ))}
    </div>
  );
}

function PayrollPanel({ mouId }: { readonly mouId: string }) {
  const { data: payroll, failed } = useLoaded(fetchMouPayroll, mouId);
  return (
    <Card className="p-6">
      <SectionTitle>Payroll Configuration</SectionTitle>
      {failed && <Notice text="Could not load the payroll configuration." />}
      {payroll !== null && (
        <>
          <div className="grid md:grid-cols-2 gap-6">
            <PayrollColumn title="Allowances" lines={payroll.allowances} valueClass="mono font-bold" valueColor={BRAND.green} />
            <PayrollColumn title="Deductions" lines={payroll.deductions} valueClass="mono font-bold text-red-600" />
          </div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mt-6 mb-3">Trainee Categories</p>
          {payroll.traineeCategories.length === 0 ? (
            <Notice text="None recorded" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {payroll.traineeCategories.map((category) => (
                <Badge key={category} text={category} />
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function HistoryPanel({ companyId }: { readonly companyId: string }) {
  const { data: agreements, failed } = useLoaded(fetchCompanyAgreements, companyId);
  return (
    <Card>
      <div className="px-5 pt-5 pb-3 border-b border-border">
        <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: BRAND.navy }}>
          Agreement History
        </h3>
      </div>
      {failed && (
        <div className="px-5 py-4">
          <Notice text="Could not load the agreement history." />
        </div>
      )}
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
          {(agreements ?? []).map((row) => {
            const status = displayStatus(row.status, row.endDate);
            return (
              <tr key={row.mouId} className="border-b border-border last:border-0">
                <td className="px-4 py-3 mono text-xs font-bold" style={{ color: BRAND.blue }}>
                  {row.generatedCode}
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{formatCalendarDate(row.mouStartDate)}</td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{formatCalendarDate(row.endDate)}</td>
                <td className="px-4 py-3">
                  <Badge text={schemeLabel(row.scheme)} tone="info" />
                </td>
                <td className="px-4 py-3">
                  <Badge text={status} tone={statusTone(status)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function DocumentsPanel({ mouId, companyId, canUpload }: {
  readonly mouId: string;
  readonly companyId: string;
  readonly canUpload: boolean;
}) {
  const { data: documents, failed } = useLoaded(fetchMouDocuments, mouId);
  return (
    <Card className="p-6 space-y-6">
      <SectionTitle>Documents</SectionTitle>
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">MoU Documents</p>
        {failed && <Notice text="Could not load the documents." />}
        {documents !== null && documents.length === 0 && <Notice text="No MoU document uploaded yet." />}
        <div className="space-y-3">
          {(documents ?? []).map((doc) => (
            <div key={doc.id} className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted transition-colors">
              <div style={{ color: BRAND.blue }}>
                <Icon name="file" className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-foreground">{doc.originalFilename}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(doc.fileSizeBytes)} · Uploaded {formatTimestamp(doc.uploadedAt)}
                </p>
              </div>
              <a
                href={documentDownloadUrl(doc.id)}
                target="_blank"
                rel="noreferrer"
                aria-label={`Download ${doc.originalFilename}`}
                className={GHOST_BUTTON}
              >
                <Icon name="download" />
              </a>
            </div>
          ))}
        </div>
      </div>
      <CompanyDocumentsSection companyId={companyId} canUpload={canUpload} />
    </Card>
  );
}
