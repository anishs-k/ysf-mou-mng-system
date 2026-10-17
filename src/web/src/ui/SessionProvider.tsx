/**
 * Purpose: Holds the clone's signed-in flag. It is mirrored to sessionStorage so a
 * page refresh inside the shell does not bounce the user back to the login screen;
 * closing the tab signs out.
 */

import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { SessionContext } from "./session.ts";

const STORAGE_KEY = "mou-clone-signed-in";

function readStoredFlag(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredFlag(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(STORAGE_KEY, "1");
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode): the session simply lasts until reload.
  }
}

export function SessionProvider({ children }: { readonly children: ReactNode }) {
  const [signedIn, setSignedIn] = useState(readStoredFlag);

  const signIn = useCallback(() => {
    writeStoredFlag(true);
    setSignedIn(true);
  }, []);

  const signOut = useCallback(() => {
    writeStoredFlag(false);
    setSignedIn(false);
  }, []);

  const value = useMemo(() => ({ signedIn, signIn, signOut }), [signedIn, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
