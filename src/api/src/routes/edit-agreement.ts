/**
 * Purpose: SPEC-10's two endpoints - request an edit (reason, optional proof,
 * optional remark) and apply one (token + edited payload + loaded version).
 * ADMIN only (section 6). The token from the first endpoint is what makes an
 * edit with no recorded reason structurally impossible (section 7): a PUT
 * without a valid, unconsumed token for this MOU is rejected outright.
 *
 * Re-validation reuses `validateCommercialDetails`/`validatePayrollDetails`
 * unchanged from SPEC-05/06 (section 4's "the same code path, not a second
 * copy"). Company identity, `generated_code` and the scheme are never part of
 * the editable payload this route reads from the client - the scheme is
 * always re-derived from the MOU's own current row, so sending a different
 * one has no effect (AC6).
 */

import {
  EDIT_AGREEMENT_REASONS,
  validateCommercialDetails,
  validatePayrollDetails,
} from "@mou/domain";
import type {
  CommercialDetails,
  EditAgreementReason,
  OtherChargeRow,
  PayrollDetails,
  PayrollItemAnswer,
} from "@mou/domain";
import { eq } from "drizzle-orm";
import { Router } from "express";
import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import type { Pool } from "pg";

import {
  requireAuth,
  requireRole,
  requireSession,
} from "../auth/middleware.ts";
import { notFoundError, requireInScope } from "../auth/zone-scope.ts";
import type { Database } from "../db/client.ts";
import {
  deriveCommercialItemRows,
  derivePayrollItemRows,
  fetchEditablePayload,
  sameDerivedRows,
  sameTraineeCategories,
} from "../db/mou-edit.ts";
import {
  agreementHistory,
  commercialItem,
  mou,
  mouEditRequest,
  payrollConfig,
  payrollItem,
  traineeCategory,
} from "../db/schema.ts";
import {
  validateProofBuffer,
  writeEditProofFile,
} from "../upload/edit-proof-storage.ts";
import { asArray, asRecord, isUuid } from "./request-parse.ts";

function isEditReason(value: string): value is EditAgreementReason {
  return (EDIT_AGREEMENT_REASONS as readonly string[]).includes(value);
}

/** SPEC-10 section 3: the same 10 MB cap as every other upload in this app. */
const MAX_PROOF_BYTES = 10 * 1024 * 1024;

const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PROOF_BYTES },
});

class StaleVersionError extends Error {}
class TokenConsumedError extends Error {}

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

export function createEditAgreementRouter(db: Database, pool: Pool): Router {
  const router = Router();
  const requireAuthSession = requireSession(pool);
  const requireAdmin = requireRole("ADMIN");

  /** POST /api/mous/:mouId/edit-request — SPEC-10 section 7. */
  router.post(
    "/mous/:mouId/edit-request",
    requireAuthSession,
    requireAdmin,
    requireInScope(pool, "mou", "mouId", notFoundError("MOU not found")),
    (request: Request, response: Response, next: NextFunction) => {
      proofUpload.single("proof")(request, response, (error: unknown) => {
        if (error === undefined || error === null) {
          next();
          return;
        }
        const isSizeError =
          error instanceof multer.MulterError &&
          error.code === "LIMIT_FILE_SIZE";
        response
          .status(422)
          .json({
            error: isSizeError
              ? "The proof file must be 10 MB or smaller"
              : "Upload failed",
          });
      });
    },
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      const mouId = String(request.params["mouId"] ?? "");
      if (!isUuid(mouId)) {
        response.status(400).json({ error: "mouId must be a UUID" });
        return;
      }

      const reason = String(request.body?.["reason"] ?? "");
      if (!isEditReason(reason)) {
        response
          .status(400)
          .json({ error: "reason must be one of the listed edit reasons" });
        return;
      }

      const file = request.file;
      // AC2/AC3: a reason of Communication from HR requires proof, enforced
      // here regardless of what the UI already checked client-side.
      if (reason === "COMMUNICATION_FROM_HR" && file === undefined) {
        response
          .status(400)
          .json({ error: "Proof is required for Communication from HR" });
        return;
      }

      if (file !== undefined) {
        const validation = validateProofBuffer(file.buffer, file.mimetype);
        if (!validation.valid) {
          response.status(422).json({ error: validation.reason });
          return;
        }
      }

      const remarkRaw =
        typeof request.body?.["remark"] === "string"
          ? (request.body["remark"] as string).trim()
          : "";
      const remark = remarkRaw === "" ? null : remarkRaw.slice(0, 500);

      const mouRows = await db
        .select({ id: mou.id, version: mou.version })
        .from(mou)
        .where(eq(mou.id, mouId));
      const mouRow = mouRows[0];
      if (mouRow === undefined) {
        response.status(404).json({ error: "MOU not found" });
        return;
      }

      const requestRows = await db
        .insert(mouEditRequest)
        .values({
          mouId,
          editReason: reason,
          remark,
          loadedVersion: mouRow.version,
          createdBy: auth.userId,
        })
        .returning({ id: mouEditRequest.id });
      const requestId = requestRows[0]?.id;
      if (requestId === undefined) {
        response.status(500).json({ error: "Failed to create edit request" });
        return;
      }

      if (file !== undefined) {
        const relativePath = await writeEditProofFile(
          mouId,
          requestId,
          file.buffer,
          file.mimetype,
        );
        await db
          .update(mouEditRequest)
          .set({ proofFilePath: relativePath })
          .where(eq(mouEditRequest.id, requestId));
      }

      const payload = await fetchEditablePayload(db, mouId);
      if (payload === undefined) {
        response.status(404).json({ error: "MOU not found" });
        return;
      }

      response.status(201).json({
        token: requestId,
        version: payload.version,
        commercial: payload.commercial,
        payroll: payload.payroll,
      });
    },
  );

  /** PUT /api/mous/:mouId — SPEC-10 section 5. */
  router.put(
    "/mous/:mouId",
    requireAuthSession,
    requireAdmin,
    requireInScope(pool, "mou", "mouId", notFoundError("MOU not found")),
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      const mouId = String(request.params["mouId"] ?? "");
      if (!isUuid(mouId)) {
        response.status(400).json({ error: "mouId must be a UUID" });
        return;
      }

      const body = asRecord(request.body);
      const token =
        typeof body["token"] === "string" ? body["token"] : undefined;
      if (token === undefined || !isUuid(token)) {
        response.status(400).json({ error: "A valid edit token is required" });
        return;
      }

      const clientVersion = Number(body["version"]);
      if (!Number.isInteger(clientVersion)) {
        response.status(400).json({ error: "version is required" });
        return;
      }

      // AC4: the token must exist, belong to this MOU, and not already be spent.
      const tokenRows = await db
        .select({
          id: mouEditRequest.id,
          mouId: mouEditRequest.mouId,
          editReason: mouEditRequest.editReason,
          proofFilePath: mouEditRequest.proofFilePath,
          remark: mouEditRequest.remark,
          consumedAt: mouEditRequest.consumedAt,
        })
        .from(mouEditRequest)
        .where(eq(mouEditRequest.id, token));
      const tokenRow = tokenRows[0];
      if (
        tokenRow === undefined ||
        tokenRow.mouId !== mouId ||
        tokenRow.consumedAt !== null
      ) {
        response
          .status(400)
          .json({ error: "Invalid or already-used edit token" });
        return;
      }

      // AC3 defence-in-depth: the create-request endpoint already refuses this,
      // but a token could in principle be replayed against a different intent.
      if (
        tokenRow.editReason === "COMMUNICATION_FROM_HR" &&
        tokenRow.proofFilePath === null
      ) {
        response
          .status(400)
          .json({ error: "Proof is required for Communication from HR" });
        return;
      }

      const current = await fetchEditablePayload(db, mouId);
      if (current === undefined) {
        response.status(404).json({ error: "MOU not found" });
        return;
      }

      const commercialRaw = asRecord(body["commercial"]);
      const charges: Record<string, string> = {};
      for (const [key, value] of Object.entries(
        asRecord(commercialRaw["charges"]),
      )) {
        charges[key] = String(value ?? "");
      }
      const commercialDetails: CommercialDetails = {
        mouStartDate: String(commercialRaw["mouStartDate"] ?? ""),
        tenureValue: String(commercialRaw["tenureValue"] ?? ""),
        tenureUnit: String(commercialRaw["tenureUnit"] ?? ""),
        attendanceCycle: String(commercialRaw["attendanceCycle"] ?? ""),
        stipendDate: String(commercialRaw["stipendDate"] ?? ""),
        charges,
        otherItems: readOtherItems(commercialRaw["otherItems"]),
        hasMouDocument: true,
      };

      const commercialValidation = validateCommercialDetails(
        commercialDetails,
        new Date().toISOString().slice(0, 10),
      );
      if (Object.keys(commercialValidation.errors).length > 0) {
        response
          .status(422)
          .json({
            error: "Commercial details are not valid",
            errors: commercialValidation.errors,
          });
        return;
      }

      const payrollRaw = asRecord(body["payroll"]);
      const traineeCategories = asArray(payrollRaw["traineeCategories"]).map(
        (value) => String(value ?? ""),
      );
      const items: Record<string, PayrollItemAnswer> = {};
      for (const [key, value] of Object.entries(
        asRecord(payrollRaw["items"]),
      )) {
        const record = asRecord(value);
        items[key] = {
          isApplicable:
            typeof record["isApplicable"] === "boolean"
              ? record["isApplicable"]
              : undefined,
          amount: String(record["amount"] ?? ""),
        };
      }
      // Section 4: the scheme is not editable - always the MOU's own current
      // scheme, whatever the client sent (same "ignored, not applied" rule as
      // company identity fields, AC6).
      const payrollDetails: PayrollDetails = {
        scheme: current.scheme,
        traineeCategories,
        items,
        otherItems: readOtherItems(payrollRaw["otherItems"]),
      };

      const payrollValidation = validatePayrollDetails(payrollDetails);
      if (Object.keys(payrollValidation.errors).length > 0) {
        response
          .status(422)
          .json({
            error: "Payroll details are not valid",
            errors: payrollValidation.errors,
          });
        return;
      }

      const newCommercialRows = deriveCommercialItemRows(
        commercialDetails.charges,
        commercialDetails.otherItems,
      );
      const currentCommercialRows = deriveCommercialItemRows(
        current.commercial.charges,
        current.commercial.otherItems,
      );
      const newPayrollRows = derivePayrollItemRows(
        payrollDetails.items,
        payrollDetails.otherItems,
      );
      const currentPayrollRows = derivePayrollItemRows(
        current.payroll.items,
        current.payroll.otherItems,
      );

      const scalarUnchanged =
        commercialDetails.mouStartDate === current.commercial.mouStartDate &&
        Number(commercialDetails.tenureValue) ===
          Number(current.commercial.tenureValue) &&
        commercialDetails.tenureUnit === current.commercial.tenureUnit &&
        commercialDetails.attendanceCycle.trim() ===
          current.commercial.attendanceCycle.trim() &&
        Number(commercialDetails.stipendDate) ===
          Number(current.commercial.stipendDate);

      // AC12: applying with nothing changed is rejected outright.
      if (
        scalarUnchanged &&
        sameDerivedRows(newCommercialRows, currentCommercialRows) &&
        sameDerivedRows(newPayrollRows, currentPayrollRows) &&
        sameTraineeCategories(
          traineeCategories,
          current.payroll.traineeCategories,
        )
      ) {
        response.status(422).json({ error: "No changes to apply" });
        return;
      }

      try {
        const newVersion = await db.transaction(async (tx) => {
          // AC11: lock the row and re-check version inside the transaction -
          // the pre-transaction read above is only what drove validation and
          // the diff; this is the authoritative concurrency check. A second
          // Apply racing on the same stale version must lose.
          const lockedRows = await tx
            .select({ version: mou.version })
            .from(mou)
            .where(eq(mou.id, mouId))
            .for("update");
          const lockedVersion = lockedRows[0]?.version;
          if (lockedVersion === undefined) {
            throw new Error("MOU disappeared during edit");
          }
          if (lockedVersion !== clientVersion) {
            throw new StaleVersionError();
          }

          const lockedTokenRows = await tx
            .select({ consumedAt: mouEditRequest.consumedAt })
            .from(mouEditRequest)
            .where(eq(mouEditRequest.id, token))
            .for("update");
          if ((lockedTokenRows[0]?.consumedAt ?? null) !== null) {
            throw new TokenConsumedError();
          }

          // Snapshot the state as it was before this edit (AC8). The version
          // check above proves nothing else has touched these child rows since
          // `current` was read, since every writer to them also bumps
          // mou.version in the same transaction.
          await tx.insert(agreementHistory).values({
            mouId,
            version: lockedVersion,
            editReason: tokenRow.editReason,
            proofFilePath: tokenRow.proofFilePath,
            remark: tokenRow.remark,
            snapshot: {
              scheme: current.scheme,
              commercial: current.commercial,
              payroll: current.payroll,
            },
            editedBy: auth.userId,
          });

          await tx
            .delete(commercialItem)
            .where(eq(commercialItem.mouId, mouId));
          if (newCommercialRows.length > 0) {
            await tx.insert(commercialItem).values(
              newCommercialRows.map((row) => ({
                mouId,
                itemKey: row.itemKey,
                customLabel: row.customLabel,
                amount: row.amount,
                itemType: row.itemType,
              })),
            );
          }

          const configRows = await tx
            .select({ id: payrollConfig.id })
            .from(payrollConfig)
            .where(eq(payrollConfig.mouId, mouId));
          const configId = configRows[0]?.id;
          if (configId === undefined) {
            throw new Error("payroll_config missing for an existing MOU");
          }

          await tx
            .delete(traineeCategory)
            .where(eq(traineeCategory.payrollConfigId, configId));
          await tx
            .insert(traineeCategory)
            .values(
              traineeCategories.map((categoryName) => ({
                payrollConfigId: configId,
                categoryName: categoryName.trim(),
              })),
            );

          await tx
            .delete(payrollItem)
            .where(eq(payrollItem.payrollConfigId, configId));
          await tx.insert(payrollItem).values(
            newPayrollRows.map((row) => ({
              payrollConfigId: configId,
              itemKey: row.itemKey,
              customLabel: row.customLabel,
              isApplicable: row.isApplicable,
              amount: row.amount,
              itemType: row.itemType,
            })),
          );

          const nextVersion = lockedVersion + 1;
          await tx
            .update(mou)
            .set({
              mouStartDate: commercialDetails.mouStartDate,
              tenureValue: Number(commercialDetails.tenureValue),
              tenureUnit: commercialDetails.tenureUnit,
              attendanceCycle: commercialDetails.attendanceCycle,
              stipendDate: Number(commercialDetails.stipendDate),
              version: nextVersion,
              updatedAt: new Date(),
            })
            .where(eq(mou.id, mouId));

          await tx
            .update(mouEditRequest)
            .set({ consumedAt: new Date() })
            .where(eq(mouEditRequest.id, token));

          return nextVersion;
        });

        response.status(200).json({ version: newVersion });
      } catch (error) {
        if (error instanceof StaleVersionError) {
          response
            .status(409)
            .json({
              error:
                "This agreement was changed by someone else. Reload and try again.",
            });
          return;
        }
        if (error instanceof TokenConsumedError) {
          response
            .status(400)
            .json({ error: "Invalid or already-used edit token" });
          return;
        }
        console.error("Edit apply failed:", error);
        response.status(500).json({ error: "Edit failed" });
      }
    },
  );

  return router;
}
