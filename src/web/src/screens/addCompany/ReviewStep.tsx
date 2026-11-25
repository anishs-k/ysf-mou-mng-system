/**
 * Purpose: Wizard step 4 - the read-only summary of what was actually entered:
 * company details, commercial terms (with each charge's frequency and basis and
 * the uploaded PDF's name) and the trainee categories - and the "Ready to save"
 * note. Codes are shown as the labels /api/enums serves. D158: no payroll item is
 * asked, so none is listed. SPEC-31's optional fields are listed when filled.
 */

import { ORGANISATION_LABELS } from "@mou/domain";
import {
  EDUCATION_FEE_PAYER_OPTIONS,
  INVOICE_MATCH_OPTIONS,
  MAIL_CONFIRMATION_OPTIONS,
  MOU_SIGN_STATUS_OPTIONS,
  computeEndDate,
} from "@mou/domain";

import type { EnumOption } from "../../api/client.ts";
import { formatCalendarDate } from "../../ui/format.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Badge, Card, SectionTitle } from "../../ui/primitives.tsx";
import type { WizardForm, WizardReference } from "./formState.ts";
import { OTHER_HEAD, isBlankChargeRow, namedCategories } from "./formState.ts";

interface ReviewItem {
  readonly label: string;
  readonly value: string;
}

function ReviewGrid({ items }: { readonly items: readonly ReviewItem[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-y-5 gap-x-6">
      {items.map((item) => (
        <div key={item.label}>
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-0.5 font-semibold">{item.label}</p>
          <p className="text-sm font-semibold text-foreground break-words">{item.value === "" ? "—" : item.value}</p>
        </div>
      ))}
    </div>
  );
}

function labelOf(options: readonly EnumOption[], value: string): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function rupees(amount: string): string {
  const value = Number(amount);
  return Number.isFinite(value) && amount.trim() !== "" ? `₹${value.toLocaleString("en-IN")}` : amount;
}

function ordinal(day: string): string {
  const n = Number(day);
  if (!Number.isInteger(n) || n <= 0) return day;
  const suffix = n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th";
  return `${n}${suffix} of every month`;
}

function safeEndDate(form: WizardForm): string {
  try {
    return formatCalendarDate(
      computeEndDate(form.commercial.mouStartDate, Number(form.commercial.tenureValue), "MONTHS"),
    );
  } catch {
    return "";
  }
}

export function ReviewStep({ form, reference }: { readonly form: WizardForm; readonly reference: WizardReference }) {
  const { company, commercial } = form;
  const { enums } = reference;
  const join = (...parts: readonly string[]) => parts.filter((part) => part.trim() !== "").join(" · ");

  const companyItems: ReviewItem[] = [
    { label: "Company Name", value: company.companyName },
    { label: "Company Type", value: labelOf(enums.companyTypes, company.companyType) },
    { label: "Registration", value: labelOf(enums.registrationTypes, company.registrationType) },
    { label: "GST Number", value: company.gstNumber },
    { label: "TAN Number", value: company.tanNumber },
    { label: "Zone", value: reference.zones.find((zone) => zone.id === company.zoneId)?.name ?? "" },
    { label: "Sector", value: labelOf(enums.sectors, company.sector) },
    { label: "Plant", value: company.plantName },
    {
      label: "Address",
      value: [company.addressLine1, company.addressLine2, company.city, company.district, company.state, company.pinCode]
        .filter((part) => part.trim() !== "")
        .join(", "),
    },
    // SPEC-31: required, first of the contacts as on the form.
    { label: "Zonal Manager", value: company.zonalManager.trim() },
    { label: "HR Contact", value: join(company.hrContactName, company.hrContactNumber, company.hrEmail) },
    { label: "Finance Head", value: join(company.financeHeadContactName, company.financeHeadContactNumber, company.financeEmail) },
  ];
  if (join(company.purchaseName, company.purchaseNumber, company.purchaseEmail) !== "") {
    companyItems.push({ label: "Purchase Contact", value: join(company.purchaseName, company.purchaseNumber, company.purchaseEmail) });
  }
  // SPEC-27: shown only when filled, like the Purchase contact.
  if (join(company.pocName, company.pocNumber) !== "") {
    companyItems.push({ label: "POC", value: join(company.pocName, company.pocNumber) });
  }
  if (join(company.decisionMakerName, company.decisionMakerNumber) !== "") {
    companyItems.push({ label: "Decision Maker", value: join(company.decisionMakerName, company.decisionMakerNumber) });
  }

  const commercialItems: ReviewItem[] = [
    { label: "Organisation", value: form.organisation === "" ? "" : ORGANISATION_LABELS[form.organisation] },
    { label: "Scheme", value: labelOf(enums.schemes, company.scheme) },
    { label: "MoU Start", value: formatCalendarDate(commercial.mouStartDate) },
    { label: "Tenure", value: `${commercial.tenureValue} Months` },
    { label: "MoU End", value: safeEndDate(form) },
    { label: "Attendance Cycle", value: commercial.attendanceCycle },
    { label: "Stipend Date", value: ordinal(commercial.stipendDate) },
    { label: "MoU PDF", value: commercial.mouDocument?.originalFilename ?? "" },
  ];
  // SPEC-31: the optional tracking fields, shown when filled.
  const tracking: readonly ReviewItem[] = [
    { label: "Sign Status", value: labelOf(MOU_SIGN_STATUS_OPTIONS, commercial.signStatus) },
    { label: "Mail Confirmation", value: labelOf(MAIL_CONFIRMATION_OPTIONS, commercial.mailConfirmation) },
    { label: "Payment Term", value: commercial.paymentTerm.trim() },
    { label: "Remark", value: commercial.remark.trim() },
    { label: "Match with Invoice", value: labelOf(INVOICE_MATCH_OPTIONS, commercial.invoiceMatch) },
    { label: "Invoice Remark", value: commercial.invoiceRemark.trim() },
  ];
  commercialItems.push(...tracking.filter((item) => item.value !== ""));

  const { payrollTerms } = form;
  const payrollItems: readonly ReviewItem[] = [
    {
      label: "Left Trainee Recovery",
      value: join(payrollTerms.leftTraineeAmount.trim() === "" ? "" : rupees(payrollTerms.leftTraineeAmount), payrollTerms.leftTraineeNote.trim()),
    },
    { label: "Education Fee Paid By", value: labelOf(EDUCATION_FEE_PAYER_OPTIONS, payrollTerms.educationFeePayer) },
  ].filter((item) => item.value !== "");

  const charges = form.charges
    .filter((row) => !isBlankChargeRow(row) && row.amount.trim() !== "")
    .map((row) =>
      row.head === OTHER_HEAD
        ? join(`${row.label}: ${rupees(row.amount)}`, labelOf(enums.itemTypes, row.itemType))
        : join(
            `${labelOf(enums.commercialItems.map((item) => ({ value: item.key, label: item.label })), row.head)}: ${rupees(row.amount)}`,
            labelOf(enums.commercialPeriods, row.period),
            labelOf(enums.commercialBases, row.basis),
          ),
    );

  const categories = namedCategories(form.categories)
    .map((card) => {
      const detail = join(card.qualification, card.stipendRate.trim() === "" ? "" : rupees(card.stipendRate));
      return detail === "" ? card.name : `${card.name} (${detail})`;
    })
    .join(" · ");

  return (
    <div className="space-y-5">
      <Card className="p-6">
        <SectionTitle>Review — Company Details</SectionTitle>
        <ReviewGrid items={companyItems} />
      </Card>
      <Card className="p-6">
        <SectionTitle>Review — Commercial Details</SectionTitle>
        <ReviewGrid items={commercialItems} />
        {charges.length > 0 && (
          <div className="mt-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 font-semibold">Charges</p>
            <div className="flex flex-wrap gap-2">
              {charges.map((charge) => (
                <Badge key={charge} text={charge} />
              ))}
            </div>
          </div>
        )}
      </Card>
      <Card className="p-6">
        <SectionTitle>Review — Payroll</SectionTitle>
        <p className="text-xs text-muted-foreground">Training Category: {categories}</p>
        {payrollItems.length > 0 && (
          <div className="mt-5">
            <ReviewGrid items={payrollItems} />
          </div>
        )}
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
            A unique MoU Code will be auto-generated when you save.
          </p>
        </div>
      </div>
    </div>
  );
}
