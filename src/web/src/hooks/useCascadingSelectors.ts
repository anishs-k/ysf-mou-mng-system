/**
 * Purpose: The Zone -> Company -> Plant -> Scheme(MOU) cascade that
 * UploadMouPage, EditAgreementPage, AgreementHistoryPage and ExportPdfPage
 * each hand-rolled independently (ADR D53 flagged this as worth revisiting
 * "if SPEC-10 needs the identical shape a third time" - it has now been
 * needed a sixth time). Every level clears everything beneath it and is
 * disabled until its predecessor has a value, and a level that resolves to
 * exactly one match auto-selects it - the same rule each page already
 * implemented by hand.
 *
 * Deliberately state-only: it returns values and change handlers, never JSX,
 * so every page keeps its own <select>/<label> markup, ids and htmlFor
 * pairing untouched - the Playwright suite locates these controls by label
 * text across six spec files, and none of those locators may move.
 *
 * ExistingCompanyPage is NOT wired to this hook: its cascade genuinely
 * diverges (plants arrive embedded in the company-overview response rather
 * than a separate fetch, and its MOU list loads on an explicit "Next" click
 * rather than automatically), so forcing it into this shape would risk
 * changing its behaviour rather than only deduplicating code.
 */

import { useEffect, useState } from "react";

import type {
  CompanyListItem,
  CompanyMouOption,
  CompanyPlantOption,
  ZoneOption,
} from "../api/client.ts";
import {
  fetchCompanyMous,
  fetchCompanyPlants,
  fetchZoneCompanies,
  fetchZones,
} from "../api/client.ts";

export interface UseCascadingSelectorsOptions {
  /** Called with a human-readable message whenever a fetch at any level
   * fails, mirroring each page's own existing `e instanceof Error ? e.message
   * : "Failed to load ..."` pattern. Omit to ignore a level's failures
   * entirely (ExportPdfPage's zone fetch has always failed silently). */
  readonly onError?: (message: string) => void;
  /** Whether a zone-fetch failure is reported via onError. Defaults to true;
   * ExportPdfPage sets this to false to preserve its existing silent
   * `.catch(() => undefined)` behaviour. */
  readonly notifyOnZoneError?: boolean;
  /** Fired only when the plant-level fetch resolves to exactly one MOU and
   * the hook auto-selects it - never on an explicit user selection. Lets a
   * page load MOU-scoped data the moment the cascade auto-resolves
   * (UploadMouPage's document list), matching what each page already did by
   * hand inside its own handlePlantChange. */
  readonly onAutoSelectMou?: (mouId: string) => void;
  /** Seeds the MOU selection once, e.g. from a `?mouId=` deep link, without
   * the page needing a second piece of state alongside this hook's own. */
  readonly initialMouId?: string;
}

/** A known position in the cascade, e.g. from a `?mouId=` deep link; inner levels are optional. */
export interface CascadeSelection {
  readonly zoneId: string;
  readonly companyId?: string;
  /** Omitted for an MOU recorded against no plant; its MOU list is then the company's. */
  readonly plantId?: string;
  readonly mouId?: string;
}

export interface UseCascadingSelectorsResult {
  readonly zones: readonly ZoneOption[];
  readonly zoneId: string;
  readonly companies: readonly CompanyListItem[];
  readonly companyId: string;
  readonly plants: readonly CompanyPlantOption[];
  readonly plantId: string;
  /** A plain setter for a page that has no fourth (scheme) level at all -
   * ExportPdfPage's Plant <select> stops the cascade there and has never
   * fetched an MOU list, so routing it through handlePlantChange would add a
   * network call the page never needed. */
  readonly setPlantId: (plantId: string) => void;
  readonly mous: readonly CompanyMouOption[];
  readonly mouId: string;
  /** A plain setter, not a handler - selecting a scheme needs no further
   * fetch of its own, exactly as every page's own scheme <select> already
   * assumed. */
  readonly setMouId: (mouId: string) => void;
  readonly handleZoneChange: (zoneId: string) => Promise<void>;
  readonly handleCompanyChange: (companyId: string) => Promise<void>;
  /** Fetches the MOU/scheme list for a plant. Only call this for a page that
   * has a fourth cascade level; a page whose cascade stops at Plant should
   * use setPlantId instead. */
  readonly handlePlantChange: (plantId: string) => Promise<void>;
  /** Clears every level back to its initial empty state, for a page like
   * EditAgreementPage that offers a "start another" action returning to
   * step "select" without a full remount. */
  readonly reset: () => void;
  /** Walks the cascade to `selection` in one go, fetching each level's options.
   * The per-level handlers cannot be chained for this, because each reads the
   * level above from state that has not re-rendered yet. */
  readonly preselect: (selection: CascadeSelection) => Promise<void>;
}

export function useCascadingSelectors(
  options: UseCascadingSelectorsOptions = {},
): UseCascadingSelectorsResult {
  const {
    onError,
    notifyOnZoneError = true,
    onAutoSelectMou,
    initialMouId,
  } = options;

  const [zones, setZones] = useState<readonly ZoneOption[]>([]);
  const [zoneId, setZoneId] = useState("");
  const [companies, setCompanies] = useState<readonly CompanyListItem[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [plants, setPlants] = useState<readonly CompanyPlantOption[]>([]);
  const [plantId, setPlantId] = useState("");
  const [mous, setMous] = useState<readonly CompanyMouOption[]>([]);
  const [mouId, setMouId] = useState(initialMouId ?? "");

  useEffect(() => {
    fetchZones()
      .then(setZones)
      .catch((e: unknown) => {
        if (notifyOnZoneError) {
          onError?.(e instanceof Error ? e.message : "Failed to load zones");
        }
      });
    // Runs once on mount, same as every page's own former zone-loading effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleZoneChange(nextZoneId: string): Promise<void> {
    setZoneId(nextZoneId);
    setCompanyId("");
    setPlants([]);
    setPlantId("");
    setMous([]);
    setMouId("");
    setCompanies([]);
    if (nextZoneId === "") {
      return;
    }
    try {
      setCompanies(await fetchZoneCompanies(nextZoneId));
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Failed to load companies");
    }
  }

  async function handleCompanyChange(nextCompanyId: string): Promise<void> {
    setCompanyId(nextCompanyId);
    setPlantId("");
    setMous([]);
    setMouId("");
    setPlants([]);
    if (nextCompanyId === "") {
      return;
    }
    try {
      setPlants(await fetchCompanyPlants(nextCompanyId));
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Failed to load plants");
    }
  }

  async function handlePlantChange(nextPlantId: string): Promise<void> {
    setPlantId(nextPlantId);
    setMous([]);
    setMouId("");
    if (nextPlantId === "" || companyId === "") {
      return;
    }
    try {
      const list = await fetchCompanyMous(companyId, nextPlantId);
      setMous(list);
      const only = list.length === 1 ? list[0] : undefined;
      if (only !== undefined) {
        setMouId(only.mouId);
        onAutoSelectMou?.(only.mouId);
      }
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Failed to load schemes");
    }
  }

  async function preselect(selection: CascadeSelection): Promise<void> {
    reset();
    setZoneId(selection.zoneId);
    try {
      setCompanies(await fetchZoneCompanies(selection.zoneId));
      if (selection.companyId === undefined) return;
      setCompanyId(selection.companyId);
      setPlants(await fetchCompanyPlants(selection.companyId));
      if (selection.plantId === undefined && selection.mouId === undefined) return;
      setPlantId(selection.plantId ?? "");
      const list = await fetchCompanyMous(selection.companyId, selection.plantId);
      setMous(list);
      const only = list.length === 1 ? list[0] : undefined;
      setMouId(selection.mouId ?? only?.mouId ?? "");
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Failed to load the selection");
    }
  }

  function reset(): void {
    setZoneId("");
    setCompanies([]);
    setCompanyId("");
    setPlants([]);
    setPlantId("");
    setMous([]);
    setMouId("");
  }

  return {
    zones,
    zoneId,
    companies,
    companyId,
    plants,
    plantId,
    setPlantId,
    mous,
    mouId,
    setMouId,
    handleZoneChange,
    handleCompanyChange,
    handlePlantChange,
    reset,
    preselect,
  };
}
