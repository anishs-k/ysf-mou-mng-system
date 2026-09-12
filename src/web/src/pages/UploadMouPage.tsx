/**
 * Purpose: SPEC-09's standalone "attach a signed MOU PDF" flow - Zone then
 * Company then Plant then Scheme, each disabled until its predecessor has a
 * value and cleared whenever an earlier one changes (section 2). When the
 * chosen company + plant has exactly one MOU the scheme step is skipped
 * entirely (section 2.1); with two or more it must be chosen explicitly
 * before the upload control is enabled (AC3/AC4).
 */

import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.tsx";
import type { CompanyListItem, CompanyMouOption, CompanyPlantOption, MouDocumentRow, ZoneOption } from "../api/client.ts";
import {
  documentDownloadUrl,
  fetchCompanyMous,
  fetchCompanyPlants,
  fetchMouDocuments,
  fetchZoneCompanies,
  fetchZones,
  uploadMouDocumentToMou,
} from "../api/client.ts";
import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Card } from "../components/ui.tsx";

const AUTHORING_ROLES: readonly string[] = ["ADMIN", "DATA_ENTRY"];

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadMouPage() {
  const { user } = useAuth();
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [zones, setZones] = useState<readonly ZoneOption[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [companies, setCompanies] = useState<readonly CompanyListItem[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [plants, setPlants] = useState<readonly CompanyPlantOption[]>([]);
  const [plantId, setPlantId] = useState("");
  const [mous, setMous] = useState<readonly CompanyMouOption[]>([]);
  const [mouId, setMouId] = useState("");
  const [documents, setDocuments] = useState<readonly MouDocumentRow[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load zones"));
  }, []);

  async function handleZoneChange(nextZoneId: string) {
    setZoneId(nextZoneId);
    setCompanyId("");
    setPlants([]);
    setPlantId("");
    setMous([]);
    setMouId("");
    setDocuments([]);
    setCompanies([]);
    if (nextZoneId === "") {
      return;
    }
    try {
      setCompanies(await fetchZoneCompanies(nextZoneId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load companies");
    }
  }

  async function handleCompanyChange(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setPlantId("");
    setMous([]);
    setMouId("");
    setDocuments([]);
    setPlants([]);
    if (nextCompanyId === "") {
      return;
    }
    try {
      setPlants(await fetchCompanyPlants(nextCompanyId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load plants");
    }
  }

  async function loadDocuments(id: string) {
    try {
      setDocuments(await fetchMouDocuments(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load documents");
    }
  }

  async function handlePlantChange(nextPlantId: string) {
    setPlantId(nextPlantId);
    setMous([]);
    setMouId("");
    setDocuments([]);
    if (nextPlantId === "" || companyId === "") {
      return;
    }
    try {
      const list = await fetchCompanyMous(companyId, nextPlantId);
      setMous(list);
      const only = list.length === 1 ? list[0] : undefined;
      if (only !== undefined) {
        setMouId(only.mouId);
        await loadDocuments(only.mouId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schemes");
    }
  }

  async function handleSchemeChange(nextMouId: string) {
    setMouId(nextMouId);
    setDocuments([]);
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
    setMessage(null);
    setUploading(true);
    try {
      await uploadMouDocumentToMou(mouId, file);
      setMessage("Document uploaded.");
      await loadDocuments(mouId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const showSchemeStep = mous.length > 1;

  // SPEC-09 section 4: upload requires ADMIN or DATA_ENTRY; a VIEWER who
  // types this URL directly is refused at the UI level too. Placed after
  // every hook above so React's rules of hooks are respected.
  if (user !== null && !AUTHORING_ROLES.includes(user.role)) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-2xl rounded-xl bg-white p-8 shadow-sm border border-border">
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
      <Topbar title="Upload MOU PDF" subtitle="Attach a signed agreement to an existing company" onOpenMenu={openMobileMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl">
          {error !== null && <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {message !== null && <div className="mb-4 rounded-md bg-green-50 p-3 text-sm text-green-700">{message}</div>}

          <Card className="space-y-4 p-6">
            <div>
              <label htmlFor="uploadZone" className="block text-sm font-medium text-foreground mb-1">
                Zone
              </label>
              <select
                id="uploadZone"
                value={zoneId}
                onChange={(event) => void handleZoneChange(event.target.value)}
                className="block w-full rounded-lg border border-border px-3 py-2 text-sm bg-white"
              >
                <option value="">Select zone</option>
                {zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="uploadCompany" className="block text-sm font-medium text-foreground mb-1">
                Company
              </label>
              <select
                id="uploadCompany"
                value={companyId}
                disabled={zoneId === ""}
                onChange={(event) => void handleCompanyChange(event.target.value)}
                className="block w-full rounded-lg border border-border px-3 py-2 text-sm bg-white disabled:bg-muted"
              >
                <option value="">{zoneId === "" ? "Select a zone first" : "Select company"}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.generatedCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="uploadPlant" className="block text-sm font-medium text-foreground mb-1">
                Company Plant
              </label>
              <select
                id="uploadPlant"
                value={plantId}
                disabled={companyId === ""}
                onChange={(event) => void handlePlantChange(event.target.value)}
                className="block w-full rounded-lg border border-border px-3 py-2 text-sm bg-white disabled:bg-muted"
              >
                <option value="">{companyId === "" ? "Select a company first" : "Select plant"}</option>
                {plants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.plantName}
                  </option>
                ))}
              </select>
            </div>

            {plantId !== "" && mous.length === 0 && (
              <p className="text-sm text-muted-foreground">No MOUs recorded for this company plant.</p>
            )}

            {showSchemeStep && (
              <div>
                <label htmlFor="uploadScheme" className="block text-sm font-medium text-foreground mb-1">
                  Scheme
                </label>
                <select
                  id="uploadScheme"
                  value={mouId}
                  onChange={(event) => void handleSchemeChange(event.target.value)}
                  className="block w-full rounded-lg border border-border px-3 py-2 text-sm bg-white"
                >
                  <option value="">Select scheme</option>
                  {mous.map((m) => (
                    <option key={m.mouId} value={m.mouId}>
                      {m.scheme}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label htmlFor="uploadFile" className="block text-sm font-medium text-foreground mb-1">
                Upload PDF
              </label>
              <input
                id="uploadFile"
                type="file"
                accept="application/pdf"
                disabled={mouId === "" || uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file !== undefined) {
                    void handleUpload(file);
                  }
                }}
                className="block w-full text-sm text-foreground disabled:opacity-50"
              />
            </div>

            {mouId !== "" && (
              <div>
                <h2 className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Attached Documents
                </h2>
                {documents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No documents attached yet.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-xs uppercase text-muted-foreground">
                        <th className="py-1 font-medium">Filename</th>
                        <th className="py-1 font-medium">Size</th>
                        <th className="py-1 font-medium">Uploaded By</th>
                        <th className="py-1 font-medium">Uploaded On</th>
                        <th className="py-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {documents.map((doc) => (
                        <tr key={doc.id} className="border-b border-border">
                          <td className="py-1">{doc.originalFilename}</td>
                          <td className="py-1">{formatBytes(doc.fileSizeBytes)}</td>
                          <td className="py-1">{doc.uploadedByUsername}</td>
                          <td className="py-1">{new Date(doc.uploadedAt).toLocaleString()}</td>
                          <td className="py-1 text-right">
                            <a
                              href={documentDownloadUrl(doc.id)}
                              target="_blank"
                              rel="noreferrer"
                              className="font-medium hover:underline"
                              style={{ color: "#1B5FAE" }}
                            >
                              Download
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
