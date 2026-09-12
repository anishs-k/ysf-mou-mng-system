/**
 * Purpose: The Dashboard Home of SPEC-02 section 3 - the landing screen after login.
 * It renders the entry points the signed-in role is allowed to see, driven entirely
 * by the shared list in dashboard/entry-points.ts so the layout and the tests cannot
 * drift apart. Destinations whose spec has not landed yet stay visible but disabled,
 * which section 3.1 requires so the dashboard never has to be rebuilt.
 *
 * The SPEC-08 section 5 badge - a live count of current MOUs within 90 days of
 * expiry, not a count of mou_alert rows - is fetched once on mount and shown on
 * the "MOU Expiry Alerts" entry point once that destination is available.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchAlertsCount } from "../api/client.ts";
import { useAuth } from "../auth/AuthContext.tsx";
import { visibleEntryPoints } from "../dashboard/entry-points.ts";
import type { DashboardEntryPoint } from "../dashboard/entry-points.ts";

function EntryPointCard({ entry, badgeCount }: { entry: DashboardEntryPoint; badgeCount: number | null }) {
  const heading = (
    <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
      {/* Isolated in its own leaf element so getByText(label, { exact: true })
          still matches the label alone even once the badge sibling below adds
          its own text - otherwise the two text nodes concatenate into one
          "own text" on the shared parent. */}
      <span>{entry.label}</span>
      {entry.available && entry.id === "expiry-alerts" && badgeCount !== null && badgeCount > 0 && (
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
          {badgeCount}
        </span>
      )}
    </span>
  );

  if (!entry.available) {
    return (
      <li
        aria-disabled="true"
        className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4"
      >
        {heading}
        <p className="mt-1 text-xs text-slate-500">{entry.description}</p>
        <p className="mt-2 text-xs text-slate-400">Coming soon · {entry.spec}</p>
      </li>
    );
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400">
      <Link to={entry.path} className="block">
        {heading}
        <p className="mt-1 text-xs text-slate-500">{entry.description}</p>
      </Link>
    </li>
  );
}

export function DashboardPage() {
  const { user, signOut } = useAuth();
  const [alertsCount, setAlertsCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAlertsCount()
      .then((count) => {
        if (!cancelled) setAlertsCount(count);
      })
      .catch(() => {
        if (!cancelled) setAlertsCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // RequireAuth guarantees a user, so this is only here to satisfy the type.
  if (user === null) {
    return null;
  }

  const entryPoints = visibleEntryPoints(user.role);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-base font-medium text-slate-900">Dashboard</h1>
          <p className="text-xs text-slate-500">
            Signed in as {user.username} · {user.role}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void signOut();
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:border-slate-500"
        >
          Log out
        </button>
      </header>

      <main className="p-6">
        <h2 className="text-sm text-slate-500">Choose a task</h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {entryPoints.map((entry) => (
            <EntryPointCard key={entry.id} entry={entry} badgeCount={alertsCount} />
          ))}
        </ul>
      </main>
    </div>
  );
}
