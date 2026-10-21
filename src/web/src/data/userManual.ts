/**
 * Purpose: The User Manual's content - the twelve sections of the AMS reference
 * guide, each an ordered list of typed blocks (paragraphs, step lists, field
 * tables, tips, FAQ cards...) that the User Manual screen renders verbatim.
 */

export const MANUAL_TITLE = "YSF Agreement Management System";
export const MANUAL_SUBTITLE = "Complete User Reference Guide · Version 2.0";
export const MANUAL_SCHEME_TAGS: readonly string[] = ["NAPS", "NATS", "WILP", "BVoc", "DVoc", "FLEXI", "MSBTE"];
export const MANUAL_FOOTER = "AMS v2.0 · Yuvashakti Foundation · For support contact your system administrator.";

export interface FeatureTileData {
  readonly emoji: string;
  readonly title: string;
  readonly text: string;
}

export interface SchemeRow {
  readonly code: string;
  readonly name: string;
  readonly body: string;
}

export interface TermRow {
  readonly term: string;
  readonly text: string;
  /** Overrides the default navy colour of the term (expiry bands use their alert colour). */
  readonly color?: string;
}

export interface ReportRow {
  readonly name: string;
  readonly format: string;
  readonly text: string;
}

export interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

/** Layout variants of the striped term/description table, as they differ per section. */
export type TermTableLook = "kpi" | "tabs" | "expiry";

export type ManualBlock =
  | { readonly kind: "lead"; readonly text: string }
  | { readonly kind: "subheading"; readonly text: string }
  | { readonly kind: "note"; readonly text: string; readonly last?: boolean }
  | { readonly kind: "features"; readonly tiles: readonly FeatureTileData[] }
  | { readonly kind: "schemes"; readonly rows: readonly SchemeRow[] }
  | { readonly kind: "terms"; readonly look: TermTableLook; readonly rows: readonly TermRow[] }
  | { readonly kind: "fields"; readonly title?: string; readonly rows: readonly TermRow[] }
  | { readonly kind: "steps"; readonly steps: readonly string[]; readonly tight?: boolean }
  | { readonly kind: "tip"; readonly tone: "info" | "warning"; readonly text: string; readonly spaced?: boolean }
  | { readonly kind: "reports"; readonly rows: readonly ReportRow[] }
  | { readonly kind: "languages"; readonly title: string; readonly languages: readonly string[] }
  | { readonly kind: "faq"; readonly items: readonly FaqItem[] };

export interface ManualSection {
  /** DOM id of the section heading, the target the contents list scrolls to. */
  readonly id: string;
  readonly title: string;
  readonly blocks: readonly ManualBlock[];
}

export const MANUAL_SECTIONS: readonly ManualSection[] = [
  {
    id: "manual-overview",
    title: "1. Overview",
    blocks: [
      {
        kind: "lead",
        text: "The YSF Agreement Management System (AMS) is a unified digital platform that manages MoU-based apprenticeship and skilling agreements between Yuvashakti Foundation and partner companies. AMS covers the full agreement lifecycle — from company onboarding to MoU creation, monitoring, and expiry management across all government schemes.",
      },
      {
        kind: "features",
        tiles: [
          { emoji: "🏢", title: "Company Registry", text: "Register and manage company profiles, contacts, and agreement details." },
          { emoji: "📄", title: "MoU Lifecycle", text: "Create, edit, upload, and track MoU documents from draft to expiry." },
          { emoji: "🔔", title: "Expiry Alerts", text: "Automated alerts for agreements expiring within 30, 60, or 90 days." },
          { emoji: "📊", title: "Analytics & Export", text: "Zone dashboards, agreement history, and Excel/ZIP report exports." },
        ],
      },
      { kind: "subheading", text: "Supported Schemes" },
      {
        kind: "schemes",
        rows: [
          { code: "NAPS", name: "National Apprenticeship Promotion Scheme", body: "MSDE/DGT" },
          { code: "NATS", name: "National Apprenticeship Training Scheme", body: "BOAT/BOPT" },
          { code: "WILP", name: "Work Integrated Learning Programme", body: "BITS Pilani" },
          { code: "BVoc", name: "Bachelor of Vocation (B.Voc)", body: "UGC" },
          { code: "DVoc", name: "Diploma of Vocation (D.Voc)", body: "AICTE" },
          { code: "FLEXI", name: "Flexi MoU Apprenticeship", body: "State Board" },
          { code: "MSBTE", name: "Maharashtra State Board Technical Education", body: "MSBTE" },
        ],
      },
    ],
  },
  {
    id: "manual-dashboard",
    title: "2. Dashboard",
    blocks: [
      {
        kind: "lead",
        text: "The Dashboard is your command center. It shows real-time KPIs, a live activity timeline, scheme distribution, and quick-action shortcuts.",
      },
      { kind: "subheading", text: "KPI Tiles" },
      {
        kind: "terms",
        look: "kpi",
        rows: [
          { term: "Total MoUs", text: "Total number of company agreements across all zones and schemes." },
          { term: "Active", text: "Agreements currently in force (expiry date is more than 30 days away)." },
          { term: "Expiring Soon", text: "Agreements expiring within the next 30 days — action recommended." },
          { term: "Expired", text: "Agreements past their expiry date — require renewal or closure." },
          { term: "Pending Review", text: "Agreements awaiting final sign-off from the compliance team." },
        ],
      },
      { kind: "tip", tone: "info", text: "Click any KPI tile to jump to the filtered list of companies matching that status." },
    ],
  },
  {
    id: "manual-add-company",
    title: "3. Add New Company",
    blocks: [
      {
        kind: "lead",
        text: "Registering a new company creates a complete MoU profile across four steps: Basic Information, Commercial Details, Payroll / Trainee Categories, and Review & Save.",
      },
      { kind: "subheading", text: "Step 1 — Basic Information" },
      {
        kind: "steps",
        steps: [
          "Select Scheme (NAPS, NATS, WILP, etc.) — an info panel with scheme guidelines, eligibility, duration, and stipend details appears automatically.",
          "Select Zone — the company and plant dropdowns will filter to companies in that zone.",
          "Select Sector and fill Company Name, Company Type, Plant/Location, Registration Type.",
          "Enter GST Number (15-digit alphanumeric) and TAN Number.",
        ],
      },
      {
        kind: "fields",
        title: "Basic Information Fields",
        rows: [
          { term: "Scheme", text: "Government scheme under which the MoU is registered. Selecting a scheme reveals eligibility guidelines." },
          { term: "Zone", text: "Geographic zone (e.g. Nashik, Pune, NCR Noida). Determines company and plant dropdown options." },
          { term: "Sector", text: "Industry sector (Automobile, Pharma, IT, etc.)." },
          { term: "Company Name", text: "Registered legal name of the partner company." },
          { term: "Company Type", text: "Private Limited / Public Limited / LLP / Partnership / Proprietorship / Government." },
          { term: "Plant / Location", text: "Specific plant or facility within the company." },
          { term: "Registration Type", text: "Type of registration — New, Renewal, or Amendment." },
          { term: "GST Number", text: "15-character GST Identification Number of the company." },
          { term: "TAN Number", text: "10-character Tax Deduction and Collection Account Number." },
        ],
      },
      { kind: "subheading", text: "Step 1 — Registered Address" },
      {
        kind: "note",
        text: "Fill street address, city, state, pincode, and country. The address is stored with the MoU for legal and correspondence purposes.",
      },
      { kind: "subheading", text: "Step 1 — Contact Information" },
      {
        kind: "fields",
        rows: [
          { term: "HR Contact", text: "Name, contact number (mobile, or landline with STD code) and email ID of the HR contact." },
          { term: "Finance Head", text: "Name, contact number and email ID of the Finance Head." },
          { term: "Purchase Contact", text: "Optional name, number and email ID for purchase order correspondence." },
          { term: "Confirm Email", text: "Each email ID is typed twice; the two must match." },
        ],
      },
      { kind: "subheading", text: "Step 2 — Commercial Details" },
      {
        kind: "steps",
        steps: [
          "Set MoU Start Date and MoU End Date using the date pickers.",
          "Enter Admin Charges (can add multiple charge types using the + button).",
          "Upload any supporting documents (PDF / JPG / PNG, max 5 MB each).",
        ],
      },
      { kind: "subheading", text: "Step 3 — Payroll / Trainee Categories" },
      {
        kind: "note",
        text: "Define one or more trainee categories. PF (12%), ESI (0.75%) and TDS (As applicable) are applied automatically and can be changed later in Edit Agreement.",
      },
      {
        kind: "steps",
        steps: [
          "Click 'Add New Category'. Enter the Trainee Category (e.g. Diploma Trainee), Qualification and Stipend Rate.",
          "Repeat for additional categories by clicking 'Add New Category' again.",
        ],
      },
      {
        kind: "tip",
        tone: "warning",
        spaced: true,
        text: "At least one trainee category must be configured before saving the agreement.",
      },
      { kind: "subheading", text: "Step 4 — Review & Save" },
      {
        kind: "note",
        last: true,
        text: "Review all entered information in a summary view. Click Save & Submit to create the MoU record. You will be shown a success confirmation with the generated MoU code.",
      },
    ],
  },
  {
    id: "manual-existing",
    title: "4. Existing Companies",
    blocks: [
      { kind: "lead", text: "Browse, search, and inspect all registered company agreements." },
      {
        kind: "steps",
        steps: [
          "Use the Search box to find companies by name or MoU code.",
          "Filter by Zone and Status (Active / Expiring / Expired / Pending) using the dropdowns.",
          "Click any row to open the full Company Profile.",
        ],
      },
      { kind: "subheading", text: "Company Profile Tabs" },
      {
        kind: "terms",
        look: "tabs",
        rows: [
          { term: "Overview", text: "MoU code, zone, plant, scheme, status badge, and expiry date at a glance." },
          { term: "Commercial", text: "MoU start/end dates, admin charges, and uploaded supporting documents." },
          { term: "Payroll", text: "Trainee categories with their stipend rates, and the PF, ESI and TDS settings." },
          { term: "History", text: "Amendment history and change log for the agreement." },
          { term: "Documents", text: "Uploaded MoU PDFs and attachment files." },
        ],
      },
    ],
  },
  {
    id: "manual-edit-agreement",
    title: "5. Edit Agreement",
    blocks: [
      { kind: "lead", text: "Amend existing MoU details while maintaining a complete audit trail of all changes." },
      {
        kind: "steps",
        steps: [
          "Select Zone → Company → Plant → Scheme using the four dropdowns, then click OK.",
          "Choose a Reason for Amendment (e.g. Renewal, Address Change, Stipend Revision).",
          "Upload proof document if required for the amendment type.",
          "Edit any fields — all changes are tracked automatically.",
          "Click Save & Submit to apply the amendment.",
        ],
      },
      {
        kind: "tip",
        tone: "warning",
        text: "Navigating away with unsaved changes will trigger an 'Unsaved Changes' warning. Confirm to discard or return to save.",
      },
    ],
  },
  {
    id: "manual-upload-mou",
    title: "6. Upload MoU PDF",
    blocks: [
      { kind: "lead", text: "Attach signed MoU PDF documents to an existing company record." },
      {
        kind: "steps",
        steps: [
          "Select Zone, Company, Plant, and Scheme to identify the target agreement.",
          "Drag and drop your PDF file into the upload area, or click Browse to select it.",
          "The file name, size, and a preview panel will appear. Confirm the correct document.",
          "Click Save & Upload. A success confirmation with upload timestamp will be shown.",
        ],
      },
      {
        kind: "tip",
        tone: "info",
        text: "Accepted formats: PDF only. Maximum file size: 25 MB. File name should include company name and date for easy identification.",
      },
    ],
  },
  {
    id: "manual-expiry-alert",
    title: "7. MoU Expiry Alerts",
    blocks: [
      { kind: "lead", text: "Monitor agreements approaching expiry so renewals can be initiated on time." },
      {
        kind: "terms",
        look: "expiry",
        rows: [
          { term: "Critical (≤ 30 days)", color: "#EF4444", text: "Immediate action required. Send renewal notice and prepare new MoU." },
          { term: "Warning (31 – 60 days)", color: "#F59E0B", text: "Begin internal approval process. Reach out to company HR." },
          { term: "Notice (61 – 90 days)", color: "#3B82F6", text: "Plan and schedule the renewal discussion." },
        ],
      },
      {
        kind: "tip",
        tone: "info",
        text: "Use the Filter bar to narrow alerts by zone or scheme. Click any alert row to open the company profile and initiate a renewal.",
      },
    ],
  },
  {
    id: "manual-history",
    title: "8. Agreement History",
    blocks: [
      {
        kind: "lead",
        text: "A complete chronological log of all MoU events — creation, amendments, renewals, uploads, and status changes.",
      },
      {
        kind: "steps",
        steps: [
          "Filter the history list by Zone, Scheme, or date range.",
          "Each row shows: Company, Zone, Action type, Changed fields, Changed by (user), and Timestamp.",
          "Click any row to expand and view the full diff of what changed.",
        ],
      },
      {
        kind: "tip",
        tone: "info",
        text: "History records are immutable — they cannot be deleted or modified, ensuring a clean audit trail.",
      },
    ],
  },
  {
    id: "manual-zone-dashboard",
    title: "9. Zone Dashboard",
    blocks: [
      { kind: "lead", text: "A geographic breakdown of all MoU activity, showing performance and coverage per zone." },
      {
        kind: "steps",
        steps: [
          "The top bar shows system-wide totals (Total, Active, Expiring, Expired) for quick orientation.",
          "Each zone card displays the zone name, number of companies, active/expiring/expired counts, and a mini progress bar.",
          "Click a zone card to drill down into companies within that zone.",
        ],
      },
    ],
  },
  {
    id: "manual-export",
    title: "10. Export Reports",
    blocks: [
      { kind: "lead", text: "Generate and download reports for compliance, management reviews, and audits." },
      {
        kind: "reports",
        rows: [
          { name: "MoU Summary Report", format: "Excel (.xlsx)", text: "All active MoUs with company details, zone, scheme, and expiry dates." },
          { name: "Expiry Report", format: "Excel (.xlsx)", text: "Companies whose MoUs expire within a selected date range." },
          { name: "Bulk MoU Documents", format: "ZIP archive", text: "All uploaded MoU PDFs for selected companies packaged into a single ZIP." },
        ],
      },
      {
        kind: "steps",
        tight: true,
        steps: [
          "Use the filters (Zone, Scheme, Company, Status, Date Range) to narrow the export scope.",
          "Click the desired report type button.",
          "The file will download automatically to your browser's default downloads folder.",
        ],
      },
    ],
  },
  {
    id: "manual-ai-chatbot",
    title: "11. AI Chatbot",
    blocks: [
      {
        kind: "lead",
        text: "The AI Chatbot is available on every page and provides instant help with navigation, form filling, and understanding scheme rules.",
      },
      {
        kind: "steps",
        steps: [
          "Click the blue chat bubble (💬) in the bottom-right corner of any page to open the chatbot.",
          "Type your question or use one of the suggested prompts shown in the panel.",
          "For voice input, click the microphone icon 🎤 and speak your question. The chatbot supports 11 Indian languages.",
          "To change language, click the globe icon 🌐 and select from the language menu.",
        ],
      },
      {
        kind: "languages",
        title: "Supported Languages",
        languages: ["English", "हिंदी", "मराठी", "தமிழ்", "తెలుగు", "ಕನ್ನಡ", "বাংলা", "ગુજરાતી", "ਪੰਜਾਬੀ", "മലയാളം", "ଓଡ଼ିଆ"],
      },
      {
        kind: "tip",
        tone: "info",
        text: "Ask the chatbot 'How do I add a new company?' or 'What is the NATS scheme?' for step-by-step guidance in your preferred language.",
      },
    ],
  },
  {
    id: "manual-faq",
    title: "12. FAQ",
    blocks: [
      {
        kind: "faq",
        items: [
          {
            question: "Q: Can I register the same company under multiple schemes?",
            answer: "A: Yes. Each scheme-plant combination is treated as a separate MoU record with its own code, dates, and trainee categories.",
          },
          {
            question: "Q: What happens when an MoU expires?",
            answer: "A: The status automatically changes to \"Expired\". The record is retained in Agreement History. Initiate a renewal through Edit Agreement → Registration Type: Renewal.",
          },
          {
            question: "Q: Who can see the system?",
            answer: "A: Access is role-based. Admins have full access. Zone managers see only their zone's companies. Read-only users can view but not create or edit.",
          },
          {
            question: "Q: How is the MoU code generated?",
            answer: "A: Codes follow the format MoU-{SCHEME}-{YEAR}-{4-digit ID}, e.g. MoU-NATS-2025-0042. The code is assigned automatically on Save & Submit.",
          },
          {
            question: "Q: What file formats are accepted for upload?",
            answer: "A: MoU documents: PDF only (max 25 MB). Supporting documents in Edit Agreement: PDF, JPG, PNG (max 5 MB each).",
          },
          {
            question: "Q: Can I export data for a specific zone only?",
            answer: "A: Yes. Use the Zone filter on the Export page before downloading.",
          },
          {
            question: "Q: How do I handle a company that has closed or merged?",
            answer: "A: Update the company status to \"Expired\" via Edit Agreement. Add a note in the amendment reason field describing the closure or merger.",
          },
        ],
      },
    ],
  },
];
