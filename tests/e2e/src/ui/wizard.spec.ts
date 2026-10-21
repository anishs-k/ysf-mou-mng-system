/**
 * Purpose: UI tests for the Add New Company wizard — the SPEC-03 shell (3-step
 * flow, draft persistence, final save), the SPEC-04 Page 1 form, the SPEC-05
 * Page 2 form, and the SPEC-06 Page 3 form. They drive the real form against the
 * real API, so the draft create/update/delete cycle, server-side validation, the
 * MOU PDF upload and the save transaction are all exercised as a browser would
 * meet them.
 *
 * Tests share fixture accounts and a draft is per-user, so a test that creates a
 * draft must clean it up (cancel) before the next test with the same account
 * starts — otherwise the resume prompt blocks the form.
 */

import { expect, test } from "@playwright/test";
import type { APIRequestContext, Page } from "@playwright/test";

import { accountFor } from "./accounts";
import { signIn } from "./sign-in";

/** The API port Playwright boots (see playwright.config.ts API_PORT). */
const API_URL = "http://localhost:3001";

async function firstZoneId(request: APIRequestContext): Promise<string> {
  const response = await request.get(`${API_URL}/api/zones`);
  const zones = (await response.json()) as Array<{ id: string }>;
  const zone = zones[0];
  if (zone === undefined) {
    throw new Error("Expected /api/zones to return at least one zone");
  }
  return zone.id;
}

/**
 * If a leftover draft from a previous test is present, discard it so the wizard
 * form is reachable. Checks with a short timeout so it does not slow the common
 * case of no leftover draft.
 */
async function discardLeftoverDraft(page: Page) {
  const discardButton = page.getByRole("button", { name: "Discard and Start New" });
  const visible = await discardButton.isVisible({ timeout: 2000 }).catch(() => false);
  if (visible) {
    await discardButton.click();
  }
}

/** A valid Page 1, so a test only has to name the one field it spoils. */
const VALID_PAGE1 = {
  companyType: "PRIVATE_SECTOR",
  companyName: "Acme Industries",
  registrationType: "COMPANY",
  tanNumber: "ABCD12345E",
  gstNumber: "27AAPFU0939F1ZV",
  plantName: "Pune Plant",
  addressLine1: "12 Main Street",
  city: "Pune",
  pinCode: "411001",
  state: "Maharashtra",
  district: "Pune",
  hrContactName: "Rita Sharma",
  financeHeadContactName: "Arun Verma",
  hrContactNumber: "9876543210",
  financeHeadContactNumber: "9123456780",
  hrEmail: "hr@acme.example",
  confirmHrEmail: "hr@acme.example",
  financeEmail: "finance@acme.example",
  confirmFinanceEmail: "finance@acme.example",
};

async function fillPage1(
  page: Page,
  zoneId: string,
  overrides: Partial<typeof VALID_PAGE1> = {},
) {
  const values = { ...VALID_PAGE1, ...overrides };

  await page.getByLabel("Company Type").selectOption(values.companyType);
  await page.getByLabel("Company Name").fill(values.companyName);
  await page.getByLabel("Registration Type").selectOption(values.registrationType);
  await page.getByLabel("TAN Number").fill(values.tanNumber);
  await page.getByLabel("GST Number").fill(values.gstNumber);
  await page.getByLabel("Zone").selectOption(zoneId);
  await page.getByLabel("Company Plant").fill(values.plantName);
  await page.getByLabel("Address Line 1").fill(values.addressLine1);
  await page.getByLabel("City").fill(values.city);
  await page.getByLabel("PIN Code").fill(values.pinCode);
  await page.getByLabel("State").fill(values.state);
  await page.getByLabel("District").fill(values.district);
  await page.getByLabel("HR Contact Name").fill(values.hrContactName);
  await page.getByLabel("Finance Head Contact Name").fill(values.financeHeadContactName);
  await page.getByLabel("HR Contact Number").fill(values.hrContactNumber);
  await page.getByLabel("Finance Head Contact Number").fill(values.financeHeadContactNumber);
  // D155: an HR and a Finance email, each confirmed.
  await page.getByLabel("HR Email ID", { exact: true }).fill(values.hrEmail);
  await page.getByLabel("Confirm HR Email ID").fill(values.confirmHrEmail);
  await page.getByLabel("Finance Email ID", { exact: true }).fill(values.financeEmail);
  await page.getByLabel("Confirm Finance Email ID").fill(values.confirmFinanceEmail);
}

const VALID_PDF_BYTES = Buffer.from("%PDF-1.4\n%mock mou document\n");

async function uploadValidPdf(page: Page, filename = "agreement.pdf") {
  await page.getByLabel("Upload MoU PDF").setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: VALID_PDF_BYTES,
  });
  await expect(page.getByText(filename)).toBeVisible();
}

/** A valid Page 2, so a test only has to name the one field it spoils. */
const VALID_PAGE2 = {
  mouStartDate: "2026-01-01",
  tenureValue: "24",
  attendanceCycle: "Monthly",
  stipendDate: "5",
};

async function fillPage2(page: Page, overrides: Partial<typeof VALID_PAGE2> = {}) {
  const values = { ...VALID_PAGE2, ...overrides };

  await page.getByLabel("MoU Start Date").fill(values.mouStartDate);
  // D157: the tenure is months, with no unit to choose.
  await page.getByLabel(/Tenure/).fill(values.tenureValue);
  await page.getByLabel("Attendance Cycle").fill(values.attendanceCycle);
  await page.getByLabel("Stipend Date").fill(values.stipendDate);
  await uploadValidPdf(page);
}

/** A valid Page 3: a scheme and one trainee category - D158 left no payroll
 * items to answer. */
const VALID_PAGE3 = {
  scheme: "WILP",
  category: "Category A",
};

async function fillPage3(page: Page, overrides: Partial<typeof VALID_PAGE3> = {}) {
  const values = { ...VALID_PAGE3, ...overrides };

  await page.getByLabel("Scheme").selectOption(values.scheme);
  await page.getByRole("button", { name: "Add Trainee Category" }).click();
  await page.getByLabel("Category").fill(values.category);
}

// ---------------------------------------------------------------------------
// SPEC-04 — Page 1
// ---------------------------------------------------------------------------

test("AC1 every Page 1 dropdown is populated from the API, not hardcoded", async ({
  page,
  request,
}) => {
  await signIn(page, accountFor("ADMIN"));
  await page.goto("/companies/new");
  await discardLeftoverDraft(page);

  const zoneId = await firstZoneId(request);

  // Company Type and Registration Type come from /api/enums.
  await expect(page.getByLabel("Company Type").locator("option")).not.toHaveCount(1);
  await expect(page.getByLabel("Registration Type").locator("option")).not.toHaveCount(1);

  // Zone comes from /api/zones and offers the real zone we just read.
  await expect(page.getByLabel("Zone").locator(`option[value="${zoneId}"]`)).toHaveCount(1);

  // D156: Contact Type is no longer asked - Page 1 has no radio pair.
  await expect(page.getByRole("radio")).toHaveCount(0);
});

test("AC9 Next with a required field empty keeps the user on Page 1 and marks it", async ({
  page,
  request,
}) => {
  await signIn(page, accountFor("ADMIN"));
  await page.goto("/companies/new");
  await discardLeftoverDraft(page);

  const zoneId = await firstZoneId(request);
  await fillPage1(page, zoneId, { companyName: "" });

  await page.getByRole("button", { name: "Next" }).click();

  // Still on Page 1, and the offending field is marked.
  await expect(page.getByRole("heading", { name: "Company Details" })).toBeVisible();
  await expect(page.getByText("Required")).toBeVisible();
  await expect(page.getByLabel("Company Name")).toHaveAttribute("aria-invalid", "true");
});

test("AC7 a 5-digit PIN code is rejected", async ({ page, request }) => {
  await signIn(page, accountFor("ADMIN"));
  await page.goto("/companies/new");
  await discardLeftoverDraft(page);

  const zoneId = await firstZoneId(request);
  await fillPage1(page, zoneId, { pinCode: "41100" });

  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Company Details" })).toBeVisible();
  await expect(page.getByText("Enter exactly 6 digits")).toBeVisible();
});

test("AC8 a GST state code disagreeing with State warns but still allows Next", async ({
  page,
  request,
}) => {
  await signIn(page, accountFor("ADMIN"));
  await page.goto("/companies/new");
  await discardLeftoverDraft(page);

  const zoneId = await firstZoneId(request);
  // 09 is Uttar Pradesh, but State says Maharashtra.
  await fillPage1(page, zoneId, { gstNumber: "09AAPFU0939F1ZV", state: "Maharashtra" });

  await page.getByRole("button", { name: "Next" }).click();

  // The warning is shown...
  await expect(page.getByText(/This GST belongs to Uttar Pradesh/)).toBeVisible();
  // ...and Next is still allowed through to Page 2.
  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
});

test("AC6 an email and its confirmation differing only in case are accepted", async ({
  page,
  request,
}) => {
  await signIn(page, accountFor("ADMIN"));
  await page.goto("/companies/new");
  await discardLeftoverDraft(page);

  const zoneId = await firstZoneId(request);
  await fillPage1(page, zoneId, {
    hrEmail: "A@B.com",
    confirmHrEmail: "a@b.com",
    financeEmail: "F@B.com",
    confirmFinanceEmail: "f@b.com",
  });

  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
});

// ---------------------------------------------------------------------------
// SPEC-05 — Page 2
// ---------------------------------------------------------------------------

async function goToPage2(page: Page, request: APIRequestContext) {
  await signIn(page, accountFor("ADMIN"));
  await page.goto("/companies/new");
  await discardLeftoverDraft(page);

  const zoneId = await firstZoneId(request);
  await fillPage1(page, zoneId);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();
}

test("AC1 a 24-month tenure computes the end date; there is no unit to choose (D157)", async ({
  page,
  request,
}) => {
  await goToPage2(page, request);

  await page.getByLabel("MOU Start Date").fill("2026-01-01");
  await page.getByLabel(/Tenure/).fill("24");
  await expect(page.getByText("2027-12-31")).toBeVisible();
  await expect(page.getByLabel("Unit")).toHaveCount(0);

  await page.getByRole("button", { name: "Cancel" }).click();
});

test("AC2 a file that is not really a PDF is rejected at upload time", async ({ page, request }) => {
  await goToPage2(page, request);

  await page.getByLabel("Upload MoU PDF").setInputFiles({
    name: "agreement.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("this is not a pdf"),
  });

  await expect(page.getByText(/not a valid PDF/i)).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
});

test("AC3 an 11 MB PDF is rejected with a size error", async ({ page, request }) => {
  await goToPage2(page, request);

  const oversized = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024)]);
  await page.getByLabel("Upload MoU PDF").setInputFiles({
    name: "agreement.pdf",
    mimeType: "application/pdf",
    buffer: oversized,
  });

  await expect(page.getByText(/10 ?MB/i)).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
});

test("AC4 stipend date 0 or 32 is rejected, 31 is accepted", async ({ page, request }) => {
  await goToPage2(page, request);

  await fillPage2(page, { stipendDate: "0" });
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();
  await expect(page.getByText("Enter a day of month between 1 and 31")).toBeVisible();

  await page.getByLabel("Stipend Date").fill("32");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Enter a day of month between 1 and 31")).toBeVisible();

  await page.getByLabel("Stipend Date").fill("31");
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Payroll Details" })).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("AC7 an Other row with a label but no amount blocks Next; a fully empty row is ignored", async ({
  page,
  request,
}) => {
  await goToPage2(page, request);
  await fillPage2(page);

  // A fully empty row is added and left untouched - it must not block Next.
  await page.getByRole("button", { name: "Add Other charge" }).click();

  // A second row gets only a label.
  await page.getByRole("button", { name: "Add Other charge" }).click();
  await page.getByLabel("Label").last().fill("Festival Bonus");

  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();
  await expect(page.getByText("Required").first()).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
});

test("AC8 two Other rows with the same label are rejected", async ({ page, request }) => {
  await goToPage2(page, request);
  await fillPage2(page);

  await page.getByRole("button", { name: "Add Other charge" }).click();
  await page.getByLabel("Label").last().fill("Bonus");
  await page.getByLabel("Amount").last().fill("500");
  await page.getByLabel("Type").last().selectOption("ALLOWANCE");

  await page.getByRole("button", { name: "Add Other charge" }).click();
  await page.getByLabel("Label").last().fill("bonus");
  await page.getByLabel("Amount").last().fill("300");
  await page.getByLabel("Type").last().selectOption("DEDUCTION");

  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();
  await expect(page.getByText("This label is used by another row").first()).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
});

test("AC9 Next with no PDF uploaded is blocked", async ({ page, request }) => {
  await goToPage2(page, request);

  await page.getByLabel("MOU Start Date").fill(VALID_PAGE2.mouStartDate);
  await page.getByLabel(/Tenure/).fill(VALID_PAGE2.tenureValue);
  await page.getByLabel("Attendance Cycle").fill(VALID_PAGE2.attendanceCycle);
  await page.getByLabel("Stipend Date").fill(VALID_PAGE2.stipendDate);
  // Deliberately no PDF upload.

  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();
  await expect(page.getByText("Upload the signed MOU PDF")).toBeVisible();

  await page.getByRole("button", { name: "Cancel" }).click();
});

// ---------------------------------------------------------------------------
// SPEC-06 — Page 3
// ---------------------------------------------------------------------------

async function goToPage3(page: Page, request: APIRequestContext) {
  await signIn(page, accountFor("ADMIN"));
  await page.goto("/companies/new");
  await discardLeftoverDraft(page);

  const zoneId = await firstZoneId(request);
  await fillPage1(page, zoneId);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();
  await fillPage2(page);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Payroll Details" })).toBeVisible();
}

test("D158 Page 3 asks only for trainee categories - no payroll item to answer", async ({ page, request }) => {
  await goToPage3(page, request);

  await expect(page.getByRole("radio", { name: "Yes" })).toHaveCount(0);
  await expect(page.getByText("Fixed Payroll Items")).toHaveCount(0);
  await expect(page.getByText("Other Payroll Items")).toHaveCount(0);

  await fillPage3(page);
  await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
});

test("AC6 two categories named Trainee and trainee are rejected as duplicates", async ({ page, request }) => {
  await goToPage3(page, request);
  await fillPage3(page, { category: "Trainee" });

  await page.getByRole("button", { name: "Add Trainee Category" }).click();
  await page.getByLabel("Category").last().fill("trainee");

  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("heading", { name: "Payroll Details" })).toBeVisible();
  await expect(page.getByText("This name is used by another category").first()).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
});

// ---------------------------------------------------------------------------
// SPEC-03 — shell behaviour, now over the full Page 1
// ---------------------------------------------------------------------------

test("AC2 completing Page 1 and refreshing resumes on Page 2 with values intact", async ({
  page,
  request,
}) => {
  await signIn(page, accountFor("DATA_ENTRY"));
  await page.goto("/companies/new");
  await discardLeftoverDraft(page);

  const zoneId = await firstZoneId(request);
  await fillPage1(page, zoneId);
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();

  await page.reload();

  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();

  // Back to Page 1 — the values survived the refresh.
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByLabel("Company Name")).toHaveValue("Acme Industries");
  await expect(page.getByLabel("Company Plant")).toHaveValue("Pune Plant");

  await page.getByRole("button", { name: "Cancel" }).click();
});

test("AC3 back from Page 3 to Page 1 and forward again preserves values", async ({
  page,
  request,
}) => {
  await signIn(page, accountFor("ADMIN"));
  await page.goto("/companies/new");
  await discardLeftoverDraft(page);

  const zoneId = await firstZoneId(request);
  await fillPage1(page, zoneId);
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();
  await fillPage2(page, { mouStartDate: "2026-06-01" });
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Payroll Details" })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();

  await expect(page.getByLabel("MOU Start Date")).toHaveValue("2026-06-01");
  await page.getByRole("button", { name: "Back" }).click();

  await expect(page.getByLabel("Company Name")).toHaveValue("Acme Industries");
  await expect(page.getByLabel("GST Number")).toHaveValue("27AAPFU0939F1ZV");

  await page.getByRole("button", { name: "Cancel" }).click();
});

test("AC7 cancel deletes the draft and returns to dashboard", async ({ page }) => {
  await signIn(page, accountFor("ADMIN"));
  await page.goto("/companies/new");
  await discardLeftoverDraft(page);

  await page.getByRole("button", { name: "Cancel" }).click();

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

  await page.goto("/companies/new");
  await expect(page.getByLabel("Company Name")).toBeVisible();
  await expect(page.getByText("unsaved draft")).not.toBeVisible();
});

test("full wizard flow creates a company and shows the generated code", async ({
  page,
  request,
}) => {
  await signIn(page, accountFor("DATA_ENTRY"));
  await page.goto("/companies/new");
  await discardLeftoverDraft(page);

  const zoneId = await firstZoneId(request);
  await fillPage1(page, zoneId);
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Commercial Details" })).toBeVisible();
  await fillPage2(page);
  await page.getByRole("button", { name: "Next" }).click();

  await expect(page.getByRole("heading", { name: "Payroll Details" })).toBeVisible();
  await fillPage3(page);
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Company Saved")).toBeVisible();
  await expect(page.getByText(/Generated code:/)).toBeVisible();
});
