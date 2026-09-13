/**
 * Purpose: The one place the web app talks to @mou/api (SPEC-02 section 2.2). Every
 * request goes out with credentials so the httpOnly session cookie travels, and a
 * 401 is treated as a normal answer rather than an error, because "not signed in"
 * is the expected state before login and after logout. Keeping this in one module
 * means no screen has to know the API's base URL or how a failure is shaped.
 */

import type { UserRole } from "@mou/domain";

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:3001";

export interface AuthUser {
  readonly userId: string;
  readonly username: string;
  readonly role: UserRole;
}

export type LoginResult =
  | { readonly ok: true; readonly user: AuthUser }
  | { readonly ok: false; readonly message: string };

async function request(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init.headers },
  });
}

/** null means "no valid session", which is a normal state, not a failure. */
export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await request("/api/auth/me");
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`GET /api/auth/me failed with status ${response.status}`);
  }
  return (await response.json()) as AuthUser;
}

export async function login(
  username: string,
  password: string,
): Promise<LoginResult> {
  const response = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  if (response.ok) {
    return { ok: true, user: (await response.json()) as AuthUser };
  }

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    retryAfterSeconds?: number;
  };
  const retryAfterSeconds = body.retryAfterSeconds;
  if (retryAfterSeconds !== undefined) {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    return {
      ok: false,
      message: `Too many failed attempts. Try again in ${minutes} minute(s).`,
    };
  }
  return { ok: false, message: body.error ?? "Invalid username or password." };
}

export async function logout(): Promise<void> {
  await request("/api/auth/logout", { method: "POST" });
}

// ---------------------------------------------------------------------------
// SPEC-03 wizard draft endpoints
// ---------------------------------------------------------------------------

export interface Draft {
  readonly id: string;
  readonly payload: {
    readonly page1?: Record<string, unknown>;
    readonly page2?: Record<string, unknown>;
    readonly page3?: Record<string, unknown>;
  };
  readonly currentPage: number;
}

export async function saveDraft(
  payload: Draft["payload"],
  currentPage: number,
): Promise<{ id: string; created: boolean }> {
  const response = await request("/api/companies/draft", {
    method: "POST",
    body: JSON.stringify({ payload, currentPage }),
  });
  if (!response.ok) {
    throw new Error(
      `POST /api/companies/draft failed with status ${response.status}`,
    );
  }
  return (await response.json()) as { id: string; created: boolean };
}

export async function getDraft(): Promise<Draft | null> {
  const response = await request("/api/companies/draft");
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(
      `GET /api/companies/draft failed with status ${response.status}`,
    );
  }
  return (await response.json()) as Draft;
}

export async function deleteDraft(draftId: string): Promise<void> {
  const response = await request(`/api/companies/draft/${draftId}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `DELETE /api/companies/draft/${draftId} failed with status ${response.status}`,
    );
  }
}

export async function submitCompany(
  draftId: string,
): Promise<{ companyId: string; generatedCode: string }> {
  const response = await request("/api/companies", {
    method: "POST",
    body: JSON.stringify({ draftId }),
  });
  if (!response.ok) {
    throw new Error(
      `POST /api/companies failed with status ${response.status}`,
    );
  }
  return (await response.json()) as {
    companyId: string;
    generatedCode: string;
  };
}

// ---------------------------------------------------------------------------
// SPEC-04 master data and Page 1 validation
// ---------------------------------------------------------------------------

export interface EnumOption {
  readonly value: string;
  readonly label: string;
}

export interface CommercialItemOption {
  readonly key: string;
  readonly label: string;
  /** null only for the "Other" entry, where the user chooses (SPEC-05 section 2.3). */
  readonly itemType: string | null;
  readonly displayOrder: number;
}

/** Same shape as CommercialItemOption; named separately for SPEC-06's payroll items. */
export interface PayrollItemOption {
  readonly key: string;
  readonly label: string;
  readonly itemType: string | null;
  readonly displayOrder: number;
}

/**
 * The slice of GET /api/enums the wizard needs. The endpoint serves every
 * section 2 list plus both item catalogues; AC1 (Page 1, and per SPEC-05/06
 * Pages 2 and 3) requires every dropdown and charge/item list to come from
 * here rather than a hardcoded list.
 */
export interface EnumsResponse {
  readonly companyTypes: readonly EnumOption[];
  readonly registrationTypes: readonly EnumOption[];
  readonly contactTypes: readonly EnumOption[];
  readonly itemTypes: readonly EnumOption[];
  readonly schemes: readonly EnumOption[];
  readonly commercialItems: readonly CommercialItemOption[];
  readonly payrollItems: readonly PayrollItemOption[];
}

export interface ZoneOption {
  readonly id: string;
  readonly code: string;
  readonly name: string;
}

/**
 * Both /api/enums and /api/zones back nine different pages' dropdowns with
 * data that essentially never changes within a session (master reference
 * lists, the zone master), yet every one of those pages fetched it fresh on
 * its own mount. Caching the in-flight *promise* (not just the resolved
 * value) means two pages mounting at nearly the same moment - e.g. the
 * cascading-selectors hook and this page's own enum fetch - share the one
 * request instead of issuing two. A rejection clears the cache immediately,
 * so a transient network failure does not permanently poison every later
 * caller for the rest of the session.
 */
let enumsPromise: Promise<EnumsResponse> | undefined;
let zonesPromise: Promise<readonly ZoneOption[]> | undefined;

export async function fetchEnums(): Promise<EnumsResponse> {
  enumsPromise ??= (async () => {
    const response = await request("/api/enums");
    if (!response.ok) {
      throw new Error(`GET /api/enums failed with status ${response.status}`);
    }
    return (await response.json()) as EnumsResponse;
  })().catch((error: unknown) => {
    enumsPromise = undefined;
    throw error;
  });
  return enumsPromise;
}

export async function fetchZones(): Promise<readonly ZoneOption[]> {
  zonesPromise ??= (async () => {
    const response = await request("/api/zones");
    if (!response.ok) {
      throw new Error(`GET /api/zones failed with status ${response.status}`);
    }
    return (await response.json()) as readonly ZoneOption[];
  })().catch((error: unknown) => {
    zonesPromise = undefined;
    throw error;
  });
  return zonesPromise;
}

/**
 * Server half of SPEC-04 section 4: GST uniqueness and the duplicate-company
 * check need a database, so they run here on Next rather than in the browser.
 * Format rules are shared with the UI through @mou/domain and are re-checked
 * server-side as well, since the client cannot be trusted.
 */
export async function validatePage1(details: Record<string, unknown>): Promise<{
  readonly errors: Record<string, string>;
  readonly warnings: Record<string, string>;
}> {
  const response = await request("/api/companies/validate-page1", {
    method: "POST",
    body: JSON.stringify({ details }),
  });
  if (!response.ok) {
    throw new Error(
      `POST /api/companies/validate-page1 failed with status ${response.status}`,
    );
  }
  return (await response.json()) as {
    errors: Record<string, string>;
    warnings: Record<string, string>;
  };
}

// ---------------------------------------------------------------------------
// SPEC-05 Page 2: MOU document upload
// ---------------------------------------------------------------------------

export interface MouDocumentMeta {
  readonly originalFilename: string;
  readonly fileSizeBytes: number;
}

/**
 * Cannot go through request() - that helper hardcodes a JSON content-type,
 * and a multipart body needs the browser to set its own boundary-bearing one.
 * Errors surface the server's message the same way validatePage1 does, so the
 * UI can show AC2/AC3's specific rejection reasons rather than a generic one.
 */
export async function uploadMouDocument(
  draftId: string,
  file: File,
): Promise<MouDocumentMeta> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(
    `${API_BASE_URL}/api/companies/draft/${draftId}/mou-document`,
    {
      method: "POST",
      credentials: "include",
      body,
    },
  );

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      errorBody.error ?? `Upload failed with status ${response.status}`,
    );
  }

  return (await response.json()) as MouDocumentMeta;
}

// ---------------------------------------------------------------------------
// SPEC-07 Existing Company: 3-page read-only view
// ---------------------------------------------------------------------------

export interface CompanyListItem {
  readonly id: string;
  readonly name: string;
}

export async function fetchZoneCompanies(
  zoneId: string,
): Promise<readonly CompanyListItem[]> {
  const response = await request(`/api/zones/${zoneId}/companies`);
  if (!response.ok) {
    throw new Error(
      `GET /api/zones/${zoneId}/companies failed with status ${response.status}`,
    );
  }
  return (await response.json()) as readonly CompanyListItem[];
}

export interface CompanyOverview {
  readonly id: string;
  readonly companyName: string;
  readonly gstNumber: string;
  readonly zoneId: string;
  readonly hrContactName: string;
  readonly hrContactNumber: string;
  readonly financeHeadContactName: string;
  readonly financeHeadContactNumber: string;
  readonly plants: readonly {
    readonly id: string;
    readonly plantName: string;
  }[];
}

export async function fetchCompanyOverview(
  companyId: string,
): Promise<CompanyOverview> {
  const response = await request(`/api/companies/${companyId}/overview`);
  if (!response.ok) {
    throw new Error(
      `GET /api/companies/${companyId}/overview failed with status ${response.status}`,
    );
  }
  return (await response.json()) as CompanyOverview;
}

export interface CompanyMouOption {
  readonly mouId: string;
  readonly scheme: string;
  readonly companyPlantId: string | null;
}

export async function fetchCompanyMous(
  companyId: string,
  plantId?: string,
): Promise<readonly CompanyMouOption[]> {
  const query = plantId !== undefined ? `?plantId=${plantId}` : "";
  const response = await request(`/api/companies/${companyId}/mous${query}`);
  if (!response.ok) {
    throw new Error(
      `GET /api/companies/${companyId}/mous failed with status ${response.status}`,
    );
  }
  return (await response.json()) as readonly CompanyMouOption[];
}

export interface MouChargeRow {
  readonly itemKey: string;
  readonly label: string;
  readonly amount: string | null;
}

export interface MouOtherItemRow {
  readonly label: string;
  readonly amount: string;
  readonly itemType: string;
}

export interface MouCommercialDetail {
  readonly mouId: string;
  readonly companyId: string;
  readonly companyPlantId: string | null;
  readonly scheme: string;
  readonly mouStartDate: string;
  readonly tenureValue: number;
  readonly tenureUnit: string;
  readonly endDate: string;
  readonly status: "ACTIVE" | "EXPIRED" | "NEW";
  readonly attendanceCycle: string;
  readonly stipendDate: number | null;
  readonly charges: readonly MouChargeRow[];
  readonly otherItems: readonly MouOtherItemRow[];
  readonly document:
    | {
        readonly id: string;
        readonly originalFilename: string;
        readonly uploadedAt: string;
      }
    | undefined;
}

export async function fetchMouCommercial(
  mouId: string,
): Promise<MouCommercialDetail> {
  const response = await request(`/api/mous/${mouId}/commercial`);
  if (!response.ok) {
    throw new Error(
      `GET /api/mous/${mouId}/commercial failed with status ${response.status}`,
    );
  }
  return (await response.json()) as MouCommercialDetail;
}

export interface MouPayrollItemRow {
  readonly itemKey: string;
  readonly label: string;
  readonly amount: string;
}

export interface MouPayrollDetail {
  readonly scheme: string;
  readonly traineeCategories: readonly string[];
  readonly allowances: readonly MouPayrollItemRow[];
  readonly deductions: readonly MouPayrollItemRow[];
}

export async function fetchMouPayroll(
  mouId: string,
): Promise<MouPayrollDetail> {
  const response = await request(`/api/mous/${mouId}/payroll`);
  if (!response.ok) {
    throw new Error(
      `GET /api/mous/${mouId}/payroll failed with status ${response.status}`,
    );
  }
  return (await response.json()) as MouPayrollDetail;
}

/** A plain link href, not a fetch - opened in a new tab so the browser handles the PDF. */
export function mouPrintUrl(mouId: string): string {
  return `${API_BASE_URL}/api/mous/${mouId}/print`;
}

// ---------------------------------------------------------------------------
// SPEC-08 MOU Expiry Alerts
// ---------------------------------------------------------------------------

export interface AlertRow {
  readonly alertId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly generatedCode: string;
  readonly zoneId: string;
  readonly zoneName: string;
  readonly plantName: string;
  readonly scheme: string;
  readonly mouStartDate: string;
  readonly endDate: string;
  readonly daysRemaining: number;
  readonly thresholdDays: number;
  readonly status: string;
  readonly acknowledgedAt: string | null;
}

export interface AlertFilters {
  readonly days?: "30" | "60" | "90" | "all";
  readonly zoneId?: string;
  readonly scheme?: string;
  readonly acknowledged?: "true" | "false" | "all";
}

function toQueryString(filters: object): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(
    filters as Record<string, string | undefined>,
  )) {
    if (value !== undefined && value !== "") {
      params.set(key, value);
    }
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export async function fetchAlerts(
  filters: AlertFilters = {},
): Promise<readonly AlertRow[]> {
  const response = await request(
    `/api/alerts/expiring${toQueryString(filters)}`,
  );
  if (!response.ok) {
    throw new Error(
      `GET /api/alerts/expiring failed with status ${response.status}`,
    );
  }
  return (await response.json()) as readonly AlertRow[];
}

export async function fetchAlertsCount(): Promise<number> {
  const response = await request("/api/alerts/count");
  if (!response.ok) {
    throw new Error(
      `GET /api/alerts/count failed with status ${response.status}`,
    );
  }
  const body = (await response.json()) as { count: number };
  return body.count;
}

export async function acknowledgeAlert(alertId: string): Promise<void> {
  const response = await request(`/api/alerts/${alertId}/acknowledge`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(
      `POST /api/alerts/${alertId}/acknowledge failed with status ${response.status}`,
    );
  }
}

// ---------------------------------------------------------------------------
// SPEC-09 Upload MOU PDF (standalone)
// ---------------------------------------------------------------------------

export interface CompanyPlantOption {
  readonly id: string;
  readonly plantName: string;
}

export async function fetchCompanyPlants(
  companyId: string,
): Promise<readonly CompanyPlantOption[]> {
  const response = await request(`/api/companies/${companyId}/plants`);
  if (!response.ok) {
    throw new Error(
      `GET /api/companies/${companyId}/plants failed with status ${response.status}`,
    );
  }
  return (await response.json()) as readonly CompanyPlantOption[];
}

export interface MouDocumentRow {
  readonly id: string;
  readonly originalFilename: string;
  readonly fileSizeBytes: number;
  readonly uploadedAt: string;
  readonly uploadedByUsername: string;
}

export async function fetchMouDocuments(
  mouId: string,
): Promise<readonly MouDocumentRow[]> {
  const response = await request(`/api/mous/${mouId}/documents`);
  if (!response.ok) {
    throw new Error(
      `GET /api/mous/${mouId}/documents failed with status ${response.status}`,
    );
  }
  return (await response.json()) as readonly MouDocumentRow[];
}

/**
 * Cannot go through request() - a multipart body needs the browser to set its
 * own boundary-bearing content-type, same reasoning as SPEC-05's
 * uploadMouDocument().
 */
export async function uploadMouDocumentToMou(
  mouId: string,
  file: File,
): Promise<void> {
  const body = new FormData();
  body.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/mous/${mouId}/document`, {
    method: "POST",
    credentials: "include",
    body,
  });

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      errorBody.error ?? `Upload failed with status ${response.status}`,
    );
  }
}

/** A plain link href, not a fetch - opened in a new tab so the browser handles the PDF. */
export function documentDownloadUrl(documentId: string): string {
  return `${API_BASE_URL}/api/documents/${documentId}`;
}

// ---------------------------------------------------------------------------
// SPEC-10 Edit Agreement
// ---------------------------------------------------------------------------

export interface EditableOtherItem {
  readonly label: string;
  readonly amount: string;
  readonly itemType: string;
}

export interface EditableCommercial {
  readonly mouStartDate: string;
  readonly tenureValue: string;
  readonly tenureUnit: string;
  readonly attendanceCycle: string;
  readonly stipendDate: string;
  readonly charges: Record<string, string>;
  readonly otherItems: EditableOtherItem[];
  readonly hasMouDocument: boolean;
}

export interface EditablePayrollItemAnswer {
  readonly isApplicable: boolean | undefined;
  readonly amount: string;
}

export interface EditablePayroll {
  readonly scheme: string;
  readonly traineeCategories: string[];
  readonly items: Record<string, EditablePayrollItemAnswer>;
  readonly otherItems: EditableOtherItem[];
}

export interface EditTokenResponse {
  readonly token: string;
  readonly version: number;
  readonly commercial: EditableCommercial;
  readonly payroll: EditablePayroll;
}

/**
 * Cannot go through request() - a multipart body needs the browser's own
 * boundary-bearing content-type, same reasoning as every other upload in
 * this file. Errors surface the server's message so the reason gate (SPEC-10
 * AC2/AC3) can show why the request was refused.
 */
export async function requestEditToken(
  mouId: string,
  reason: string,
  remark: string,
  proof: File | null,
): Promise<EditTokenResponse> {
  const body = new FormData();
  body.append("reason", reason);
  if (remark !== "") {
    body.append("remark", remark);
  }
  if (proof !== null) {
    body.append("proof", proof);
  }

  const response = await fetch(
    `${API_BASE_URL}/api/mous/${mouId}/edit-request`,
    {
      method: "POST",
      credentials: "include",
      body,
    },
  );
  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      errorBody.error ?? `Edit request failed with status ${response.status}`,
    );
  }
  return (await response.json()) as EditTokenResponse;
}

export type ApplyEditResult =
  | { readonly ok: true; readonly version: number }
  | { readonly ok: false; readonly status: number; readonly message: string };

/**
 * Never throws - the caller needs to distinguish a stale-version 409 (SPEC-10
 * section 5.1) and a validation/no-changes 422 from an unexpected failure,
 * each with its own message, so the result is a discriminated union rather
 * than an exception.
 */
export async function applyEdit(
  mouId: string,
  token: string,
  version: number,
  commercial: EditableCommercial,
  payroll: EditablePayroll,
): Promise<ApplyEditResult> {
  const response = await request(`/api/mous/${mouId}`, {
    method: "PUT",
    body: JSON.stringify({ token, version, commercial, payroll }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    version?: number;
    error?: string;
  };
  if (response.ok && body.version !== undefined) {
    return { ok: true, version: body.version };
  }
  return {
    ok: false,
    status: response.status,
    message: body.error ?? "Edit failed",
  };
}

// ---------------------------------------------------------------------------
// SPEC-11 Agreement History
// ---------------------------------------------------------------------------

export interface HistoryRow {
  readonly historyId: string;
  readonly version: number;
  readonly editedAt: string | null;
  readonly editedByUsername: string | null;
  readonly editReason: string;
  readonly editReasonLabel: string;
  readonly remark: string | null;
  readonly hasProof: boolean;
}

export interface HistoryListResponse {
  readonly currentVersion: number;
  readonly rows: readonly HistoryRow[];
}

export interface HistoryDetail extends HistoryRow {
  readonly commercial: EditableCommercial;
  readonly payroll: EditablePayroll;
}

export interface DiffRow {
  readonly field: string;
  readonly oldValue: string;
  readonly newValue: string;
  readonly changed: boolean;
}

export interface CompareResponse {
  readonly fromLabel: string;
  readonly toLabel: string;
  readonly rows: readonly DiffRow[];
}

export async function fetchAgreementHistory(
  mouId: string,
): Promise<HistoryListResponse> {
  const response = await request(`/api/mous/${mouId}/history`);
  if (!response.ok) {
    throw new Error(
      `GET /api/mous/${mouId}/history failed with status ${response.status}`,
    );
  }
  return (await response.json()) as HistoryListResponse;
}

/** `historyId` may be a real id or the literal "current" - both resolve to the same detail shape. */
export async function fetchHistoryDetail(
  mouId: string,
  historyId: string,
): Promise<HistoryDetail> {
  const response = await request(`/api/mous/${mouId}/history/${historyId}`);
  if (!response.ok) {
    throw new Error(
      `GET /api/mous/${mouId}/history/${historyId} failed with status ${response.status}`,
    );
  }
  return (await response.json()) as HistoryDetail;
}

/** `from`/`to` are each a history id or the literal "current". */
export async function fetchHistoryCompare(
  mouId: string,
  from: string,
  to: string,
): Promise<CompareResponse> {
  const response = await request(
    `/api/mous/${mouId}/history/compare?from=${from}&to=${to}`,
  );
  if (!response.ok) {
    throw new Error(
      `GET /api/mous/${mouId}/history/compare failed with status ${response.status}`,
    );
  }
  return (await response.json()) as CompareResponse;
}

export function historyProofDownloadUrl(
  mouId: string,
  historyId: string,
): string {
  return `${API_BASE_URL}/api/mous/${mouId}/history/${historyId}/proof`;
}

// ---------------------------------------------------------------------------
// SPEC-12 Zone Wise Dashboard
// ---------------------------------------------------------------------------

export interface ZoneSummaryRow {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly companies: number;
  readonly plants: number;
  readonly mous: number;
  readonly active: number;
  readonly expired: number;
  readonly new: number;
  readonly expiringSoon: number;
}

export interface ZoneTotals {
  readonly companies: number;
  readonly plants: number;
  readonly mous: number;
  readonly active: number;
  readonly expired: number;
  readonly new: number;
  readonly expiringSoon: number;
}

export interface SchemeMatrixRow {
  readonly zoneId: string;
  readonly zoneName: string;
  readonly counts: Readonly<Record<string, number>>;
  readonly rowTotal: number;
}

export interface SchemeMatrix {
  readonly schemes: readonly string[];
  readonly rows: readonly SchemeMatrixRow[];
  readonly columnTotals: Readonly<Record<string, number>>;
  readonly grandTotal: number;
}

export interface ZoneDashboardResponse {
  readonly zones: readonly ZoneSummaryRow[];
  readonly totals: ZoneTotals;
  readonly matrix: SchemeMatrix;
}

export interface ZoneDashboardFilters {
  readonly scheme?: string;
  readonly zoneStatus?: string;
}

function zoneFilterQuery(filters: ZoneDashboardFilters): string {
  const params = new URLSearchParams();
  if (filters.scheme !== undefined && filters.scheme !== "") {
    params.set("scheme", filters.scheme);
  }
  if (filters.zoneStatus !== undefined && filters.zoneStatus !== "") {
    params.set("status", filters.zoneStatus);
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export async function fetchZoneDashboard(
  filters: ZoneDashboardFilters = {},
): Promise<ZoneDashboardResponse> {
  const response = await request(
    `/api/dashboard/zone-wise${zoneFilterQuery(filters)}`,
  );
  if (!response.ok) {
    throw new Error(
      `GET /api/dashboard/zone-wise failed with status ${response.status}`,
    );
  }
  return (await response.json()) as ZoneDashboardResponse;
}

export interface ZoneDrillDownRow {
  readonly mouId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly generatedCode: string;
  readonly plantName: string | null;
  readonly scheme: string;
  readonly status: "ACTIVE" | "EXPIRED" | "NEW";
  readonly endDate: string;
}

export async function fetchZoneDrillDown(
  zoneId: string,
  filters: ZoneDashboardFilters = {},
): Promise<readonly ZoneDrillDownRow[]> {
  const response = await request(
    `/api/dashboard/zone-wise/${zoneId}/companies${zoneFilterQuery(filters)}`,
  );
  if (!response.ok) {
    throw new Error(
      `GET /api/dashboard/zone-wise/${zoneId}/companies failed with status ${response.status}`,
    );
  }
  return (await response.json()) as readonly ZoneDrillDownRow[];
}

// ---------------------------------------------------------------------------
// SPEC-13 Search, Export Excel, Export PDF
// ---------------------------------------------------------------------------

export interface SearchFilters {
  readonly by?: "company" | "plant" | "scheme";
  readonly q?: string;
  readonly zoneId?: string;
  readonly status?: string;
}

export interface SearchRow {
  readonly mouId: string;
  readonly companyId: string;
  readonly companyName: string;
  readonly generatedCode: string;
  readonly zoneId: string;
  readonly zoneName: string;
  readonly plantName: string | null;
  readonly scheme: string;
  readonly mouStartDate: string;
  readonly endDate: string;
  readonly status: "ACTIVE" | "EXPIRED" | "NEW";
}

export interface SearchResponse {
  readonly rows: readonly SearchRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

function searchFilterQuery(
  filters: SearchFilters,
  extra: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams();
  const all = { ...filters, ...extra };
  for (const [key, value] of Object.entries(all)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

export async function fetchSearch(
  filters: SearchFilters,
  page = 1,
): Promise<SearchResponse> {
  const response = await request(
    `/api/search${searchFilterQuery(filters, { page })}`,
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      body.error ?? `GET /api/search failed with status ${response.status}`,
    );
  }
  return (await response.json()) as SearchResponse;
}

export interface ExportJobStatus {
  readonly jobId: string;
  readonly status: "pending" | "ready" | "failed";
  readonly downloadUrl?: string;
}

export async function startExcelExport(
  filters: SearchFilters,
): Promise<ExportJobStatus> {
  const response = await request(
    `/api/export/excel${searchFilterQuery(filters)}`,
  );
  if (!response.ok) {
    throw new Error(
      `GET /api/export/excel failed with status ${response.status}`,
    );
  }
  return (await response.json()) as ExportJobStatus;
}

export interface PdfExportParams {
  readonly scope: "all_zones" | "company";
  readonly companyId?: string;
  readonly plantId?: string;
}

export async function startPdfExport(
  params: PdfExportParams,
): Promise<ExportJobStatus> {
  const query = searchFilterQuery({}, { ...params });
  const response = await request(`/api/export/pdf${query}`);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(
      body.error ?? `GET /api/export/pdf failed with status ${response.status}`,
    );
  }
  return (await response.json()) as ExportJobStatus;
}

export async function fetchExportJob(jobId: string): Promise<ExportJobStatus> {
  const response = await request(`/api/export/jobs/${jobId}`);
  if (!response.ok) {
    throw new Error(
      `GET /api/export/jobs/${jobId} failed with status ${response.status}`,
    );
  }
  return (await response.json()) as ExportJobStatus;
}

export function exportDownloadUrl(jobId: string): string {
  return `${API_BASE_URL}/api/export/jobs/${jobId}/download`;
}

// ---------------------------------------------------------------------------
// SPEC-14 Dashboard KPI + recent activity (Figma UI replication)
// ---------------------------------------------------------------------------

export interface DashboardSummary {
  readonly totalCompanies: number;
  readonly activeMou: number;
  readonly expiringSoon: number;
  readonly expired: number;
  readonly pendingReview: number;
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const response = await request("/api/dashboard/summary");
  if (!response.ok) {
    throw new Error(
      `GET /api/dashboard/summary failed with status ${response.status}`,
    );
  }
  return (await response.json()) as DashboardSummary;
}

export interface RecentActivityRow {
  readonly type: "COMPANY_CREATED" | "MOU_EDITED";
  readonly company: string;
  readonly zone: string;
  readonly plant: string | null;
  readonly scheme: string | null;
  readonly status: "ACTIVE" | "EXPIRED" | "NEW" | null;
  readonly occurredAt: string;
}

export async function fetchRecentActivity(
  limit = 10,
): Promise<readonly RecentActivityRow[]> {
  const response = await request(
    `/api/dashboard/recent-activity?limit=${limit}`,
  );
  if (!response.ok) {
    throw new Error(
      `GET /api/dashboard/recent-activity failed with status ${response.status}`,
    );
  }
  return (await response.json()) as readonly RecentActivityRow[];
}
