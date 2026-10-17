/**
 * Purpose: The signed-in frame - background orbs, the sidebar, the routed screen
 * and the AI button - plus `ScreenFrame`, which every screen uses to render its
 * own Topbar above a scrolling content area. Redirects to /login when no session.
 */

import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, Outlet, useNavigate, useOutletContext } from "react-router-dom";

import { useSession } from "../session.ts";
import { AiChatButton } from "./AiChatButton.tsx";
import { BackgroundOrbs } from "./BackgroundOrbs.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { Topbar } from "./Topbar.tsx";

interface ShellContext {
  readonly openMenu: () => void;
}

export function AppShell() {
  const { signedIn, signOut } = useSession();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openMenu = useCallback(() => setMobileOpen(true), []);

  if (!signedIn) return <Navigate to="/login" replace />;

  const context: ShellContext = { openMenu };
  return (
    <div className="flex h-screen overflow-hidden relative">
      <BackgroundOrbs variant="shell" />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
        onSignOut={() => {
          signOut();
          navigate("/login", { replace: true });
        }}
      />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 relative z-10">
        <Outlet context={context} />
      </main>
      <AiChatButton />
    </div>
  );
}

interface ScreenFrameProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly contentClassName?: string;
  readonly children: ReactNode;
}

export function ScreenFrame({ title, subtitle, contentClassName = "p-4 md:p-6 space-y-4 md:space-y-6", children }: ScreenFrameProps) {
  const { openMenu } = useOutletContext<ShellContext>();
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar title={title} subtitle={subtitle} onOpenMenu={openMenu} />
      <div className={`${contentClassName} flex-1 overflow-y-auto`}>{children}</div>
    </div>
  );
}
