/**
 * Purpose: UI tests proving the Figma-clone Edit Agreement screen runs SPEC-10 on
 * the API: the cascade opens a real MoU, the summary strip shows its code and the
 * history's current version, the Company Details tab shows Figma's Previous/New
 * Value rows with locked inputs, choosing a reason (plus proof for Communication
 * from HR) fetches the edit token and unlocks the fields with no Start Editing
 * step, Save Draft restores in-progress edits in this browser, edits are
 * validated and diffed, and Save & Submit applies them as a new version.
 */

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { API_URL, insertCompanyWithMou, signInAs } from "./figma-fixtures";
import type { MouFixture } from "./figma-fixtures";

async function openAgreement(page: Page, fixture: MouFixture): Promise<void> {
  await page.goto("/agreements/edit");
  await page.getByLabel("Zone").selectOption(fixture.zoneId);
  await page.getByLabel("Company").selectOption(fixture.companyId);
  await page.getByLabel("Plant").selectOption(fixture.plantId);
  await expect(page.getByLabel("Scheme")).toHaveValue(fixture.mouId);
  await page.getByRole("button", { name: "OK" }).click();
}

async function currentVersion(page: Page, mouId: string): Promise<number> {
  const response = await page.request.get(`${API_URL}/api/mous/${mouId}/history`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { currentVersion: number }).currentVersion;
}

test("the summary strip shows the MoU's code and the history's current version", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ withPayroll: true });
  await signInAs(page, "ADMIN");
  await openAgreement(page, fixture);

  const version = await currentVersion(page, fixture.mouId);
  const summary = page.getByTestId("agreement-summary");
  await expect(summary).toContainText(fixture.companyName);
  await expect(summary).toContainText(fixture.plantName);
  await expect(summary).toContainText(fixture.generatedCode);
  await expect(summary).toContainText(`V${version}`);
});

test("Company Details shows previous values beside locked new-value inputs", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ withPayroll: true });
  await signInAs(page, "ADMIN");
  await openAgreement(page, fixture);

  await expect(page.getByText("Previous Value")).toBeVisible();
  await expect(page.getByText("New Value")).toBeVisible();
  const newName = page.getByLabel("New Company Name");
  await expect(newName).toHaveAttribute("placeholder", "Enter new company name");
  await expect(newName).toBeDisabled();
  await expect(page.getByLabel("New Zone")).toBeDisabled();
  // The Figma form has no remark box and no Start Editing step.
  await expect(page.getByRole("button", { name: "Start Editing" })).toHaveCount(0);
  await expect(page.getByLabel("Remark (optional)")).toHaveCount(0);
});

test("Commercial Details carries Figma's locked Scheme and derived End Date rows", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ withPayroll: true });
  await signInAs(page, "ADMIN");
  await openAgreement(page, fixture);

  await page.getByRole("button", { name: "Addendum in Agreement" }).click();
  await page.getByRole("button", { name: "Commercial Details" }).click();
  await expect(page.getByLabel("New Scheme")).toBeDisabled();
  const endDate = page.getByLabel("New MoU End Date");
  await expect(endDate).toBeDisabled();
  const before = await endDate.inputValue();
  await page.getByLabel("New Tenure", { exact: true }).fill("36");
  await expect(endDate).not.toHaveValue(before);

  await page.getByRole("button", { name: "Payroll Details" }).click();
  await expect(page.getByLabel("New Scheme")).toHaveCount(0);
});

test("Communication from HR needs a proof file before editing starts", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ withPayroll: true });
  await signInAs(page, "ADMIN");
  await openAgreement(page, fixture);

  await page.getByRole("button", { name: "Communication from HR" }).click();
  await page.getByRole("button", { name: "Commercial Details" }).click();
  await expect(page.getByLabel("New Stipend Date")).toHaveCount(0);
  await page.getByRole("button", { name: "Save & Submit" }).click();
  await expect(page.getByRole("heading", { name: "Proof Not Uploaded" })).toBeVisible();
});

test("choosing the proof for Communication from HR unlocks the fields", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ withPayroll: true });
  await signInAs(page, "ADMIN");
  await openAgreement(page, fixture);

  await page.getByRole("button", { name: "Communication from HR" }).click();
  await page.getByTestId("proof-input").setInputFiles({
    name: "proof.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%proof\n"),
  });
  await page.getByRole("button", { name: "Commercial Details" }).click();
  await expect(page.getByLabel("New Stipend Date")).toBeEnabled();
});

test("Save Draft keeps in-progress edits in this browser until they are submitted", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ withPayroll: true });
  await signInAs(page, "ADMIN");
  await openAgreement(page, fixture);

  await page.getByRole("button", { name: "Addendum in Agreement" }).click();
  await page.getByRole("button", { name: "Commercial Details" }).click();
  await page.getByLabel("New Attendance Cycle").fill("Fortnightly");
  await page.getByRole("button", { name: "Save Draft" }).click();
  await expect(page.getByRole("button", { name: "Draft Saved" })).toBeVisible();

  await page.reload();
  await openAgreement(page, fixture);
  await page.getByRole("button", { name: "Addendum in Agreement" }).click();
  await page.getByRole("button", { name: "Commercial Details" }).click();
  await expect(page.getByLabel("New Attendance Cycle")).toHaveValue("Fortnightly");
});

test("an edit is validated, reviewed as a diff and applied as a new version", async ({ page }) => {
  const fixture = await insertCompanyWithMou({ withPayroll: true });
  await signInAs(page, "ADMIN");
  await openAgreement(page, fixture);
  const before = await currentVersion(page, fixture.mouId);

  await page.getByRole("button", { name: "Addendum in Agreement" }).click();

  await page.getByRole("button", { name: "Commercial Details" }).click();
  // An invalid value is caught by the domain validation before review.
  await page.getByLabel("New Stipend Date").fill("45");
  await page.getByRole("button", { name: "Review Changes" }).click();
  await expect(page.getByText("Enter a day of month between 1 and 31")).toBeVisible();

  await page.getByLabel("New Stipend Date").fill("5");
  await page.getByLabel("New Attendance Cycle").fill("Weekly");
  await page.getByRole("button", { name: "Review Changes" }).click();

  const diff = page.getByTestId("review-row").filter({ hasText: "Attendance Cycle" });
  await expect(diff).toContainText("Monthly");
  await expect(diff).toContainText("Weekly");

  await page.getByRole("button", { name: "Save & Submit" }).click();
  await expect(page.getByRole("heading", { name: "Agreement Updated Successfully" })).toBeVisible();

  const after = await currentVersion(page, fixture.mouId);
  expect(after).toBe(before + 1);
  await expect(page.getByText(`V${after}`).last()).toBeVisible();

  await page.getByRole("button", { name: "View Agreement" }).click();
  await expect(page).toHaveURL(new RegExp(`/agreements/history\\?mouId=${fixture.mouId}`));
});
