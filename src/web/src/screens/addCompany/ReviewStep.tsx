/**
 * Purpose: Wizard step 4 - the read-only summary of company, commercial and payroll
 * details (the prototype's fixed sample registration) and the "Ready to save" note.
 */

import {
  REVIEW_COMMERCIAL,
  REVIEW_COMPANY,
  REVIEW_PAYROLL_TAGS,
  REVIEW_TRAINING_CATEGORIES,
} from "../../data/addCompanyOptions.ts";
import type { ReviewItem } from "../../data/addCompanyOptions.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Badge, Card, SectionTitle } from "../../ui/primitives.tsx";

function ReviewGrid({ items }: { readonly items: readonly ReviewItem[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-6">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5 font-semibold">{item.label}</p>
          <p className="text-sm font-semibold text-foreground">{item.value}</p>
        </div>
      ))}
    </div>
  );
}

export function ReviewStep() {
  return (
    <div className="space-y-5">
      <Card className="p-6">
        <SectionTitle>Review — Company Details</SectionTitle>
        <ReviewGrid items={REVIEW_COMPANY} />
      </Card>
      <Card className="p-6">
        <SectionTitle>Review — Commercial Details</SectionTitle>
        <ReviewGrid items={REVIEW_COMMERCIAL} />
      </Card>
      <Card className="p-6">
        <SectionTitle>Review — Payroll</SectionTitle>
        <div className="flex flex-wrap gap-2 mb-3">
          {REVIEW_PAYROLL_TAGS.map((tag) => (
            <Badge key={tag.text} text={tag.text} tone={tag.tone} />
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Training Category: {REVIEW_TRAINING_CATEGORIES}</p>
      </Card>
      <div className="rounded-xl p-4 flex items-start gap-3 border" style={{ background: "#E8F0FB", borderColor: "#CDDAEE" }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: "#1B5FAE" }}>
          <Icon name="check" className="w-4 h-4" strokeWidth={2.5} />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: "#0D2E5A" }}>
            Ready to save
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            A unique MoU Code will be auto-generated. Download the summary PDF after saving.
          </p>
        </div>
      </div>
    </div>
  );
}
