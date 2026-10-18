/**
 * Purpose: The five read-only SPEC-07 endpoints - company overview, the
 * schemes a company (+ plant) has an MOU for, one MOU's commercial and
 * payroll detail, and the printable Page 1 + Page 2 document - plus the
 * company's full agreements list (every MoU, active or not). Every field in
 * this flow is view-only (SPEC-07 section 1), so every route here is a GET
 * with no role restriction beyond being signed in - a VIEWER sees exactly
 * what an ADMIN sees. The query assembly itself lives in db/mou-view.ts so
 * SPEC-11 (history) and SPEC-13 (export) can reuse it.
 */

import { MOU_STATUS_LABELS } from "@mou/domain";
import { Router } from "express";
import type { Request, Response } from "express";
import PDFDocument from "pdfkit";
import type { Pool } from "pg";

import { requireSession } from "../auth/middleware.ts";
import { emptyList, notFoundError, requireInScope } from "../auth/zone-scope.ts";
import type { Database } from "../db/client.ts";
import {
  fetchCompanyAgreements,
  fetchCompanyMous,
  fetchCompanyOverview,
  fetchMouCommercialDetail,
  fetchMouPayrollDetail,
} from "../db/mou-view.ts";
import { isUuid } from "./request-parse.ts";

export function createCompanyViewRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);

  /** GET /api/companies/:id/overview — SPEC-07 Page 1. */
  router.get(
    "/companies/:id/overview",
    requireAuthSession,
    requireInScope(pool, "company", "id", notFoundError("Company not found")),
    async (request: Request, response: Response) => {
      const id = String(request.params["id"] ?? "");
      if (!isUuid(id)) {
        response.status(400).json({ error: "id must be a UUID" });
        return;
      }
      const overview = await fetchCompanyOverview(db, id);
      if (overview === undefined) {
        response.status(404).json({ error: "Company not found" });
        return;
      }
      response.json(overview);
    },
  );

  /** GET /api/companies/:id/agreements — every MoU of the company, active and inactive, newest start first. */
  router.get(
    "/companies/:id/agreements",
    requireAuthSession,
    requireInScope(pool, "company", "id", notFoundError("Company not found")),
    async (request: Request, response: Response) => {
      const id = String(request.params["id"] ?? "");
      if (!isUuid(id)) {
        response.status(400).json({ error: "id must be a UUID" });
        return;
      }
      const agreements = await fetchCompanyAgreements(db, pool, id);
      if (agreements === undefined) {
        response.status(404).json({ error: "Company not found" });
        return;
      }
      response.json(agreements);
    },
  );

  /** GET /api/companies/:id/mous?plantId= — SPEC-07 section 4.1 scheme dropdown. */
  router.get(
    "/companies/:id/mous",
    requireAuthSession,
    requireInScope(pool, "company", "id", emptyList),
    async (request: Request, response: Response) => {
      const id = String(request.params["id"] ?? "");
      if (!isUuid(id)) {
        response.status(400).json({ error: "id must be a UUID" });
        return;
      }
      const plantId = request.query["plantId"];
      if (
        plantId !== undefined &&
        (typeof plantId !== "string" || !isUuid(plantId))
      ) {
        response.status(400).json({ error: "plantId must be a UUID" });
        return;
      }
      const mous = await fetchCompanyMous(db, id, plantId);
      response.json(mous);
    },
  );

  /** GET /api/mous/:mouId/commercial — SPEC-07 Page 2. */
  router.get(
    "/mous/:mouId/commercial",
    requireAuthSession,
    requireInScope(pool, "mou", "mouId", notFoundError("MOU not found")),
    async (request: Request, response: Response) => {
      const mouId = String(request.params["mouId"] ?? "");
      if (!isUuid(mouId)) {
        response.status(400).json({ error: "mouId must be a UUID" });
        return;
      }
      const detail = await fetchMouCommercialDetail(db, pool, mouId);
      if (detail === undefined) {
        response.status(404).json({ error: "MOU not found" });
        return;
      }
      response.json(detail);
    },
  );

  /** GET /api/mous/:mouId/payroll — SPEC-07 Page 3. */
  router.get(
    "/mous/:mouId/payroll",
    requireAuthSession,
    requireInScope(pool, "mou", "mouId", notFoundError("MOU not found")),
    async (request: Request, response: Response) => {
      const mouId = String(request.params["mouId"] ?? "");
      if (!isUuid(mouId)) {
        response.status(400).json({ error: "mouId must be a UUID" });
        return;
      }
      const detail = await fetchMouPayrollDetail(db, mouId);
      if (detail === undefined) {
        response.status(404).json({ error: "MOU not found" });
        return;
      }
      response.json(detail);
    },
  );

  /** GET /api/mous/:mouId/print — SPEC-07 section 4.4: Page 1 + Page 2 only, never payroll. */
  router.get(
    "/mous/:mouId/print",
    requireAuthSession,
    requireInScope(pool, "mou", "mouId", notFoundError("MOU not found")),
    async (request: Request, response: Response) => {
      const mouId = String(request.params["mouId"] ?? "");
      if (!isUuid(mouId)) {
        response.status(400).json({ error: "mouId must be a UUID" });
        return;
      }
      const detail = await fetchMouCommercialDetail(db, pool, mouId);
      if (detail === undefined) {
        response.status(404).json({ error: "MOU not found" });
        return;
      }
      const overview = await fetchCompanyOverview(db, detail.companyId);
      if (overview === undefined) {
        response.status(404).json({ error: "Company not found" });
        return;
      }

      response.setHeader("Content-Type", "application/pdf");
      response.setHeader(
        "Content-Disposition",
        `inline; filename="${detail.generatedCode}.pdf"`,
      );

      const doc = new PDFDocument({ margin: 50 });
      doc.pipe(response);

      doc.fontSize(18).text(overview.companyName, { underline: true });
      doc.fontSize(11).moveDown(0.5);
      // SPEC-16 D109: the code belongs to the MOU, not the company, so this print
      // (which is MOU-scoped) reports the MOU's own code.
      doc.text(`MoU Code: ${detail.generatedCode}`);
      doc.text(`GST Number: ${overview.gstNumber}`);
      doc.text(
        `HR Contact: ${overview.hrContactName} (${overview.hrContactNumber})`,
      );
      doc.text(
        `Finance Head: ${overview.financeHeadContactName} (${overview.financeHeadContactNumber})`,
      );

      doc
        .moveDown()
        .fontSize(14)
        .text("Commercial Details", { underline: true });
      doc.fontSize(11).moveDown(0.5);
      doc.text(`Scheme: ${detail.scheme}`);
      doc.text(`MoU Start Date: ${detail.mouStartDate}`);
      doc.text(`Tenure: ${detail.tenureValue} ${detail.tenureUnit}`);
      doc.text(`MoU End Date: ${detail.endDate}`);
      doc.text(`Status: ${MOU_STATUS_LABELS[detail.status]}`);
      doc.text(`Attendance Cycle: ${detail.attendanceCycle}`);
      doc.text(`Stipend Date: ${detail.stipendDate ?? "—"}`);

      doc.moveDown().fontSize(12).text("Charges", { underline: true });
      doc.fontSize(11);
      for (const charge of detail.charges) {
        doc.text(`${charge.label}: ${charge.amount ?? "—"}`);
      }
      for (const other of detail.otherItems) {
        doc.text(`${other.label} (${other.itemType}): ${other.amount}`);
      }

      doc.end();
    },
  );

  return router;
}
