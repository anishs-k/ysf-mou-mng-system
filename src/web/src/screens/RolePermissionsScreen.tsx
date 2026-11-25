/**
 * Purpose: SPEC-33's Roles & Permissions screen at /admin/permissions, reached from
 * User Management in the sidebar (a super admin only). A grid of sections x roles
 * with a View and a Change tick each; ticking Change ticks View, unticking View
 * unticks Change. Admin's column is shown locked. Save asks for confirmation,
 * listing every change, then PUTs the changed roles; the API applies them at once.
 */

import { PERMISSION_SECTIONS, USER_ROLE_LABELS } from "@mou/domain";
import type { Permission, PermissionSection, UserRole } from "@mou/domain";
import { useEffect, useState } from "react";

import { fetchPermissionMatrix, savePermissionMatrix } from "../api/client.ts";
import type { PermissionMatrix, RoleGrant } from "../api/client.ts";
import { Icon } from "../ui/Icon.tsx";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { Button, Card, SectionTitle } from "../ui/primitives.tsx";

const ALERT_CLASS = "rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]";
const SUCCESS_CLASS = "rounded-lg px-4 py-3 text-sm font-medium bg-green-50 text-green-800 border border-green-200";

type Draft = Readonly<Record<string, readonly Permission[]>>;

function draftOf(matrix: PermissionMatrix): Draft {
  return Object.fromEntries(matrix.roles.map((grant) => [grant.role, grant.permissions]));
}

function roleLabel(role: string): string {
  return USER_ROLE_LABELS[role as UserRole] ?? role;
}

function permissionLabel(permission: Permission): string {
  const section = PERMISSION_SECTIONS.find((candidate) => candidate.view === permission || candidate.change === permission);
  if (section === undefined) return permission;
  return section.view === permission ? `${section.label} (view)` : section.view === undefined ? section.label : `${section.label} (change)`;
}

/** Ticking Change brings View; unticking View drops Change - the same rule the API applies. */
function toggle(grants: readonly Permission[], section: PermissionSection, kind: "view" | "change"): Permission[] {
  const next = new Set(grants);
  const target = section[kind];
  if (target === undefined) return [...grants];
  if (next.has(target)) {
    next.delete(target);
    if (kind === "view" && section.change !== undefined) next.delete(section.change);
  } else {
    next.add(target);
    if (kind === "change" && section.view !== undefined) next.add(section.view);
  }
  return [...next];
}

interface Change {
  readonly role: string;
  readonly added: readonly Permission[];
  readonly removed: readonly Permission[];
}

function changesBetween(saved: PermissionMatrix, draft: Draft): Change[] {
  return saved.roles
    .map((grant) => {
      const now = draft[grant.role] ?? [];
      return {
        role: grant.role,
        added: now.filter((permission) => !grant.permissions.includes(permission)),
        removed: grant.permissions.filter((permission) => !now.includes(permission)),
      };
    })
    .filter((change) => change.added.length > 0 || change.removed.length > 0);
}

function Tick({ checked, locked, label, onChange }: { checked: boolean; locked: boolean; label: string; onChange?: () => void }) {
  return (
    <label className={`inline-flex items-center gap-1 text-xs ${locked ? "text-muted-foreground" : "cursor-pointer text-foreground"}`}>
      <input type="checkbox" checked={checked} disabled={locked} onChange={onChange} aria-label={label} className="w-4 h-4 accent-[#1B5FAE]" />
      {label.endsWith("View") ? "View" : "Change"}
    </label>
  );
}

export function RolePermissionsScreen() {
  const [saved, setSaved] = useState<PermissionMatrix | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchPermissionMatrix()
      .then((matrix) => {
        if (cancelled) return;
        setSaved(matrix);
        setDraft(draftOf(matrix));
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the permissions. Please try again.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changes = saved === null ? [] : changesBetween(saved, draft);

  const flip = (role: string, section: PermissionSection, kind: "view" | "change") => {
    setNotice("");
    setConfirming(false);
    setDraft((current) => ({ ...current, [role]: toggle(current[role] ?? [], section, kind) }));
  };

  const save = () => {
    const roles: RoleGrant[] = changes.map((change) => ({ role: change.role, permissions: draft[change.role] ?? [] }));
    setBusy(true);
    setError("");
    savePermissionMatrix(roles)
      .then((matrix) => {
        setSaved(matrix);
        setDraft(draftOf(matrix));
        setNotice("Permissions saved. They apply to every user straight away.");
      })
      .catch((saveError: unknown) => setError(saveError instanceof Error ? saveError.message : "Could not save the permissions."))
      .finally(() => {
        setBusy(false);
        setConfirming(false);
      });
  };

  const columns = saved === null ? [] : [saved.locked, ...saved.roles];

  return (
    <ScreenFrame
      title="Roles & Permissions"
      subtitle="Choose what each role may see and change"
      contentClassName="p-4 md:p-6 max-w-6xl mx-auto w-full space-y-4"
    >
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
        <div className="flex items-center justify-between gap-4 mb-4">
          <SectionTitle>Permission Matrix</SectionTitle>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={changes.length === 0 || busy}
              onClick={() => {
                if (saved !== null) setDraft(draftOf(saved));
                setConfirming(false);
              }}
            >
              Discard
            </Button>
            <Button size="sm" disabled={changes.length === 0 || busy} onClick={() => setConfirming(true)}>
              <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.5} />
              Save{changes.length > 0 && ` (${changes.length})`}
            </Button>
          </div>
        </div>

        {confirming && (
          <div className="mb-4 rounded-lg border border-[#F5C26B] bg-[#FFF8EB] p-4 text-sm">
            <p className="font-semibold mb-2">These changes apply to every user of the role at once:</p>
            <ul className="space-y-1 mb-3">
              {changes.map((change) => (
                <li key={change.role}>
                  <span className="font-semibold">{roleLabel(change.role)}:</span>{" "}
                  {change.added.length > 0 && <span className="text-green-700">+ {change.added.map(permissionLabel).join(", ")}</span>}
                  {change.added.length > 0 && change.removed.length > 0 && " · "}
                  {change.removed.length > 0 && <span className="text-[#B91C1C]">− {change.removed.map(permissionLabel).join(", ")}</span>}
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={busy}>
                {busy ? "Saving…" : "Confirm save"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {saved === null ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{error === "" ? "Loading…" : ""}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-4 font-semibold text-muted-foreground">Section</th>
                  {columns.map((grant) => (
                    <th key={grant.role} className="py-2 px-3 font-semibold text-muted-foreground whitespace-nowrap">
                      {roleLabel(grant.role)}
                      {grant.role === saved.locked.role && (
                        <span className="ml-1 inline-flex align-middle" title="Admin always has every permission">
                          <Icon name="lock" className="w-3.5 h-3.5" />
                        </span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERMISSION_SECTIONS.map((section) => (
                  <tr key={section.label} className="border-b border-border last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-foreground whitespace-nowrap">{section.label}</td>
                    {columns.map((grant) => {
                      const locked = grant.role === saved.locked.role;
                      const grants = locked ? grant.permissions : (draft[grant.role] ?? []);
                      return (
                        <td key={grant.role} className="py-2.5 px-3">
                          <div className="flex gap-3">
                            {(["view", "change"] as const).map((kind) => {
                              const permission = section[kind];
                              if (permission === undefined) return null;
                              return (
                                <Tick
                                  key={kind}
                                  checked={grants.includes(permission)}
                                  locked={locked || busy}
                                  label={`${roleLabel(grant.role)} ${section.label} ${kind === "view" ? "View" : "Change"}`}
                                  onChange={locked ? undefined : () => flip(grant.role, section, kind)}
                                />
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-3">
              Admin is locked so nobody can be shut out. User Management stays with the super admin only.
            </p>
          </div>
        )}
      </Card>
    </ScreenFrame>
  );
}
