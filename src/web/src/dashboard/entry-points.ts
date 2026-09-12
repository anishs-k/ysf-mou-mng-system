/**
 * Purpose: The ten Dashboard Home entry points of SPEC-02 section 3.1 together with
 * the role visibility matrix of section 3.3, declared once as data. The dashboard,
 * the routes and the Playwright tests all read this single list, so adding a
 * destination when its spec lands is one edit and cannot leave the UI and the tests
 * disagreeing. `available` stays false until the destination spec is implemented:
 * section 3.1 requires the entry point to be present but disabled, so the dashboard
 * layout never has to be rebuilt.
 */

import type { UserRole } from "@mou/domain";

export const ALL_ROLES: readonly UserRole[] = ["ADMIN", "DATA_ENTRY", "VIEWER"];

/** Roles that may create or amend agreements - the section 3.3 "no" column for VIEWER. */
const AUTHORING_ROLES: readonly UserRole[] = ["ADMIN", "DATA_ENTRY"];

export interface DashboardEntryPoint {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly path: string;
  /** Roles that may see this entry point at all; SPEC-02 section 3.3. */
  readonly roles: readonly UserRole[];
  /** False until the destination spec lands, rendered as "coming soon". */
  readonly available: boolean;
  /** Which spec delivers the destination, shown to the user while it is pending. */
  readonly spec: string;
}

export const DASHBOARD_ENTRY_POINTS: readonly DashboardEntryPoint[] = [
  {
    id: "add-company",
    label: "Add New Company",
    description: "Onboard a company through the three-page wizard",
    path: "/companies/new",
    roles: AUTHORING_ROLES,
    available: true,
    spec: "SPEC-03",
  },
  {
    id: "existing-company",
    label: "Existing Company",
    description: "Review a company's MOU, commercial and payroll details",
    path: "/companies",
    roles: ALL_ROLES,
    available: true,
    spec: "SPEC-07",
  },
  {
    id: "expiry-alerts",
    label: "MOU Expiry Alerts",
    description: "Agreements expiring in the next 30, 60 or 90 days",
    path: "/alerts",
    roles: ALL_ROLES,
    available: true,
    spec: "SPEC-08",
  },
  {
    id: "upload-mou",
    label: "Upload MOU PDF",
    description: "Attach a signed agreement to an existing company",
    path: "/upload-mou",
    roles: AUTHORING_ROLES,
    available: true,
    spec: "SPEC-09",
  },
  {
    id: "edit-agreement",
    label: "Edit Agreement",
    description: "Amend a saved agreement after stating a reason",
    path: "/agreements/edit",
    roles: ["ADMIN"],
    available: true,
    spec: "SPEC-10",
  },
  {
    id: "agreement-history",
    label: "Agreement History",
    description: "Every past version of an agreement, with the reason",
    path: "/agreements/history",
    roles: ALL_ROLES,
    available: true,
    spec: "SPEC-11",
  },
  {
    id: "zone-dashboard",
    label: "Zone Wise Dashboard",
    description: "Companies and MOUs summarised by zone",
    path: "/zones/overview",
    roles: ALL_ROLES,
    available: true,
    spec: "SPEC-12",
  },
  {
    id: "export-excel",
    label: "Export Excel",
    description: "Download the company and MOU data as a workbook",
    path: "/export/excel",
    roles: ALL_ROLES,
    available: true,
    spec: "SPEC-13",
  },
  {
    id: "export-pdf",
    label: "Export PDF",
    description: "Download a PDF for all zones or a single company",
    path: "/export/pdf",
    roles: ALL_ROLES,
    available: true,
    spec: "SPEC-13",
  },
  {
    id: "search",
    label: "Search",
    description: "Find a record by company, plant or scheme",
    path: "/search",
    roles: ALL_ROLES,
    available: true,
    spec: "SPEC-13",
  },
];

/** The entry points a role is allowed to see. A VIEWER sees seven of the ten. */
export function visibleEntryPoints(role: UserRole): readonly DashboardEntryPoint[] {
  return DASHBOARD_ENTRY_POINTS.filter((entry) => entry.roles.includes(role));
}

/**
 * Whether a role may open a path at all. Used to keep a hidden entry point from
 * being reached by typing its URL - the UI hiding is presentation, and the server
 * enforces the same matrix independently (SPEC-02 section 3.3).
 */
export function canAccessPath(role: UserRole, path: string): boolean {
  const entry = DASHBOARD_ENTRY_POINTS.find((candidate) => candidate.path === path);
  return entry === undefined ? false : entry.roles.includes(role);
}
