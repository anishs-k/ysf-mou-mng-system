/**
 * Purpose: Session and role enforcement for SPEC-02 sections 2.1 and 3.3. The
 * session cookie is httpOnly so no script can read it, and holds only an opaque
 * session row id - never a user id or role, both of which are re-read from the
 * database on every request. requireSession answers 401 and requireRole answers 403,
 * which is what lets SPEC-02 insist that hiding an entry point in the UI is not the
 * control: every endpoint is checked independently.
 */

import type { UserRole } from "@mou/domain";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Pool } from "pg";

import { resolveSession } from "./session-repository.ts";
import type { AuthenticatedUser } from "./session-repository.ts";

export const SESSION_COOKIE_NAME = "mou_session";

declare global {
  namespace Express {
    interface Request {
      /** Set by requireSession(); undefined on unauthenticated routes. */
      auth?: AuthenticatedUser;
    }
  }
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax",
  path: "/",
} as const;

export function readSessionCookie(request: Request): string | null {
  const value: unknown = request.cookies?.[SESSION_COOKIE_NAME];
  return typeof value === "string" && value !== "" ? value : null;
}

export function setSessionCookie(response: Response, sessionId: string, expiresAt: Date): void {
  response.cookie(SESSION_COOKIE_NAME, sessionId, {
    ...COOKIE_OPTIONS,
    secure: process.env["NODE_ENV"] === "production",
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE_NAME, COOKIE_OPTIONS);
}

export function requireSession(pool: Pool): RequestHandler {
  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    const sessionId = readSessionCookie(request);
    if (sessionId === null) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }

    const auth = await resolveSession(pool, sessionId);
    if (auth === null) {
      clearSessionCookie(response);
      response.status(401).json({ error: "Authentication required" });
      return;
    }

    request.auth = auth;
    next();
  };
}

export function requireRole(...allowed: readonly UserRole[]): RequestHandler {
  return (request: Request, response: Response, next: NextFunction): void => {
    const auth = request.auth;
    if (auth === undefined) {
      response.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!allowed.includes(auth.role)) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}

/** Reads the session user on a route already guarded by requireSession(). */
export function requireAuth(request: Request): AuthenticatedUser {
  const auth = request.auth;
  if (auth === undefined) {
    throw new Error("requireAuth() was called on a route without requireSession()");
  }
  return auth;
}
