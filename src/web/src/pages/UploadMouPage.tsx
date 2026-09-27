/**
 * Purpose: SPEC-09's standalone "attach a signed MOU PDF" flow - Zone then
 * Company then Plant then Scheme, each disabled until its predecessor has a
 * value and cleared whenever an earlier one changes (section 2). When the
 * chosen company + plant has exactly one MOU the scheme step is skipped
 * entirely (section 2.1); with two or more it must be chosen explicitly
 * before the upload control is enabled (AC3/AC4).
 *
 * UI aligned with Figma v3 — drag-drop upload area, progress visualization,
 * styled document list.
 */

import { SCHEME_LABELS } from "@mou/domain";
import { useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.tsx";
import type { MouDocumentRow } from "../api/client.ts";
import { documentDownloadUrl, fetchMouDocuments, uploadMouDocumentToMou } from "../api/client.ts";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Badge, Btn, Card, SecTitle, brand } from "../components/ui.tsx";
import { useCascadingSelectors } from "../hooks/useCascadingSelectors.ts";

const AUTHORING_ROLES: readonly string[] = ["ADMIN", "DATA_ENTRY"];

const SELECT_CLASS =
  "block w-full h-10 pl-3 pr-8 border border-border rounded-lg text-sm bg-white appearance-none focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted disabled:text-muted-foreground";

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadMouPage() {
  const { user } = useAuth();
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [documents, setDocuments] = useState<readonly MouDocumentRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  async function loadDocuments(id: string) {
    try {
      setDocuments(await fetchMouDocuments(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    }
  }

  const {
    zones,
    zoneId,
    companies,
    companyId,
    plants,
    plantId,
    mous,
    mouId,
    setMouId,
    handleZoneChange: cascadeZoneChange,
    handleCompanyChange: cascadeCompanyChange,
    handlePlantChange: cascadePlantChange,
  } = useCascadingSelectors({
    onError: (msg) => setError(msg),
    onAutoSelectMou: (autoMouId) => void loadDocuments(autoMouId),
  });

  async function handleZoneChange(nextZoneId: string) {
    setDocuments([]);
    setUploadSuccess(false);
    await cascadeZoneChange(nextZoneId);
  }

  async function handleCompanyChange(nextCompanyId: string) {
    setDocuments([]);
    setUploadSuccess(false);
    await cascadeCompanyChange(nextCompanyId);
  }

  async function handlePlantChange(nextPlantId: string) {
    setDocuments([]);
    setUploadSuccess(false);
    await cascadePlantChange(nextPlantId);
  }

  async function handleSchemeChange(nextMouId: string) {
    setMouId(nextMouId);
    setDocuments([]);
    setUploadSuccess(false);
    if (nextMouId === "") {
      return;
    }
    await loadDocuments(nextMouId);
  }

  async function handleUpload(file: File) {
    if (mouId === "") {
      return;
    }
    setError(null);
    setUploadSuccess(false);
    setUploading(true);
    try {
      await uploadMouDocumentToMou(mouId, file);
      setUploadSuccess(true);
      await loadDocuments(mouId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file !== undefined && file.type === "application/pdf") {
      void handleUpload(file);
    } else {
      setError("Only PDF files are accepted.");
    }
  }

  const showSchemeStep = mous.length > 1;
  const uploadReady = mouId !== "" && !uploading;

  if (user !== null && !AUTHORING_ROLES.includes(user.role)) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-2xl glass-card rounded-xl p-8">
          <h1 className="text-base font-medium text-foreground">Not available</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your role ({user.role}) does not have access to this screen.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Topbar title="Upload MoU PDF" subtitle="Attach signed MoU documents to company records" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-5">
          {error !== null && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}

          {/* Select Company Card */}
          <Card className="p-6">
            <SecTitle>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              Select Company
            </SecTitle>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="uploadZone" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                  Zone
                </label>
                <select id="uploadZone" value={zoneId} onChange={(event) => void handleZoneChange(event.target.value)} className={SELECT_CLASS}>
                  <option value="">Select zone</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>{z.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="uploadCompany" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                  Company
                </label>
                <select id="uploadCompany" value={companyId} disabled={zoneId === ""} onChange={(event) => void handleCompanyChange(event.target.value)} className={SELECT_CLASS}>
                  <option value="">{zoneId === "" ? "Select a zone first" : "Select company"}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="uploadPlant" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                  Company Plant
                </label>
                <select id="uploadPlant" value={plantId} disabled={companyId === ""} onChange={(event) => void handlePlantChange(event.target.value)} className={SELECT_CLASS}>
                  <option value="">{companyId === "" ? "Select a company first" : "Select plant"}</option>
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>{p.plantName}</option>
                  ))}
                </select>
              </div>
              {showSchemeStep && (
                <div>
                  <label htmlFor="uploadScheme" className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">
                    Scheme
                  </label>
                  <select id="uploadScheme" value={mouId} onChange={(event) => void handleSchemeChange(event.target.value)} className={SELECT_CLASS}>
                    <option value="">Select scheme</option>
                    {mous.map((m) => (
                      <option key={m.mouId} value={m.mouId}>
                        {SCHEME_LABELS[m.scheme as keyof typeof SCHEME_LABELS] ?? m.scheme}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {plantId !== "" && mous.length === 0 && (
              <p className="mt-3 text-sm text-muted-foreground">No MoUs recorded for this company plant.</p>
            )}
          </Card>

          {/* Upload Document Card */}
          <Card className="p-6">
            <SecTitle>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Upload Document
            </SecTitle>

            {uploadSuccess ? (
              <div className="rounded-xl border-2 border-green-300 bg-green-50 p-8 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <p className="font-bold text-green-800 text-sm">Document uploaded successfully!</p>
                <p className="text-xs text-green-600 mt-1">The file has been attached to this MoU record.</p>
                <Btn variant="secondary" size="sm" className="mt-4" onClick={() => setUploadSuccess(false)}>
                  Upload another
                </Btn>
              </div>
            ) : uploading ? (
              <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-8 text-center">
                <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-3 animate-pulse">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#1B5FAE" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="font-bold text-blue-800 text-sm">Uploading…</p>
                <div className="mt-3 h-2 bg-blue-200 rounded-full overflow-hidden max-w-xs mx-auto">
                  <div className="h-full bg-[#1B5FAE] rounded-full animate-pulse" style={{ width: "60%" }} />
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={!uploadReady}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (uploadReady) setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={uploadReady ? handleDrop : undefined}
                className={`w-full rounded-xl border-2 border-dashed p-8 text-center transition-all duration-200 ${
                  !uploadReady
                    ? "border-border bg-muted/30 opacity-50 cursor-not-allowed"
                    : dragOver
                      ? "border-[#1B5FAE] bg-blue-50 scale-[1.01]"
                      : "border-border hover:border-[#1B5FAE] hover:bg-blue-50/50 cursor-pointer"
                }`}
              >
                <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6 text-muted-foreground">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                </div>
                <p className="font-semibold text-sm text-foreground">
                  {uploadReady ? "Drop file here or click to browse" : "Select a company and scheme first"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">PDF files only, max 10 MB</p>
              </button>
            )}
            <input
              ref={fileInputRef}
              id="uploadFile"
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file !== undefined) {
                  void handleUpload(file);
                }
              }}
            />
          </Card>

          {/* Attached Documents Card */}
          {mouId !== "" && (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
                <h3 className="font-bold text-sm uppercase tracking-wide flex items-center gap-2" style={{ color: brand.navy }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  Attached Documents
                </h3>
                <Badge text={`${documents.length}`} variant="default" />
              </div>
              {documents.length === 0 ? (
                <p className="px-5 py-8 text-sm text-muted-foreground text-center">No documents attached yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/40">
                        {["Filename", "Size", "Uploaded By", "Uploaded On", ""].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => (
                        <tr key={doc.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-3 font-semibold text-foreground text-xs">{doc.originalFilename}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs mono">{formatBytes(doc.fileSizeBytes)}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs">{doc.uploadedByUsername}</td>
                          <td className="px-4 py-3 text-muted-foreground text-xs mono">{new Date(doc.uploadedAt).toLocaleString()}</td>
                          <td className="px-4 py-3 text-right">
                            <a
                              href={documentDownloadUrl(doc.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-semibold text-xs hover:underline"
                              style={{ color: brand.blue }}
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
          )}
        </div>
      </div>
    </>
  );
}
