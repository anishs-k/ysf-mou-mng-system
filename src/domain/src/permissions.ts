/**
 * Purpose: SPEC-32's section-wise access control. Each role maps to a fixed set
 * of permissions (view or change one section of a record, export, manage users),
 * so the API guards, the response filtering and the web UI all read one matrix
 * and cannot drift apart. Zone scope (SPEC-19) still decides which companies a
 * user sees; this decides what they may see and change inside one.
 * SPEC-33: ROLE_PERMISSIONS becomes the default seeded into the role_permission
 * table, which a super admin edits. ADMIN always holds everything, "users.manage"
 * is never granted to another role, and a change permission brings its view.
 */

import type { UserRole } from "./enums.ts";

export const PERMISSIONS = [
  "company.create",
  "company.view",
  "company.edit",
  "contacts.view",
  "contacts.edit",
  "commercial.view",
  "commercial.edit",
  "payroll.view",
  "payroll.edit",
  "documents.view",
  "documents.upload",
  "agreement.edit",
  "alerts.ack",
  "export.data",
  "contacts.export",
  "users.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The approved SPEC-32 matrix, and since SPEC-33 the default the migration seeds.
 * "users.manage" is further limited to a super admin (an ADMIN with all zones)
 * by the user-management routes, per SPEC-21.
 */
export const ROLE_PERMISSIONS: Readonly<Record<UserRole, readonly Permission[]>> = {
  ADMIN: PERMISSIONS,
  DATA_ENTRY: [
    "company.create",
    "company.view",
    "company.edit",
    "contacts.view",
    "contacts.edit",
    "commercial.view",
    "commercial.edit",
    "payroll.view",
    "payroll.edit",
    "documents.view",
    "documents.upload",
    "alerts.ack",
    "export.data",
  ],
  HR: [
    "company.create",
    "company.view",
    "company.edit",
    "contacts.view",
    "contacts.edit",
    "commercial.view",
    "payroll.view",
    "payroll.edit",
    "documents.view",
    "documents.upload",
    "agreement.edit",
    "alerts.ack",
    "export.data",
    "contacts.export",
  ],
  FINANCE: [
    "company.create",
    "company.view",
    "contacts.view",
    "commercial.view",
    "commercial.edit",
    "payroll.view",
    "payroll.edit",
    "documents.view",
    "documents.upload",
    "agreement.edit",
    "alerts.ack",
    "export.data",
    "contacts.export",
  ],
  VIEWER: ["company.view", "commercial.view", "payroll.view", "documents.view"],
};

/** Whether the default matrix gives `role` the permission (SPEC-33: live checks read the user's stored permissions). */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** SPEC-33: the roles whose permissions a super admin may change; ADMIN is locked. */
export const EDITABLE_ROLES = ["DATA_ENTRY", "HR", "FINANCE", "VIEWER"] as const satisfies readonly UserRole[];

export type EditableRole = (typeof EDITABLE_ROLES)[number];

export function isEditableRole(value: string): value is EditableRole {
  return (EDITABLE_ROLES as readonly string[]).includes(value);
}

/** A change permission and the view permission it cannot exist without. */
const IMPLIED_VIEW: Readonly<Partial<Record<Permission, Permission>>> = {
  "company.edit": "company.view",
  "contacts.edit": "contacts.view",
  "commercial.edit": "commercial.view",
  "payroll.edit": "payroll.view",
  "documents.upload": "documents.view",
  "contacts.export": "contacts.view",
};

/**
 * SPEC-33: the permissions a non-admin role may actually hold, from whatever was
 * stored or sent: unknown values and "users.manage" are dropped, each change
 * permission adds its view permission, and the result follows PERMISSIONS order.
 */
export function normalizeGrant(values: readonly string[]): Permission[] {
  const granted = new Set<Permission>();
  for (const value of values) {
    const permission = PERMISSIONS.find((candidate) => candidate === value);
    if (permission === undefined || permission === "users.manage") continue;
    granted.add(permission);
    const view = IMPLIED_VIEW[permission];
    if (view !== undefined) granted.add(view);
  }
  return PERMISSIONS.filter((permission) => granted.has(permission));
}

/** SPEC-33: what a user of `role` holds, given the role's stored permissions. ADMIN always holds all. */
export function effectivePermissions(role: UserRole, stored: readonly string[]): Permission[] {
  return role === "ADMIN" ? [...PERMISSIONS] : normalizeGrant(stored);
}

/** SPEC-33: the rows of the Roles & Permissions screen - one section, its view and change permissions. */
export interface PermissionSection {
  readonly label: string;
  readonly view?: Permission;
  readonly change?: Permission;
}

export const PERMISSION_SECTIONS: readonly PermissionSection[] = [
  { label: "Add company / bulk upload", change: "company.create" },
  { label: "Company details", view: "company.view", change: "company.edit" },
  { label: "Contacts", view: "contacts.view", change: "contacts.edit" },
  { label: "Commercial", view: "commercial.view", change: "commercial.edit" },
  { label: "Payroll", view: "payroll.view", change: "payroll.edit" },
  { label: "Documents", view: "documents.view", change: "documents.upload" },
  { label: "Edit Agreement", change: "agreement.edit" },
  { label: "Acknowledge alerts", change: "alerts.ack" },
  { label: "Export (Excel / PDF)", change: "export.data" },
  { label: "Contacts export", change: "contacts.export" },
];

/** Which of the three Edit Agreement sections an edit actually changed. */
export interface ChangedSections {
  readonly contacts: boolean;
  readonly commercial: boolean;
  readonly payroll: boolean;
}

const EDIT_SECTIONS: readonly { readonly key: keyof ChangedSections; readonly permission: Permission; readonly label: string }[] = [
  { key: "contacts", permission: "contacts.edit", label: "Contact Details" },
  { key: "commercial", permission: "commercial.edit", label: "Commercial Details" },
  { key: "payroll", permission: "payroll.edit", label: "Payroll Details" },
];

/**
 * The labels of the sections changed without the right to change them, for a
 * user holding `permissions`.
 * A section sent back unchanged is always allowed, so a read-only tab never
 * blocks an edit of the others.
 */
export function forbiddenEditSections(permissions: readonly Permission[], changed: ChangedSections): string[] {
  return EDIT_SECTIONS.filter((section) => changed[section.key] && !permissions.includes(section.permission)).map(
    (section) => section.label,
  );
}
