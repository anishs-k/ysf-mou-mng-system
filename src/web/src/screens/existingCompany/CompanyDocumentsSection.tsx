/**
 * Purpose: The "Company Documents" group of the record's Documents tab (SPEC-23
 * §3.3) - the company's GST / Registration certificates with type, size, upload
 * date and a download link, and for ADMIN / DATA_ENTRY an Upload Document control
 * (type dropdown + PDF / JPG / PNG picker). It owns its list so an upload can
 * reload it without touching the rest of the record.
 */

import { COMPANY_DOCUMENT_TYPE_LABELS, COMPANY_DOCUMENT_TYPE_OPTIONS } from "@mou/domain";
import type { CompanyDocumentType } from "@mou/domain";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";

import { companyDocumentDownloadUrl, fetchCompanyDocuments, uploadCompanyDocument } from "../../api/client.ts";
import type { CompanyDocumentRow } from "../../api/client.ts";
import { SelectInput } from "../../ui/form.tsx";
import { formatFileSize, formatTimestamp } from "../../ui/format.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Badge, Button } from "../../ui/primitives.tsx";
import { BRAND } from "../../ui/theme.ts";

const GHOST_BUTTON =
  "inline-flex items-center gap-2 font-semibold transition-all duration-150 cursor-pointer border select-none rounded-lg bg-transparent text-muted-foreground border-transparent hover:bg-muted hover:text-foreground px-3 py-1.5 text-xs  ";
const ACCEPTED_FILES = "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

type ListState =
  | { readonly phase: "loading" }
  | { readonly phase: "failed" }
  | { readonly phase: "loaded"; readonly rows: readonly CompanyDocumentRow[] };

function typeLabel(documentType: string): string {
  return COMPANY_DOCUMENT_TYPE_LABELS[documentType as CompanyDocumentType] ?? documentType;
}

export function CompanyDocumentsSection({ companyId, canUpload }: { readonly companyId: string; readonly canUpload: boolean }) {
  const [list, setList] = useState<ListState>({ phase: "loading" });

  const reload = useCallback(() => {
    let cancelled = false;
    fetchCompanyDocuments(companyId)
      .then((rows) => {
        if (!cancelled) setList({ phase: "loaded", rows });
      })
      .catch(() => {
        if (!cancelled) setList({ phase: "failed" });
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);
  useEffect(reload, [reload]);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Company Documents</p>
      </div>
      {canUpload && <UploadControl companyId={companyId} onUploaded={reload} />}
      {list.phase === "failed" && <p className="text-sm text-muted-foreground">Could not load the company documents.</p>}
      {list.phase === "loaded" && list.rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No GST or Registration certificate uploaded yet.</p>
      )}
      <div className="space-y-3">
        {(list.phase === "loaded" ? list.rows : []).map((doc) => (
          <div key={doc.id} className="flex items-center gap-4 p-3 rounded-lg border border-border hover:bg-muted transition-colors">
            <div style={{ color: BRAND.blue }}>
              <Icon name="file" className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{doc.originalFilename}</p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(doc.fileSizeBytes)} · Uploaded {formatTimestamp(doc.uploadedAt)}
              </p>
            </div>
            <Badge text={typeLabel(doc.documentType)} tone="info" />
            <a
              href={companyDocumentDownloadUrl(doc.id)}
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
  );
}

function UploadControl({ companyId, onUploaded }: { readonly companyId: string; readonly onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = () => {
    if (documentType === "" || file === null) {
      setError("Choose the document type and a file first.");
      return;
    }
    setSaving(true);
    setError(null);
    uploadCompanyDocument(companyId, documentType, file)
      .then(() => {
        setFile(null);
        setDocumentType("");
        if (inputRef.current !== null) inputRef.current.value = "";
        onUploaded();
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Upload failed."))
      .finally(() => setSaving(false));
  };

  return (
    <div className="mb-4 p-3 rounded-lg border border-dashed border-border">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="sm:w-56">
          <SelectInput
            ariaLabel="Document type"
            options={COMPANY_DOCUMENT_TYPE_OPTIONS}
            value={documentType}
            onChange={setDocumentType}
            placeholder="Document type…"
            disabled={saving}
          />
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_FILES}
          aria-label="Company document file"
          disabled={saving}
          onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)}
          className="flex-1 min-w-0 text-xs text-muted-foreground file:mr-3 file:h-9 file:px-3 file:rounded-lg file:border file:border-border file:bg-white file:text-xs file:font-semibold"
        />
        <Button variant="accent" size="sm" onClick={upload} disabled={saving}>
          <Icon name="upload" /> {saving ? "Uploading…" : "Upload Document"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">PDF, JPG or PNG, up to 10 MB.</p>
      {error !== null && (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
