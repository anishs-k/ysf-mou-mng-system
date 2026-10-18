/**
 * Purpose: UI tests proving the Figma-clone Upload MoU screen drives the real
 * Zone -> Company -> Plant -> Scheme cascade, accepts PDFs only, uploads through
 * POST /api/mous/:mouId/document and lists GET /api/mous/:mouId/documents, and
 * honours the ?mouId= deep link.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { API_URL, MINIMAL_PDF, insertCompanyWithMou, signInAs } from "./figma-fixtures";
import type { MouFixture } from "./figma-fixtures";

async function chooseMou(page: Page, fixture: MouFixture): Promise<void> {
  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await page.getByLabel("Company").selectOption(fixture.companyId);
  await page.getByLabel("Plant").selectOption(fixture.plantId);
  // A company plant with one MoU auto-selects its scheme.
  await expect(page.getByLabel("Scheme")).toHaveValue(fixture.mouId);
}

test("each select stays disabled until the previous one is chosen", async ({ page }) => {
  const fixture = await insertCompanyWithMou();
  await signInAs(page, "DATA_ENTRY");
  await page.goto("/upload-mou");

  await expect(page.getByLabel("Company")).toBeDisabled();
  await expect(page.getByLabel("Plant")).toBeDisabled();
  await expect(page.getByLabel("Scheme")).toBeDisabled();

  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await expect(page.getByLabel("Company")).toBeEnabled();
  await expect(page.getByLabel("Plant")).toBeDisabled();

  await page.getByLabel("Company").selectOption(fixture.companyId);
  await expect(page.getByLabel("Plant")).toBeEnabled();
});

test("a non-PDF file is refused in the browser", async ({ page }) => {
  const fixture = await insertCompanyWithMou();
  await signInAs(page, "DATA_ENTRY");
  await page.goto("/upload-mou");
  await chooseMou(page, fixture);

  await page.locator('input[type="file"]').setInputFiles({
    name: "terms.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from("not a pdf"),
  });

  await expect(page.getByRole("alert")).toContainText("PDF");
  await expect(page.getByRole("button", { name: "Save Document" })).toBeDisabled();
});

test("Save Document uploads the PDF and lists it under Attached Documents", async ({ page }) => {
  const fixture = await insertCompanyWithMou();
  await signInAs(page, "DATA_ENTRY");
  await page.goto("/upload-mou");
  await chooseMou(page, fixture);

  await page.locator('input[type="file"]').setInputFiles({
    name: "signed-mou.pdf",
    mimeType: "application/pdf",
    buffer: MINIMAL_PDF,
  });
  await page.getByLabel("Document Date").fill("2026-10-01");
  await page.getByLabel("Valid Until").fill("2027-09-30");
  await page.getByLabel("Reference Number").fill("E2E/REF/001");
  await page.getByRole("button", { name: "Save Document" }).click();

  await expect(page.getByRole("heading", { name: "Document Saved Successfully" })).toBeVisible();
  await expect(page.getByText("signed-mou.pdf").first()).toBeVisible();

  const response = await page.request.get(`${API_URL}/api/mous/${fixture.mouId}/documents`);
  expect(response.ok()).toBe(true);
  const documents = (await response.json()) as readonly { id: string; originalFilename: string }[];
  expect(documents.map((document) => document.originalFilename)).toContain("signed-mou.pdf");

  const attached = page.locator("table tbody tr");
  await expect(attached).toHaveCount(documents.length);
  await expect(attached.filter({ hasText: "signed-mou.pdf" }).getByRole("link", { name: "Download" })).toHaveAttribute(
    "href",
    new RegExp(`/api/documents/${documents[0]?.id ?? ""}`),
  );
});

test("?mouId= preselects zone, company, plant and scheme", async ({ page }) => {
  const fixture = await insertCompanyWithMou();
  await signInAs(page, "ADMIN");
  await page.goto(`/upload-mou?mouId=${fixture.mouId}`);

  await expect(page.getByLabel("Zone")).toHaveValue(fixture.zoneId);
  await expect(page.getByLabel("Company")).toHaveValue(fixture.companyId);
  await expect(page.getByLabel("Plant")).toHaveValue(fixture.plantId);
  await expect(page.getByLabel("Scheme")).toHaveValue(fixture.mouId);
});
