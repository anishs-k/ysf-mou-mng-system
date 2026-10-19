/**
 * Purpose: The data side of SPEC-21 admin provisioning - list, create, edit and
 * soft-delete users and their user_zone rows. Every write runs in one transaction
 * that first locks the active super-admin rows (ordered by id, so two writers
 * never deadlock), re-checks that the actor is still a super admin, and refuses a
 * change that would remove the actor's own super-admin access or leave none at
 * all (D133). Callers validate fields (@mou/domain) and hash passwords first.
 */

import type { UserRole } from "@mou/domain";
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from "./client.ts";
import { session, user, userZone, zone } from "./schema.ts";

export interface ManagedUser {
  readonly userId: string;
  readonly username: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly role: string;
  readonly allZones: boolean;
  readonly zones: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly createdAt: Date;
}

export interface NewManagedUser {
  readonly username: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly passwordHash: string;
  readonly role: UserRole;
  readonly allZones: boolean;
  readonly zoneIds: readonly string[];
}

export interface ManagedUserChanges {
  readonly username?: string;
  readonly email?: string;
  readonly fullName?: string | null;
  readonly passwordHash?: string;
  readonly role?: UserRole;
  readonly allZones?: boolean;
  readonly zoneIds?: readonly string[];
}

/** Why a write was refused; the route maps each to its HTTP answer. */
export type WriteRefusal = "not-found" | "not-super-admin" | "own-access" | "last-super-admin" | "no-zones" | "zones-with-all";

export type WriteResult = { readonly ok: true } | { readonly ok: false; readonly reason: WriteRefusal };

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** D132: `#` is not a legal username character, so a renamed value never clashes. */
const DELETED_MARKER = "#deleted-";
const MAX_IDENTIFIER = 255;
const ID_PREFIX_LENGTH = 8;

const activeSuperAdmin = and(eq(user.role, "ADMIN"), eq(user.allZones, true), eq(user.isActive, true));

async function zonesOf(db: Database | Transaction, userIds: readonly string[]): Promise<Map<string, Array<{ id: string; name: string }>>> {
  const byUser = new Map<string, Array<{ id: string; name: string }>>();
  if (userIds.length === 0) {
    return byUser;
  }
  const rows = await db
    .select({ userId: userZone.userId, id: zone.id, name: zone.name })
    .from(userZone)
    .innerJoin(zone, eq(zone.id, userZone.zoneId))
    .where(inArray(userZone.userId, [...userIds]))
    .orderBy(asc(zone.name));
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({ id: row.id, name: row.name });
    byUser.set(row.userId, list);
  }
  return byUser;
}

const MANAGED_COLUMNS = {
  userId: user.id,
  username: user.username,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  allZones: user.allZones,
  createdAt: user.createdAt,
};

/** Section 5.2: active users only, by username; an all-zone user's zones are []. */
export async function listManagedUsers(db: Database, onlyUserId?: string): Promise<ManagedUser[]> {
  const rows = await db
    .select(MANAGED_COLUMNS)
    .from(user)
    .where(and(eq(user.isActive, true), onlyUserId === undefined ? undefined : eq(user.id, onlyUserId)))
    .orderBy(asc(user.username));
  const zones = await zonesOf(db, rows.filter((row) => !row.allZones).map((row) => row.userId));
  return rows.map((row) => ({ ...row, zones: row.allZones ? [] : (zones.get(row.userId) ?? []) }));
}

export async function findManagedUser(db: Database, userId: string): Promise<ManagedUser | null> {
  return (await listManagedUsers(db, userId))[0] ?? null;
}

/** True only when every id names an active zone. */
export async function allZonesActive(db: Database, zoneIds: readonly string[]): Promise<boolean> {
  if (zoneIds.length === 0) {
    return true;
  }
  const rows = await db
    .select({ id: zone.id })
    .from(zone)
    .where(and(inArray(zone.id, [...zoneIds]), eq(zone.isActive, true)));
  return rows.length === zoneIds.length;
}

/** Which of the identifiers another user already holds, case-insensitively. */
export async function takenIdentifiers(
  db: Database,
  wanted: { readonly username?: string; readonly email?: string },
  exceptUserId?: string,
): Promise<{ username: boolean; email: boolean }> {
  const check = async (column: typeof user.username | typeof user.email, value: string | undefined): Promise<boolean> => {
    if (value === undefined) {
      return false;
    }
    const rows = await db
      .select({ id: user.id })
      .from(user)
      .where(and(sql`lower(${column}) = ${value}`, exceptUserId === undefined ? undefined : sql`${user.id} <> ${exceptUserId}`))
      .limit(1);
    return rows.length > 0;
  };
  return { username: await check(user.username, wanted.username), email: await check(user.email, wanted.email) };
}

async function replaceZones(tx: Transaction, userId: string, zoneIds: readonly string[]): Promise<void> {
  await tx.delete(userZone).where(eq(userZone.userId, userId));
  if (zoneIds.length > 0) {
    await tx.insert(userZone).values(zoneIds.map((zoneId) => ({ userId, zoneId })));
  }
}

export async function createManagedUser(db: Database, values: NewManagedUser): Promise<string> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(user)
      .values({
        username: values.username,
        email: values.email,
        fullName: values.fullName,
        passwordHash: values.passwordHash,
        role: values.role,
        allZones: values.allZones,
      })
      .returning({ id: user.id });
    if (created === undefined) {
      throw new Error("Creating a user returned no row");
    }
    await replaceZones(tx, created.id, values.allZones ? [] : values.zoneIds);
    return created.id;
  });
}

interface LockedTarget {
  readonly tx: Transaction;
  readonly target: { readonly id: string; readonly allZones: boolean };
  readonly isSuperAdmin: boolean;
}

/**
 * D133 in one place: lock the super admins, then the target. `losesSuperAdmin`
 * says whether the requested change takes super-admin access from the target.
 */
async function guardedWrite(
  db: Database,
  actorId: string,
  targetId: string,
  losesSuperAdmin: (targetIsSuperAdmin: boolean) => boolean,
  write: (locked: LockedTarget) => Promise<WriteResult>,
): Promise<WriteResult> {
  return db.transaction(async (tx) => {
    const supers = await tx.select({ id: user.id }).from(user).where(activeSuperAdmin).orderBy(asc(user.id)).for("update");
    const superIds = supers.map((row) => row.id);
    if (!superIds.includes(actorId)) {
      return { ok: false, reason: "not-super-admin" };
    }
    const [target] = await tx
      .select({ id: user.id, allZones: user.allZones })
      .from(user)
      .where(and(eq(user.id, targetId), eq(user.isActive, true)))
      .for("update");
    if (target === undefined) {
      return { ok: false, reason: "not-found" };
    }
    const isSuperAdmin = superIds.includes(targetId);
    if (losesSuperAdmin(isSuperAdmin)) {
      if (targetId === actorId) {
        return { ok: false, reason: "own-access" };
      }
      if (superIds.length <= 1) {
        return { ok: false, reason: "last-super-admin" };
      }
    }
    return write({ tx, target, isSuperAdmin });
  });
}

/** Section 5.4. A password change ends that user's sessions (D135). */
export async function updateManagedUser(
  db: Database,
  actorId: string,
  targetId: string,
  changes: ManagedUserChanges,
): Promise<WriteResult> {
  const demotes = (changes.role !== undefined && changes.role !== "ADMIN") || changes.allZones === false;
  return guardedWrite(db, actorId, targetId, (isSuper) => isSuper && demotes, async ({ tx, target }) => {
    const allZones = changes.allZones ?? target.allZones;
    if (allZones && changes.zoneIds !== undefined && changes.zoneIds.length > 0) {
      return { ok: false, reason: "zones-with-all" };
    }
    if (!allZones) {
      const zoneIds = changes.zoneIds ?? (await tx.select({ id: userZone.zoneId }).from(userZone).where(eq(userZone.userId, targetId))).map((row) => row.id);
      if (zoneIds.length === 0) {
        return { ok: false, reason: "no-zones" };
      }
      if (changes.zoneIds !== undefined) {
        await replaceZones(tx, targetId, zoneIds);
      }
    } else if (changes.allZones === true) {
      await replaceZones(tx, targetId, []);
    }

    const columns = {
      ...(changes.username === undefined ? {} : { username: changes.username }),
      ...(changes.email === undefined ? {} : { email: changes.email }),
      ...(changes.fullName === undefined ? {} : { fullName: changes.fullName }),
      ...(changes.passwordHash === undefined ? {} : { passwordHash: changes.passwordHash }),
      ...(changes.role === undefined ? {} : { role: changes.role }),
      ...(changes.allZones === undefined ? {} : { allZones: changes.allZones }),
    };
    if (Object.keys(columns).length > 0) {
      await tx.update(user).set(columns).where(eq(user.id, targetId));
    }
    if (changes.passwordHash !== undefined) {
      await tx.delete(session).where(eq(session.userId, targetId));
    }
    return { ok: true };
  });
}

/** Section 5.5 / D132: deactivate, free both identifiers, end every session. */
export async function deleteManagedUser(db: Database, actorId: string, targetId: string): Promise<WriteResult> {
  return guardedWrite(db, actorId, targetId, (isSuper) => isSuper, async ({ tx }) => {
    const suffix = sql`${DELETED_MARKER} || left(${user.id}::text, ${ID_PREFIX_LENGTH})`;
    const keep = MAX_IDENTIFIER - DELETED_MARKER.length - ID_PREFIX_LENGTH;
    await tx
      .update(user)
      .set({
        isActive: false,
        username: sql`left(${user.username}, ${keep}) || ${suffix}`,
        email: sql`left(${user.email}, ${keep}) || ${suffix}`,
      })
      .where(eq(user.id, targetId));
    await tx.delete(session).where(eq(session.userId, targetId));
    return { ok: true };
  });
}
