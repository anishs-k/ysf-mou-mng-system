/**
 * Purpose: Holds the signed-in user for the clone. On mount it asks the API who the
 * session cookie belongs to, so a page refresh keeps the user signed in; sign-in
 * and sign-out go through @mou/api, which owns the session server-side.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { fetchCurrentUser, login, logout } from "../api/client.ts";
import type { AuthUser } from "../api/client.ts";
import { SessionContext } from "./session.ts";

const UNREACHABLE_MESSAGE = "Unable to reach the server. Please try again.";

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchCurrentUser()
      .catch(() => null)
      .then((current) => {
        if (cancelled) return;
        setUser(current);
        setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string): Promise<string | null> => {
    if (!username.trim() || !password) return "Please enter both username and password.";
    try {
      const result = await login(username.trim(), password);
      if (!result.ok) return result.message;
      setUser(result.user);
      return null;
    } catch {
      return UNREACHABLE_MESSAGE;
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ checking, user, signedIn: user !== null, signIn, signOut }),
    [checking, user, signIn, signOut],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
