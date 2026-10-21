/**
 * Purpose: Unit tests for the SPEC-23 §5 record PDF renderer, fed a fixed record
 * so no database is involved. The PDF is rendered uncompressed and its text is
 * read back from the TJ operators (hex segments joined across kerning gaps),
 * which proves what a reader would see: header, five sections, PF as a
 * percentage, TDS as text, repeated table headers and "Page x of y".
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import type { CompanyRecord } from "./company-record-pdf.ts";
import { renderCompanyRecordPdf, renderCompanyRecordsPdf } from "./company-record-pdf.ts";

const LOGO = new URL("../../assets/logo-ysf.png", import.meta.url);

function agreement(index: number) {
  return {
    mouId: `m${index}`,
    generatedCode: `MOU-NAPS-2020-${String(index).padStart(4, "0")}`,
    scheme: "NAPS",
    plantName: "Chakan Plant",
    mouStartDate: "2020-01-01",
    endDate: "2020-12-31",
    status: "EXPIRED" as const,
    isActive: false,
  };
}

function record(overrides: Partial<CompanyRecord> = {}): CompanyRecord {
  return {
    overview: {
      id: "c1",
      companyName: "Acme Gears Pvt Ltd",
      companyType: "PRIVATE_SECTOR",
      sector: "AUTOMOBILE",
      registrationType: "COMPANY",
      tanNumber: "PNEA12345B",
      gstNumber: "27AAACA1234A1Z5",
      zoneId: "z1",
      zoneName: "Pune",
      addressLine1: "Plot 4, MIDC",
      addressLine2: null,
      city: "Pune",
      pinCode: "410501",
      district: "Pune",
      state: "Maharashtra",
      contactType: null,
      hrContactName: "Asha Rao",
      hrContactNumber: "9876543210",
      financeHeadContactName: "Ravi Iyer",
      financeHeadContactNumber: "9876501234",
      hrEmail: "hr@acme.in",
      financeEmail: "accounts@acme.in",
      purchaseName: null,
      purchaseNumber: null,
      purchaseEmail: null,
      plants: [{ id: "p1", plantName: "Chakan Plant" }],
    },
    commercial: {
      mouId: "m0",
      generatedCode: "MOU-NAPS-2026-0001",
      companyId: "c1",
      companyPlantId: "p1",
      scheme: "NAPS",
      mouStartDate: "2026-01-01",
      tenureValue: 12,
      tenureUnit: "MONTHS",
      endDate: "2026-12-31",
      status: "ACTIVE",
      attendanceCycle: "16th to 15th",
      stipendDate: 7,
      charges: [
        { itemKey: "ADMIN_CHARGES", label: "Admin Charges", amount: "1500.00", period: "MONTHLY", basis: "FLAT" },
        { itemKey: "INSURANCE", label: "Insurance", amount: null, period: null, basis: null },
      ],
      otherItems: [{ label: "Safety Kit", amount: "250.00", itemType: "DEDUCTION" }],
      document: undefined,
    },
    payroll: {
      scheme: "NAPS",
      traineeCategories: ["ITI Fitter", "Diploma"],
      allowances: [{ itemKey: "HRA", label: "HRA", valueKind: "AMOUNT", amount: "1500.00", isApplicable: true }],
      deductions: [
        { itemKey: "PF", label: "Provident Fund (PF)", valueKind: "PERCENT", amount: "12.00", isApplicable: true },
        { itemKey: "ESI", label: "ESI", valueKind: "PERCENT", amount: "0.75", isApplicable: true },
        { itemKey: "TDS", label: "TDS", valueKind: "STATUS", amount: null, isApplicable: true },
      ],
    },
    agreements: [agreement(1)],
    documents: [
      { name: "signed-mou.pdf", type: "MoU Document", sizeBytes: 2.5 * 1024 * 1024, uploadedAt: "2026-01-05T10:00:00Z" },
      { name: "gst.png", type: "GST Certificate", sizeBytes: 48 * 1024, uploadedAt: "2026-02-01T10:00:00Z" },
    ],
    today: "2026-10-20",
    generatedBy: "asha",
    ...overrides,
  };
}

/** Every text line drawn, decoded from the uncompressed content streams. */
function pdfText(pdf: Buffer): string[] {
  const source = pdf.toString("latin1");
  return [...source.matchAll(/\[([^\]]*)\]\s*TJ/g)].map((match) =>
    [...(match[1] ?? "").matchAll(/<([0-9a-f]*)>/g)].map((hex) => Buffer.from(hex[1] ?? "", "hex").toString("latin1")).join(""),
  );
}

async function render(overrides: Partial<CompanyRecord> = {}, logo?: Buffer) {
  const pdf = await renderCompanyRecordPdf(record(overrides), { logo, compress: false });
  return { pdf, lines: pdfText(pdf) };
}

test("the record renders as a PDF", async () => {
  const { pdf } = await render();
  assert.equal(pdf.subarray(0, 4).toString("latin1"), "%PDF");
});

test("AC8 the header carries the company name, zone and MoU code", async () => {
  const { lines } = await render();
  assert.ok(lines.includes("Acme Gears Pvt Ltd"));
  assert.ok(lines.some((line) => line.includes("Pune Zone") && line.includes("MOU-NAPS-2026-0001")));
});

test("the status pill shows the displayed status - an active MoU ending in 72 days is Expiring", async () => {
  const { lines } = await render();
  assert.ok(lines.includes("EXPIRING"));
});

test("AC8 all five section headings are present, in order", async () => {
  const { lines } = await render();
  const order = ["OVERVIEW", "COMMERCIAL", "PAYROLL", "HISTORY", "DOCUMENTS"].map((heading) => lines.indexOf(heading));
  assert.ok(order.every((index) => index >= 0), `missing heading: ${JSON.stringify(order)}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test("AC8 PF and ESI print as percentages, TDS as its text, amounts in Rs. per month", async () => {
  const { lines } = await render();
  assert.ok(lines.includes("12%"));
  assert.ok(lines.includes("0.75%"));
  assert.ok(lines.includes("As applicable"));
  assert.ok(lines.includes("Rs. 1500.00/mo"));
});

test("a statutory item the MOU never recorded prints Not recorded", async () => {
  const base = record();
  const deductions = [{ itemKey: "PF", label: "Provident Fund (PF)", valueKind: "PERCENT" as const, amount: null, isApplicable: null }];
  const { lines } = await render({ payroll: base.payroll === undefined ? undefined : { ...base.payroll, deductions } });
  assert.ok(lines.includes("Not recorded"));
});

test("commercial charges show amount, period and basis; a blank charge is left out", async () => {
  const { lines } = await render();
  assert.ok(lines.includes("Admin Charges"));
  assert.ok(lines.includes("Monthly"));
  assert.ok(lines.includes("Flat"));
  assert.ok(lines.includes("Safety Kit (Deduction)"));
  assert.ok(!lines.includes("Insurance"));
});

test("documents list the size in MB or KB and the upload date", async () => {
  const { lines } = await render();
  assert.ok(lines.includes("2.5 MB"));
  assert.ok(lines.includes("48.0 KB"));
  assert.ok(lines.includes("GST Certificate"));
});

test("a long history runs onto more pages, repeats its header row, and every page is numbered", async () => {
  const many = Array.from({ length: 80 }, (_, index) => agreement(index + 1));
  const { lines } = await render({ agreements: many });
  const pageLines = lines.filter((line) => /^Page \d+ of \d+$/.test(line));
  assert.ok(pageLines.length >= 2, "expected at least two pages");
  const total = pageLines[0]?.split(" of ")[1];
  assert.ok(pageLines.every((line) => line.endsWith(` of ${total}`)));
  assert.ok(lines.filter((line) => line === "MoU Code").length >= 2, "the history header must repeat");
});

test("pages after the first repeat the company name and MoU code in a running header", async () => {
  const many = Array.from({ length: 80 }, (_, index) => agreement(index + 1));
  const { lines } = await render({ agreements: many });
  assert.ok(lines.filter((line) => line === "Acme Gears Pvt Ltd").length >= 2);
  assert.ok(lines.filter((line) => line === "MOU-NAPS-2026-0001").length >= 2);
});

test("no blank trailing page is added by the footer - every page object is a numbered page", async () => {
  const { pdf, lines } = await render();
  const pageObjects = pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? [];
  const footers = lines.filter((line) => /^Page \d+ of \d+$/.test(line));
  assert.equal(pageObjects.length, footers.length);
  assert.ok(footers.every((line) => line.endsWith(` of ${footers.length}`)));
});

test("empty sections say so instead of drawing an empty table", async () => {
  const { lines } = await render({ payroll: undefined, agreements: [], documents: [] });
  assert.ok(lines.includes("No payroll configuration recorded."));
  assert.ok(lines.includes("No documents uploaded."));
});

test("with the logo the header embeds an image; without it a YSF mark is drawn", async () => {
  const withLogo = await render({}, await readFile(LOGO));
  assert.match(withLogo.pdf.toString("latin1"), /\/Subtype \/Image/);
  const withoutLogo = await render();
  assert.ok(withoutLogo.lines.includes("YSF"));
});

// --- SPEC-24: several records in one PDF ----------------------------------------------

function secondRecord(): CompanyRecord {
  const base = record();
  return {
    ...base,
    overview: { ...base.overview, id: "c2", companyName: "Bharat Forge Works" },
    commercial: { ...base.commercial, mouId: "m9", generatedCode: "MOU-WILP-2026-0042", companyId: "c2" },
  };
}

async function renderMany(records: readonly CompanyRecord[]) {
  const pdf = await renderCompanyRecordsPdf(records, { compress: false });
  return { pdf, lines: pdfText(pdf) };
}

test("SPEC-24 every record starts on a new page with its own header band and five sections", async () => {
  const pageCount = (pdf: Buffer): number => (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;
  const { pdf, lines } = await renderMany([record(), secondRecord()]);
  assert.ok(lines.includes("Acme Gears Pvt Ltd"));
  assert.ok(lines.includes("Bharat Forge Works"));
  assert.equal(lines.filter((line) => line === "OVERVIEW").length, 2);
  assert.equal(lines.filter((line) => line === "DOCUMENTS").length, 2);
  // Only a page break before each record makes the pages add up exactly.
  const first = await renderMany([record()]);
  const second = await renderMany([secondRecord()]);
  assert.equal(pageCount(pdf), pageCount(first.pdf) + pageCount(second.pdf));
});

test("SPEC-24 page numbers run across the whole file", async () => {
  const { lines } = await renderMany([record(), secondRecord(), record()]);
  const footers = lines.filter((line) => /^Page \d+ of \d+$/.test(line));
  assert.equal(footers[0], `Page 1 of ${footers.length}`);
  assert.equal(footers.at(-1), `Page ${footers.length} of ${footers.length}`);
});

test("SPEC-24 a continuation page names the record it belongs to, not the first one", async () => {
  const many = Array.from({ length: 80 }, (_, index) => agreement(index + 1));
  const second = { ...secondRecord(), agreements: many };
  const { lines } = await renderMany([record(), second]);
  // The second record runs over several pages, so its code repeats in its running headers.
  assert.ok(lines.filter((line) => line === "MOU-WILP-2026-0042").length >= 3);
});

test("SPEC-24 the single-record PDF is the one-record case of the same renderer", async () => {
  const single = pdfText(await renderCompanyRecordPdf(record(), { compress: false }));
  const many = (await renderMany([record()])).lines;
  assert.deepEqual(single, many);
});

test("SPEC-24 rendering no records is refused rather than producing an empty PDF", async () => {
  await assert.rejects(renderCompanyRecordsPdf([], {}), /at least one record/);
});
