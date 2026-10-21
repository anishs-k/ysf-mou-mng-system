/**
 * Purpose: SPEC-22's Bulk Upload mode of the Add New Company page. EntryModeSwitch
 * is the Manual Entry / Bulk Upload switch with its short how-to text, shown above
 * either mode. BulkUploadPanel is everything the bulk mode shows: Download Template
 * (one click saves both the Excel and the PDF template) and Upload Bulk Data - the
 * filled .xlsx, its rows' MoU PDFs named by GST Number (D162), or the PDFs alone
 * for companies that already exist (D164) - then either a success dialog listing
 * what was created or attached (D161) or, inline, the row / column / file errors.
 */

import { formatMoUDisplayCode } from "@mou/domain";
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { createPortal } from "react-dom";

import { downloadBulkTemplate, uploadBulkCompanies } from "../../api/client.ts";
import type { BulkTemplateFormat, BulkUploadResult } from "../../api/client.ts";
import { BRAND } from "../../ui/theme.ts";
import { saveBlob } from "../../ui/download.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Button, Card } from "../../ui/primitives.tsx";

export type EntryMode = "manual" | "bulk";

const ALERT_CLASS =
  "rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]";
/** D162: the sheet (.xlsx; .xls is offered so it gets a clear message) and its MoU PDFs. */
const UPLOAD_ACCEPT =
  ".xlsx,.xls,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel";

export function EntryModeSwitch({
  mode,
  onChange,
}: {
  readonly mode: EntryMode;
  readonly onChange: (mode: EntryMode) => void;
}) {
  return (
    <div className="glass-card rounded-xl p-4 mb-4 md:mb-6 flex flex-col md:flex-row md:items-center gap-3">
      <div role="group" aria-label="Entry mode" className="flex gap-2 shrink-0">
        <Button
          size="sm"
          variant={mode === "manual" ? "primary" : "outline"}
          onClick={() => onChange("manual")}
        >
          <Icon name="edit" className="w-3.5 h-3.5" />
          Manual Entry
        </Button>
        <Button
          size="sm"
          variant={mode === "bulk" ? "primary" : "outline"}
          onClick={() => onChange("bulk")}
        >
          <Icon name="table" className="w-3.5 h-3.5" />
          Bulk Upload
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold text-foreground">Bulk Upload:</span>{" "}
        download the Excel template, fill one row per company and upload it.
        Upload the MoU PDFs with it or any time later on their own - name each
        PDF by its company&apos;s GST Number (e.g. 27AAKCS4821M1Z3.pdf). A PDF
        template filled in on a computer can also be uploaded on its own: it
        creates the company if it does not exist yet. Everything is checked with
        the same rules as this form; if anything has an error, nothing is saved.
      </p>
    </div>
  );
}

const TEMPLATE_FORMATS: readonly BulkTemplateFormat[] = ["xlsx", "pdf"];
const FILENAMES: Readonly<Record<BulkTemplateFormat, string>> = {
  xlsx: "company-bulk-template.xlsx",
  pdf: "company-bulk-template.pdf",
};

type UploadSuccess = Extract<BulkUploadResult, { readonly ok: true }>;

/** D161: the success pop-up - how many companies were created, each with its MoU number. Esc or Close dismisses it. */
function UploadSuccessDialog({
  result,
  onClose,
}: {
  readonly result: UploadSuccess;
  readonly onClose: () => void;
}) {
  const { created, attached } = result;
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialog.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const plural = (count: number, one: string, many: string) =>
    `${count} ${count === 1 ? one : many}`;
  const title = [
    created.length > 0
      ? `${plural(created.length, "company", "companies")} created`
      : "",
    attached.length > 0
      ? `${plural(attached.length, "MoU PDF", "MoU PDFs")} attached`
      : "",
  ]
    .filter((part) => part !== "")
    .join(", ");
  const waiting = created.filter((entry) => entry.mouPdf === null).length;
  // Portalled to <body>: the panel's glass Card uses backdrop-filter, which makes a
  // fixed overlay cover only the Card (pinning the dialog near the top), not the screen.
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(13, 46, 90, 0.45)" }}
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Bulk upload complete"
        className="glass-modal rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col outline-none"
      >
        <div className="flex items-center gap-3 p-6 border-b border-border">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
            style={{ background: "#39B54A" }}
          >
            <Icon name="check" className="w-5 h-5" strokeWidth={2.5} />
          </div>
          <div>
            <h2 className="font-bold text-base" style={{ color: BRAND.navy }}>
              Bulk upload complete
            </h2>
            <p role="status" className="text-xs text-muted-foreground mt-0.5">
              {title}.
              {waiting > 0
                ? " Upload the missing MoU PDFs any time, named by GST Number."
                : ""}
            </p>
          </div>
        </div>
        <div className="p-6 overflow-y-auto space-y-6">
          {created.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">Row</th>
                  <th className="py-2 pr-3 font-semibold">Company Name</th>
                  <th className="py-2 pr-3 font-semibold">MoU Number</th>
                  <th className="py-2 font-semibold">MoU PDF</th>
                </tr>
              </thead>
              <tbody>
                {created.map((entry) => (
                  <tr
                    key={entry.companyId}
                    data-testid="bulk-created-row"
                    className="border-t border-border"
                  >
                    <td className="py-2 pr-3 text-muted-foreground">
                      {entry.row === 0 ? "PDF" : entry.row}
                    </td>
                    <td className="py-2 pr-3 font-medium text-foreground">
                      {entry.companyName}
                    </td>
                    <td
                      className="py-2 pr-3 font-mono text-xs font-semibold"
                      style={{ color: BRAND.blue }}
                    >
                      {formatMoUDisplayCode(entry.generatedCode)}
                    </td>
                    <td className="py-2 text-xs">
                      {entry.mouPdf === null ? (
                        <span className="text-muted-foreground">
                          Attach later
                        </span>
                      ) : (
                        <span
                          className="text-green-700 font-medium"
                          title={entry.mouPdf}
                        >
                          Attached
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {attached.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-semibold">MoU PDF</th>
                  <th className="py-2 pr-3 font-semibold">Company Name</th>
                  <th className="py-2 font-semibold">MoU Number</th>
                </tr>
              </thead>
              <tbody>
                {attached.map((entry) => (
                  <tr
                    key={entry.fileName}
                    data-testid="bulk-attached-row"
                    className="border-t border-border"
                  >
                    <td className="py-2 pr-3 text-xs text-muted-foreground">
                      {entry.fileName}
                    </td>
                    <td className="py-2 pr-3 font-medium text-foreground">
                      {entry.companyName}
                    </td>
                    <td
                      className="py-2 font-mono text-xs font-semibold"
                      style={{ color: BRAND.blue }}
                    >
                      {formatMoUDisplayCode(entry.generatedCode)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="flex justify-end p-4 border-t border-border">
          <Button onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function UploadErrors({
  result,
}: {
  readonly result: Extract<BulkUploadResult, { readonly ok: false }>;
}) {
  return (
    <div role="alert" className={ALERT_CLASS}>
      <p className="font-bold">{result.message}</p>
      {result.fileErrors.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-xs font-normal space-y-0.5">
          {result.fileErrors.map((message) => (
            <li key={message} data-testid="bulk-file-error">
              {message}
            </li>
          ))}
        </ul>
      )}
      {result.rowErrors.length > 0 && (
        <div className="mt-2 max-h-80 overflow-auto">
          <table className="w-full text-xs font-normal">
            <thead>
              <tr className="text-left">
                <th className="py-1 pr-3">Row</th>
                <th className="py-1 pr-3">Column</th>
                <th className="py-1">Problem</th>
              </tr>
            </thead>
            <tbody>
              {result.rowErrors.map((error, index) => (
                <tr
                  key={`${error.row}-${error.column}-${index}`}
                  data-testid="bulk-row-error"
                  className="border-t border-[#FECACA]"
                >
                  <td className="py-1 pr-3">{error.row}</td>
                  <td className="py-1 pr-3">{error.column}</td>
                  <td className="py-1">{error.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** The obvious mistakes, caught before the upload; the server checks everything again (D162). */
function pickedFilesError(files: readonly File[]): string | undefined {
  const lowerNames = files.map((file) => file.name.toLowerCase());
  const oldExcel = files.find((file) =>
    file.name.toLowerCase().endsWith(".xls"),
  );
  if (oldExcel !== undefined)
    return `${oldExcel.name} is an old Excel (.xls) file. Save it as Excel Workbook (.xlsx) and upload again.`;
  const other = files.find((file) => !/\.(xlsx|pdf)$/i.test(file.name));
  if (other !== undefined)
    return `${other.name}: only the Excel template (.xlsx) and MoU PDFs (.pdf) can be uploaded.`;
  // D164: the Excel file alone, PDFs alone, or both together are all fine.
  if (lowerNames.filter((name) => name.endsWith(".xlsx")).length > 1)
    return "Upload one Excel file at a time.";
  return undefined;
}

export function BulkUploadPanel() {
  const fileInput = useRef<HTMLInputElement>(null);
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<BulkUploadResult | null>(null);

  /** Both templates are fetched first, so a refusal saves neither and shows one message. */
  const download = () => {
    setDownloading(true);
    setError("");
    Promise.all(
      TEMPLATE_FORMATS.map((format) =>
        downloadBulkTemplate(format).then((blob) => ({ format, blob })),
      ),
    )
      .then((files) =>
        files.forEach(({ format, blob }) => saveBlob(blob, FILENAMES[format])),
      )
      .catch((downloadError: unknown) =>
        setError(
          downloadError instanceof Error
            ? downloadError.message
            : "Could not download the template.",
        ),
      )
      .finally(() => setDownloading(false));
  };

  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.target.files ?? [])];
    // Cleared so picking the same (corrected) files again still fires a change.
    event.target.value = "";
    if (files.length === 0) return;
    setError("");
    setResult(null);
    const quickError = pickedFilesError(files);
    if (quickError !== undefined) {
      setError(quickError);
      return;
    }
    setUploading(true);
    uploadBulkCompanies(files)
      .then(setResult)
      // A refused upload comes back as a result with its own message; reaching here means no answer at all.
      .catch(() =>
        setError(
          "Could not reach the server, so nothing was uploaded. Check your connection and try again.",
        ),
      )
      .finally(() => setUploading(false));
  };

  const busy = downloading || uploading;
  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={busy} onClick={download}>
          <Icon name="download" className="w-4 h-4" />
          {downloading ? "Preparing…" : "Download Template"}
        </Button>
        <Button disabled={busy} onClick={() => fileInput.current?.click()}>
          <Icon name="upload" className="w-4 h-4" />
          {uploading ? "Uploading…" : "Upload Bulk Data"}
        </Button>
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          className="hidden"
          aria-label="Bulk data file"
          onChange={upload}
        />
      </div>
      {error !== "" && (
        <div role="alert" className={ALERT_CLASS}>
          {error}
        </div>
      )}
      {result !== null && !result.ok && <UploadErrors result={result} />}
      {result !== null && result.ok && (
        <UploadSuccessDialog result={result} onClose={() => setResult(null)} />
      )}
    </Card>
  );
}
