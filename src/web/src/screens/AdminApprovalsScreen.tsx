/**
 * Purpose: SPEC-20's super-admin queue of self sign-ups at /admin/approvals. Lists
 * GET /api/admin/users/pending and decides each row through POST
 * /api/admin/users/:userId/decision - Approve with a chosen role (DATA_ENTRY or
 * VIEWER, never ADMIN) or Reject, which asks for a second click so one stray click
 * cannot turn a person away. A decided row leaves the list. AppShell already keeps
 * everyone but a super admin out (ui/access.ts); the API enforces the same rule.
 */

import { APPROVABLE_ROLES, USER_ROLE_LABELS } from "@mou/domain";
import { useEffect, useState } from "react";

import { decideUser, fetchPendingUsers } from "../api/client.ts";
import type { ApprovalDecision, PendingUser } from "../api/client.ts";
import { PENDING_FIGURE, formatTimestamp } from "../ui/format.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Button, Card, SectionTitle } from "../ui/primitives.tsx";

type ApprovableRole = (typeof APPROVABLE_ROLES)[number];

const ALERT_CLASS = "rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]";
const SUCCESS_CLASS = "rounded-lg px-4 py-3 text-sm font-medium bg-green-50 text-green-800 border border-green-200";
const SELECT_CLASS =
  "h-9 px-2.5 border border-border rounded-lg text-xs bg-white text-foreground focus:outline-none focus:ring-2 focus:ring-ring";
const HEADINGS = ["Name", "Email", "Zone", "Requested On", "Role", "Action"] as const;

export function AdminApprovalsScreen() {
  const [pending, setPending] = useState<readonly PendingUser[] | null>(null);
  const [roles, setRoles] = useState<Readonly<Record<string, ApprovableRole>>>({});
  const [confirmingReject, setConfirmingReject] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPendingUsers()
      .then((rows) => {
        if (!cancelled) setPending(rows);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the pending sign-ups. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const decide = (person: PendingUser, decision: ApprovalDecision) => {
    setBusy(person.userId);
    setError("");
    setNotice("");
    decideUser(person.userId, decision)
      .then(() => {
        setPending((rows) => (rows ?? []).filter((row) => row.userId !== person.userId));
        setNotice(
          decision.decision === "APPROVE"
            ? `${person.email} approved as ${USER_ROLE_LABELS[decision.role]}.`
            : `${person.email} rejected.`,
        );
      })
      .catch((decideError: unknown) => {
        setError(decideError instanceof Error ? decideError.message : "Could not save the decision.");
      })
      .finally(() => {
        setBusy(null);
        setConfirmingReject(null);
      });
  };

  return (
    <ScreenFrame title="User Approvals" subtitle="Approve or reject self sign-up requests" contentClassName="p-4 md:p-6 max-w-5xl mx-auto w-full space-y-4">
      {error !== "" && (
        <div role="alert" className={ALERT_CLASS}>
          {error}
        </div>
      )}
      {notice !== "" && (
        <div role="status" className={SUCCESS_CLASS}>
          {notice}
        </div>
      )}

      <Card className="p-5">
        <SectionTitle>Pending Requests{pending !== null && ` (${pending.length})`}</SectionTitle>
        {pending === null ? (
          <p className="text-sm text-muted-foreground text-center py-8">{error === "" ? "Loading…" : PENDING_FIGURE}</p>
        ) : pending.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No sign-up requests are waiting for approval.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {HEADINGS.map((heading) => (
                    <th key={heading} className="text-left text-xs font-bold uppercase tracking-wider text-muted-foreground py-2 pr-4">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pending.map((person) => {
                  const role = roles[person.userId] ?? "VIEWER";
                  const rowBusy = busy === person.userId;
                  return (
                    <tr key={person.userId} data-testid="pending-row" className="border-b border-border last:border-0">
                      <td className="py-3 pr-4 font-semibold text-foreground">{person.fullName ?? PENDING_FIGURE}</td>
                      <td className="py-3 pr-4 text-foreground">{person.email}</td>
                      <td className="py-3 pr-4 text-foreground">{person.zoneName ?? PENDING_FIGURE}</td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{formatTimestamp(person.requestedAt)}</td>
                      <td className="py-3 pr-4">
                        <select
                          aria-label={`Role for ${person.email}`}
                          value={role}
                          disabled={rowBusy}
                          onChange={(event) => setRoles((current) => ({ ...current, [person.userId]: event.target.value as ApprovableRole }))}
                          className={SELECT_CLASS}
                        >
                          {APPROVABLE_ROLES.map((option) => (
                            <option key={option} value={option}>
                              {USER_ROLE_LABELS[option]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2 whitespace-nowrap">
                          <Button size="sm" disabled={rowBusy} onClick={() => decide(person, { decision: "APPROVE", role })}>
                            <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.5} />
                            Approve
                          </Button>
                          {confirmingReject === person.userId ? (
                            <>
                              <Button size="sm" variant="accent" disabled={rowBusy} onClick={() => decide(person, { decision: "REJECT" })}>
                                Confirm reject
                              </Button>
                              <Button size="sm" variant="ghost" disabled={rowBusy} onClick={() => setConfirmingReject(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline" disabled={rowBusy} onClick={() => setConfirmingReject(person.userId)}>
                              Reject
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </ScreenFrame>
  );
}
