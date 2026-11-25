/**
 * Purpose: The persistent left navigation of the signed-in shell: brand block,
 * product strip, the destinations the signed-in role may open (ui/access.ts) with
 * an "Operation" section, and the card of the API session's user with sign-out.
 * SPEC-33: User Management is a group - clicking it opens Users and Roles &
 * Permissions beneath it (a super admin only); it stays open on those screens.
 * It collapses to an icon rail on desktop and becomes a slide-in drawer below the
 * `lg` breakpoint.
 */

import { USER_ROLE_LABELS } from "@mou/domain";
import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import logo from "../../assets/logo-ysf.png";
import { ROLE_PERMISSIONS_PATH, USER_MANAGEMENT_PATH, canOpenPath } from "../access.ts";
import { Icon } from "../Icon.tsx";
import type { IconName } from "../Icon.tsx";
import { useSession } from "../session.ts";
import { BRAND } from "../theme.ts";

interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly icon: IconName;
  readonly iconClass: string;
  readonly strokeWidth?: number;
}

/** SPEC-33: a heading that shows its children only once clicked. */
interface NavGroup {
  readonly group: string;
  readonly icon: IconName;
  readonly iconClass: string;
  readonly children: readonly NavItem[];
}

type NavEntry = NavItem | NavGroup | { readonly section: string };

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
  {
    group: "User Management",
    icon: "user",
    iconClass: "w-5 h-5",
    children: [
      { path: USER_MANAGEMENT_PATH, label: "Users", icon: "user", iconClass: "w-4 h-4" },
      { path: ROLE_PERMISSIONS_PATH, label: "Roles & Permissions", icon: "lock", iconClass: "w-4 h-4" },
    ],
  },
];

const LINK_CLASS = "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-150 text-left";
const IDLE_CLASS = "text-[#5A7AA8] hover:bg-[#E8F0FB] hover:text-foreground";

/** "e2e-admin" -> "EA", "admin" -> "AD": the first letters of up to two name parts. */
function initialsOf(username: string): string {
  const parts = username.split(/[^A-Za-z0-9]+/).filter((part) => part !== "");
  const letters = parts.length > 1 ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}` : username.slice(0, 2);
  return letters.toUpperCase();
}

interface SidebarProps {
  readonly collapsed: boolean;
  readonly onToggleCollapsed: () => void;
  readonly mobileOpen: boolean;
  readonly onMobileClose: () => void;
  readonly onSignOut: () => void;
}

export function Sidebar({ collapsed, onToggleCollapsed, mobileOpen, onMobileClose, onSignOut }: SidebarProps) {
  const { user } = useSession();
  const username = user?.username ?? "";
  const initials = initialsOf(username);
  const roleLabel = user === null ? "" : USER_ROLE_LABELS[user.role];
  const { pathname } = useLocation();
  const [groupOpen, setGroupOpen] = useState(false);
  const entries = NAV_ENTRIES.flatMap((entry): NavEntry[] => {
    if ("section" in entry) return [entry];
    if (user === null) return [];
    if ("group" in entry) {
      const children = entry.children.filter((child) => canOpenPath(user, child.path));
      return children.length === 0 ? [] : [{ ...entry, children }];
    }
    return canOpenPath(user, entry.path) ? [entry] : [];
  });

  const navLink = (entry: NavItem, nested = false) => (
    <NavLink
      key={entry.path}
      to={entry.path}
      end
      onClick={onMobileClose}
      title={collapsed ? entry.label : undefined}
      className={({ isActive }) =>
        `${LINK_CLASS} ${nested && !collapsed ? "pl-9" : ""} ${isActive ? "text-white bg-[#1B5FAE]" : IDLE_CLASS}`
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
  );
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
          {entries.map((entry) =>
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
            ) : "group" in entry ? (
              <div key={entry.group}>
                {(() => {
                  // Open while on one of its screens, or once clicked.
                  const open = groupOpen || entry.children.some((child) => child.path === pathname);
                  return (
                    <>
                      <button
                        type="button"
                        onClick={() => setGroupOpen(!open)}
                        aria-expanded={open}
                        title={collapsed ? entry.group : undefined}
                        className={`${LINK_CLASS} ${IDLE_CLASS}`}
                      >
                        <span className="shrink-0">
                          <Icon name={entry.icon} className={entry.iconClass} />
                        </span>
                        {!collapsed && <span className="text-sm font-medium truncate">{entry.group}</span>}
                        {!collapsed && (
                          <span className="ml-auto">
                            <Icon name={open ? "chevronDown" : "chevronRight"} className="w-4 h-4" strokeWidth={2} />
                          </span>
                        )}
                      </button>
                      {open && entry.children.map((child) => navLink(child, true))}
                    </>
                  );
                })()}
              </div>
            ) : (
              navLink(entry)
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
              {initials}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                style={{ background: BRAND.orange }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{username}</p>
                <p className="text-xs text-muted-foreground truncate">{roleLabel}</p>
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
