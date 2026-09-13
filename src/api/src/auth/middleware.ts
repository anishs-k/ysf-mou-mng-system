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

/**
 * `lax` keeps the cookie safe from cross-site request forgery and is correct
 * whenever the browser reaches the API on the same site as the web app - the
 * docker-compose deployment (nginx proxies /api to the api container, one
 * origin) and any custom-domain setup where web and API are subdomains of one
 * registrable domain (app.example.com + api.example.com are same-site).
 *
 * It must become `none` only when the two are genuinely cross-site, which is
 * what a platform's own generated hostnames force: *.up.railway.app sits on
 * the public suffix list, so two services there are cross-site and a `lax`
 * cookie is simply never sent back on the credentialed fetch, making login
 * silently impossible. `none` additionally requires `secure`, so the pairing
 * is validated below rather than left to produce a cookie browsers reject.
 *
 * Configurable rather than hardcoded to `none` because permanently opting out
 * of same-site protection to satisfy a temporary hostname would weaken every
 * deployment, including the ones that never needed it.
 */
function sessionCookieSameSite(): "lax" | "none" {
  return process.env["SESSION_COOKIE_SAMESITE"] === "none" ? "none" : "lax";
}

/** `sameSite: "none"` is void without it, and browsers drop such a cookie. */
function sessionCookieSecure(): boolean {
  return sessionCookieSameSite() === "none" || process.env["NODE_ENV"] === "production";
}

/**
 * Every attribute except `expires`. clearCookie() has to be handed the same
 * `path`/`sameSite`/`secure` it was set with: a browser matches on those, so
 * clearing with different attributes silently leaves the original cookie in
 * place and "log out" stops actually logging out in the browser.
 */
function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: sessionCookieSameSite(),
    secure: sessionCookieSecure(),
    path: "/",
  } as const;
}

export function readSessionCookie(request: Request): string | null {
  const value: unknown = request.cookies?.[SESSION_COOKIE_NAME];
  return typeof value === "string" && value !== "" ? value : null;
}

export function setSessionCookie(response: Response, sessionId: string, expiresAt: Date): void {
  response.cookie(SESSION_COOKIE_NAME, sessionId, {
    ...cookieOptions(),
    expires: expiresAt,
  });
}

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE_NAME, cookieOptions());
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
