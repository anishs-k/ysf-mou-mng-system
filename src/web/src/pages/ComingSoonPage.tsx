/**
 * Purpose: The placeholder every dashboard destination renders until its own spec
 * lands (SPEC-02 section 3.1). It also closes the hole that hiding an entry point
 * leaves open: a URL typed directly is checked against the same role matrix, so a
 * VIEWER who guesses /companies/new is refused here as well as by the server. This
 * is a convenience, not the control - SPEC-02 section 3.3 is explicit that the
 * server must enforce the matrix independently.
 */

import { Link, useLocation } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.tsx";
import { DASHBOARD_ENTRY_POINTS, canAccessPath } from "../dashboard/entry-points.ts";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-8 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl glass-card rounded-xl p-8">
        <h1 className="text-base font-medium text-foreground">{title}</h1>
        {children}
        <Link className="mt-6 inline-block text-sm hover:underline" style={{ color: "#1B5FAE" }} to="/">
          Back to the dashboard
        </Link>
      </div>
    </div>
  );
}

export function ComingSoonPage() {
  const { user } = useAuth();
  const location = useLocation();

  if (user === null) {
    return null;
  }

  const entry = DASHBOARD_ENTRY_POINTS.find((candidate) => candidate.path === location.pathname);

  if (entry === undefined) {
    return (
      <Shell title="Page not found">
        <p className="mt-1 text-sm text-muted-foreground">There is nothing at {location.pathname}.</p>
      </Shell>
    );
  }

  if (!canAccessPath(user.role, location.pathname)) {
    return (
      <Shell title="Not available">
        <p className="mt-1 text-sm text-muted-foreground">
          Your role ({user.role}) does not have access to this screen.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title={entry.label}>
      <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
      <p className="mt-4 text-sm text-muted-foreground">This screen is not built yet. It arrives with {entry.spec}.</p>
    </Shell>
  );
}
