/**
 * Purpose: Unit tests for the Export Data page's Zone-wise MoU Summary PDF
 * (SPEC-13 §4.2) in the YSF layout (D166), fed fixed data so no database is
 * involved. The PDF is rendered uncompressed and its text read back from the TJ
 * operators: YSF band, the three kinds of tables, totals, statuses and footers.
 */

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import type { ZoneSummaryPdfData } from "./export-builder.ts";
import { renderZoneSummaryPdf } from "./export-builder.ts";

const LOGO = new URL("../../assets/logo-ysf.png", import.meta.url);

/** Every text line drawn, decoded from the uncompressed content streams. */
function pdfText(pdf: Buffer): string[] {
  const source = pdf.toString("latin1");
  return [...source.matchAll(/\[([^\]]*)\]\s*TJ/g)].map((match) =>
    [...(match[1] ?? "").matchAll(/<([0-9a-f]*)>/g)].map((hex) => Buffer.from(hex[1] ?? "", "hex").toString("latin1")).join(""),
  );
}

function mou(index: number, zoneId: string, status: string, endDate = "2027-12-31") {
  return {
    mouId: `m${index}`,
    companyId: `c${index}`,
    companyName: `Company ${index}`,
    generatedCode: `MOU-NAPS-2026-${String(index).padStart(4, "0")}`,
    zoneId,
    zoneName: zoneId === "z1" ? "Pune" : "Mumbai",
    plantName: index % 2 === 0 ? null : "Chakan Plant",
    scheme: "NAPS",
    mouStartDate: "2026-01-01",
    endDate,
    status,
    hrContactName: "HR",
    hrContactNumber: "9876543210",
    tenureValue: 12,
    tenureUnit: "MONTHS",
    attendanceCycle: "16th to 15th",
    stipendDate: 7,
  };
}

function data(mouCount = 3): ZoneSummaryPdfData {
  const mous = Array.from({ length: mouCount }, (_, index) => mou(index + 1, index === 0 ? "z2" : "z1", "ACTIVE"));
  return {
    summary: [
      { zoneId: "z1", zoneName: "Pune", companies: 2, plants: 3, mous: mouCount - 1, active: 1, expired: 1, new: 0, expiringSoon: 1 },
      { zoneId: "z2", zoneName: "Mumbai", companies: 1, plants: 1, mous: 1, active: 1, expired: 0, new: 0, expiringSoon: 0 },
    ],
    matrix: {
      schemes: ["NAPS", "NATS"],
      rows: [
        { zoneId: "z1", zoneName: "Pune", counts: { NAPS: 2 }, rowTotal: 2 },
        { zoneId: "z2", zoneName: "Mumbai", counts: { NAPS: 1 }, rowTotal: 1 },
      ],
      columnTotals: { NAPS: 3, NATS: 0 },
      grandTotal: 3,
    },
    mous: [...mous, mou(99, "z1", "ACTIVE", "2026-11-15")],
    today: "2026-10-21",
    generatedBy: "pune.entry",
  };
}

async function render(input = data(), logo?: Buffer) {
  const pdf = await renderZoneSummaryPdf(input, { logo, compress: false });
  return { pdf, lines: pdfText(pdf) };
}

test("D166 the summary opens with the YSF band: title, scope figures and who generated it", async () => {
  const { lines } = await render();
  assert.ok(lines.includes("Zone-wise MoU Summary"), "band title");
  assert.ok(lines.includes("2 zones · 3 MoUs · 3 companies"), JSON.stringify(lines.slice(0, 6)));
  assert.ok(lines.includes("Generated 21 Oct 2026 by pune.entry"));
});

test("D166 three sections in order: zone summary, scheme matrix, then each zone's MoUs", async () => {
  const { lines } = await render();
  const order = ["ZONE SUMMARY", "SCHEME MATRIX", "PUNE - MOUS (3)", "MUMBAI - MOUS (1)"].map((heading) => lines.indexOf(heading));
  assert.ok(order.every((index) => index >= 0), JSON.stringify(order));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

test("D166 the zone summary is a table with a totals row", async () => {
  const { lines } = await render();
  for (const header of ["Zone", "Companies", "Plants", "MoUs", "Active", "Expired", "New", "Expiring <= 90d"]) {
    assert.ok(lines.includes(header), header);
  }
  const total = lines.indexOf("Total");
  assert.ok(total >= 0, "totals row");
  assert.deepEqual(lines.slice(total + 1, total + 8), ["3", "4", "3", "2", "1", "0", "1"]);
});

test("D166 the scheme matrix lists scheme labels with row and grand totals", async () => {
  const { lines } = await render();
  const matrix = lines.indexOf("SCHEME MATRIX");
  const after = lines.slice(matrix);
  assert.ok(after.includes("NAPS") && after.includes("NATS"));
  assert.ok(after.includes("Total"));
});

test("D166 a zone's MoU table shows the code, company, plant, dates and the derived status", async () => {
  const { lines } = await render();
  assert.ok(lines.includes("MOU-NAPS-2026-0002"));
  assert.ok(lines.includes("Company 2"));
  assert.ok(lines.includes("01 Jan 2026"));
  assert.ok(lines.includes("Expiring"), "an active MoU ending within the window reads Expiring");
  // Helvetica's WinAnsi encoding writes "—" as byte 0x97, which the latin1 read-back keeps as is.
  assert.ok(lines.includes("\u0097"), "a MoU without a plant shows a dash");
});

test("D166 every page carries the YSF footer with Page x of y; later pages a running header", async () => {
  const { lines } = await render(data(60));
  const pages = lines.filter((line) => /^Page \d+ of \d+$/.test(line));
  assert.ok(pages.length >= 2, "spans pages");
  assert.equal(pages[0], `Page 1 of ${pages.length}`);
  assert.equal(lines.filter((line) => line === "YSF MoU Management System · Confidential").length, pages.length);
  assert.ok(lines.filter((line) => line === "Zone-wise MoU Summary").length >= 2, "running header repeats the title");
});

test("D166 the YSF logo is embedded when given", async () => {
  const { pdf } = await render(data(), await readFile(LOGO));
  assert.match(pdf.toString("latin1"), /\/Subtype \/Image/);
});
