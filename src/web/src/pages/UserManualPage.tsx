/**
 * Purpose: SPEC-18 / SPEC-16 User Manual page - a full 12-section user reference guide
 * with a sticky table-of-contents navigation sidebar, cover header, step badges,
 * field descriptions, warning/tip callouts, and FAQ items.
 */

import { useState } from "react";
import { useOutletContext } from "react-router-dom";

import type { AppShellContext } from "../components/layout/AppShell.tsx";
import { Topbar } from "../components/layout/Topbar.tsx";
import { Icon } from "../components/icons.tsx";
import { brand } from "../components/ui.tsx";

const MANUAL_SECTIONS = [
  { id: "overview", title: "1. Overview" },
  { id: "dashboard", title: "2. Dashboard" },
  { id: "add-company", title: "3. Add New Company" },
  { id: "existing", title: "4. Existing Companies" },
  { id: "edit-agreement", title: "5. Edit Agreement" },
  { id: "upload-mou", title: "6. Upload MoU PDF" },
  { id: "expiry-alert", title: "7. MoU Expiry Alerts" },
  { id: "history", title: "8. Agreement History" },
  { id: "zone-dashboard", title: "9. Zone Dashboard" },
  { id: "export", title: "10. Export Reports" },
  { id: "ai-chatbot", title: "11. AI Chatbot" },
  { id: "faq", title: "12. FAQ" },
] as const;

const SUPPORTED_SCHEMES = [
  { name: "NAPS", full: "National Apprenticeship Promotion Scheme", body: "MSDE/DGT" },
  { name: "NATS", full: "National Apprenticeship Training Scheme", body: "BOAT/BOPT" },
  { name: "WILP", full: "Work Integrated Learning Programme", body: "BITS Pilani" },
  { name: "BVoc", full: "Bachelor of Vocation (B.Voc)", body: "UGC" },
  { name: "DVoc", full: "Diploma of Vocation (D.Voc)", body: "AICTE" },
  { name: "FLEXI", full: "Flexi MoU Apprenticeship", body: "State Board" },
  { name: "MSBTE", full: "Maharashtra State Board Technical Education", body: "MSBTE" },
] as const;

const KPI_DESCRIPTIONS = [
  { label: "Total MoUs", desc: "Total number of company agreements across all zones and schemes." },
  { label: "Active", desc: "Agreements currently in force (expiry date is more than 30 days away)." },
  { label: "Expiring Soon", desc: "Agreements expiring within the next 30 days — action recommended." },
  { label: "Expired", desc: "Agreements past their expiry date — require renewal or closure." },
  { label: "Pending Review", desc: "Agreements awaiting final sign-off from the compliance team." },
] as const;

const PROFILE_TABS = [
  { tab: "Overview", desc: "MoU code, zone, plant, scheme, status badge, and expiry date at a glance." },
  { tab: "Commercial", desc: "MoU start/end dates, admin charges, and uploaded supporting documents." },
  { tab: "Payroll", desc: "All trainee categories with their allowances, deductions, and stipend rates." },
  { tab: "History", desc: "Amendment history and change log for the agreement." },
  { tab: "Documents", desc: "Uploaded MoU PDFs and attachment files." },
] as const;

const ALERT_BANDS = [
  { band: "Critical (≤ 30 days)", color: "#EF4444", desc: "Immediate action required. Send renewal notice and prepare new MoU." },
  { band: "Warning (31 – 60 days)", color: "#F59E0B", desc: "Begin internal approval process. Reach out to company HR." },
  { band: "Notice (61 – 90 days)", color: "#3B82F6", desc: "Plan and schedule the renewal discussion." },
] as const;

const EXPORT_REPORTS = [
  { report: "MoU Summary Report", format: "Excel (.xlsx)", desc: "All active MoUs with company details, zone, scheme, and expiry dates." },
  { report: "Expiry Report", format: "Excel (.xlsx)", desc: "Companies whose MoUs expire within a selected date range." },
  { report: "Bulk MoU Documents", format: "ZIP archive", desc: "All uploaded MoU PDFs for selected companies packaged into a single ZIP." },
] as const;

const FAQ_ITEMS = [
  { q: "Can I register the same company under multiple schemes?", a: "Yes. Each scheme-plant combination is treated as a separate MoU record with its own code, dates, and trainee categories." },
  { q: "What happens when an MoU expires?", a: 'The status automatically changes to "Expired". The record is retained in Agreement History. Initiate a renewal through Edit Agreement → Registration Type: Renewal.' },
  { q: "Who can see the system?", a: "Access is role-based. Admins have full access. Zone managers see only their zone's companies. Read-only users can view but not create or edit." },
  { q: "How is the MoU code generated?", a: "Codes follow the format MoU-{SCHEME}-{YEAR}-{4-digit ID}, e.g. MoU-NATS-2025-0042. The code is assigned automatically on Save & Submit." },
  { q: "What file formats are accepted for upload?", a: "MoU documents: PDF only (max 25 MB). Supporting documents in Edit Agreement: PDF, JPG, PNG (max 5 MB each)." },
  { q: "Can I export data for a specific zone only?", a: "Yes. Use the Zone filter on the Export page before downloading." },
  { q: "How do I handle a company that has closed or merged?", a: 'Update the company status to "Expired" via Edit Agreement. Add a note in the amendment reason field describing the closure or merger.' },
] as const;

const SCHEME_PILLS = ["NAPS", "NATS", "WILP", "BVoc", "DVoc", "FLEXI", "MSBTE"] as const;

const CHATBOT_LANGUAGES = ["English", "हिंदी", "मराठी", "தமிழ்", "తెలుగు", "ಕನ್ನಡ", "বাংলা", "ગુજરાતી", "ਪੰਜਾਬੀ", "മലയാളം", "ଓଡ଼ିଆ"] as const;

const SYSTEM_PILLARS = [
  { icon: "🏢", label: "Company Registry", desc: "Register and manage company profiles, contacts, and agreement details." },
  { icon: "📄", label: "MoU Lifecycle", desc: "Create, edit, upload, and track MoU documents from draft to expiry." },
  { icon: "🔔", label: "Expiry Alerts", desc: "Automated alerts for agreements expiring within 30, 60, or 90 days." },
  { icon: "📊", label: "Analytics & Export", desc: "Zone dashboards, agreement history, and Excel/ZIP report exports." },
] as const;

function Step({ n, text }: { readonly n: number; readonly text: string }) {
  return (
    <div className="flex gap-3 items-start">
      <span
        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold mt-0.5"
        style={{ background: brand.blue }}
      >
        {n}
      </span>
      <p className="text-sm text-foreground leading-relaxed">{text}</p>
    </div>
  );
}

function Field({ label, desc }: { readonly label: string; readonly desc: string }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-border last:border-0">
      <span className="shrink-0 text-xs font-bold min-w-[140px]" style={{ color: brand.navy }}>
        {label}
      </span>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </div>
  );
}

function Tip({ text }: { readonly text: string }) {
  return (
    <div className="flex gap-2 items-start px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(27,95,174,0.07)" }}>
      <span className="text-lg leading-none mt-[-2px]">💡</span>
      <span style={{ color: brand.navy }}>{text}</span>
    </div>
  );
}

function Warn({ text }: { readonly text: string }) {
  return (
    <div className="flex gap-2 items-start px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(242,101,34,0.08)" }}>
      <span className="text-lg leading-none mt-[-2px]">⚠️</span>
      <span style={{ color: brand.orange }}>{text}</span>
    </div>
  );
}

function SectionHead({ id, title }: { readonly id: string; readonly title: string }) {
  return (
    <div id={`manual-${id}`} className="mb-6 scroll-mt-20">
      <h2 className="text-lg font-bold mb-1" style={{ color: brand.navy }}>
        {title}
      </h2>
      <div className="h-0.5 rounded" style={{ background: `linear-gradient(to right, ${brand.blue}, transparent)` }} />
    </div>
  );
}

function SubHead({ title }: { readonly title: string }) {
  return (
    <h3 className="font-semibold text-sm mt-5 mb-2" style={{ color: brand.blue }}>
      {title}
    </h3>
  );
}

export function UserManualPage() {
  const { openMobileMenu } = useOutletContext<AppShellContext>();
  const [active, setActive] = useState("overview");

  function scrollTo(id: string) {
    setActive(id);
    document.getElementById(`manual-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Topbar title="User Manual" subtitle="Agreement Management System v2.0 · Reference Guide" onOpenMenu={openMobileMenu} />

      <div className="flex flex-1 overflow-hidden">
        {/* TOC sidebar */}
        <aside
          className="hidden lg:flex flex-col w-56 shrink-0 border-r border-border overflow-y-auto py-4 px-2"
          style={{ background: "rgba(255,255,255,0.55)", backdropFilter: "blur(16px)" }}
        >
          <p className="px-3 mb-3 text-[10px] font-bold uppercase tracking-widest" style={{ color: brand.orange }}>
            Contents
          </p>
          {MANUAL_SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className={`text-left px-3 py-2 rounded-lg text-xs font-medium mb-0.5 transition-all ${
                active === s.id ? "text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
              style={active === s.id ? { background: brand.blue } : {}}
            >
              {s.title}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-3xl mx-auto space-y-10">
            {/* Cover */}
            <div className="glass-card rounded-2xl p-6 flex flex-col sm:flex-row gap-5 items-start sm:items-center">
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 text-white"
                style={{ background: `linear-gradient(135deg,${brand.blue},${brand.navy})` }}
              >
                {Icon.book}
              </div>
              <div>
                <h1 className="text-xl font-bold" style={{ color: brand.navy }}>
                  YSF Agreement Management System
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5">Complete User Reference Guide · Version 2.0</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {SCHEME_PILLS.map((s) => (
                    <span key={s} className="px-2 py-0.5 rounded text-xs font-bold text-white" style={{ background: brand.blue }}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 1. Overview */}
            <section>
              <SectionHead id="overview" title="1. Overview" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                The YSF Agreement Management System (AMS) is a unified digital platform that manages MoU-based apprenticeship and skilling agreements between Yuvashakti Foundation and partner companies. AMS covers the full agreement lifecycle — from company onboarding to MoU creation, monitoring, and expiry management across all government schemes.
              </p>
              <div className="grid sm:grid-cols-2 gap-3 mb-4">
                {SYSTEM_PILLARS.map((c) => (
                  <div key={c.label} className="glass-card rounded-xl p-4 flex gap-3">
                    <span className="text-2xl shrink-0">{c.icon}</span>
                    <div>
                      <p className="text-xs font-bold" style={{ color: brand.navy }}>
                        {c.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{c.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <SubHead title="Supported Schemes" />
              <div className="glass-card rounded-xl overflow-hidden">
                {SUPPORTED_SCHEMES.map((s, i) => (
                  <div key={s.name} className={`flex items-center gap-3 px-4 py-2.5 text-xs ${i % 2 === 0 ? "bg-white/40" : "bg-white/20"}`}>
                    <span className="font-bold w-14 shrink-0" style={{ color: brand.blue }}>
                      {s.name}
                    </span>
                    <span className="flex-1 text-foreground">{s.full}</span>
                    <span className="text-muted-foreground shrink-0">{s.body}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 2. Dashboard */}
            <section>
              <SectionHead id="dashboard" title="2. Dashboard" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                The Dashboard is your command center. It shows real-time KPIs, a live activity timeline, scheme distribution, and quick-action shortcuts.
              </p>
              <SubHead title="KPI Tiles" />
              <div className="glass-card rounded-xl overflow-hidden mb-3">
                {KPI_DESCRIPTIONS.map((r, i) => (
                  <div key={r.label} className={`flex gap-3 px-4 py-2.5 ${i % 2 === 0 ? "bg-white/40" : "bg-white/20"}`}>
                    <span className="font-semibold text-xs w-32 shrink-0" style={{ color: brand.navy }}>
                      {r.label}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.desc}</span>
                  </div>
                ))}
              </div>
              <Tip text="Click any KPI tile to jump to the filtered list of companies matching that status." />
            </section>

            {/* 3. Add New Company */}
            <section>
              <SectionHead id="add-company" title="3. Add New Company" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Registering a new company creates a complete MoU profile across four steps: Basic Information, Commercial Details, Payroll / Trainee Categories, and Review & Save.
              </p>
              <SubHead title="Step 1 — Basic Information" />
              <div className="space-y-2 mb-4">
                <Step n={1} text="Select Scheme (NAPS, NATS, WILP, etc.) — an info panel with scheme guidelines, eligibility, duration, and stipend details appears automatically." />
                <Step n={2} text="Select Zone — the company and plant dropdowns will filter to companies in that zone." />
                <Step n={3} text="Select Sector and fill Company Name, Company Type, Plant/Location, Registration Type." />
                <Step n={4} text="Enter GST Number (15-digit alphanumeric) and TAN Number." />
              </div>
              <div className="glass-card rounded-xl p-4 mb-4">
                <p className="text-xs font-bold mb-2" style={{ color: brand.navy }}>
                  Basic Information Fields
                </p>
                <Field label="Scheme" desc="Government scheme under which the MoU is registered. Selecting a scheme reveals eligibility guidelines." />
                <Field label="Zone" desc="Geographic zone (e.g. Nashik, Pune, NCR Noida). Determines company and plant dropdown options." />
                <Field label="Sector" desc="Industry sector (Automobile, Pharma, IT, etc.)." />
                <Field label="Company Name" desc="Registered legal name of the partner company." />
                <Field label="Company Type" desc="Private Limited / Public Limited / LLP / Partnership / Proprietorship / Government." />
                <Field label="Plant / Location" desc="Specific plant or facility within the company." />
                <Field label="Registration Type" desc="Type of registration — New, Renewal, or Amendment." />
                <Field label="GST Number" desc="15-character GST Identification Number of the company." />
                <Field label="TAN Number" desc="10-character Tax Deduction and Collection Account Number." />
              </div>
              <SubHead title="Step 1 — Registered Address" />
              <p className="text-xs text-muted-foreground mb-3">Fill street address, city, state, pincode, and country. The address is stored with the MoU for legal and correspondence purposes.</p>
              <SubHead title="Step 1 — Contact Information" />
              <div className="glass-card rounded-xl p-4 mb-4">
                <Field label="HR Contact Name" desc="Primary HR contact person at the company." />
                <Field label="HR Mobile" desc="10-digit mobile number of the HR contact." />
                <Field label="HR Email" desc="Official email address of the HR contact." />
                <Field label="Alternate Mobile" desc="Secondary contact number (optional)." />
                <Field label="Purchase Confirm Email" desc="Email ID for purchase order / MoU confirmation correspondence." />
              </div>
              <SubHead title="Step 2 — Commercial Details" />
              <div className="space-y-2 mb-4">
                <Step n={1} text="Set MoU Start Date and MoU End Date using the date pickers." />
                <Step n={2} text="Enter Admin Charges (can add multiple charge types using the + button)." />
                <Step n={3} text="Upload any supporting documents (PDF / JPG / PNG, max 5 MB each)." />
              </div>
              <SubHead title="Step 3 — Payroll / Trainee Categories" />
              <p className="text-xs text-muted-foreground mb-3">Define one or more trainee categories. Each category has its own allowances and deductions inline.</p>
              <div className="space-y-2 mb-4">
                <Step n={1} text="Click 'Add New Category'. Enter Category Name (e.g. Diploma Trainee), Qualification, Stipend Rate, and Trainee Count." />
                <Step n={2} text="Check applicable Allowances. Each checked allowance reveals an amount input. For Insurance, choose sub-type: Top Up (GFS), Recovery (MoU), or Both — and enter the respective amounts." />
                <Step n={3} text="Check applicable Deductions. Each checked deduction reveals an amount input." />
                <Step n={4} text="Repeat for additional categories by clicking 'Add New Category' again." />
              </div>
              <Tip text="Each category is independent — allowances and deductions configured in one category do not affect others." />
              <div className="mt-3">
                <Warn text="At least one trainee category must be configured before saving the agreement." />
              </div>
              <SubHead title="Step 4 — Review & Save" />
              <p className="text-xs text-muted-foreground">Review all entered information in a summary view. Click Save & Submit to create the MoU record. You will be shown a success confirmation with the generated MoU code.</p>
            </section>

            {/* 4. Existing Companies */}
            <section>
              <SectionHead id="existing" title="4. Existing Companies" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Browse, search, and inspect all registered company agreements.
              </p>
              <div className="space-y-2 mb-4">
                <Step n={1} text="Use the Search box to find companies by name or MoU code." />
                <Step n={2} text="Filter by Zone and Status (Active / Expiring / Expired / Pending) using the dropdowns." />
                <Step n={3} text="Click any row to open the full Company Profile." />
              </div>
              <SubHead title="Company Profile Tabs" />
              <div className="glass-card rounded-xl overflow-hidden mb-3">
                {PROFILE_TABS.map((r, i) => (
                  <div key={r.tab} className={`flex gap-3 px-4 py-2.5 ${i % 2 === 0 ? "bg-white/40" : "bg-white/20"}`}>
                    <span className="font-semibold text-xs w-24 shrink-0" style={{ color: brand.navy }}>
                      {r.tab}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.desc}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 5. Edit Agreement */}
            <section>
              <SectionHead id="edit-agreement" title="5. Edit Agreement" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Amend existing MoU details while maintaining a complete audit trail of all changes.
              </p>
              <div className="space-y-2 mb-4">
                <Step n={1} text="Select Zone → Company → Plant → Scheme using the four dropdowns, then click OK." />
                <Step n={2} text="Choose a Reason for Amendment (e.g. Renewal, Address Change, Stipend Revision)." />
                <Step n={3} text="Upload proof document if required for the amendment type." />
                <Step n={4} text="Edit any fields — all changes are tracked automatically." />
                <Step n={5} text="Click Save & Submit to apply the amendment." />
              </div>
              <Warn text="Navigating away with unsaved changes will trigger an 'Unsaved Changes' warning. Confirm to discard or return to save." />
            </section>

            {/* 6. Upload MoU */}
            <section>
              <SectionHead id="upload-mou" title="6. Upload MoU PDF" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Attach signed MoU PDF documents to an existing company record.
              </p>
              <div className="space-y-2 mb-4">
                <Step n={1} text="Select Zone, Company, Plant, and Scheme to identify the target agreement." />
                <Step n={2} text="Drag and drop your PDF file into the upload area, or click Browse to select it." />
                <Step n={3} text="The file name, size, and a preview panel will appear. Confirm the correct document." />
                <Step n={4} text="Click Save & Upload. A success confirmation with upload timestamp will be shown." />
              </div>
              <Tip text="Accepted formats: PDF only. Maximum file size: 25 MB. File name should include company name and date for easy identification." />
            </section>

            {/* 7. MoU Expiry Alerts */}
            <section>
              <SectionHead id="expiry-alert" title="7. MoU Expiry Alerts" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Monitor agreements approaching expiry so renewals can be initiated on time.
              </p>
              <div className="glass-card rounded-xl overflow-hidden mb-4">
                {ALERT_BANDS.map((r, i) => (
                  <div key={r.band} className={`flex gap-3 px-4 py-3 ${i % 2 === 0 ? "bg-white/40" : "bg-white/20"}`}>
                    <span className="font-bold text-xs w-40 shrink-0" style={{ color: r.color }}>
                      {r.band}
                    </span>
                    <span className="text-xs text-muted-foreground">{r.desc}</span>
                  </div>
                ))}
              </div>
              <Tip text="Use the Filter bar to narrow alerts by zone or scheme. Click any alert row to open the company profile and initiate a renewal." />
            </section>

            {/* 8. Agreement History */}
            <section>
              <SectionHead id="history" title="8. Agreement History" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                A complete chronological log of all MoU events — creation, amendments, renewals, uploads, and status changes.
              </p>
              <div className="space-y-2 mb-4">
                <Step n={1} text="Filter the history list by Zone, Scheme, or date range." />
                <Step n={2} text="Each row shows: Company, Zone, Action type, Changed fields, Changed by (user), and Timestamp." />
                <Step n={3} text="Click any row to expand and view the full diff of what changed." />
              </div>
              <Tip text="History records are immutable — they cannot be deleted or modified, ensuring a clean audit trail." />
            </section>

            {/* 9. Zone Dashboard */}
            <section>
              <SectionHead id="zone-dashboard" title="9. Zone Dashboard" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                A geographic breakdown of all MoU activity, showing performance and coverage per zone.
              </p>
              <div className="space-y-2 mb-4">
                <Step n={1} text="The top bar shows system-wide totals (Total, Active, Expiring, Expired) for quick orientation." />
                <Step n={2} text="Each zone card displays the zone name, number of companies, active/expiring/expired counts, and a mini progress bar." />
                <Step n={3} text="Click a zone card to drill down into companies within that zone." />
              </div>
            </section>

            {/* 10. Export */}
            <section>
              <SectionHead id="export" title="10. Export Reports" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                Generate and download reports for compliance, management reviews, and audits.
              </p>
              <div className="glass-card rounded-xl overflow-hidden mb-4">
                {EXPORT_REPORTS.map((r, i) => (
                  <div key={r.report} className={`flex flex-col sm:flex-row gap-1 sm:gap-3 px-4 py-3 ${i % 2 === 0 ? "bg-white/40" : "bg-white/20"}`}>
                    <div className="sm:w-48 shrink-0">
                      <p className="text-xs font-semibold" style={{ color: brand.navy }}>
                        {r.report}
                      </p>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(27,95,174,0.1)", color: brand.blue }}>
                        {r.format}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">{r.desc}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-2 mb-3">
                <Step n={1} text="Use the filters (Zone, Scheme, Company, Status, Date Range) to narrow the export scope." />
                <Step n={2} text="Click the desired report type button." />
                <Step n={3} text="The file will download automatically to your browser's default downloads folder." />
              </div>
            </section>

            {/* 11. AI Chatbot */}
            <section>
              <SectionHead id="ai-chatbot" title="11. AI Chatbot" />
              <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                The AI Chatbot is available on every page and provides instant help with navigation, form filling, and understanding scheme rules.
              </p>
              <div className="space-y-2 mb-4">
                <Step n={1} text="Click the blue chat bubble (💬) in the bottom-right corner of any page to open the chatbot." />
                <Step n={2} text="Type your question or use one of the suggested prompts shown in the panel." />
                <Step n={3} text="For voice input, click the microphone icon 🎤 and speak your question. The chatbot supports 11 Indian languages." />
                <Step n={4} text="To change language, click the globe icon 🌐 and select from the language menu." />
              </div>
              <div className="glass-card rounded-xl p-4 mb-3">
                <p className="text-xs font-bold mb-2" style={{ color: brand.navy }}>
                  Supported Languages
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {CHATBOT_LANGUAGES.map((l) => (
                    <span key={l} className="px-2 py-0.5 rounded text-xs border border-border bg-white/60">
                      {l}
                    </span>
                  ))}
                </div>
              </div>
              <Tip text="Ask the chatbot 'How do I add a new company?' or 'What is the NATS scheme?' for step-by-step guidance in your preferred language." />
            </section>

            {/* 12. FAQ */}
            <section>
              <SectionHead id="faq" title="12. FAQ" />
              <div className="space-y-3">
                {FAQ_ITEMS.map((item, i) => (
                  <div key={i} className="glass-card rounded-xl p-4">
                    <p className="text-sm font-semibold mb-1" style={{ color: brand.navy }}>
                      Q: {item.q}
                    </p>
                    <p className="text-xs text-muted-foreground leading-relaxed">A: {item.a}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* Footer note */}
            <div className="py-6 text-center text-xs text-muted-foreground border-t border-border">
              AMS v2.0 · Yuvashakti Foundation · For support contact your system administrator.
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
