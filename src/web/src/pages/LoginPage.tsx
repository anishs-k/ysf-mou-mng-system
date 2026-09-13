/**
 * Purpose: The login screen of SPEC-02 section 2, restyled per SPEC-14 to match
 * `figma_code/src/App.tsx`'s `LoginPage` (glass card, gradient orbs, stat
 * tiles). It still submits to /api/auth/login and shows exactly what the API
 * returned - one generic message for a bad username, a bad password or an
 * inactive account (D80, unchanged). "Remember me" and "Forgot password?"
 * render but do nothing (D83, deferred).
 *
 * The four stat tiles show a real, live figure fetched from the new
 * unauthenticated `GET /api/public/stats` (`db/public-stats.ts`), reversing
 * ADR D88 at explicit user request. That route deliberately returns only
 * coarse, whole-portal counts - no per-zone or per-company detail - which is
 * what keeps this an intentional, narrow exception rather than a blanket
 * reversal of "every endpoint requires a session" (SPEC-02). A fetch failure
 * falls back to the tile's label alone (no number), the same fallback shape
 * the pre-D88-reversal static version always rendered - this screen must
 * never show a broken/placeholder number to a visitor who has not signed in.
 */

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";

import { fetchPublicStats } from "../api/client.ts";
import type { PublicStats } from "../api/client.ts";
import logoYSF from "../assets/logo-ysf.png";
import { useAuth } from "../auth/AuthContext.tsx";
import { Icon } from "../components/icons.tsx";
import { brand } from "../components/ui.tsx";

interface StatTile {
  readonly key: keyof PublicStats;
  readonly label: string;
  readonly color: string;
  readonly iconBg: string;
  readonly icon: React.ReactNode;
}

const STAT_TILES: readonly StatTile[] = [
  { key: "activeMou", label: "Active MOUs", color: brand.blue, iconBg: "#EBF2FB", icon: Icon.user },
  { key: "totalCompanies", label: "Companies", color: brand.orange, iconBg: "#FFF0E8", icon: Icon.building },
  { key: "expiringSoon", label: "Expiring Soon", color: brand.blue, iconBg: "#EBF2FB", icon: Icon.clock },
  { key: "activeZones", label: "Active Zones", color: brand.orange, iconBg: "#FFF0E8", icon: Icon.map },
];

/** Numbers into the wide-format the design's stat tiles use, e.g. 1,240 -> "1.2K". */
function formatStatValue(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(1)}K` : String(value);
}

export function LoginPage() {
  const { user, loading, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // undefined while loading/on failure: the tile then renders its label with
  // no number, rather than a stale zero or a placeholder that looks live.
  const [stats, setStats] = useState<PublicStats | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchPublicStats()
      .then((value) => {
        if (!cancelled) setStats(value);
      })
      .catch(() => {
        // Silent: an unauthenticated visitor seeing four label-only tiles is
        // a fine degraded state; a thrown error dialog is not.
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div className="min-h-screen flex flex-col relative overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="orb-a absolute"
          style={{
            top: "-15%",
            right: "-10%",
            width: 700,
            height: 700,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(27,95,174,0.32) 0%, transparent 65%)",
            filter: "blur(36px)",
          }}
        />
        <div
          className="orb-b absolute"
          style={{
            bottom: "-18%",
            left: "0%",
            width: 600,
            height: 600,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(242,101,34,0.22) 0%, transparent 65%)",
            filter: "blur(44px)",
          }}
        />
      </div>

      <header
        className="glass-header shrink-0 relative z-10"
        style={{ borderBottom: "2px solid rgba(242,101,34,0.45)" }}
      >
        <div className="flex items-center justify-between px-4 sm:px-8 h-[56px] sm:h-[60px]">
          <div className="flex items-center gap-2 sm:gap-3">
            <img src={logoYSF} alt="YSF" className="h-8 sm:h-9 w-auto object-contain" />
            <div style={{ borderLeft: "1.5px solid #E0E8F0", paddingLeft: 10, marginLeft: 2 }}>
              <p className="font-bold text-xs sm:text-sm leading-tight" style={{ color: brand.navy }}>
                Agreement Management System
              </p>
              <p className="text-[10px] sm:text-xs font-medium hidden sm:block" style={{ color: "#7A90B0" }}>
                National Skill Development Portal
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 items-center px-3 sm:px-8 lg:px-16 py-4 sm:py-6 lg:py-12 gap-6 lg:gap-16 max-w-6xl mx-auto w-full overflow-y-auto relative z-10">
        <div className="flex-1 min-w-0 w-full hidden md:block">
          <div className="flex items-center gap-2 mb-4 lg:mb-5">
            <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: brand.orange }}>
              Government Skilling Initiative
            </p>
            <div className="w-8 h-[2.5px] rounded-full" style={{ background: brand.orange }} />
          </div>

          <h1
            className="font-extrabold leading-tight mb-3 lg:mb-4"
            style={{ fontSize: "clamp(24px, 3vw, 40px)", color: brand.navy }}
          >
            Empowering Youth
            <br />
            <span style={{ color: brand.navy }}>Through </span>
            <span style={{ color: brand.orange }}>Skills</span>
          </h1>

          <p className="text-xs sm:text-sm leading-relaxed mb-6 lg:mb-8 max-w-sm" style={{ color: "#6B7B99" }}>
            A unified digital platform for company MOU registration, payroll scheme management, document
            verification, and compliance tracking across all YSF training zones.
          </p>

          <div className="grid grid-cols-2 gap-3 lg:gap-4 max-w-xs lg:max-w-sm">
            {STAT_TILES.map((stat) => {
              const rawValue = stats?.[stat.key];
              return (
                <div key={stat.label} className="glass-stat rounded-xl p-3 lg:p-4 flex flex-col gap-1.5 lg:gap-2">
                  <div
                    className="w-8 h-8 lg:w-9 lg:h-9 rounded-lg flex items-center justify-center"
                    style={{ background: stat.iconBg, color: stat.color }}
                  >
                    {stat.icon}
                  </div>
                  {rawValue !== undefined && (
                    <p
                      className="font-bold mono"
                      style={{ fontSize: "clamp(18px, 2vw, 26px)", color: stat.color, lineHeight: 1 }}
                    >
                      {formatStatValue(rawValue)}
                    </p>
                  )}
                  <p className="text-xs font-medium" style={{ color: "#8A9BB5" }}>
                    {stat.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 w-full max-w-sm lg:max-w-[360px]">
          <div className="glass-login rounded-2xl overflow-hidden">
            <div
              className="h-1.5 w-full"
              style={{ background: `linear-gradient(to right, ${brand.blue} 50%, ${brand.orange} 50%)` }}
            />

            <div className="p-8">
              <h2 className="font-bold mb-1" style={{ fontSize: 24, color: brand.navy }}>
                Welcome back
              </h2>
              <p className="text-sm mb-6" style={{ color: "#7A90B0" }}>
                Sign in to your Agreement Management System account
              </p>

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label
                    className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5"
                    style={{ color: "#4A5568" }}
                    htmlFor="username"
                  >
                    Username or email
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#B0C0D8" }}>
                      {Icon.user}
                    </span>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      placeholder="e.g., branch_xyz01"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className="w-full h-11 pl-9 pr-4 rounded-lg text-sm focus:outline-none transition-all"
                      style={{ border: "1.5px solid #D8E3F0", color: brand.navy }}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label
                    className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5"
                    style={{ color: "#4A5568" }}
                    htmlFor="password"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#B0C0D8" }}>
                      {Icon.lock}
                    </span>
                    <input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      placeholder="Enter your password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="w-full h-11 pl-9 pr-10 rounded-lg text-sm focus:outline-none transition-all"
                      style={{ border: "1.5px solid #D8E3F0", color: brand.navy }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Hide typed characters" : "Show typed characters"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                      style={{ color: "#B0C0D8" }}
                    >
                      {Icon.eye}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between mb-5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(event) => setRememberMe(event.target.checked)}
                      className="w-4 h-4 rounded border"
                      style={{ accentColor: brand.orange, borderColor: "#D8E3F0" }}
                    />
                    <span className="text-sm" style={{ color: "#4A5568" }}>
                      Remember me
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={(event) => event.preventDefault()}
                    className="text-sm font-semibold hover:underline"
                    style={{ color: brand.orange }}
                  >
                    Forgot password?
                  </button>
                </div>

                {error !== null && (
                  <p
                    role="alert"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mb-4"
                    style={{ background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FECACA" }}
                  >
                    {Icon.alert}
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-full text-white font-bold text-sm transition-all active:scale-[0.98]"
                  style={{
                    height: 46,
                    background: submitting ? "#B0C0D8" : brand.orange,
                    letterSpacing: "0.03em",
                    boxShadow: submitting ? "none" : "0 4px 16px rgba(242,101,34,0.35)",
                  }}
                >
                  {submitting ? "Signing in…" : "Sign in"}
                </button>
              </form>

              <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: "#EEF2F8" }}>
                <p className="text-xs" style={{ color: "#8A9BB5" }}>
                  Ministry of Skill Development &amp; Entrepreneurship
                </p>
                <p className="text-xs font-bold mt-0.5 uppercase tracking-wider" style={{ color: brand.orange }}>
                  NAPS Apprenticeship Portal · V2.0
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <footer className="shrink-0 py-4 text-center border-t relative z-10" style={{ borderColor: "rgba(27,95,174,0.18)" }}>
        <p className="text-xs" style={{ color: "#8A9BB5" }}>
          © 2026 Yuvashakti Foundation · Company MOU Management System v2.0 · All rights reserved
        </p>
      </footer>
    </div>
  );
}
