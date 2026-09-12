# SPEC-14 — Figma UI Replication

**Depends on:** SPEC-01 through SPEC-13 (every route and data model already
implemented). This spec changes no business logic, no data model and no route
behaviour except the small, explicitly-scoped additions in §5.
**Source:** `figma_code/` (a Figma Make export — `src/App.tsx`,
`src/index.css`, `src/imports/pasted_text/ux-deliverables-summary.md`,
`src/imports/logo-ysf.png`), resolved through a grill-me interview on
2026-09-13 — see §0.
**Status:** decisions resolved (see §0). Two UI elements are deferred, not
implemented — see `SPEC-15-deferred-ui-features.md`.

Every feature required by `docs/specifications/specindex.md` is already built.
This spec is a **visual replication pass**: restyle the already-implemented
pages so they match the Figma design pixel-for-pixel, without changing what
any page does, what route it lives at, or how a user moves through it.

---

## 0. Resolved decisions

Settled through a grill-me interview against `figma_code/`, cross-checked
against `ARCHITECTURE.md`, `ADR.md`, `packagedesign.md`, `sourcemap.md` and
the implemented `src/` tree. Numbering continues `docs/design/ADR.md` §"Resolved
Decisions" (D1–D79); these are also appended there in full so the two
documents stay in step.

| # | Decision | Choice | Resolved via |
|---|---|---|---|
| D80 | Scope of this spec | **Visual/style replication only.** Every existing route, page boundary, step flow and data-entry interaction pattern (SPEC-01–13) stays exactly as implemented. Only colours, typography, spacing, chrome (sidebar/topbar) and component styling change | User interview |
| D81 | Figma's floating multilingual AI chatbot widget | **Excluded entirely.** No SPEC backs it, and even a static/scripted version is new UI surface and new multilingual content beyond a visual reskin | User interview |
| D82 | Fonts (Figma loads Roboto/Roboto Mono from Google Fonts via CDN `@import`) | **Self-hosted.** Font files are downloaded once (Apache 2.0 licensed) and served from `@mou/web`'s own static assets; no runtime dependency on `fonts.googleapis.com` | User interview |
| D83 | Login page's "Remember Me" checkbox and "Forgot Password" link (no SPEC-02 backing — no remember-me session extension, no password-reset flow exists) | **Rendered visually, wired to no-ops.** Logged as pending functional work in `SPEC-15-deferred-ui-features.md`, not implemented here | User interview |
| D84 | Dashboard KPI tiles (Total Companies, Active MOU, Expiring Soon, Expired, Pending Review — none exist on today's Dashboard) | **Built as new minimal backend scope**, not omitted and not faked. See §5.1 | User interview |
| D85 | Meaning of "Pending Review" (no such concept exists anywhere in the domain — MOU status is only NEW / ACTIVE / EXPIRED, and `NEW` means "not yet started", not "awaiting approval") | **Count of `company_draft` rows** — wizard sessions started but never finalised (SPEC-03). Zero new schema; a table that already exists for exactly this purpose | User interview |
| D86 | Dashboard "Recent Activity" feed (no existing feed or activity-log table) | **Built from existing timestamps**, not a new audit table: `company.createdAt` (company onboarded) UNION `agreement_history.createdAt` (MOU edited, SPEC-10), merged and sorted desc. See §5.2 | User interview |
| D87 | Topbar search box (decorative even in Figma's own code — local state only, no submit handler) and bell icon (wired in Figma to navigate to the expiry-alerts page) | **Both wired for real, both zero-new-backend.** Bell → existing `/alerts` route. Search box, on Enter, navigates to the existing `/search` route with the typed text as the query. Neither is a new global-search feature | User interview |
| D88 | Login page's four "live" stat tiles (Active MOUs, Companies, Expiring Soon, Active Zones), which would require a new **unauthenticated** endpoint since every existing endpoint requires a session (SPEC-02) | **Replaced with static marketing copy** (icon + label, no live numbers). No public/pre-auth endpoint is added | User interview |
| D89 | Brand copy in `figma_code` (`logo-ysf.png`, YSF colours, "NAPS Apprenticeship Portal · V2.0", "Ministry of Skill Development & Entrepreneurship") is not cross-referenced anywhere in `docs/project_information.md`, and its scheme name ("NATS"/apprenticeship) does not match this system's schemes (WILP / BOC and DVOC / MSBTE / FLEXI) | **Reproduced verbatim.** Treated as accurate to the real client/org context even though it predates this repo's own docs | User interview |
| D90 | Expiry Alert detail modal: Figma has no "Acknowledge" control at all (SPEC-08's required action, already implemented — stamps `acknowledged_at`/`acknowledged_by`, removes the alert from the default list); Figma instead has a "Renew" button that navigates to the Upload MOU page | **Keep Acknowledge** (SPEC-08's acceptance criteria depend on it; restyled only). **Add** Figma's "Renew" button next to it as an additional shortcut that navigates to the existing `/upload-mou` route. Plain navigation, no query-string prefill — Upload MOU's Zone/Company/Plant/Scheme selection is unchanged | User interview |
| D91 | `figma_code/src/data/napsData.ts` and `natsData.ts` (mock company/zone rows for a different scheme, "NATS", with city-level "zones" like Mumbai/Haridwar/Sikkim) | **Reference-only for visual design.** Not imported, and does not change real master data: zones stay the SPEC-01 provisional seed (North/South/East/West/Central), schemes stay WILP/BOC and DVOC/MSBTE/FLEXI. Any Figma copy that names a scheme or zone (e.g. "BVOC & DVOC") is corrected to the real domain label ("BOC and DVOC") before use | Codebase inspection |
| D92 | Sidebar navigation — items, order, icons, role-visibility | **Driven by the existing `DASHBOARD_ENTRY_POINTS` list** (`src/web/src/dashboard/entry-points.ts`), not hand-duplicated. One source of truth for the dashboard cards, the sidebar, and the route guards, matching this file's own stated purpose | Codebase inspection |
| D93 | No shared page chrome exists today (`src/web/src` has no Sidebar/Topbar/Layout component — each page renders standalone) | **New `AppShell` layout** (Sidebar + Topbar) wraps every authenticated route via a React Router layout route (nested `<Outlet/>`). `/login` stays outside it | Codebase inspection |
| D94 | Design tokens (colours, radii, shadows, the "glass" blur utility classes in `figma_code/src/index.css`) | **Ported verbatim** into `src/web/src/index.css`'s `@theme` block. Tailwind v4 stays CSS-configured — no `tailwind.config.js` is introduced, matching this repo's existing convention | Codebase inspection |
| D95 | Icons (Figma uses inline SVG throughout, no icon library dependency) | **Ported into a shared `src/web/src/components/icons.tsx` module**, not a new npm dependency — matches both `figma_code`'s own approach and this repo's minimal-dependency posture | Codebase inspection |
| D96 | Export Excel and Export PDF are two separate routes (SPEC-13); Figma has one combined `ExportPage` | **Stay two routes.** Figma's single page's visual design is split and applied to each existing page separately — consistent with D80 (no route merges) | Codebase inspection |
| D97 | Sidebar user badge (Figma hardcodes "Rajendra Kumar" / "Admin · North Zone") | Shows the **signed-in user's real name/initials and role** from the session (SPEC-02's user model). Omits the zone sub-label — users are not zone-scoped in the data model | Codebase inspection |

---

## 1. Scope

**In scope:**

- Restyle every implemented page (§4) to match `figma_code`'s visual design:
  colour palette, typography, spacing, card/button/input/table styling, the
  "glass" translucent chrome, and the new persistent Sidebar + Topbar shell.
- The small, explicitly-approved new read-only backend endpoints in §5
  (Dashboard KPIs and Recent Activity), because nothing else can honestly
  drive Figma's Dashboard tiles.
- Wiring the two Topbar elements and the Expiry Alert "Renew" shortcut to
  real, already-existing routes (D87, D90).

**Out of scope (explicitly, per §0):**

- Any change to routing, page boundaries, step ordering, or data-entry
  interaction pattern established by SPEC-01–13.
- The AI chatbot widget (D81).
- Real "Remember Me" / "Forgot Password" functionality (D83 — see SPEC-15).
- A public/unauthenticated stats endpoint (D88).
- Merging Export Excel and Export PDF into one page (D96).
- Adopting Figma's proposed IA changes that were never asked for here:
  checkbox-driven payroll fields, tabbed company profile merging
  History/Documents, and global search replacing the structured Search page.
  All three remain exactly as SPEC-06, SPEC-07/09/11, and SPEC-13 built them —
  only their visuals change.

---

## 2. Source material inventory

| `figma_code` path | Contents | How SPEC-14 uses it |
|---|---|---|
| `src/App.tsx` (3,322 lines) | Every screen as one file: `LoginPage`, `DashboardPage`, `AIChatBot`, `Stepper`, `AddCompanyPage`, `ExistingCompanyPage`, `ExpiryDetailModal`, `ExpiryAlertPage`, `HistoryDetailModal`, `AgreementHistoryPage`, `UploadMOUPage`, `ExportPage`, `ZoneDashboardPage`, `EditAgreementPage`, plus shared primitives (`Badge`, `Btn`, `Input`, `Select`, `Card`, `SecTitle`, `YSFLogo`, `Sidebar`, `Topbar`) | Visual/markup reference per page, mapped in §4. `AIChatBot` is not used (D81) |
| `src/index.css` | CSS custom properties (colour tokens), the Roboto/Roboto Mono `@import`, and the `.glass-*` utility classes | Tokens ported into `@mou/web`'s `index.css` (D94); font handling changed per D82 |
| `src/imports/logo-ysf.png` | The real logo asset | Copied into `@mou/web`'s static assets and used as-is |
| `src/imports/pasted_text/ux-deliverables-summary.md` | The UX brief this mockup was built from — proposes IA changes (checkbox payroll, tabs, global search, bottom nav) beyond what `App.tsx` itself implements | Read for context only. Where it conflicts with `App.tsx`'s actual code (e.g. it names "Inter / IBM Plex Sans" while the code loads Roboto; it describes a mobile bottom nav that the code never builds), **the code is the source of truth**, not the aspirational brief |
| `src/data/napsData.ts`, `src/data/natsData.ts` | Mock company/zone rows for a different scheme ("NATS") | Not imported (D91) |
| `package.json` | React 19, Vite 8, Tailwind v4, zero UI/icon library dependencies | Confirms nothing beyond what `@mou/web` already depends on is required |

---

## 3. Design tokens and global chrome

### 3.1 Colour tokens

Ported verbatim from `figma_code/src/index.css` into `src/web/src/index.css`'s
`@theme` block (D94):

| Token | Value | Use |
|---|---|---|
| `--ysf-blue` | `#1B5FAE` | Primary brand colour |
| `--ysf-orange` | `#F26522` | Accent / call-to-action |
| `--ysf-green` | `#39B54A` | Success |
| `--ysf-navy` | `#0D2E5A` | Headline text |
| `--background` | `#dce8fa` | Page background (plus the radial-gradient canvas) |
| `--card` | `rgba(255,255,255,0.62)` | Card surfaces |
| `--border` | `rgba(27,95,174,0.15)` | Hairlines |

Danger/warning/info badge colours follow the same red/amber/blue families
`Badge`'s `variant` prop already encodes in `App.tsx`.

### 3.2 Typography

Roboto (body) and Roboto Mono (`.mono`, used for codes/amounts) — self-hosted
per D82. Font files land under `src/web/public/fonts/`, loaded via
`@font-face` in `index.css` rather than a CDN `@import`.

### 3.3 Spacing, radius, shadow

8pt grid; 48px buttons and inputs; 16px card radius (`--radius: 10px` token,
plus the `+4px`/`-2px` derived scale already defined in Figma's `@theme
inline` block); the `.glass-*` blur/shadow utility classes ported as-is.

### 3.4 AppShell (new)

`src/web/src` has no shared layout today — every page renders standalone
(D93). SPEC-14 adds:

- `src/web/src/components/layout/AppShell.tsx` — a React Router layout route
  rendering `Sidebar` + `Topbar` + `<Outlet/>`, wrapping every authenticated
  route. `/login` renders outside it.
- `src/web/src/components/layout/Sidebar.tsx` — desktop persistent /
  mobile off-canvas drawer, built from Figma's `Sidebar` component. Nav items
  come from `DASHBOARD_ENTRY_POINTS` (D92), not a hand-written list, so a
  future entry point cannot leave the sidebar and the dashboard disagreeing.
  User badge shows the real signed-in user (D97) with a working sign-out.
- `src/web/src/components/layout/Topbar.tsx` — page title/subtitle, the
  search box and bell described in D87.
- `src/web/src/components/icons.tsx` — the inline SVG icon set ported from
  Figma's `Ic` object (D95).

---

## 4. Page-by-page mapping

| Figma component (`App.tsx`) | Our route | Treatment |
|---|---|---|
| `LoginPage` | `/login` | Full visual replication: gradient hero, headline, static stat tiles (D88), glass login card. Real auth logic (SPEC-02) unchanged. Remember Me / Forgot Password rendered but inert (D83) |
| `DashboardPage` | `/` | Restyled entry-point cards (from `DASHBOARD_ENTRY_POINTS`) as Figma's dashboard cards. Adds the KPI row (§5.1) and Recent Activity table (§5.2) |
| `AddCompanyPage` + `Stepper` | `/companies/new` | Our wizard (`WizardShell.tsx` + `Page1`/`Page2`/`Page3`) already uses a single page with an internal step indicator — matches Figma's structure. Restyle the stepper and the three pages' cards/inputs only |
| `ExistingCompanyPage` | `/companies` | Our page already uses a single page with internal step state (overview → commercial → payroll) — matches Figma's flow, not its "free-navigation tabs" proposal (D80/out of scope). Restyle only |
| `ExpiryDetailModal` + `ExpiryAlertPage` | `/alerts` | Restyle list/filters/modal. Keep Acknowledge, add Renew shortcut (D90) |
| `UploadMOUPage` | `/upload-mou` | Restyle only. Also the destination of the new Renew shortcut (D90), plain navigation, no prefill |
| `EditAgreementPage` | `/agreements/edit` | Restyle only; reason-gated fields and proof upload behaviour (SPEC-10) unchanged |
| `HistoryDetailModal` + `AgreementHistoryPage` | `/agreements/history` | Restyle only |
| `ZoneDashboardPage` | `/zones/overview` | Restyle only |
| `ExportPage` | `/export/excel` and `/export/pdf` | Figma's one page's visuals split across our two existing routes (D96) |
| *(no Figma equivalent — Figma's brief proposes replacing this with global search, out of scope per D80)* | `/search` | Restyled using the same card/table/input language as the rest of the app; structured Company/Plant/Scheme search (SPEC-13) unchanged |
| *(no Figma equivalent)* | `*` (catch-all) | `ComingSoonPage` restyled to match Figma's disabled-entry visual treatment (dashed border, muted) |
| `AIChatBot` | — | Not implemented (D81) |

---

## 5. New minimal backend scope

Two new read-only, session-authenticated endpoints, both open to all roles
(matching the existing Dashboard's own visibility rule — SPEC-02 §3.3 has no
role restriction on read-only summary data).

### 5.1 Dashboard summary

`GET /api/dashboard/summary`

```json
{
  "totalCompanies": 128,
  "activeMou": 96,
  "expiringSoon": 14,
  "expired": 9,
  "pendingReview": 3
}
```

- `totalCompanies` / `activeMou` / `expiringSoon` / `expired` reuse the same
  per-status aggregation SPEC-12's zone-wise endpoint already computes,
  summed across all zones rather than grouped by zone.
- `pendingReview` is `COUNT(*)` on `company_draft` (D85) — one row per user
  with an unfinished onboarding wizard.

### 5.2 Recent activity

`GET /api/dashboard/recent-activity?limit=10`

```json
[
  {
    "type": "COMPANY_CREATED",
    "company": "Tata Consultancy Services",
    "zone": "West",
    "plant": "Pune Plant A",
    "scheme": "WILP",
    "status": "ACTIVE",
    "occurredAt": "2026-08-02T10:15:00Z"
  },
  {
    "type": "MOU_EDITED",
    "company": "Reliance Industries Ltd",
    "zone": "West",
    "plant": "Jamnagar",
    "scheme": "BOC and DVOC",
    "status": "ACTIVE",
    "occurredAt": "2026-08-01T09:40:00Z"
  }
]
```

- Union of `company.createdAt` (event `COMPANY_CREATED`) and
  `agreement_history.createdAt` (event `MOU_EDITED`, written by SPEC-10),
  merged and ordered `occurredAt` desc, capped at `limit` (default 10, max
  50). No new table (D86).
- `status` is the MOU's current derived status (`deriveStatus`, SPEC-01 §6.2)
  at read time, not a stored value.

### 5.3 Expiry Alert "Renew" shortcut

No new endpoint. `ExpiryDetailModal`'s "Renew" button becomes a plain client
navigation to `/upload-mou` (D90) — no query-string prefill, since Upload MOU
does not accept one today and adding it was not asked for.

---

## 6. Deferred / out of scope

Logged in full in `docs/specifications/SPEC-15-deferred-ui-features.md`:

- Real "Remember Me" (extended session duration) — D83.
- Real "Forgot Password" (password reset flow) — D83.

Neither blocks this spec; both are rendered but inert per D83.

---

## 7. Non-functional requirements

- **Responsive breakpoints** follow Figma's own Tailwind breakpoints
  (`sm`/`md`/`lg`): collapsible desktop sidebar, off-canvas mobile drawer with
  a backdrop, no bottom-navigation bar (the `ux-deliverables-summary.md`
  brief mentions one; `App.tsx` never builds it — code wins per §2).
- **`backdrop-filter` support**: the `.glass-*` classes rely on it. All
  target browsers (current Chrome/Edge/Firefox/Safari) support it; no
  fallback is added, consistent with reproducing the design pixel-for-pixel
  (D80).
- **Colour fidelity over contrast tuning**: tokens are reproduced verbatim
  (D89 sets the precedent — accuracy over invention). If a specific
  text/background pairing is found to fail WCAG AA during implementation,
  flag it for a follow-up decision rather than silently adjusting the
  Figma-specified colour.
- **No new runtime dependencies**: fonts self-hosted (D82), icons inline
  (D95), no icon or UI-component library added.

---

## 8. Acceptance criteria

1. Every route listed in §4 renders using the new design tokens (§3.1–3.3)
   and the new AppShell (§3.4); none of the thirteen existing routes moved,
   merged, or split.
2. The wizard (`/companies/new`) and Existing Company (`/companies`) keep
   their exact current step sequence and field behaviour — only their visual
   styling changed.
3. The AI chatbot widget does not appear anywhere in the application.
4. Fonts load with zero requests to `fonts.googleapis.com` or any other
   external font host.
5. "Remember Me" and "Forgot Password" render on `/login` but produce no
   session or navigation change when used.
6. The Dashboard's five KPI tiles show real counts from
   `GET /api/dashboard/summary`; "Pending Review" equals the number of
   in-progress `company_draft` rows at that moment.
7. The Dashboard's Recent Activity table shows real events from
   `GET /api/dashboard/recent-activity`, newest first, capped at the
   requested limit.
8. The Topbar bell navigates to `/alerts`; pressing Enter in the Topbar
   search box with text "acme" navigates to `/search` with "acme" as the
   pre-filled query.
9. The Login page shows four stat tiles with icons and labels but no
   numeric values, and no request is made to any endpoint before sign-in.
10. On the Expiry Alert detail modal: "Acknowledge" still stamps
    `acknowledged_at`/`acknowledged_by` and removes the alert from the
    default list (SPEC-08 AC6, unchanged); "Renew" navigates to
    `/upload-mou`.
11. `/export/excel` and `/export/pdf` remain two separate routes, each
    individually restyled.
12. No page references `napsData.ts`/`natsData.ts`, and no UI text shows a
    zone or scheme name other than the ones SPEC-01 defines.
