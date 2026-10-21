/**
 * Purpose: UI tests for SPEC-22 on the real API: switching Add New Company to
 * Bulk Upload hides the whole wizard and leaves only Download Template and Upload
 * Bulk Data; the one Download Template click saves both the Excel and PDF templates; uploading
 * the untouched template is refused with the server's "no company rows" message,
 * and a non-xlsx file is refused before it is sent.
 */

import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { signInAs } from "./figma-fixtures";

async function openBulkMode(page: Page): Promise<void> {
  await signInAs(page, "DATA_ENTRY");
  await page.goto("/companies/new");
  await page.getByRole("button", { name: "Bulk Upload" }).click();
}

test("Bulk Upload hides the wizard and shows only the two bulk buttons", async ({ page }) => {
  await openBulkMode(page);
  for (const name of ["Download Template", "Upload Bulk Data"]) {
    await expect(page.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: /Excel Template|PDF Template/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Save & Continue/ })).toHaveCount(0);
  await expect(page.getByLabel("Company Name")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Discard" })).toHaveCount(0);

  await page.getByRole("button", { name: "Manual Entry" }).click();
  await expect(page.getByRole("button", { name: /Save & Continue/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Upload Bulk Data" })).toHaveCount(0);
});

test("one Download Template click downloads both the Excel and the PDF template", async ({ page }) => {
  await openBulkMode(page);
  const filenames: string[] = [];
  page.on("download", (download) => filenames.push(download.suggestedFilename()));
  await page.getByRole("button", { name: "Download Template", exact: true }).click();
  await expect.poll(() => [...filenames].sort()).toEqual(["company-bulk-template.pdf", "company-bulk-template.xlsx"]);
});

test("an empty template and a non-xlsx file are refused", async ({ page }) => {
  await openBulkMode(page);
  const excel = page.waitForEvent("download", (download) => download.suggestedFilename().endsWith(".xlsx"));
  await page.getByRole("button", { name: "Download Template", exact: true }).click();
  // A download is saved under a random name, so the file is re-offered as .xlsx.
  const template = await readFile(await (await excel).path());

  await page.getByLabel("Bulk data file").setInputFiles({
    name: "company-bulk-template.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: template,
  });
  await expect(page.getByRole("alert")).toContainText("The sheet has no company rows.");

  await page.getByLabel("Bulk data file").setInputFiles({ name: "companies.csv", mimeType: "text/csv", buffer: Buffer.from("a,b") });
  await expect(page.getByRole("alert")).toContainText("companies.csv: only the Excel template (.xlsx) and MoU PDFs (.pdf) can be uploaded.");
});
