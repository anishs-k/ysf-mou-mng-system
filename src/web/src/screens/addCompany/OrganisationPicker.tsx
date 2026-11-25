/**
 * Purpose: SPEC-34's first question on Add New Company - is the company added for
 * YSF (Yuvashakti Foundation) or YSI (Yuvashakti Skill India)? Nothing else of the
 * wizard shows until one is chosen, since it decides the schemes offered and the
 * YSI-only fees. OrganisationBadge then shows the choice with a Change button.
 */

import { ORGANISATION_LABELS, ORGANISATION_SCHEMES, ORGANISATIONS, SCHEME_LABELS } from "@mou/domain";
import type { Organisation } from "@mou/domain";

import { Card, SectionTitle } from "../../ui/primitives.tsx";
import { BRAND } from "../../ui/theme.ts";

const CHOICE_CLASS =
  "flex-1 text-left rounded-xl border-2 border-border p-5 transition-all hover:border-[#1B5FAE] hover:bg-[#E8F0FB] focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer";

function schemesOf(organisation: Organisation): string {
  return ORGANISATION_SCHEMES[organisation].map((scheme) => SCHEME_LABELS[scheme]).join(", ");
}

export function OrganisationPicker({ onPick }: { readonly onPick: (organisation: Organisation) => void }) {
  return (
    <Card className="p-6">
      <SectionTitle>Who is this company being added for?</SectionTitle>
      <p className="text-sm text-muted-foreground mb-4">The schemes and fees you fill next depend on this choice.</p>
      <div className="flex flex-col sm:flex-row gap-4">
        {ORGANISATIONS.map((organisation) => (
          <button key={organisation} type="button" className={CHOICE_CLASS} onClick={() => onPick(organisation)}>
            <p className="text-2xl font-bold" style={{ color: BRAND.navy }}>
              {organisation}
            </p>
            <p className="text-sm font-semibold text-foreground">{ORGANISATION_LABELS[organisation].split(" - ")[1]}</p>
            <p className="text-xs text-muted-foreground mt-2">Schemes: {schemesOf(organisation)}</p>
          </button>
        ))}
      </div>
    </Card>
  );
}

export function OrganisationBadge({
  organisation,
  onChange,
  disabled,
}: {
  readonly organisation: Organisation;
  readonly onChange: () => void;
  readonly disabled: boolean;
}) {
  return (
    <div className="flex items-center gap-3 mb-4 rounded-lg border border-border bg-white px-4 py-2.5">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adding for</span>
      <span className="px-2 py-0.5 rounded text-sm font-bold text-white" style={{ background: BRAND.navy }}>
        {organisation}
      </span>
      <span className="text-sm text-foreground">{ORGANISATION_LABELS[organisation].split(" - ")[1]}</span>
      <button
        type="button"
        onClick={onChange}
        disabled={disabled}
        className="ml-auto text-xs font-semibold text-[#1B5FAE] hover:underline disabled:opacity-50"
      >
        Change
      </button>
    </div>
  );
}
