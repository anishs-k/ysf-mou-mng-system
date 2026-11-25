# SPEC-34 — YSF / YSI on Add New Company

**Amends:** SPEC-03 (wizard), SPEC-22 / SPEC-30 (bulk template, fill from template), SPEC-10 (Edit Agreement), SPEC-13 (search, export), SPEC-23 (record PDF).
**Depends on:** SPEC-31 (the client sheet's fields).
**Source:** client instruction, 2026-11-25. The client's MOU TEMPLATE has two sheets, YSF and YSI. They are the same except for YSI's five extra fee columns.

---

## 1. Scope

Every agreement belongs to **YSF** (Yuvashakti Foundation) or **YSI** (Yuvashakti
Skill India). Add New Company asks this first, and the fields that follow depend on it.

- **The scheme decides the organisation**, so nothing new is stored and no migration
  is needed. Existing MoUs are classified automatically.

| Organisation | Schemes |
|---|---|
| YSF | NAPS, NATS |
| YSI | WILP, FLEXI, BVoc, DVoc, MSBTE |

- **YSI-only fees:** Education Charges, One Time Registration Fees, Examination
  Fees, Employability Skill Test Fees, MSBTE Affiliation Fees.
- **YSI-only payroll field:** Education Fee Paid By.
- Everything else is common to both.

## 2. Rules (`src/domain/src/organisations.ts`)

`validateOrganisationFields({ organisation?, scheme, charges, educationFeePayer?, keepCharges? })`:

1. An organisation other than YSF / YSI → `organisation: "Choose YSF or YSI"`.
2. A scheme the chosen organisation does not run → `scheme: "Choose a YSF scheme (NAPS or NATS)"` (or the YSI equivalent).
3. On a YSF agreement:
   - a filled YSI-only fee → `charges[KEY]: "This fee applies to YSI agreements only"`;
   - a filled fee payer → `educationFeePayer: "This applies to YSI agreements only"`.
4. `keepCharges` (Edit Agreement only) lists YSI-only fees the agreement already
   held. These may be kept or cleared, but none can be newly added.

The wizard, the final save, bulk upload and Edit Agreement all run this one function.

## 3. Add New Company

- Before anything else, a card asks **"Who is this company being added for?"** with
  a **YSF** and a **YSI** choice. No other part of the wizard shows until one is chosen.
- A badge then shows the choice, with **Change** (it asks for confirmation first).
- Choosing clears what no longer applies: a scheme the organisation does not run,
  YSI-only fee rows, and the fee payer.
- **Company Details:** the scheme list holds only that organisation's schemes.
- **Commercial Details:** the charge head list leaves out YSI-only fees for YSF.
- **Payroll:** Education Fee Paid By is shown for YSI only.
- **Review:** shows the organisation.
- The draft keeps the choice as `page3.organisation`. A draft without one takes
  it from its scheme.
- The final save answers 422 when the rules fail.

## 4. Bulk template / Fill from Template

- A new optional list column, **Organisation (YSF / YSI)**, sits before Scheme.
  A blank cell means the scheme decides.
- Each row is checked by the rules in §2. Errors appear under the column that
  caused them.
- Fill from Template sets the organisation from the cell, or from the scheme.

## 5. Elsewhere

- **Edit Agreement:** the Commercial tab of a YSF agreement leaves out YSI-only
  fees, except one it already holds. This covers the 5 NAPS MoUs that already hold
  One Time Registration Fees: their value is kept and shown, and can be cleared.
  The API applies the same rule.
- **Existing Company:** the Commercial tab shows the Organisation.
- **List filter:** a YSF / YSI filter is added. `GET /api/search?organisation=YSF|YSI`
  works for every search-based export too.
- **Record PDF:** the Commercial section shows the Organisation.
- **Excel export:** the MOUs sheet gets an Organisation column.

## 6. Acceptance criteria

1. Every scheme belongs to exactly one organisation.
2. A YSF agreement cannot be saved, uploaded or edited with a new YSI-only fee or a fee payer.
3. An organisation that does not run the chosen scheme is refused.
4. On live data, `organisation=YSF` selects 161 MoUs and `organisation=YSI` selects 232, which together make all 393.
