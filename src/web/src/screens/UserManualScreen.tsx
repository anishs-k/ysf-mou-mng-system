/**
 * Purpose: The User Manual - a "Contents" rail beside a scrolling pane holding the
 * guide's title card, all twelve sections and the footer. Clicking a contents item
 * marks it active and smooth-scrolls the pane to that section, as the design does.
 */

import { useState } from "react";

import { MANUAL_FOOTER, MANUAL_SCHEME_TAGS, MANUAL_SECTIONS, MANUAL_SUBTITLE, MANUAL_TITLE } from "../data/userManual.ts";
import { ScreenFrame } from "../ui/layout/AppShell.tsx";
import { ManualHero } from "./userManual/ManualHero.tsx";
import { ManualSection } from "./userManual/ManualSection.tsx";
import { ManualToc } from "./userManual/ManualToc.tsx";

export function UserManualScreen() {
  const [activeId, setActiveId] = useState(MANUAL_SECTIONS[0]?.id ?? "");

  const selectSection = (id: string) => {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <ScreenFrame title="User Manual" subtitle="Agreement Management System v2.0 · Reference Guide" contentClassName="flex">
      <ManualToc items={MANUAL_SECTIONS} activeId={activeId} onSelect={selectSection} />
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-3xl mx-auto space-y-10">
          <ManualHero title={MANUAL_TITLE} subtitle={MANUAL_SUBTITLE} tags={MANUAL_SCHEME_TAGS} />
          {MANUAL_SECTIONS.map((section) => (
            <ManualSection key={section.id} section={section} />
          ))}
          <div className="py-6 text-center text-xs text-muted-foreground border-t border-border">{MANUAL_FOOTER}</div>
        </div>
      </div>
    </ScreenFrame>
  );
}
