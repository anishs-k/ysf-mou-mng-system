/**
 * Purpose: The signed-in frame - background orbs, the sidebar, the routed screen
 * and the AI button - plus `ScreenFrame`, which every screen uses to render its
 * own Topbar above a scrolling content area. Redirects to /login when the API
 * reports no session, and shows "Not available" in place of a screen the user's
 * role may not open (ui/access.ts), so typing a hidden URL does not reach it.
 */

import { USER_ROLE_LABELS } from "@mou/domain";
import type { UserRole } from "@mou/domain";
import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { Navigate, Outlet, useLocation, useNavigate, useOutletContext } from "react-router-dom";

import { canOpenPath } from "../access.ts";
import { useSession } from "../session.ts";
import { AiChatButton } from "./AiChatButton.tsx";
import { BackgroundOrbs } from "./BackgroundOrbs.tsx";
import { Sidebar } from "./Sidebar.tsx";
import { Topbar } from "./Topbar.tsx";

interface ShellContext {
  readonly openMenu: () => void;
}

export function AppShell() {
  const { checking, user, signOut } = useSession();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const openMenu = useCallback(() => setMobileOpen(true), []);

  if (checking) return null;
  if (user === null) return <Navigate to="/login" replace />;

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
          void signOut().finally(() => navigate("/login", { replace: true }));
        }}
      />
      <main className="flex-1 flex flex-col overflow-hidden min-w-0 relative z-10">
        {canOpenPath(user, pathname) ? (
          <Outlet context={context} />
        ) : (
          <NotAvailable role={user.role} onOpenMenu={openMenu} />
        )}
      </main>
      <AiChatButton />
    </div>
  );
}

/** Rendered by the shell itself, outside the Outlet, so it takes the menu opener directly. */
function NotAvailable({ role, onOpenMenu }: { readonly role: UserRole; readonly onOpenMenu: () => void }) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar title="Not available" onOpenMenu={onOpenMenu} />
      <div className="p-4 md:p-6 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl glass-card rounded-xl p-8">
          <p className="text-sm text-muted-foreground">
            Your role ({USER_ROLE_LABELS[role]}) does not have access to this screen.
          </p>
        </div>
      </div>
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
