/**
 * Purpose: The three accounts the UI tests sign in as - one per role in SPEC-02
 * section 3.3 - and the password they share. global-setup.ts creates them in the
 * database with a real scrypt hash, so the tests drive the genuine login flow rather
 * than bypassing it. The usernames are prefixed so they are obviously fixtures and
 * never collide with a real user.
 */

import type { UserRole } from "@mou/domain";

export const E2E_PASSWORD = process.env["E2E_PASSWORD"] ?? "e2e-password";

export interface E2eAccount {
  readonly username: string;
  readonly role: UserRole;
}

export const E2E_ACCOUNTS: readonly E2eAccount[] = [
  { username: "e2e-admin", role: "ADMIN" },
  { username: "e2e-data-entry", role: "DATA_ENTRY" },
  { username: "e2e-viewer", role: "VIEWER" },
];

export function accountFor(role: UserRole): E2eAccount {
  const account = E2E_ACCOUNTS.find((candidate) => candidate.role === role);
  if (account === undefined) {
    throw new Error(`No e2e account is defined for role ${role}`);
  }
  return account;
}
