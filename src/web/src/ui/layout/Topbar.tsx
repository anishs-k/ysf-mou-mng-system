/**
 * Purpose: The glass header at the top of every signed-in screen: the screen's
 * title and subtitle, the mobile menu button, a search box and the notification
 * bell, which opens the alerts screen and shows its dot only while
 * GET /api/alerts/count reports MoUs nearing expiry.
 */

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { fetchAlertsCount } from "../../api/client.ts";
import { Icon } from "../Icon.tsx";
import { BRAND } from "../theme.ts";

interface TopbarProps {
  readonly title: string;
  readonly subtitle?: string;
  readonly onOpenMenu: () => void;
}

export function Topbar({ title, subtitle, onOpenMenu }: TopbarProps) {
  const navigate = useNavigate();
  const [alertCount, setAlertCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchAlertsCount()
      .then((count) => {
        if (!cancelled) setAlertCount(count);
      })
      // No count means no dot; the bell itself still works.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <header
      className="flex items-center justify-between px-4 md:px-6 glass-topbar shrink-0 gap-3"
      style={{ minHeight: 64 }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMenu}
          className="lg:hidden shrink-0 w-9 h-9 flex items-center justify-center text-muted-foreground hover:bg-muted rounded-lg transition-colors"
        >
          <Icon name="menu" strokeWidth={2} />
        </button>
        <div className="min-w-0">
          <h1 className="font-bold text-sm md:text-base leading-tight truncate" style={{ color: BRAND.navy }}>
            {title}
          </h1>
          {subtitle !== undefined && <p className="text-xs text-muted-foreground hidden sm:block truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <div className="relative hidden sm:block">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <Icon name="search" className="w-4 h-4" />
          </span>
          <input
            type="text"
            placeholder="Search…"
            className="w-36 md:w-56 h-9 pl-9 pr-3 border border-border rounded-lg text-sm bg-muted placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:bg-white focus:w-48 md:focus:w-64 transition-all"
          />
        </div>
        <button
          type="button"
          aria-label="Expiry alerts"
          title="Expiry alerts"
          onClick={() => navigate("/alerts")}
          className="relative w-9 h-9 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-all"
        >
          <Icon name="bell" />
          {alertCount > 0 && (
            <span
              data-testid="alerts-dot"
              className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full border border-white"
              style={{ background: BRAND.orange }}
            />
          )}
        </button>
      </div>
    </header>
  );
}
