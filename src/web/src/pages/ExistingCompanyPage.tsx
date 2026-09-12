/**
 * Purpose: SPEC-07's 3-page read-only view flow - Overview, Commercial Details
 * (view only) and Payroll Details (view only). Every field here is
 * display-only; there is no draft, no save, and every endpoint it calls is a
 * GET. Zone carries from Page 1 into Pages 2/3 and is never re-selected
 * (section 4 step 1) - the scheme is the only choice Page 2 makes, and it is
 * scoped to the schemes this company + plant actually has an MOU for
 * (section 4.1), not the full SPEC-01 enum.
 *
 * Accepts optional `?zoneId=&companyId=` query parameters so another screen
 * (SPEC-08's alert list, and later SPEC-11/12/13) can link straight to a
 * specific company's overview instead of leaving the visitor to reselect it.
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import type {
  CompanyListItem,
  CompanyMouOption,
  CompanyOverview,
  MouCommercialDetail,
  MouPayrollDetail,
  ZoneOption,
} from "../api/client.ts";
import {
  fetchCompanyMous,
  fetchCompanyOverview,
  fetchMouCommercial,
  fetchMouPayroll,
  fetchZoneCompanies,
  fetchZones,
  mouPrintUrl,
} from "../api/client.ts";

const STATUS_LABEL: Record<MouCommercialDetail["status"], string> = {
  NEW: "● New",
  ACTIVE: "✓ Active",
  EXPIRED: "✕ Expired",
};

const STATUS_CLASS: Record<MouCommercialDetail["status"], string> = {
  NEW: "bg-blue-100 text-blue-800",
  ACTIVE: "bg-green-100 text-green-800",
  EXPIRED: "bg-red-100 text-red-800",
};

function StatusBadge({ status }: { readonly status: MouCommercialDetail["status"] }) {
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

function amountText(value: string | null): string {
  return value === null ? "—" : value;
}

export function ExistingCompanyPage() {
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [zones, setZones] = useState<readonly ZoneOption[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [companies, setCompanies] = useState<readonly CompanyListItem[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [plantId, setPlantId] = useState("");

  const [mous, setMous] = useState<readonly CompanyMouOption[]>([]);
  const [scheme, setScheme] = useState("");
  const [commercial, setCommercial] = useState<MouCommercialDetail | null>(null);
  const [payroll, setPayroll] = useState<MouPayrollDetail | null>(null);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load zones"));
  }, []);

  // Deep-link support: another screen can send a visitor straight to a known
  // company instead of making them reselect zone then company.
  useEffect(() => {
    const linkedZoneId = searchParams.get("zoneId");
    const linkedCompanyId = searchParams.get("companyId");
    if (linkedZoneId === null || linkedCompanyId === null) {
      return;
    }
    void (async () => {
      await handleZoneChange(linkedZoneId);
      await handleCompanyChange(linkedCompanyId);
    })();
    // Only ever run once, from the URL this page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleZoneChange(id: string) {
    setZoneId(id);
    setCompanyId("");
    setOverview(null);
    setCompanies([]);
    if (id === "") {
      return;
    }
    try {
      setCompanies(await fetchZoneCompanies(id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load companies");
    }
  }

  async function handleCompanyChange(id: string) {
    setCompanyId(id);
    setOverview(null);
    if (id === "") {
      return;
    }
    try {
      const data = await fetchCompanyOverview(id);
      setOverview(data);
      setPlantId(data.plants[0]?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load company");
    }
  }

  async function loadMou(mouId: string) {
    try {
      const [c, p] = await Promise.all([fetchMouCommercial(mouId), fetchMouPayroll(mouId)]);
      setCommercial(c);
      setPayroll(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load MOU");
    }
  }

  async function handleNextToCommercial() {
    if (companyId === "") {
      return;
    }
    setError(null);
    try {
      const list = await fetchCompanyMous(companyId, plantId || undefined);
      setMous(list);
      const first = list[0];
      if (list.length > 0 && first !== undefined) {
        setScheme(first.scheme);
        await loadMou(first.mouId);
      } else {
        setScheme("");
        setCommercial(null);
        setPayroll(null);
      }
      setStep(2);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load schemes");
    }
  }

  async function handleSchemeChange(nextScheme: string) {
    setScheme(nextScheme);
    const match = mous.find((m) => m.scheme === nextScheme);
    if (match !== undefined) {
      await loadMou(match.mouId);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <h1 className="mb-6 text-2xl font-bold text-gray-900">Existing Company</h1>

      {error !== null && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {step === 1 && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Overview</h2>
          <div>
            <label htmlFor="viewZone" className="block text-sm font-medium text-gray-700">
              Zone
            </label>
            <select
              id="viewZone"
              value={zoneId}
              onChange={(event) => void handleZoneChange(event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
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
            <label htmlFor="viewCompany" className="block text-sm font-medium text-gray-700">
              Company Name
            </label>
            <select
              id="viewCompany"
              value={companyId}
              disabled={zoneId === ""}
              onChange={(event) => void handleCompanyChange(event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm disabled:bg-gray-100"
            >
              <option value="">{zoneId === "" ? "Select a zone first" : "Select company"}</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.generatedCode})
                </option>
              ))}
            </select>
          </div>

          {overview !== null && (
            <div className="space-y-2 rounded-md bg-gray-50 p-4 text-sm">
              <p>
                <span className="font-medium">Company Name:</span> {overview.companyName}
              </p>
              <p>
                <span className="font-medium">Generated Code:</span> {overview.generatedCode}
              </p>
              <p>
                <span className="font-medium">GST Number:</span> {overview.gstNumber}
              </p>
              {overview.plants.length > 1 ? (
                <div>
                  <label htmlFor="viewPlant" className="block font-medium text-gray-700">
                    Plant
                  </label>
                  <select
                    id="viewPlant"
                    value={plantId}
                    onChange={(event) => setPlantId(event.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
                  >
                    {overview.plants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.plantName}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p>
                  <span className="font-medium">Plant:</span> {overview.plants[0]?.plantName ?? "—"}
                </p>
              )}
              <p>
                <span className="font-medium">HR Contact:</span> {overview.hrContactName} (
                {overview.hrContactNumber})
              </p>
              <p>
                <span className="font-medium">Finance Head:</span> {overview.financeHeadContactName} (
                {overview.financeHeadContactNumber})
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              disabled={overview === null}
              onClick={() => void handleNextToCommercial()}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Commercial Details</h2>

          <div>
            <label htmlFor="viewScheme" className="block text-sm font-medium text-gray-700">
              Scheme
            </label>
            <select
              id="viewScheme"
              value={scheme}
              onChange={(event) => void handleSchemeChange(event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm"
            >
              {mous.map((m) => (
                <option key={m.mouId} value={m.scheme}>
                  {m.scheme}
                </option>
              ))}
            </select>
          </div>

          {mous.length === 0 && <p className="text-sm text-gray-600">No MOUs recorded for this company.</p>}

          {commercial !== null && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-3">
                <StatusBadge status={commercial.status} />
                <span>
                  {commercial.mouStartDate} → {commercial.endDate}
                </span>
              </div>
              <p>
                Tenure: {commercial.tenureValue} {commercial.tenureUnit}
              </p>
              <p>Attendance Cycle: {commercial.attendanceCycle}</p>
              <p>Stipend Date: {commercial.stipendDate ?? "—"}</p>

              <h3 className="pt-2 font-semibold uppercase tracking-wide text-gray-500">Charges</h3>
              <table className="w-full text-left">
                <tbody>
                  {commercial.charges.map((charge) => (
                    <tr key={charge.itemKey} className="border-b border-gray-100">
                      <td className="py-1">{charge.label}</td>
                      <td className="py-1 text-right">{amountText(charge.amount)}</td>
                    </tr>
                  ))}
                  {commercial.otherItems.map((other, index) => (
                    <tr key={index} className="border-b border-gray-100">
                      <td className="py-1">
                        {other.label} ({other.itemType})
                      </td>
                      <td className="py-1 text-right">{other.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 className="pt-2 font-semibold uppercase tracking-wide text-gray-500">MOU Document</h3>
              {commercial.document !== undefined ? (
                <p>
                  {commercial.document.originalFilename} — uploaded{" "}
                  {new Date(commercial.document.uploadedAt).toLocaleDateString()}
                </p>
              ) : (
                <p className="text-gray-600">No document uploaded.</p>
              )}

              <div className="flex gap-2">
                <a
                  href={mouPrintUrl(commercial.mouId)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Print
                </a>
                <a
                  href={`/agreements/history?mouId=${commercial.mouId}`}
                  className="inline-block rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Agreement History
                </a>
              </div>
            </div>
          )}

          <div className="flex justify-between pt-2">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            <button
              type="button"
              disabled={commercial === null}
              onClick={() => setStep(3)}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && payroll !== null && (
        <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Payroll Details</h2>
          <p className="text-sm">Scheme: {payroll.scheme}</p>

          <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
            Trainee Categories
          </h3>
          {payroll.traineeCategories.length > 0 ? (
            <ul className="list-inside list-disc text-sm">
              {payroll.traineeCategories.map((category) => (
                <li key={category}>{category}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">No trainee categories recorded.</p>
          )}

          {payroll.allowances.length === 0 && payroll.deductions.length === 0 ? (
            <p className="text-sm text-gray-600">No payroll items configured for this scheme.</p>
          ) : (
            <>
              {payroll.allowances.length > 0 && (
                <>
                  <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Allowances
                  </h3>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {payroll.allowances.map((item) => (
                        <tr key={item.itemKey} className="border-b border-gray-100">
                          <td className="py-1">{item.label}</td>
                          <td className="py-1 text-right">{item.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
              {payroll.deductions.length > 0 && (
                <>
                  <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Deductions
                  </h3>
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {payroll.deductions.map((item) => (
                        <tr key={item.itemKey} className="border-b border-gray-100">
                          <td className="py-1">{item.label}</td>
                          <td className="py-1 text-right">{item.amount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </>
          )}

          <div className="flex justify-start pt-2">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
