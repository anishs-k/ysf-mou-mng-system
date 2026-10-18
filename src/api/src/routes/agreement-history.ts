/**
 * Purpose: SPEC-11's four read-only endpoints - the version list, one
 * version's full snapshot, a field-level compare between any two versions
 * (or a version against "current"), and the proof-file download. Every
 * route here is a GET open to any authenticated role (section 4); nothing
 * in this file, or reachable through it, can write to `agreement_history`
 * (AC9) - only SPEC-10's `edit-agreement.ts` ever inserts a row.
 *
 * Snapshots are parsed defensively (AC5): a key the current schema no
 * longer has is ignored, and one it does not yet have defaults to blank,
 * so a stored JSON blob can never make this route throw as the live schema
 * evolves around it.
 */

import {
  computeAgreementDiff,
  EDIT_AGREEMENT_REASON_LABELS,
} from "@mou/domain";
import type {
  AgreementSnapshot,
  CommercialDetails,
  OtherChargeRow,
  PayrollDetails,
  PayrollItemAnswer,
} from "@mou/domain";
import { and, desc, eq } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import path from "node:path";
import type { Pool } from "pg";

import { requireSession } from "../auth/middleware.ts";
import { notFoundError, requireInScope } from "../auth/zone-scope.ts";
import type { Database } from "../db/client.ts";
import { fetchEditablePayload } from "../db/mou-edit.ts";
import { agreementHistory, mou, user } from "../db/schema.ts";
import { readFileOrThrowMissing } from "../upload/file-errors.ts";
import { uploadRoot } from "../upload/mou-document-storage.ts";
import { asArray, asRecord, isUuid } from "./request-parse.ts";

function readOtherItems(value: unknown): OtherChargeRow[] {
  return asArray(value).map((row) => {
    const record = asRecord(row);
    return {
      label: String(record["label"] ?? ""),
      amount: String(record["amount"] ?? ""),
      itemType: String(record["itemType"] ?? ""),
    };
  });
}

/** AC5: missing keys default to blank rather than throwing. */
function parseSnapshot(raw: unknown): AgreementSnapshot {
  const record = asRecord(raw);
  const commercialRaw = asRecord(record["commercial"]);
  const payrollRaw = asRecord(record["payroll"]);

  const charges: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    asRecord(commercialRaw["charges"]),
  )) {
    charges[key] = String(value ?? "");
  }
  const commercial: CommercialDetails = {
    mouStartDate: String(commercialRaw["mouStartDate"] ?? ""),
    tenureValue: String(commercialRaw["tenureValue"] ?? ""),
    tenureUnit: String(commercialRaw["tenureUnit"] ?? ""),
    attendanceCycle: String(commercialRaw["attendanceCycle"] ?? ""),
    stipendDate: String(commercialRaw["stipendDate"] ?? ""),
    charges,
    otherItems: readOtherItems(commercialRaw["otherItems"]),
    hasMouDocument: true,
  };

  const items: Record<string, PayrollItemAnswer> = {};
  for (const [key, value] of Object.entries(asRecord(payrollRaw["items"]))) {
    const itemRecord = asRecord(value);
    items[key] = {
      isApplicable:
        typeof itemRecord["isApplicable"] === "boolean"
          ? itemRecord["isApplicable"]
          : undefined,
      amount: String(itemRecord["amount"] ?? ""),
    };
  }
  const payroll: PayrollDetails = {
    scheme: String(record["scheme"] ?? payrollRaw["scheme"] ?? ""),
    traineeCategories: asArray(payrollRaw["traineeCategories"]).map((value) =>
      String(value ?? ""),
    ),
    items,
    otherItems: readOtherItems(payrollRaw["otherItems"]),
  };

  return { commercial, payroll };
}

const EXTENSION_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

export function createAgreementHistoryRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);

  /** GET /api/mous/:mouId/history — SPEC-11 section 2.2, newest first. */
  router.get(
    "/mous/:mouId/history",
    requireAuthSession,
    requireInScope(pool, "mou", "mouId", notFoundError("MOU not found")),
    async (request: Request, response: Response) => {
      const mouId = String(request.params["mouId"] ?? "");
      if (!isUuid(mouId)) {
        response.status(400).json({ error: "mouId must be a UUID" });
        return;
      }

      const mouRows = await db
        .select({ version: mou.version })
        .from(mou)
        .where(eq(mou.id, mouId));
      const mouRow = mouRows[0];
      if (mouRow === undefined) {
        response.status(404).json({ error: "MOU not found" });
        return;
      }

      const rows = await db
        .select({
          historyId: agreementHistory.id,
          version: agreementHistory.version,
          editedAt: agreementHistory.editedAt,
          editReason: agreementHistory.editReason,
          remark: agreementHistory.remark,
          proofFilePath: agreementHistory.proofFilePath,
          editedByUsername: user.username,
        })
        .from(agreementHistory)
        .innerJoin(user, eq(user.id, agreementHistory.editedBy))
        .where(eq(agreementHistory.mouId, mouId))
        .orderBy(desc(agreementHistory.version));

      response.json({
        currentVersion: mouRow.version,
        rows: rows.map((row) => ({
          historyId: row.historyId,
          version: row.version,
          editedAt: row.editedAt,
          editedByUsername: row.editedByUsername,
          editReason: row.editReason,
          editReasonLabel:
            EDIT_AGREEMENT_REASON_LABELS[
              row.editReason as keyof typeof EDIT_AGREEMENT_REASON_LABELS
            ] ?? row.editReason,
          remark: row.remark,
          hasProof: row.proofFilePath !== null,
        })),
      });
    },
  );

  /**
   * GET /api/mous/:mouId/history/current — the live agreement, in the exact
   * same shape as a history row's detail (section 2.3: opening the current
   * row shows the same kind of detail as any other version). Registered
   * before the `:historyId` route below for the same routing reason as
   * `compare`.
   */
  router.get(
    "/mous/:mouId/history/current",
    requireAuthSession,
    requireInScope(pool, "mou", "mouId", notFoundError("MOU not found")),
    async (request: Request, response: Response) => {
      const mouId = String(request.params["mouId"] ?? "");
      if (!isUuid(mouId)) {
        response.status(400).json({ error: "mouId must be a UUID" });
        return;
      }
      const payload = await fetchEditablePayload(db, mouId);
      if (payload === undefined) {
        response.status(404).json({ error: "MOU not found" });
        return;
      }
      response.json({
        historyId: null,
        version: payload.version,
        editedAt: null,
        editedByUsername: null,
        editReason: "CURRENT",
        editReasonLabel: "Current",
        remark: null,
        hasProof: false,
        commercial: payload.commercial,
        payroll: payload.payroll,
      });
    },
  );

  /**
   * GET /api/mous/:mouId/history/compare?from=&to= — SPEC-11 section 2.4;
   * `current` means the live record. Registered before the `:historyId`
   * route below, since Express would otherwise match "compare" itself as a
   * `:historyId` value.
   */
  router.get(
    "/mous/:mouId/history/compare",
    requireAuthSession,
    requireInScope(pool, "mou", "mouId", notFoundError("One of the requested versions was not found")),
    async (request: Request, response: Response) => {
      const mouId = String(request.params["mouId"] ?? "");
      if (!isUuid(mouId)) {
        response.status(400).json({ error: "mouId must be a UUID" });
        return;
      }
      const from = String(request.query["from"] ?? "");
      const to = String(request.query["to"] ?? "");
      if (from === "" || to === "") {
        response.status(400).json({ error: "from and to are required" });
        return;
      }

      async function resolve(
        side: string,
      ): Promise<{ label: string; snapshot: AgreementSnapshot } | undefined> {
        if (side === "current") {
          const payload = await fetchEditablePayload(db, mouId);
          if (payload === undefined) {
            return undefined;
          }
          return {
            label: "Current",
            snapshot: {
              commercial: payload.commercial,
              payroll: payload.payroll,
            },
          };
        }
        if (!isUuid(side)) {
          return undefined;
        }
        const rows = await db
          .select({
            version: agreementHistory.version,
            snapshot: agreementHistory.snapshot,
          })
          .from(agreementHistory)
          .where(
            and(
              eq(agreementHistory.id, side),
              eq(agreementHistory.mouId, mouId),
            ),
          );
        const row = rows[0];
        if (row === undefined) {
          return undefined;
        }
        return {
          label: `Version ${row.version}`,
          snapshot: parseSnapshot(row.snapshot),
        };
      }

      const [fromResolved, toResolved] = await Promise.all([
        resolve(from),
        resolve(to),
      ]);
      if (fromResolved === undefined || toResolved === undefined) {
        response
          .status(404)
          .json({ error: "One of the requested versions was not found" });
        return;
      }

      response.json({
        fromLabel: fromResolved.label,
        toLabel: toResolved.label,
        rows: computeAgreementDiff(fromResolved.snapshot, toResolved.snapshot),
      });
    },
  );

  /** GET /api/mous/:mouId/history/:historyId — SPEC-11 section 2.3. */
  router.get(
    "/mous/:mouId/history/:historyId",
    requireAuthSession,
    requireInScope(pool, "mou", "mouId", notFoundError("History entry not found")),
    async (request: Request, response: Response) => {
      const mouId = String(request.params["mouId"] ?? "");
      const historyId = String(request.params["historyId"] ?? "");
      if (!isUuid(mouId) || !isUuid(historyId)) {
        response
          .status(400)
          .json({ error: "mouId and historyId must be UUIDs" });
        return;
      }

      const rows = await db
        .select({
          version: agreementHistory.version,
          editedAt: agreementHistory.editedAt,
          editReason: agreementHistory.editReason,
          remark: agreementHistory.remark,
          proofFilePath: agreementHistory.proofFilePath,
          snapshot: agreementHistory.snapshot,
          editedByUsername: user.username,
        })
        .from(agreementHistory)
        .innerJoin(user, eq(user.id, agreementHistory.editedBy))
        .where(
          and(
            eq(agreementHistory.id, historyId),
            eq(agreementHistory.mouId, mouId),
          ),
        );
      const row = rows[0];
      if (row === undefined) {
        response.status(404).json({ error: "History entry not found" });
        return;
      }

      const snapshot = parseSnapshot(row.snapshot);
      response.json({
        historyId,
        version: row.version,
        editedAt: row.editedAt,
        editedByUsername: row.editedByUsername,
        editReason: row.editReason,
        editReasonLabel:
          EDIT_AGREEMENT_REASON_LABELS[
            row.editReason as keyof typeof EDIT_AGREEMENT_REASON_LABELS
          ] ?? row.editReason,
        remark: row.remark,
        hasProof: row.proofFilePath !== null,
        commercial: snapshot.commercial,
        payroll: snapshot.payroll,
      });
    },
  );

  /** GET /api/mous/:mouId/history/:historyId/proof — SPEC-11 section 3; 401 unauthenticated (AC10). */
  router.get(
    "/mous/:mouId/history/:historyId/proof",
    requireAuthSession,
    requireInScope(pool, "mou", "mouId", notFoundError("No proof file for this version")),
    async (request: Request, response: Response) => {
      const mouId = String(request.params["mouId"] ?? "");
      const historyId = String(request.params["historyId"] ?? "");
      if (!isUuid(mouId) || !isUuid(historyId)) {
        response
          .status(400)
          .json({ error: "mouId and historyId must be UUIDs" });
        return;
      }

      const rows = await db
        .select({ proofFilePath: agreementHistory.proofFilePath })
        .from(agreementHistory)
        .where(
          and(
            eq(agreementHistory.id, historyId),
            eq(agreementHistory.mouId, mouId),
          ),
        );
      const row = rows[0];
      if (row === undefined || row.proofFilePath === null) {
        response.status(404).json({ error: "No proof file for this version" });
        return;
      }

      const absolutePath = path.join(uploadRoot(), row.proofFilePath);
      // A genuinely absent file is a 404; any other read failure (permissions,
      // disk fault) propagates as a 500 rather than masquerading as "missing".
      const buffer = await readFileOrThrowMissing(absolutePath);
      if (buffer === undefined) {
        response.status(404).json({ error: "Proof file missing" });
        return;
      }

      const contentType =
        EXTENSION_CONTENT_TYPES[
          path.extname(row.proofFilePath).toLowerCase()
        ] ?? "application/octet-stream";
      response.setHeader("Content-Type", contentType);
      response.send(buffer);
    },
  );

  return router;
}
