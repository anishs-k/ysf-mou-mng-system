/**
 * Purpose: Holds the signed-in user for the whole application (SPEC-02 section 2).
 * On boot it asks /api/auth/me, so a reload keeps the session and a stale cookie
 * does not. signOut calls the API first and only then clears local state, which is
 * what makes AC8 hold: the session is gone on the server, so pressing back cannot
 * restore an authenticated screen even though the browser still has history.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { fetchCurrentUser, login as loginRequest, logout as logoutRequest } from "../api/client.ts";
import type { AuthUser } from "../api/client.ts";

export interface AuthState {
  readonly user: AuthUser | null;
  /** True until the initial /api/auth/me has answered. */
  readonly loading: boolean;
  /** Resolves to null on success, or to the message to show on failure. */
  readonly signIn: (username: string, password: string) => Promise<string | null>;
  readonly signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .then((current) => {
        if (!cancelled) {
          setUser(current);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string): Promise<string | null> => {
    const result = await loginRequest(username, password);
    if (result.ok) {
      setUser(result.user);
      return null;
    }
    return result.message;
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    await logoutRequest();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- a hook, not a component
export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth() must be used inside an AuthProvider");
  }
  return context;
}
