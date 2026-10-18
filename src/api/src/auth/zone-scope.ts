/**
 * Purpose: SPEC-19's zone isolation in one place. A signed-in user is either
 * all-zone (user.zone_id NULL) or zonal; zoneScopeOf reads that off the session,
 * recordInScope answers whether a record's company sits inside the scope with
 * one indexed lookup per record kind, and requireInScope turns that check into
 * route middleware that answers an out-of-zone id with the route's own
 * not-found response (D119), so another zone's ids look like ids that do not exist.
 */

import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Pool } from "pg";

import { requireAuth } from "./middleware.ts";

/** The zone a user's data is restricted to; null means every zone (D117). */
export type ZoneScope = string | null;

export const OUT_OF_ZONE_MESSAGE = "You can only add companies in your own zone";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only valid on a route behind requireSession(). */
export function zoneScopeOf(request: Request): ZoneScope {
  return requireAuth(request).zoneId;
}

export function zoneAllowed(scope: ZoneScope, zoneId: string): boolean {
  return scope === null || scope === zoneId;
}

/** Each query returns the zone of the record's owning company. */
const ZONE_OF_RECORD = {
  company: `SELECT c.zone_id FROM company c WHERE c.id = $1`,
  mou: `SELECT c.zone_id FROM mou m JOIN company c ON c.id = m.company_id WHERE m.id = $1`,
  document: `SELECT c.zone_id FROM mou_document d
               JOIN mou m ON m.id = d.mou_id
               JOIN company c ON c.id = m.company_id
              WHERE d.id = $1`,
  alert: `SELECT c.zone_id FROM mou_alert a
            JOIN mou m ON m.id = a.mou_id
            JOIN company c ON c.id = m.company_id
           WHERE a.id = $1`,
} as const;

export type ScopedRecord = keyof typeof ZONE_OF_RECORD;

/**
 * False only when the record exists and belongs to another zone. A record that
 * does not exist is "in scope" here on purpose: the route's own not-found path
 * then answers it, which is what keeps the two cases identical.
 */
export async function recordInScope(pool: Pool, scope: ZoneScope, kind: ScopedRecord, id: string): Promise<boolean> {
  if (scope === null) {
    return true;
  }
  const { rows } = await pool.query<{ zone_id: string }>(ZONE_OF_RECORD[kind], [id]);
  const row = rows[0];
  return row === undefined || row.zone_id === scope;
}

/** How a route answers an id it does not know - reused verbatim for an out-of-zone id. */
export type NotFoundResponse = (response: Response) => void;

export function notFoundError(message: string): NotFoundResponse {
  return (response) => {
    response.status(404).json({ error: message });
  };
}

export const emptyList: NotFoundResponse = (response) => {
  response.json([]);
};

/**
 * Middleware for a route naming a record in `request.params[param]`. Place it
 * after requireSession(). A malformed id is passed through so the route's own
 * 400 still answers it.
 */
export function requireInScope(
  pool: Pool,
  kind: ScopedRecord,
  param: string,
  notFound: NotFoundResponse,
): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const id = String(request.params[param] ?? "");
    if (!UUID_PATTERN.test(id) || (await recordInScope(pool, zoneScopeOf(request), kind, id))) {
      next();
      return;
    }
    notFound(response);
  };
}
