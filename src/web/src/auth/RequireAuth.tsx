/**
 * Purpose: Guards every route except login (SPEC-02 section 2.1). It waits for the
 * initial session check before deciding, so a reload does not briefly flash the
 * login screen, and it redirects with `replace` so the protected URL is not left in
 * history for the back button to return to.
 */

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./AuthContext.tsx";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <p className="p-8 text-sm text-slate-500">Checking your session…</p>;
  }

  if (user === null) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
