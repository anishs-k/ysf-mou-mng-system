/**
 * Purpose: SPEC-32's response filtering. Hiding a section in the web UI is not
 * access control, so a role without "contacts.view" (the Viewer) must not
 * receive a company's people at all: these helpers blank the contact fields of
 * an overview and a search row, and drop the contacts from a history snapshot.
 * Generic over the row shape, so every route reuses the same rule. SPEC-33: the
 * check reads the caller's permissions (from role_permission), not the role.
 */

import type { Permission } from "@mou/domain";

/** Anything carrying the caller's permissions - in practice the session user. */
export interface PermissionHolder {
  readonly permissions: readonly Permission[];
}

function seesContacts(holder: PermissionHolder): boolean {
  return holder.permissions.includes("contacts.view");
}

/** Required contact columns: blanked to "" so the response keeps its string type. */
const REQUIRED_CONTACT_FIELDS = [
  "hrContactName",
  "hrContactNumber",
  "financeHeadContactName",
  "financeHeadContactNumber",
  "hrEmail",
  "financeEmail",
] as const;

/** Optional contact columns: blanked to null, as if never recorded. */
const OPTIONAL_CONTACT_FIELDS = [
  "purchaseName",
  "purchaseNumber",
  "purchaseEmail",
  "pocName",
  "pocNumber",
  "decisionMakerName",
  "decisionMakerNumber",
  "zonalManager",
] as const;

type ContactOverview = Record<(typeof REQUIRED_CONTACT_FIELDS)[number], string> &
  Record<(typeof OPTIONAL_CONTACT_FIELDS)[number], string | null>;

export function overviewFor<T extends ContactOverview>(holder: PermissionHolder, overview: T): T {
  if (seesContacts(holder)) return overview;
  const blanked: Record<string, unknown> = { ...overview };
  for (const field of REQUIRED_CONTACT_FIELDS) blanked[field] = "";
  for (const field of OPTIONAL_CONTACT_FIELDS) blanked[field] = null;
  return blanked as T;
}

export function searchRowFor<T extends { readonly hrContactName: string; readonly hrContactNumber: string }>(
  holder: PermissionHolder,
  row: T,
): T {
  if (seesContacts(holder)) return row;
  return { ...row, hrContactName: "", hrContactNumber: "" };
}

export function snapshotFor<T extends { readonly contacts?: unknown }>(holder: PermissionHolder, snapshot: T): T {
  if (seesContacts(holder)) return snapshot;
  const { contacts: _contacts, ...rest } = snapshot;
  return rest as T;
}
