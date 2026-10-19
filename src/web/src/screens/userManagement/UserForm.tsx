/**
 * Purpose: The SPEC-21 section 6 Add / Edit User form. It checks the fields with
 * @mou/domain's validateUserAccount - the same rules the API applies - plus a
 * client-only Confirm Password, and shows the API's field errors under their
 * fields. Zone access is an "All zones" switch or a checkbox list of zones (at
 * least one). On edit only changed fields are sent; a blank password is unchanged.
 */

import { USER_ROLES, USER_ROLE_LABELS, validateUserAccount } from "@mou/domain";
import type { UserAccountInput, UserRole } from "@mou/domain";
import { useState } from "react";
import type { FormEvent } from "react";

import { saveManagedUser } from "../../api/client.ts";
import type { ManagedUser, UserAccountDetails, ZoneOption } from "../../api/client.ts";
import { Field, SelectInput, TextInput } from "../../ui/form.tsx";
import { Button, Card, SectionTitle } from "../../ui/primitives.tsx";

type FieldName = "username" | "email" | "fullName" | "password" | "confirmPassword" | "role" | "allZones" | "zoneIds";

interface FormState {
  readonly username: string;
  readonly email: string;
  readonly fullName: string;
  readonly password: string;
  readonly confirmPassword: string;
  readonly role: string;
  readonly allZones: boolean;
  readonly zoneIds: readonly string[];
}

const ROLE_OPTIONS = USER_ROLES.map((role) => ({ value: role, label: USER_ROLE_LABELS[role] }));
const ALERT_CLASS = "rounded-lg px-4 py-3 text-sm font-medium bg-[#FEE2E2] text-[#B91C1C] border border-[#FECACA]";

function initialState(user: ManagedUser | null): FormState {
  return {
    username: user?.username ?? "",
    email: user?.email ?? "",
    fullName: user?.fullName ?? "",
    password: "",
    confirmPassword: "",
    role: user?.role ?? "VIEWER",
    allZones: user?.allZones ?? false,
    zoneIds: user?.zones.map((zone) => zone.id) ?? [],
  };
}

/** Create: everything. Edit: only what differs from the loaded user. */
function toInput(form: FormState, user: ManagedUser | null): UserAccountInput {
  if (user === null) {
    return { ...form, zoneIds: form.allZones ? [] : form.zoneIds };
  }
  const original = initialState(user);
  const zonesChanged = form.allZones !== original.allZones || [...form.zoneIds].sort().join() !== [...original.zoneIds].sort().join();
  return {
    ...(form.username !== original.username ? { username: form.username } : {}),
    ...(form.email !== original.email ? { email: form.email } : {}),
    ...(form.fullName !== original.fullName ? { fullName: form.fullName } : {}),
    ...(form.password !== "" ? { password: form.password } : {}),
    ...(form.role !== original.role ? { role: form.role } : {}),
    ...(zonesChanged ? { allZones: form.allZones, zoneIds: form.allZones ? [] : form.zoneIds } : {}),
  };
}

function FieldError({ message }: { readonly message: string | undefined }) {
  if (message === undefined) return null;
  return <p className="text-xs text-red-600">{message}</p>;
}

interface UserFormProps {
  /** null = Add User. */
  readonly user: ManagedUser | null;
  readonly zones: readonly ZoneOption[];
  /** The signed-in super admin's own row: role and zone access are locked (section 5.6). */
  readonly isSelf: boolean;
  readonly onSaved: (user: ManagedUser) => void;
  readonly onCancel: () => void;
}

export function UserForm({ user, zones, isSelf, onSaved, onCancel }: UserFormProps) {
  const [form, setForm] = useState<FormState>(() => initialState(user));
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }));
  const toggleZone = (zoneId: string) =>
    set("zoneIds", form.zoneIds.includes(zoneId) ? form.zoneIds.filter((id) => id !== zoneId) : [...form.zoneIds, zoneId]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const input = toInput(form, user);
    const checked = validateUserAccount(input, user === null ? "create" : "edit");
    const found: Partial<Record<FieldName, string>> = { ...checked.errors };
    if (form.password !== form.confirmPassword) {
      found.confirmPassword = "Passwords do not match";
    }
    setErrors(found);
    setMessage("");
    if (Object.keys(found).length > 0) return;
    if (user !== null && Object.keys(input).length === 0) {
      onCancel();
      return;
    }

    setSaving(true);
    saveManagedUser(user?.userId ?? null, input as UserAccountDetails)
      .then((result) => {
        if (result.ok) {
          onSaved(result.user);
          return;
        }
        setErrors(result.errors);
        setMessage(result.message);
      })
      .catch(() => setMessage("Could not save the user. Please try again."))
      .finally(() => setSaving(false));
  };

  return (
    <Card className="p-5">
      <SectionTitle>{user === null ? "Add User" : `Edit ${user.username}`}</SectionTitle>
      <form onSubmit={submit} noValidate className="space-y-4">
        {message !== "" && (
          <div role="alert" className={ALERT_CLASS}>
            {message}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Username" htmlFor="user-username" required>
            <TextInput id="user-username" value={form.username} onChange={(value) => set("username", value)} />
            <FieldError message={errors.username} />
          </Field>
          <Field label="Email" htmlFor="user-email" required>
            <TextInput id="user-email" type="email" value={form.email} onChange={(value) => set("email", value)} />
            <FieldError message={errors.email} />
          </Field>
          <Field label="Full Name" htmlFor="user-full-name">
            <TextInput id="user-full-name" value={form.fullName} onChange={(value) => set("fullName", value)} />
            <FieldError message={errors.fullName} />
          </Field>
          <Field label="Role" htmlFor="user-role" required>
            <SelectInput
              id="user-role"
              options={ROLE_OPTIONS}
              value={form.role}
              disabled={isSelf}
              onChange={(value) => set("role", value as UserRole)}
            />
            <FieldError message={errors.role} />
          </Field>
          <Field
            label="Password"
            htmlFor="user-password"
            required={user === null}
            hint={user === null ? undefined : "Leave blank to keep the current password"}
          >
            <TextInput id="user-password" type="password" value={form.password} onChange={(value) => set("password", value)} />
            <FieldError message={errors.password} />
          </Field>
          <Field label="Confirm Password" htmlFor="user-confirm-password" required={user === null}>
            <TextInput
              id="user-confirm-password"
              type="password"
              value={form.confirmPassword}
              onChange={(value) => set("confirmPassword", value)}
            />
            <FieldError message={errors.confirmPassword} />
          </Field>
        </div>

        <fieldset className="space-y-2" disabled={isSelf}>
          <legend className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Zone Access<span className="text-red-500 ml-0.5">*</span>
          </legend>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.allZones} onChange={(event) => set("allZones", event.target.checked)} />
            All zones
          </label>
          {!form.allZones && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-h-56 overflow-y-auto border border-border rounded-lg p-3">
              {zones.map((zone) => (
                <label key={zone.id} className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={form.zoneIds.includes(zone.id)} onChange={() => toggleZone(zone.id)} />
                  {zone.name}
                </label>
              ))}
            </div>
          )}
          <FieldError message={errors.zoneIds ?? errors.allZones} />
          {isSelf && <p className="text-xs text-muted-foreground">You cannot change your own role or zone access.</p>}
        </fieldset>

        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : user === null ? "Create User" : "Save Changes"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
