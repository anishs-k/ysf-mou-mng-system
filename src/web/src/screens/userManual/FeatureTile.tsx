/**
 * Purpose: The two-column grid of emoji feature tiles in the manual's Overview
 * (Company Registry, MoU Lifecycle, ...).
 */

import type { FeatureTileData } from "../../data/userManual.ts";
import { BRAND } from "../../ui/theme.ts";

export function FeatureTile({ tile }: { readonly tile: FeatureTileData }) {
  return (
    <div className="glass-card rounded-xl p-4 flex gap-3">
      <span className="text-2xl shrink-0">{tile.emoji}</span>
      <div>
        <p className="text-xs font-bold" style={{ color: BRAND.navy }}>
          {tile.title}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{tile.text}</p>
      </div>
    </div>
  );
}

export function FeatureGrid({ tiles }: { readonly tiles: readonly FeatureTileData[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3 mb-4">
      {tiles.map((tile) => (
        <FeatureTile key={tile.title} tile={tile} />
      ))}
    </div>
  );
}
