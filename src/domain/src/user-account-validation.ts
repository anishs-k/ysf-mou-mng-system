/**
 * Purpose: The SPEC-21 section 5.1 field rules for a user account, held in layer 0
 * so the User Management form and the /api/admin/users routes enforce them
 * identically. "create" requires every field except the full name; "edit" checks
 * only the fields present, and an empty password there means "unchanged". Pure:
 * whether a zone exists and is active, and uniqueness, are the API's to check.
 */

import { USER_ROLES } from "./enums.ts";
import type { UserRole } from "./enums.ts";

const USERNAME_PATTERN = /^[a-z0-9._@-]{3,255}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_EMAIL = 255;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const MIN_NAME = 2;
const MAX_NAME = 150;

export type UserAccountMode = "create" | "edit";

/** Raw input: every field optional, because an edit sends only what changed. */
export interface UserAccountInput {
  readonly username?: string;
  readonly email?: string;
  readonly fullName?: string | null;
  readonly password?: string;
  readonly role?: string;
  readonly allZones?: boolean;
  readonly zoneIds?: readonly string[];
}

/** Normalised values; on edit only the fields that were sent are present. */
export interface UserAccountValues {
  readonly username?: string;
  readonly email?: string;
  readonly fullName?: string | null;
  readonly password?: string;
  readonly role?: UserRole;
  readonly allZones?: boolean;
  readonly zoneIds?: readonly string[];
}

export type UserAccountErrors = Partial<Record<keyof UserAccountInput, string>>;

export interface UserAccountResult {
  readonly value?: UserAccountValues;
  readonly errors: UserAccountErrors;
}

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

function zoneIdsError(allZones: boolean | undefined, zoneIds: readonly string[] | undefined, mode: UserAccountMode): string | undefined {
  if (zoneIds !== undefined && zoneIds.some((id) => !UUID_PATTERN.test(id))) {
    return "Choose zones from the list";
  }
  if (zoneIds !== undefined && new Set(zoneIds).size !== zoneIds.length) {
    return "Choose each zone once";
  }
  if (allZones === true && zoneIds !== undefined && zoneIds.length > 0) {
    return "All zones cannot be combined with specific zones";
  }
  // On edit, allZones: false without zoneIds keeps the user's current zones -
  // only the API knows whether they have any.
  const zonal = allZones === false || (allZones === undefined && mode === "edit");
  const mustList = mode === "create" ? allZones === false : zoneIds !== undefined;
  if (zonal && mustList && (zoneIds === undefined || zoneIds.length === 0)) {
    return "Choose at least one zone";
  }
  return undefined;
}

export function validateUserAccount(input: UserAccountInput, mode: UserAccountMode): UserAccountResult {
  const creating = mode === "create";
  const errors: UserAccountErrors = {};
  const value: {
    -readonly [K in keyof UserAccountValues]: UserAccountValues[K];
  } = {};

  if (input.username !== undefined || creating) {
    const username = (input.username ?? "").trim().toLowerCase();
    if (USERNAME_PATTERN.test(username)) {
      value.username = username;
    } else {
      errors.username = "Use 3 to 255 characters: letters, digits, . _ - @";
    }
  }

  if (input.email !== undefined || creating) {
    const email = (input.email ?? "").trim().toLowerCase();
    if (EMAIL_PATTERN.test(email) && email.length <= MAX_EMAIL) {
      value.email = email;
    } else {
      errors.email = "Enter a valid email address";
    }
  }

  if (input.fullName !== undefined || creating) {
    const fullName = (input.fullName ?? "").trim();
    if (fullName === "") {
      value.fullName = null;
    } else if (fullName.length >= MIN_NAME && fullName.length <= MAX_NAME) {
      value.fullName = fullName;
    } else {
      errors.fullName = `Enter between ${MIN_NAME} and ${MAX_NAME} characters`;
    }
  }

  const password = input.password ?? "";
  if (password !== "" || creating) {
    if (password.length >= MIN_PASSWORD && password.length <= MAX_PASSWORD) {
      value.password = password;
    } else {
      errors.password = `Use ${MIN_PASSWORD} to ${MAX_PASSWORD} characters`;
    }
  }

  if (input.role !== undefined || creating) {
    const role = input.role ?? "";
    if (isUserRole(role)) {
      value.role = role;
    } else {
      errors.role = "Choose a role";
    }
  }

  if (input.allZones !== undefined) {
    value.allZones = input.allZones;
  } else if (creating) {
    errors.allZones = "Choose zone access";
  }

  const zoneError = zoneIdsError(input.allZones, input.zoneIds, mode);
  if (zoneError !== undefined) {
    errors.zoneIds = zoneError;
  } else if (input.zoneIds !== undefined) {
    value.zoneIds = [...input.zoneIds];
  } else if (creating && input.allZones === true) {
    value.zoneIds = [];
  }

  return Object.keys(errors).length > 0 ? { errors } : { value, errors };
}
