/**
 * Purpose: The sign-in screen - portal header, the "Empowering Youth Through
 * Skills" hero with four headline figures, and the glass login card. Credentials
 * are checked by @mou/api (see ui/SessionProvider.tsx) and the hero figures come
 * from the unauthenticated GET /api/public/stats. The page chrome lives in
 * login/AuthPageFrame.tsx. There is no sign-up link: accounts are created by a
 * super admin (SPEC-21).
 */

import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";

import { fetchPublicStats } from "../api/client.ts";
import type { PublicStats } from "../api/client.ts";
import { Icon } from "../ui/Icon.tsx";
import type { IconName } from "../ui/Icon.tsx";
import { AUTH_INPUT_STYLE as INPUT_STYLE, BRAND } from "../ui/theme.ts";
import { useSession } from "../ui/session.ts";
import { AuthPageFrame, FieldLabel } from "./login/AuthPageFrame.tsx";

/** Shown in a hero tile until /api/public/stats answers, or when it cannot. */
const PENDING_FIGURE = "—";

interface HeroStat {
  readonly key: keyof PublicStats;
  readonly label: string;
  readonly icon: IconName;
  readonly tint: "blue" | "orange";
}

const HERO_STATS: readonly HeroStat[] = [
  { key: "activeMou", label: "Active MoUs", icon: "user", tint: "blue" },
  { key: "totalCompanies", label: "Companies", icon: "table", tint: "orange" },
  { key: "expiringSoon", label: "Expiring Soon", icon: "calendar", tint: "blue" },
  { key: "activeZones", label: "Active Zones", icon: "clock", tint: "orange" },
];

const TINTS = {
  blue: { color: BRAND.blue, background: "#EBF2FB" },
  orange: { color: BRAND.orange, background: "#FFF0E8" },
} as const;

export function LoginScreen() {
  const { signedIn, signIn } = useSession();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState<PublicStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicStats()
      .then((result) => {
        if (!cancelled) setStats(result);
      })
      .catch(() => {
        // The hero keeps its placeholder figures; signing in does not depend on them.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (signedIn && !submitting) return <Navigate to="/" replace />;

  async function submit(): Promise<void> {
    if (submitting) return;
    setError("");
    setSubmitting(true);
    const problem = await signIn(username, password);
    if (problem !== null) {
      setError(problem);
      setSubmitting(false);
      return;
    }
    navigate("/", { replace: true });
  }

  const submitOnEnter = (event: { key: string }) => {
    if (event.key === "Enter") void submit();
  };

  return (
    <AuthPageFrame>
      <div className="flex-1 min-w-0 w-full hidden md:block">
        <div className="flex items-center gap-2 mb-4 lg:mb-5">
          <p className="text-xs font-bold uppercase tracking-[0.18em]" style={{ color: BRAND.orange }}>
            Government Skilling Initiative
          </p>
          <div className="w-8 h-[2.5px] rounded-full" style={{ background: BRAND.orange }} />
        </div>
        <h1 className="font-extrabold leading-tight mb-3 lg:mb-4" style={{ fontSize: "clamp(24px, 3vw, 40px)", color: BRAND.navy }}>
          Empowering Youth
          <br />
          <span style={{ color: BRAND.navy }}>Through </span>
          <span style={{ color: BRAND.orange }}>Skills</span>
        </h1>
        <p className="text-xs sm:text-sm leading-relaxed mb-6 lg:mb-8 max-w-sm" style={{ color: "#6B7B99" }}>
          A unified digital platform for company AMS registration, payroll scheme management, document verification,
          and compliance tracking across all YSF training zones.
        </p>
        <div className="grid grid-cols-2 gap-3 lg:gap-4 max-w-xs lg:max-w-sm">
          {HERO_STATS.map((stat) => {
            const tint = TINTS[stat.tint];
            return (
              <div key={stat.label} className="glass-stat rounded-xl p-3 lg:p-4 flex flex-col gap-1.5 lg:gap-2">
                <div
                  className="w-8 h-8 lg:w-9 lg:h-9 rounded-lg flex items-center justify-center"
                  style={{ background: tint.background, color: tint.color }}
                >
                  <Icon name={stat.icon} />
                </div>
                <p className="font-bold mono" style={{ fontSize: "clamp(18px, 2vw, 26px)", color: tint.color, lineHeight: 1 }}>
                  {stats === null ? PENDING_FIGURE : stats[stat.key]}
                </p>
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
          <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${BRAND.blue} 50%, ${BRAND.orange} 50%)` }} />
          <div className="p-8">
            <h2 className="font-bold mb-1" style={{ fontSize: 24, color: BRAND.navy }}>
              Welcome back
            </h2>
            <p className="text-sm mb-6" style={{ color: "#7A90B0" }}>
              Sign in to your Agreement Management System account
            </p>

            <div className="mb-4">
              <FieldLabel>Username</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#B0C0D8" }}>
                  <Icon name="user" className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="e.g., branch_xyz01"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  onKeyDown={submitOnEnter}
                  className="w-full h-11 pl-9 pr-4 rounded-lg text-sm focus:outline-none transition-all"
                  style={INPUT_STYLE}
                />
              </div>
            </div>

            <div className="mb-4">
              <FieldLabel>Password</FieldLabel>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "#B0C0D8" }}>
                  <Icon name="lock" className="w-4 h-4" />
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  onKeyDown={submitOnEnter}
                  className="w-full h-11 pl-9 pr-10 rounded-lg text-sm focus:outline-none transition-all"
                  style={INPUT_STYLE}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "#B0C0D8" }}
                >
                  <Icon name={showPassword ? "eyeOff" : "eye"} className="w-4 h-4" />
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
                  style={{ accentColor: BRAND.orange, borderColor: "#D8E3F0" }}
                />
                <span className="text-sm" style={{ color: "#4A5568" }}>
                  Remember me
                </span>
              </label>
              <button type="button" className="text-sm font-semibold hover:underline" style={{ color: BRAND.orange }}>
                Forgot password?
              </button>
            </div>

            {error !== "" && (
              <div
                role="alert"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mb-1"
                style={{ background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FECACA" }}
              >
                <Icon name="alertCircle" className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="w-full rounded-full text-white font-bold text-sm transition-all active:scale-[0.98]"
              style={{
                height: 46,
                background: submitting ? "#B0C0D8" : BRAND.orange,
                fontFamily: "inherit",
                letterSpacing: "0.03em",
                boxShadow: submitting ? "none" : "0 4px 16px rgba(242,101,34,0.35)",
              }}
            >
              {submitting ? "Signing in…" : "Sign In →"}
            </button>

            <div className="mt-6 pt-5 border-t text-center" style={{ borderColor: "#EEF2F8" }}>
              <p className="text-xs" style={{ color: "#8A9BB5" }}>
                Ministry of Skill Development &amp; Entrepreneurship
              </p>
              <p className="text-xs font-bold mt-0.5 uppercase tracking-wider" style={{ color: BRAND.orange }}>
                NAPS Apprenticeship Portal · V2.0
              </p>
            </div>
          </div>
        </div>
      </div>
    </AuthPageFrame>
  );
}
