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
import { buildContactsWorkbook, companiesSheetColumns, renderZoneSummaryPdf } from "./export-builder.ts";

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

// --- SPEC-29: the HR & client contacts workbook --------------------------------

function overviewFor(companyId: string) {
  return {
    id: companyId,
    companyName: "Acme Gears",
    companyType: "PRIVATE_SECTOR",
    sector: "AUTOMOBILE",
    registrationType: "COMPANY",
    tanNumber: "PNEA12345B",
    gstNumber: "27AAACA1234A1Z5",
    zoneId: "z1",
    zoneName: "Pune",
    addressLine1: "Plot 4",
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
    pocName: "Rahul Sharma",
    pocNumber: "9876512345",
    decisionMakerName: null,
    decisionMakerNumber: null,
    zonalManager: "Abhishek B.",
    plants: [],
  };
}

test("SPEC-29 the contacts workbook has one row per MoU with every contact column", async () => {
  const rows = [mou(1, "z1", "ACTIVE"), mou(2, "z1", "EXPIRED")];
  const overviews = new Map(rows.map((row) => [row.companyId, overviewFor(row.companyId)]));
  const workbook = buildContactsWorkbook(rows, overviews);
  const sheet = workbook.getWorksheet("Contacts");
  assert.ok(sheet !== undefined);
  const headers = (sheet.getRow(1).values as unknown[]).slice(1);
  assert.deepEqual(headers, [
    "Company Name",
    "MoU Code",
    "Zone",
    "Plant",
    "Scheme",
    "Status",
    "HR Contact Name",
    "HR Contact Number",
    "HR Email",
    "Finance Head Name",
    "Finance Head Number",
    "Finance Email",
    "Purchase Name",
    "Purchase Number",
    "Purchase Email",
    "POC Name",
    "POC Number",
    "Decision Maker Name",
    "Decision Maker Number",
    "Zonal Manager",
  ]);
  assert.equal(sheet.rowCount, 3);
  const first = sheet.getRow(2);
  assert.equal(first.getCell(1).value, "Company 1");
  assert.equal(first.getCell(7).value, "Asha Rao");
  assert.equal(first.getCell(16).value, "Rahul Sharma");
  assert.equal(first.getCell(18).value, "");
  assert.equal(first.getCell(20).value, "Abhishek B.");
});

test("SPEC-29 a MoU whose company has no overview still lists its search row", () => {
  const workbook = buildContactsWorkbook([mou(3, "z1", "ACTIVE")], new Map());
  const row = workbook.getWorksheet("Contacts")?.getRow(2);
  assert.equal(row?.getCell(1).value, "Company 3");
  assert.equal(row?.getCell(7).value, "HR");
});

test("SPEC-32 the Companies sheet lists contact columns only for a role that may export contacts", () => {
  const contactHeaders = [
    "HR Contact Name",
    "HR Contact Number",
    "Finance Head Contact Name",
    "Finance Head Contact Number",
    "HR Email",
    "Finance Email",
    "POC Name",
    "POC Number",
    "Decision Maker Name",
    "Decision Maker Number",
    "Zonal Manager",
  ];
  const withContacts = companiesSheetColumns(true).map((column) => column.header);
  const withoutContacts = companiesSheetColumns(false).map((column) => column.header);
  for (const header of contactHeaders) {
    assert.ok(withContacts.includes(header), header);
    assert.ok(!withoutContacts.includes(header), header);
  }
  assert.deepEqual(withoutContacts, withContacts.filter((header) => !contactHeaders.includes(String(header))));
  assert.equal(withoutContacts[0], "Company Name");
});

test("the contacts workbook's header cells are bold", () => {
  const sheet = buildContactsWorkbook([], new Map()).getWorksheet("Contacts");
  assert.ok(sheet !== undefined);
  sheet.getRow(1).eachCell((headerCell) => assert.equal(headerCell.font?.bold, true, String(headerCell.value)));
});
