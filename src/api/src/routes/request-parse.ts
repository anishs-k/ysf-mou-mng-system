/**
 * Purpose: The request-parsing primitives every route module had previously
 * copy-pasted on its own - a UUID-shape check (10 separate declarations
 * across the router files), and the defensive JSON-body readers
 * (`asRecord`/`asArray`/`readJsonField`) that turn an untrusted request body
 * into a safely-typed value without throwing. Consolidated here so a future
 * change (e.g. accepting UUID v7) is one edit, not ten.
 *
 * Deliberately excludes `firstRow()`: that helper exists in two genuinely
 * different shapes across the codebase (one throws on an empty result, one
 * returns `T | undefined`), and unifying them would change a caller's
 * postcondition rather than remove duplication.
 */

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Narrows an unknown value to a plain record, or {} for anything else. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** Narrows an unknown value to an array, or [] for anything else. */
export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Reads one named field off a request body that may not even be an object. */
export function readJsonField<T>(body: unknown, field: string): T | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  return (body as Record<string, unknown>)[field] as T | undefined;
}
