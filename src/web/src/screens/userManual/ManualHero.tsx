/**
 * Purpose: The title card at the top of the User Manual - book icon, guide title,
 * version line and the row of supported-scheme tags.
 */

import { Icon } from "../../ui/Icon.tsx";
import { BRAND } from "../../ui/theme.ts";

interface ManualHeroProps {
  readonly title: string;
  readonly subtitle: string;
  readonly tags: readonly string[];
}

export function ManualHero({ title, subtitle, tags }: ManualHeroProps) {
  return (
    <div className="glass-card rounded-2xl p-6 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
      <div
        className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `linear-gradient(135deg, ${BRAND.blue}, ${BRAND.navy})` }}
      >
        <Icon name="book" />
      </div>
      <div>
        <h1 className="text-xl font-bold" style={{ color: BRAND.navy }}>
          {title}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        <div className="flex flex-wrap gap-2 mt-2">
          {tags.map((tag) => (
            <span key={tag} className="px-2 py-0.5 rounded text-xs font-bold text-white" style={{ background: BRAND.blue }}>
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
