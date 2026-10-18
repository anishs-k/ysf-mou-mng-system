/**
 * Purpose: The Upload MoU screen (ADMIN / DATA_ENTRY; AppShell guards the route) -
 * the Zone -> Company -> Plant -> Scheme cascade of real ids (each select disabled
 * until the previous is chosen; ?mouId= or ?zoneId=&companyId= preselect it), a
 * drag-and-drop / browse zone for one PDF, the optional Document Details, and Save,
 * which uploads through POST /api/mous/:mouId/document. The chosen MoU's attached
 * documents are listed from GET /api/mous/:mouId/documents.
 */

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import {
  documentDownloadUrl,
  fetchCompanyOverview,
  fetchMouCommercial,
  fetchMouDocuments,
  uploadMouDocumentToMou,
} from "../api/client.ts";
import type { MouDocumentRow, UploadedMouDocument } from "../api/client.ts";
import { useCascadingSelectors } from "../hooks/useCascadingSelectors.ts";
import { PENDING_FIGURE, formatCalendarDate, formatTimestamp, schemeLabel } from "../ui/format.ts";
import { Field, SelectInput, TextInput } from "../ui/form.tsx";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Badge, Button, Card, SectionTitle } from "../ui/primitives.tsx";
import { BRAND } from "../ui/theme.ts";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const NOT_PDF = "Only PDF files can be uploaded.";
const TOO_LARGE = "The file must be 10 MB or smaller.";
const DOCUMENTS_ERROR = "Could not load the attached documents.";

const ALERT_CLASS = "rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The browser's own check before the server's %PDF header check. */
function fileProblem(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return NOT_PDF;
  if (file.size > MAX_FILE_BYTES) return TOO_LARGE;
  return null;
}

type Phase = "idle" | "saving" | "saved";

/** Document Details, sent with the upload when filled in; every field is optional. */
interface DocumentDetails {
  readonly date: string;
  readonly validUntil: string;
  readonly reference: string;
}

const NO_DETAILS: DocumentDetails = { date: "", validUntil: "", reference: "" };

export function UploadMouScreen() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState<UploadedMouDocument | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [dragging, setDragging] = useState(false);
  const [details, setDetails] = useState(NO_DETAILS);
  // Kept with the MoU they belong to, so a stale list is never shown for another MoU.
  const [loadedDocuments, setLoadedDocuments] = useState<{ readonly mouId: string; readonly rows: readonly MouDocumentRow[] } | null>(null);
  const [documentsKey, setDocumentsKey] = useState(0);

  const cascade = useCascadingSelectors({ onError: setError });
  const { mouId, preselect } = cascade;

  // A deep link from the alerts screen: ?mouId= (or ?zoneId=&companyId=) preselects the cascade.
  useEffect(() => {
    const linkedMouId = searchParams.get("mouId");
    const linkedZoneId = searchParams.get("zoneId");
    const linkedCompanyId = searchParams.get("companyId");
    let cancelled = false;
    if (linkedMouId !== null) {
      fetchMouCommercial(linkedMouId)
        .then(async (mou) => {
          const company = await fetchCompanyOverview(mou.companyId);
          if (cancelled) return;
          await preselect({
            zoneId: company.zoneId,
            companyId: mou.companyId,
            plantId: mou.companyPlantId ?? undefined,
            mouId: mou.mouId,
          });
        })
        .catch(() => {
          if (!cancelled) setError("Could not open the linked MoU. Please choose it below.");
        });
    } else if (linkedZoneId !== null) {
      void preselect({ zoneId: linkedZoneId, companyId: linkedCompanyId ?? undefined });
    }
    return () => {
      cancelled = true;
    };
    // Runs once: the link is read on arrival, later selections are the user's own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (mouId === "") return undefined;
    let cancelled = false;
    fetchMouDocuments(mouId)
      .then((rows) => {
        if (!cancelled) setLoadedDocuments({ mouId, rows });
      })
      .catch(() => {
        if (!cancelled) setError(DOCUMENTS_ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, [mouId, documentsKey]);

  const pick = (picked: File | undefined) => {
    if (picked === undefined) return;
    const problem = fileProblem(picked);
    setError(problem ?? "");
    setFile(problem === null ? picked : null);
    if (problem !== null && inputRef.current !== null) inputRef.current.value = "";
  };

  const removeFile = () => {
    setFile(null);
    if (inputRef.current !== null) inputRef.current.value = "";
  };

  const save = () => {
    if (file === null || mouId === "") return;
    if (details.date !== "" && details.validUntil !== "" && details.validUntil < details.date) {
      setError("Valid Until cannot be earlier than the Document Date.");
      return;
    }
    setError("");
    setPhase("saving");
    uploadMouDocumentToMou(mouId, file, {
      documentDate: details.date,
      validUntil: details.validUntil,
      referenceNumber: details.reference,
    })
      .then((uploaded) => {
        setSaved(uploaded);
        setDetails(NO_DETAILS);
        removeFile();
        setPhase("saved");
        setDocumentsKey((key) => key + 1);
      })
      .catch((uploadError: unknown) => {
        setError(uploadError instanceof Error ? uploadError.message : "Upload failed");
        setPhase("idle");
      });
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    pick(event.dataTransfer.files[0]);
  };

  const { zones, zoneId, companies, companyId, plants, plantId, mous } = cascade;

  return (
    <ScreenFrame
      title="Upload MoU PDF"
      subtitle="Attach signed MoU documents to company records"
      contentClassName="p-4 md:p-6 max-w-2xl mx-auto space-y-4 md:space-y-5"
    >
      {error !== "" && (
        <div role="alert" className={ALERT_CLASS}>
          {error}
        </div>
      )}

      <Card className="p-6">
        <SectionTitle>Select Company</SectionTitle>
        <div className="grid gap-4">
          <Field label="Zone" htmlFor="upload-zone" required>
            <SelectInput
              id="upload-zone"
              options={zones.map((zone) => ({ value: zone.id, label: zone.name }))}
              value={zoneId}
              onChange={(value) => void cascade.handleZoneChange(value)}
            />
          </Field>
          <Field label="Company" htmlFor="upload-company" required>
            <SelectInput
              id="upload-company"
              options={companies.map((company) => ({ value: company.id, label: company.name }))}
              value={companyId}
              disabled={zoneId === ""}
              onChange={(value) => void cascade.handleCompanyChange(value)}
            />
          </Field>
          <Field label="Plant" htmlFor="upload-plant" required>
            <SelectInput
              id="upload-plant"
              options={plants.map((plant) => ({ value: plant.id, label: plant.plantName }))}
              value={plantId}
              disabled={companyId === ""}
              onChange={(value) => void cascade.handlePlantChange(value)}
            />
          </Field>
          <Field label="Scheme" htmlFor="upload-scheme" required>
            <SelectInput
              id="upload-scheme"
              options={mous.map((mou) => ({ value: mou.mouId, label: schemeLabel(mou.scheme) }))}
              value={mouId}
              disabled={mous.length === 0}
              onChange={cascade.setMouId}
            />
          </Field>
          {plantId !== "" && mous.length === 0 && (
            <p className="text-xs text-muted-foreground">No MoUs are recorded for this company plant.</p>
          )}
        </div>
      </Card>

      <Card className="p-6">
        <SectionTitle>Upload Document</SectionTitle>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event: ChangeEvent<HTMLInputElement>) => pick(event.target.files?.[0])}
        />
        {phase === "saving" && file !== null ? (
          <div className="rounded-xl border border-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#E8F0FB] flex items-center justify-center text-[#1B5FAE] shrink-0 animate-pulse">
                <Icon name="upload" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Saving to server…</p>
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-[#F26522] w-full animate-pulse" />
            </div>
          </div>
        ) : file === null ? (
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
              dragging ? "border-[#1B5FAE] bg-[#E8F0FB]" : "border-border hover:border-[#1B5FAE] hover:bg-muted/40"
            }`}
          >
            <div className="mb-4 text-[#1B5FAE]">
              <Icon name="uploadBox" className="w-12 h-12 mx-auto" strokeWidth={1.5} />
            </div>
            <p className="text-base font-bold text-foreground">Drop file here or click to browse</p>
            <p className="text-sm text-muted-foreground mt-1">PDF only · Max 10 MB</p>
            <div className="mt-4 px-4 py-2 rounded-lg text-xs font-semibold bg-[#E8F0FB] text-[#1B5FAE]">Browse Files</div>
          </div>
        ) : (
          <div className="rounded-xl border p-4 bg-green-50 border-green-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center text-green-600 shrink-0">
                <Icon name="file" className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-green-900 truncate">{file.name}</p>
                <p className="text-xs text-green-700 mt-0.5">{formatSize(file.size)} · Ready to save</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-green-600">
                  <Icon name="check" className="w-4 h-4" strokeWidth={2.5} />
                </span>
                <button type="button" aria-label="Remove file" onClick={removeFile} className="text-muted-foreground hover:text-red-500 transition-colors">
                  <Icon name="close" className="w-4 h-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        )}
      </Card>

      {phase === "idle" && file !== null && (
        <Card className="p-6">
          <SectionTitle>Document Details</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Document Date" htmlFor="document-date">
              <TextInput id="document-date" type="date" value={details.date} onChange={(date) => setDetails({ ...details, date })} />
            </Field>
            <Field label="Valid Until" htmlFor="document-valid-until">
              <TextInput
                id="document-valid-until"
                type="date"
                value={details.validUntil}
                onChange={(validUntil) => setDetails({ ...details, validUntil })}
              />
            </Field>
            <Field label="Reference Number" htmlFor="document-reference" className="col-span-2">
              <TextInput
                id="document-reference"
                placeholder="e.g. RIL/HR/MoU/2026/001"
                value={details.reference}
                onChange={(reference) => setDetails({ ...details, reference })}
              />
            </Field>
          </div>
        </Card>
      )}

      {phase === "saved" && saved !== null && (
        <Card className="p-8 flex flex-col items-center text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-green-600 mb-4">
            <Icon name="check" className="w-8 h-8" strokeWidth={2.5} />
          </div>
          <h3 className="font-bold text-lg text-[#0D2E5A] mb-1">Document Saved Successfully</h3>
          <p className="text-sm text-muted-foreground mb-1">{saved.originalFilename}</p>
          <p className="text-xs text-muted-foreground mb-5">
            {formatSize(saved.fileSizeBytes)} · Saved on{" "}
            {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setPhase("idle")}
              className="inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-secondary text-primary border-border hover:bg-blue-100 px-4 py-2 text-sm"
            >
              Upload Another
            </button>
            <Button onClick={() => navigate("/")}>Go to Dashboard</Button>
          </div>
        </Card>
      )}

      {mouId !== "" && <AttachedDocuments documents={loadedDocuments?.mouId === mouId ? loadedDocuments.rows : null} />}

      {phase === "idle" && (
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <Button variant="accent" disabled={file === null || mouId === ""} onClick={save}>
            <Icon name="upload" />
            Save Document
          </Button>
        </div>
      )}
    </ScreenFrame>
  );
}

const DOCUMENT_HEADINGS = ["Filename", "Size", "Document Date", "Valid Until", "Reference", "Uploaded By", "Uploaded On", ""];

function AttachedDocuments({ documents }: { readonly documents: readonly MouDocumentRow[] | null }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
        <h3 className="font-bold text-sm uppercase tracking-wide" style={{ color: BRAND.navy }}>
          Attached Documents
        </h3>
        <Badge text={documents === null ? PENDING_FIGURE : String(documents.length)} />
      </div>
      {documents !== null && documents.length === 0 ? (
        <p className="px-5 py-8 text-sm text-muted-foreground text-center">No documents attached yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                {DOCUMENT_HEADINGS.map((heading) => (
                  <th key={heading} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {documents?.map((document) => (
                <tr key={document.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-semibold text-foreground text-xs max-w-[180px] truncate">{document.originalFilename}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs mono whitespace-nowrap">{formatSize(document.fileSizeBytes)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs mono whitespace-nowrap">{formatCalendarDate(document.documentDate)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs mono whitespace-nowrap">{formatCalendarDate(document.validUntil)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{document.referenceNumber ?? PENDING_FIGURE}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{document.uploadedByUsername}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs mono whitespace-nowrap">{formatTimestamp(document.uploadedAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={documentDownloadUrl(document.id)}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-xs hover:underline"
                      style={{ color: BRAND.blue }}
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
