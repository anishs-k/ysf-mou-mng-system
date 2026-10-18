/**
 * Purpose: The option lists the GET /api/search filter bars share (Existing
 * Companies, Agreement History, Export) - zones as {id, name} from the cached
 * GET /api/zones, schemes from @mou/domain, and the four status filters the API
 * accepts - so every screen sends the same codes the API validates.
 */

import { SCHEME_OPTIONS } from "@mou/domain";
import { useEffect, useState } from "react";

import { fetchZones } from "../api/client.ts";
import type { SelectOption } from "../ui/form.tsx";

export const SCHEME_FILTER_OPTIONS: readonly SelectOption[] = SCHEME_OPTIONS;

/** EXPIRING is a filter only: an ACTIVE MoU ending within the next 90 days. */
export const STATUS_FILTER_OPTIONS: readonly SelectOption[] = [
  { value: "ACTIVE", label: "Active" },
  { value: "EXPIRING", label: "Expiring" },
  { value: "EXPIRED", label: "Expired" },
  { value: "NEW", label: "New" },
];

/** Zone ids with their names; empty until GET /api/zones answers (or if it fails). */
export function useZoneOptions(): readonly SelectOption[] {
  const [zones, setZones] = useState<readonly SelectOption[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchZones()
      .then((rows) => {
        if (!cancelled) setZones(rows.map((zone) => ({ value: zone.id, label: zone.name })));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return zones;
}
