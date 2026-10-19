/**
 * Purpose: SPEC-21's super-admin User Management screen at /admin/users, which
 * replaces SPEC-20's approval queue. Lists GET /api/admin/users, opens
 * userManagement/UserForm.tsx to add or edit a user, and deletes through DELETE
 * /api/admin/users/:userId after a second "Confirm delete" click. The signed-in
 * admin's own row cannot be deleted. AppShell keeps everyone but a super admin
 * out (ui/access.ts); the API enforces the same rule.
 */

import { USER_ROLE_LABELS } from "@mou/domain";
import { useEffect, useState } from "react";

import { deleteManagedUser, fetchManagedUsers, fetchZones } from "../api/client.ts";
import type { ManagedUser, ZoneOption } from "../api/client.ts";
import { PENDING_FIGURE, formatTimestamp } from "../ui/format.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Button, Card, SectionTitle } from "../ui/primitives.tsx";
import { useSession } from "../ui/session.ts";
import { UserForm } from "./userManagement/UserForm.tsx";

const ALERT_CLASS = "rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]";
const SUCCESS_CLASS = "rounded-lg px-4 py-3 text-sm font-medium bg-green-50 text-green-800 border border-green-200";
const HEADINGS = ["Username", "Full Name", "Email", "Role", "Zones", "Created", "Action"] as const;

/** null = closed, "new" = Add User, otherwise the user being edited. */
type Editing = null | "new" | ManagedUser;

function zonesLabel(user: ManagedUser): string {
  return user.allZones ? "All zones" : user.zones.map((zone) => zone.name).join(", ") || PENDING_FIGURE;
}

export function UserManagementScreen() {
  const { user: me } = useSession();
  const [users, setUsers] = useState<readonly ManagedUser[] | null>(null);
  const [zones, setZones] = useState<readonly ZoneOption[]>([]);
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchManagedUsers(), fetchZones()])
      .then(([rows, zoneRows]) => {
        if (cancelled) return;
        setUsers(rows);
        setZones(zoneRows);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the users. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saved = (savedUser: ManagedUser) => {
    const isNew = editing === "new";
    setUsers((rows) => {
      const others = (rows ?? []).filter((row) => row.userId !== savedUser.userId);
      return [...others, savedUser].sort((a, b) => a.username.localeCompare(b.username));
    });
    setEditing(null);
    setError("");
    setNotice(isNew ? `${savedUser.username} created.` : `${savedUser.username} updated.`);
  };

  const remove = (target: ManagedUser) => {
    setBusy(target.userId);
    setError("");
    setNotice("");
    deleteManagedUser(target.userId)
      .then(() => {
        setUsers((rows) => (rows ?? []).filter((row) => row.userId !== target.userId));
        setNotice(`${target.username} deleted.`);
      })
      .catch((deleteError: unknown) => {
        setError(deleteError instanceof Error ? deleteError.message : "Could not delete the user.");
      })
      .finally(() => {
        setBusy(null);
        setConfirmingDelete(null);
      });
  };

  return (
    <ScreenFrame title="User Management" subtitle="Create, edit and remove user accounts" contentClassName="p-4 md:p-6 max-w-6xl mx-auto w-full space-y-4">
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

      {editing !== null && (
        <UserForm
          key={editing === "new" ? "new" : editing.userId}
          user={editing === "new" ? null : editing}
          zones={zones}
          isSelf={editing !== "new" && editing.userId === me?.userId}
          onSaved={saved}
          onCancel={() => setEditing(null)}
        />
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between gap-4">
          <SectionTitle>Users{users !== null && ` (${users.length})`}</SectionTitle>
          <Button size="sm" onClick={() => setEditing("new")} disabled={users === null}>
            <Icon name="plus" className="w-3.5 h-3.5" strokeWidth={2.5} />
            Add User
          </Button>
        </div>
        {users === null ? (
          <p className="text-sm text-muted-foreground text-center py-8">{error === "" ? "Loading…" : PENDING_FIGURE}</p>
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
                {users.map((row) => {
                  const rowBusy = busy === row.userId;
                  const isSelf = row.userId === me?.userId;
                  return (
                    <tr key={row.userId} data-testid="user-row" className="border-b border-border last:border-0">
                      <td className="py-3 pr-4 font-semibold text-foreground">{row.username}</td>
                      <td className="py-3 pr-4 text-foreground">{row.fullName ?? PENDING_FIGURE}</td>
                      <td className="py-3 pr-4 text-foreground">{row.email}</td>
                      <td className="py-3 pr-4 text-foreground">{USER_ROLE_LABELS[row.role]}</td>
                      <td className="py-3 pr-4 text-foreground">{zonesLabel(row)}</td>
                      <td className="py-3 pr-4 text-muted-foreground whitespace-nowrap">{formatTimestamp(row.createdAt)}</td>
                      <td className="py-3">
                        <div className="flex gap-2 whitespace-nowrap">
                          <Button size="sm" variant="outline" disabled={rowBusy} onClick={() => setEditing(row)}>
                            <Icon name="edit" className="w-3.5 h-3.5" />
                            Edit
                          </Button>
                          {confirmingDelete === row.userId ? (
                            <>
                              <Button size="sm" variant="accent" disabled={rowBusy} onClick={() => remove(row)}>
                                Confirm delete
                              </Button>
                              <Button size="sm" variant="ghost" disabled={rowBusy} onClick={() => setConfirmingDelete(null)}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="ghost" disabled={rowBusy || isSelf} onClick={() => setConfirmingDelete(row.userId)}>
                              Delete
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
