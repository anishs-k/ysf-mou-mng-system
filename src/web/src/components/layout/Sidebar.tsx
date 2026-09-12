/**
 * Purpose: SPEC-14's persistent navigation shell (D93), ported from
 * `figma_code/src/App.tsx`'s `Sidebar`. Nav items come from
 * `visibleEntryPoints(user.role)` (D92) - the same list the Dashboard cards
 * and the route guards already read - plus a manual "Dashboard" entry at
 * the top (the Dashboard is `/`, not itself a `DASHBOARD_ENTRY_POINTS` row).
 * The logout button keeps the icon-only visual Figma uses but its
 * accessible name stays "Log out" (not Figma's "Sign out"), since
 * `dashboard.spec.ts`'s AC8 test already locates it that way.
 */

import { Link, useLocation, useNavigate } from "react-router-dom";
import logoYSF from "../../assets/logo-ysf.png";
import { useAuth } from "../../auth/AuthContext.tsx";
import { visibleEntryPoints } from "../../dashboard/entry-points.ts";
import { ENTRY_ICON, Icon } from "../icons.tsx";
import { brand } from "../ui.tsx";

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
  readonly mobileOpen: boolean;
  readonly onMobileClose: () => void;
}) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  if (user === null) {
    return null;
  }

  const entries = visibleEntryPoints(user.role).filter((entry) => entry.available);
  const initials = user.username.slice(0, 2).toUpperCase();

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={onMobileClose} />}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col glass-sidebar transition-all duration-300
          lg:relative lg:z-auto lg:translate-x-0
          ${mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"}
        `}
        style={{ width: collapsed ? 64 : 236 }}
      >
        <div className="flex items-center h-[72px] px-3 border-b border-border shrink-0">
          {collapsed ? (
            <div className="flex-1 flex justify-center">
              <img src={logoYSF} alt="YSF" className="w-10 h-10 object-contain" />
            </div>
          ) : (
            <>
              <img src={logoYSF} alt="YSF" className="w-10 h-10 object-contain shrink-0" />
              <div className="flex-1 min-w-0 ml-2 overflow-hidden">
                <p className="font-bold text-sm leading-tight truncate" style={{ color: brand.navy }}>
                  YSF · SES
                </p>
                <p className="text-xs text-muted-foreground truncate">Branch Center</p>
              </div>
              <button
                onClick={onToggle}
                title="Collapse menu"
                className="hidden lg:flex shrink-0 w-8 h-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors ml-1"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 3v18" />
                  <path d="M15 9l-3 3 3 3" />
                </svg>
              </button>
              <button
                onClick={onMobileClose}
                title="Close menu"
                className="lg:hidden shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors ml-1"
              >
                {Icon.x}
              </button>
            </>
          )}
        </div>

        {!collapsed && (
          <div className="px-4 py-2 border-b border-border shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: brand.orange }}>
              Agreement Management System
            </p>
            <p className="text-[10px] text-muted-foreground">NAPS · v2.0</p>
          </div>
        )}

        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          <Link
            to="/"
            onClick={onMobileClose}
            title={collapsed ? "Dashboard" : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-150 text-left ${
              location.pathname === "/" ? "text-white bg-[#1B5FAE]" : "text-[#5A7AA8] hover:bg-[#E8F0FB] hover:text-foreground"
            }`}
          >
            <span className="shrink-0">{Icon.grid}</span>
            {!collapsed && <span className="text-sm font-medium truncate">Dashboard</span>}
            {!collapsed && location.pathname === "/" && <span className="ml-auto">{Icon.chevR}</span>}
          </Link>
          {entries.map((entry) => {
            const active = location.pathname === entry.path;
            return (
              <Link
                key={entry.id}
                to={entry.path}
                onClick={onMobileClose}
                title={collapsed ? entry.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 transition-all duration-150 text-left ${
                  active ? "text-white bg-[#1B5FAE]" : "text-[#5A7AA8] hover:bg-[#E8F0FB] hover:text-foreground"
                }`}
              >
                <span className="shrink-0">{Icon[ENTRY_ICON[entry.id] ?? "file"]}</span>
                {!collapsed && <span className="text-sm font-medium truncate">{entry.label}</span>}
                {!collapsed && active && <span className="ml-auto">{Icon.chevR}</span>}
              </Link>
            );
          })}
        </nav>

        {collapsed && (
          <div className="px-3 py-2 border-t border-border shrink-0 hidden lg:flex justify-center">
            <button
              onClick={onToggle}
              title="Expand menu"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
                <path d="M12 9l3 3-3 3" />
              </svg>
            </button>
          </div>
        )}

        <div className={`px-3 py-3 border-t border-border shrink-0 ${collapsed ? "flex justify-center" : ""}`}>
          {collapsed ? (
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: brand.orange }}>
              {initials}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: brand.orange }}>
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{user.username}</p>
                <p className="text-xs text-muted-foreground truncate">{user.role}</p>
              </div>
              <button onClick={() => void handleLogout()} title="Log out" aria-label="Log out" className="text-muted-foreground hover:text-red-500 transition-colors">
                {Icon.logout}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
