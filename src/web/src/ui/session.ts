/**
 * Purpose: The clone's sign-in contract - the fixed demo credential check, the
 * context SessionProvider fills, and the useSession() hook screens read it with.
 * Like the prototype it talks to no server.
 */

import { createContext, useContext } from "react";

const DEMO_USERNAME = "admin";
const DEMO_PASSWORD = "Admin@123";

export interface Session {
  readonly signedIn: boolean;
  readonly signIn: () => void;
  readonly signOut: () => void;
}

export const SessionContext = createContext<Session | null>(null);

/** Returns the error message the login card shows, or null when accepted. */
export function checkCredentials(username: string, password: string): string | null {
  if (!username.trim() || !password) return "Please enter both username and password.";
  if (username.trim() !== DEMO_USERNAME || password !== DEMO_PASSWORD) {
    return "Invalid username or password. Please try again.";
  }
  return null;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (session === null) throw new Error("useSession() must be used inside a SessionProvider");
  return session;
}
