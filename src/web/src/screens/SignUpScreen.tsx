/**
 * Purpose: SPEC-20's self sign-up screen, in the login screen's chrome and card
 * style (login/AuthPageFrame.tsx). The zone dropdown comes from the anonymous
 * GET /api/public/zones; the request goes to POST /api/auth/signup, whose
 * field-keyed errors are shown under each field. Confirm Password is checked here
 * only - the API never receives it. Success shows that approval is pending and
 * creates no session.
 */

import { useEffect, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";

import { fetchSignUpZones, signUp } from "../api/client.ts";
import { Icon } from "../ui/Icon.tsx";
import type { IconName } from "../ui/Icon.tsx";
import { AUTH_INPUT_STYLE as INPUT_STYLE, BRAND } from "../ui/theme.ts";
import { useSession } from "../ui/session.ts";
import { AuthPageFrame, FieldLabel } from "./login/AuthPageFrame.tsx";

type Field = "fullName" | "email" | "zoneId" | "password" | "confirmPassword";

const INPUT_CLASS = "w-full h-11 pl-9 pr-4 rounded-lg text-sm focus:outline-none transition-all bg-white";
const ERROR_BORDER = { ...INPUT_STYLE, border: "1.5px solid #F87171" } as const;

function FieldError({ message }: { readonly message: string | undefined }) {
  if (message === undefined) return null;
  return <p className="mt-1 text-xs text-red-600">{message}</p>;
}

function IconField({ icon, children }: { readonly icon: IconName; readonly children: ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "#B0C0D8" }}>
        <Icon name={icon} className="w-4 h-4" />
      </span>
      {children}
    </div>
  );
}

export function SignUpScreen() {
  const { signedIn } = useSession();
  const [zones, setZones] = useState<readonly { id: string; name: string }[]>([]);
  const [form, setForm] = useState<Record<Field, string>>({
    fullName: "",
    email: "",
    zoneId: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchSignUpZones()
      .then((rows) => {
        if (!cancelled) setZones(rows);
      })
      .catch(() => {
        if (!cancelled) setMessage("Could not load the zone list. Please refresh the page.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (signedIn) return <Navigate to="/" replace />;

  const set = (field: Field) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }));
  const border = (field: Field) => (errors[field] === undefined ? INPUT_STYLE : ERROR_BORDER);

  async function submit(): Promise<void> {
    if (submitting) return;
    setMessage("");
    if (form.password !== form.confirmPassword) {
      setErrors({ confirmPassword: "Passwords do not match" });
      return;
    }
    setErrors({});
    setSubmitting(true);
    const result = await signUp({
      fullName: form.fullName,
      email: form.email,
      zoneId: form.zoneId,
      password: form.password,
    }).catch(() => ({ ok: false as const, message: "Could not submit the sign-up. Please try again.", errors: {} }));
    setSubmitting(false);
    if (result.ok) {
      setSubmitted(result.message);
      return;
    }
    setErrors(result.errors);
    setMessage(result.message);
  }

  return (
    <AuthPageFrame>
      <div className="w-full max-w-md mx-auto">
        <div className="glass-login rounded-2xl overflow-hidden">
          <div className="h-1.5 w-full" style={{ background: `linear-gradient(to right, ${BRAND.blue} 50%, ${BRAND.orange} 50%)` }} />
          <div className="p-8">
            {submitted !== "" ? (
              <div role="status" className="text-center">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 text-white"
                  style={{ background: BRAND.green }}
                >
                  <Icon name="check" className="w-7 h-7" strokeWidth={3} />
                </div>
                <h2 className="font-bold mb-2" style={{ fontSize: 22, color: BRAND.navy }}>
                  Request submitted
                </h2>
                <p className="text-sm mb-6" style={{ color: "#7A90B0" }}>
                  {submitted}
                </p>
                <Link to="/login" className="text-sm font-semibold hover:underline" style={{ color: BRAND.orange }}>
                  ← Back to Sign In
                </Link>
              </div>
            ) : (
              <>
                <h2 className="font-bold mb-1" style={{ fontSize: 24, color: BRAND.navy }}>
                  Create an account
                </h2>
                <p className="text-sm mb-6" style={{ color: "#7A90B0" }}>
                  An administrator approves every new account before it can sign in.
                </p>

                <div className="space-y-4">
                  <div>
                    <FieldLabel htmlFor="signup-name">Full Name</FieldLabel>
                    <IconField icon="user">
                      <input id="signup-name" type="text" placeholder="Your full name" value={form.fullName} onChange={set("fullName")}
                        className={INPUT_CLASS} style={border("fullName")} />
                    </IconField>
                    <FieldError message={errors.fullName} />
                  </div>

                  <div>
                    <FieldLabel htmlFor="signup-email">Email</FieldLabel>
                    <IconField icon="chat">
                      <input id="signup-email" type="email" placeholder="name@company.com" value={form.email} onChange={set("email")}
                        className={INPUT_CLASS} style={border("email")} />
                    </IconField>
                    <FieldError message={errors.email} />
                  </div>

                  <div>
                    <FieldLabel htmlFor="signup-zone">Zone</FieldLabel>
                    <IconField icon="map">
                      <select id="signup-zone" value={form.zoneId} onChange={set("zoneId")} className={`${INPUT_CLASS} appearance-none`} style={border("zoneId")}>
                        <option value="">Select your zone…</option>
                        {zones.map((zone) => (
                          <option key={zone.id} value={zone.id}>
                            {zone.name}
                          </option>
                        ))}
                      </select>
                    </IconField>
                    <FieldError message={errors.zoneId} />
                  </div>

                  <div>
                    <FieldLabel htmlFor="signup-password">Password</FieldLabel>
                    <IconField icon="lock">
                      <input id="signup-password" type="password" placeholder="At least 8 characters" value={form.password} onChange={set("password")}
                        className={INPUT_CLASS} style={border("password")} />
                    </IconField>
                    <FieldError message={errors.password} />
                  </div>

                  <div>
                    <FieldLabel htmlFor="signup-confirm">Confirm Password</FieldLabel>
                    <IconField icon="lock">
                      <input id="signup-confirm" type="password" placeholder="Re-enter your password" value={form.confirmPassword}
                        onChange={set("confirmPassword")} onKeyDown={(event) => event.key === "Enter" && void submit()}
                        className={INPUT_CLASS} style={border("confirmPassword")} />
                    </IconField>
                    <FieldError message={errors.confirmPassword} />
                  </div>
                </div>

                {message !== "" && (
                  <div
                    role="alert"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium mt-4"
                    style={{ background: "#FEE2E2", color: "#B91C1C", border: "1px solid #FECACA" }}
                  >
                    <Icon name="alertCircle" className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                    {message}
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={submitting}
                  className="w-full rounded-full text-white font-bold text-sm transition-all active:scale-[0.98] mt-5"
                  style={{
                    height: 46,
                    background: submitting ? "#B0C0D8" : BRAND.orange,
                    fontFamily: "inherit",
                    letterSpacing: "0.03em",
                    boxShadow: submitting ? "none" : "0 4px 16px rgba(242,101,34,0.35)",
                  }}
                >
                  {submitting ? "Submitting…" : "Request Account →"}
                </button>

                <p className="text-sm text-center mt-4" style={{ color: "#7A90B0" }}>
                  Already have an account?{" "}
                  <Link to="/login" className="font-semibold hover:underline" style={{ color: BRAND.orange }}>
                    Sign in
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </AuthPageFrame>
  );
}
