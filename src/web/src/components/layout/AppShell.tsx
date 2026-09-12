/**
 * Purpose: SPEC-14's shared page chrome (D93) - a React Router layout route
 * wrapping every authenticated page in `Sidebar` + the routed page's own
 * content. Owns the desktop-collapse and mobile-drawer state `Sidebar`
 * needs; exposes `openMobileMenu` to routed pages via `useOutletContext()`
 * so each page's own `Topbar` call can wire its hamburger button without
 * prop-drilling through `App.tsx`'s route table.
 */

import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar.tsx";

export interface AppShellContext {
  readonly openMobileMenu: () => void;
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const context: AppShellContext = { openMobileMenu: () => setMobileOpen(true) };

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Outlet context={context} />
      </main>
    </div>
  );
}
