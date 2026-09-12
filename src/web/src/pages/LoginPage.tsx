/**
 * Purpose: The login screen of SPEC-02 section 2. It submits to /api/auth/login and
 * shows exactly what the API returned - one generic message for a bad username, a
 * bad password or an inactive account, so the screen cannot become a way to probe
 * which usernames exist. The password is never stored, logged or echoed back.
 */

import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext.tsx";

export function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Already signed in: the login screen has nothing to offer.
  if (!loading && user !== null) {
    return <Navigate to="/" replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const message = await signIn(username, password);
    if (message !== null) {
      setError(message);
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm">
        <h1 className="text-lg font-medium text-slate-900">MOU Management System</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to continue.</p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm text-slate-700" htmlFor="username">
              Username or email
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>

          <div>
            <label className="block text-sm text-slate-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-500"
            />
          </div>

          {error !== null && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}
