/**
 * Purpose: The clone's sign-in contract - the context SessionProvider fills from
 * @mou/api (POST /api/auth/login, GET /api/auth/me) and the useSession() hook
 * screens read it with. The session itself is the API's httpOnly cookie; this
 * only mirrors who it belongs to.
 */

import { createContext, useContext } from "react";

import type { AuthUser } from "../api/client.ts";

export interface Session {
  /** True while GET /api/auth/me has not answered yet, so no screen redirects early. */
  readonly checking: boolean;
  readonly user: AuthUser | null;
  readonly signedIn: boolean;
  /** Resolves to the error message the login card shows, or null when accepted. */
  readonly signIn: (username: string, password: string) => Promise<string | null>;
  readonly signOut: () => Promise<void>;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) throw new Error("useSession() must be used inside a SessionProvider");
  return session;
}
