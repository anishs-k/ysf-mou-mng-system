/**
 * Purpose: The persistent left navigation of the signed-in shell: brand block,
 * product strip, the ten destinations with an "Operation" section, and the
 * officer card with sign-out. It collapses to an icon rail on desktop and becomes
 * a slide-in drawer below the `lg` breakpoint.
 */

import { NavLink } from "react-router-dom";

import logo from "../../assets/logo-ysf.png";
import { CURRENT_OFFICER } from "../../data/dashboard.ts";
import { Icon } from "../Icon.tsx";
import type { IconName } from "../Icon.tsx";
import { BRAND } from "../theme.ts";

interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
  readonly iconClass: string;
  readonly strokeWidth?: number;
}

type NavEntry = NavItem | { readonly section: string };

const NAV_ENTRIES: readonly NavEntry[] = [
  { path: "/", label: "Dashboard", icon: "grid", iconClass: "w-5 h-5" },
  { path: "/companies/new", label: "Add New Company", icon: "plus", iconClass: "w-4 h-4", strokeWidth: 2.2 },
  { path: "/companies", label: "Existing Company", icon: "table", iconClass: "w-5 h-5" },
  { path: "/agreements/edit", label: "Edit Agreement", icon: "edit", iconClass: "w-4 h-4" },
  { path: "/upload-mou", label: "Upload MoU", icon: "upload", iconClass: "w-5 h-5" },
  { path: "/alerts", label: "MoU Expiry Alert", icon: "bell", iconClass: "w-5 h-5" },
  { path: "/agreements/history", label: "Agreement History", icon: "history", iconClass: "w-5 h-5" },
  { path: "/zones/overview", label: "Zone Dashboard", icon: "map", iconClass: "w-5 h-5" },
  { path: "/export", label: "Export", icon: "download", iconClass: "w-5 h-5" },
  { section: "Operation" },
  { path: "/user-manual", label: "User Manual", icon: "book", iconClass: "w-5 h-5" },
];

interface SidebarProps {
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly mobileOpen: boolean;
  readonly onMobileClose: () => void;
  readonly onSignOut: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onMobileClose, onSignOut }: SidebarProps) {
  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onMobileClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col glass-sidebar transition-all duration-300 lg:relative lg:z-auto lg:translate-x-0 ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}`}
        style={{ width: collapsed ? 64 : 236 }}
      >
        <div className="flex items-center h-[72px] px-3 border-b border-border shrink-0">
          {collapsed ? (
            <div className="flex-1 flex justify-center">
              <img src={logo} alt="YSF" className="w-10 h-10 object-contain" />
            </div>
          ) : (
            <>
              <img src={logo} alt="YSF" className="w-10 h-10 object-contain shrink-0" />
              <div className="flex-1 min-w-0 ml-2 overflow-hidden">
                <p className="font-bold text-sm leading-tight truncate" style={{ color: BRAND.navy }}>
                  YSF · SES
                </p>
                <p className="text-xs text-muted-foreground truncate">Branch Center</p>
              </div>
              <button
                type="button"
                onClick={onToggleCollapsed}
                title="Collapse menu"
                className="hidden lg:flex shrink-0 w-8 h-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-1"
              >
                <Icon name="panelCollapse" />
              </button>
              <button
                type="button"
                onClick={onMobileClose}
                title="Close menu"
                className="lg:hidden shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors ml-1"
              >
                <Icon name="panelCollapse" />
              </button>
            </>
          )}
        </div>

        {!collapsed && (
          <div className="px-4 py-2 border-b border-border shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND.orange }}>
              Agreement Management System
            </p>
            <p className="text-[10px] text-muted-foreground">NAPS · v2.0</p>
          </div>
        )}

        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          {NAV_ENTRIES.map((entry) =>
            "section" in entry ? (
              collapsed ? (
                <div key={entry.section} className="my-2 border-t border-border" />
              ) : (
                <div key={entry.section} className="mt-3 mb-1 px-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND.orange }}>
                    {entry.section}
                  </p>
                </div>
              )
            ) : (
              <NavLink
                key={entry.path}
                to={entry.path}
                end
                onClick={onMobileClose}
                title={collapsed ? entry.label : undefined}
                className={({ isActive }) =>
                  `w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-150 text-left ${isActive ? "text-white bg-[#1B5FAE]" : "text-[#5A7AA8] hover:bg-[#E8F0FB] hover:text-foreground"}`
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="shrink-0">
                      <Icon name={entry.icon} className={entry.iconClass} strokeWidth={entry.strokeWidth} />
                    </span>
                    {!collapsed && <span className="text-sm font-medium truncate">{entry.label}</span>}
                    {!collapsed && isActive && (
                      <span className="ml-auto">
                        <Icon name="chevronRight" className="w-4 h-4" strokeWidth={2} />
                      </span>
                    )}
                  </>
                )}
              </NavLink>
            ),
          )}
        </nav>

        {collapsed && (
          <div className="px-3 py-2 border-t border-border shrink-0 hidden lg:flex justify-center">
            <button
              type="button"
              onClick={onToggleCollapsed}
              title="Expand menu"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <Icon name="panelExpand" />
            </button>
          </div>
        )}

        <div className={`px-3 py-3 border-t border-border shrink-0 ${collapsed ? "flex justify-center" : ""}`}>
          {collapsed ? (
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: BRAND.orange }}
            >
              {CURRENT_OFFICER.initials}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: BRAND.orange }}
              >
                {CURRENT_OFFICER.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{CURRENT_OFFICER.name}</p>
                <p className="text-xs text-muted-foreground truncate">{CURRENT_OFFICER.role}</p>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                title="Sign out"
                className="text-muted-foreground hover:text-red-500 transition-colors"
              >
                <Icon name="logout" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
