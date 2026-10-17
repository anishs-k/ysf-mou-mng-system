/**
 * Purpose: Renders one numbered section of the User Manual - the anchored heading
 * with its gradient rule, then each content block of the section in order.
 */

import type { ManualBlock, ManualSection as ManualSectionData } from "../../data/userManual.ts";
import { BRAND } from "../../ui/theme.ts";
import { FeatureGrid } from "./FeatureTile.tsx";
import { FaqList, FieldList, LanguageChips, ReportList, StepList, TermTable, Tip } from "./ManualBlocks.tsx";
import { SchemesTable } from "./SchemesTable.tsx";

function Block({ block }: { readonly block: ManualBlock }) {
  switch (block.kind) {
    case "lead":
      return <p className="text-sm text-muted-foreground leading-relaxed mb-4">{block.text}</p>;
    case "subheading":
      return (
        <h3 className="font-semibold text-sm mt-5 mb-2" style={{ color: BRAND.blue }}>
          {block.text}
        </h3>
      );
    case "note":
      return <p className={block.last === true ? "text-xs text-muted-foreground" : "text-xs text-muted-foreground mb-3"}>{block.text}</p>;
    case "features":
      return <FeatureGrid tiles={block.tiles} />;
    case "schemes":
      return <SchemesTable rows={block.rows} />;
    case "terms":
      return <TermTable look={block.look} rows={block.rows} />;
    case "fields":
      return <FieldList title={block.title} rows={block.rows} />;
    case "steps":
      return <StepList steps={block.steps} tight={block.tight} />;
    case "tip":
      return block.spaced === true ? (
        <div className="mt-3">
          <Tip tone={block.tone} text={block.text} />
        </div>
      ) : (
        <Tip tone={block.tone} text={block.text} />
      );
    case "reports":
      return <ReportList rows={block.rows} />;
    case "languages":
      return <LanguageChips title={block.title} languages={block.languages} />;
    case "faq":
      return <FaqList items={block.items} />;
  }
}

export function ManualSection({ section }: { readonly section: ManualSectionData }) {
  return (
    <section>
      <div id={section.id} className="mb-6">
        <h2 className="text-lg font-bold mb-1 scroll-mt-6" style={{ color: BRAND.navy }}>
          {section.title}
        </h2>
        <div className="h-0.5 rounded" style={{ background: `linear-gradient(to right, ${BRAND.blue}, transparent)` }} />
      </div>
      {section.blocks.map((block, index) => (
        <Block key={`${block.kind}-${index}`} block={block} />
      ))}
    </section>
  );
}
