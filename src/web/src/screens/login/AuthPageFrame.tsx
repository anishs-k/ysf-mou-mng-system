/**
 * Purpose: The signed-out page chrome of the login screen - background orbs, the
 * portal header, the centred content row and the copyright footer - plus the
 * card's field label (its input style is ui/theme.ts's AUTH_INPUT_STYLE). Moved
 * verbatim out of LoginScreen for SPEC-20's sign-up page; SPEC-21 removed that
 * page, and the login page still renders exactly as before.
 */

import type { ReactNode } from "react";

import logo from "../../assets/logo-ysf.png";
import { BackgroundOrbs } from "../../ui/layout/BackgroundOrbs.tsx";
import { BRAND } from "../../ui/theme.ts";

export function FieldLabel({ children, htmlFor }: { readonly children: ReactNode; readonly htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-[11px] font-bold uppercase tracking-[0.12em] mb-1.5" style={{ color: "#4A5568" }}>
      {children}
    </label>
  );
}

export function AuthPageFrame({ children }: { readonly children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col relative overflow-hidden" style={{ fontFamily: "Roboto, sans-serif" }}>
      <BackgroundOrbs variant="login" />

      <header className="glass-header shrink-0 relative z-10" style={{ borderBottom: "2px solid rgba(242,101,34,0.45)" }}>
        <div className="flex items-center justify-between px-4 sm:px-8 h-[56px] sm:h-[60px]">
          <div className="flex items-center gap-2 sm:gap-3">
            <img src={logo} alt="YSF" className="h-8 sm:h-9 w-auto object-contain" />
            <div style={{ borderLeft: "1.5px solid #E0E8F0", paddingLeft: 10, marginLeft: 2 }}>
              <p className="font-bold text-xs sm:text-sm leading-tight" style={{ color: BRAND.navy }}>
                Agreement Management System
              </p>
              <p className="text-[10px] sm:text-xs font-medium hidden sm:block" style={{ color: "#7A90B0" }}>
                National Skill Development Portal
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6 text-xs font-medium" style={{ color: "#7A90B0" }}>
            <span>
              Helpdesk: <strong style={{ color: BRAND.navy }}>1800-XXX-XXXX</strong>
            </span>
            <span style={{ color: BRAND.blue }}>support@ses.ysf.in</span>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row flex-1 items-center px-3 sm:px-8 lg:px-16 py-4 sm:py-6 lg:py-12 gap-6 lg:gap-16 max-w-6xl mx-auto w-full overflow-y-auto relative z-10">
        {children}
      </div>

      <footer className="shrink-0 py-4 text-center border-t relative z-10" style={{ borderColor: "rgba(27,95,174,0.18)" }}>
        <p className="text-xs" style={{ color: "#8A9BB5" }}>
          © 2026 Yuvashakti Foundation · Agreement Management System v2.0 · All rights reserved
        </p>
      </footer>
    </div>
  );
}
