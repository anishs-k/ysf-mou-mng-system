/**
 * Purpose: The company draft and final-save endpoints of SPEC-03. Draft routes
 * let the wizard persist in-progress work across refreshes; the final-save route
 * turns a complete draft into real rows in a single transaction. Access is
 * restricted to ADMIN and DATA_ENTRY (SPEC-02 section 3.3).
 *
 * Field-level validation for each page lives in its own @mou/domain module
 * (company-details-validation, commercial-details-validation,
 * payroll-details-validation - SPEC-04/05/06) so the browser and this route
 * enforce exactly the same rules; final save re-runs every one of them before
 * writing a single row.
 */

import {
  COMMERCIAL_FIXED_ITEM_KEYS,
  COMMERCIAL_ITEM_BY_KEY,
  PAYROLL_FIXED_ITEM_KEYS,
  PAYROLL_ITEM_BY_KEY,
  validateCommercialDetails,
  validateCompanyDetails,
  validatePayrollDetails,
} from "@mou/domain";
import type {
  CommercialDetails,
  OtherChargeRow,
  PayrollDetails,
  PayrollItemAnswer,
} from "@mou/domain";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Router } from "express";
import type { Request, Response } from "express";
import multer from "multer";
import type { Pool } from "pg";

import { requireAuth, requireSession } from "../auth/middleware.ts";
import { allocateCompanyCode } from "../db/company-code-repository.ts";
import type { Database } from "../db/client.ts";
import { readJsonField, UUID_PATTERN } from "./request-parse.ts";
import {
  company,
  companyDraft,
  companyPlant,
  commercialItem,
  mou,
  mouDocument,
  payrollConfig,
  payrollItem,
  traineeCategory,
  zone,
} from "../db/schema.ts";
import {
  discardTempDocument,
  permanentDocumentRelativePath,
  promoteTempDocument,
  scanForViruses,
  tempDocumentExists,
  tempDocumentFilePath,
  validatePdfBuffer,
  writeTempDocument,
} from "../upload/mou-document-storage.ts";

/** The authoring roles that may use the wizard (SPEC-02 section 3.3). */
const AUTHORING_ROLES = ["ADMIN", "DATA_ENTRY"] as const;

/** SPEC-05 section 3: the MOU PDF is capped at 10 MB. */
const MAX_MOU_DOCUMENT_BYTES = 10 * 1024 * 1024;

/** Buffered in memory: files this small make a half-written temp file the
 * bigger risk, not the memory cost. */
const mouDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_MOU_DOCUMENT_BYTES },
});

interface DraftPayload {
  readonly page1?: Record<string, unknown>;
  readonly page2?: Record<string, unknown>;
  readonly page3?: Record<string, unknown>;
}

function isAuthoringRole(
  role: string,
): role is (typeof AUTHORING_ROLES)[number] {
  return (AUTHORING_ROLES as readonly string[]).includes(role);
}

function validateUpsertBody(
  body: unknown,
): { payload: DraftPayload; currentPage: number } | null {
  const payload = readJsonField<DraftPayload>(body, "payload");
  const currentPage = readJsonField<number>(body, "currentPage");
  if (
    payload === undefined ||
    typeof currentPage !== "number" ||
    currentPage < 1 ||
    currentPage > 3
  ) {
    return null;
  }
  return { payload, currentPage };
}

function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected the statement to return a row");
  }
  return row;
}

/** PostgreSQL SQLSTATE for a unique-constraint violation. */
const UNIQUE_VIOLATION = "23505";

/**
 * The unique constraints the final save can realistically collide with, and
 * the message a user can act on. Page 1 validation already checks GST and the
 * company/plant pair, but two users can pass that check simultaneously and
 * then race to insert - the loser reaches the database constraint instead.
 * Naming the conflict turns an opaque "Save failed" into something the user
 * can fix.
 */
const UNIQUE_CONFLICT_MESSAGES: Readonly<Record<string, string>> = {
  company_gst_number_unique: "A company with this GST number already exists",
  company_plant_company_name_uq:
    "A company with this name and plant already exists in this zone",
  mou_generated_code_unique:
    "This MOU code has already been allocated; please try saving again",
  mou_company_plant_scheme_uq:
    "A current MOU already exists for this company, plant and scheme",
};

/**
 * Returns a user-facing message when the error is a unique-constraint
 * violation this route knows how to explain, or undefined for anything else
 * (which the caller reports as a 500). The error and its `cause` are both
 * inspected, because a driver or query-builder layer may wrap the original
 * pg error rather than rethrowing it untouched.
 */
function describeUniqueConflict(error: unknown): string | undefined {
  let current: unknown = error;
  for (
    let depth = 0;
    depth < 5 && current !== null && current !== undefined;
    depth += 1
  ) {
    const candidate = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (candidate.code === UNIQUE_VIOLATION) {
      const constraint =
        typeof candidate.constraint === "string" ? candidate.constraint : "";
      return (
        UNIQUE_CONFLICT_MESSAGES[constraint] ??
        "This record conflicts with one that already exists"
      );
    }
    current = candidate.cause;
  }
  return undefined;
}

export function createCompaniesRouter(db: Database, pool: Pool): Router {
  const router = Router();

  // --------------------------------------------------------------------------
  // Existing SPEC-01 route — unchanged
  // --------------------------------------------------------------------------
  router.get("/companies/:id/plants", async (request, response) => {
    const id = String(request.params["id"] ?? "");
    if (!UUID_PATTERN.test(id)) {
      response.status(400).json({ error: "id must be a UUID" });
      return;
    }

    const plants = await db
      .select({ id: companyPlant.id, plantName: companyPlant.plantName })
      .from(companyPlant)
      .where(eq(companyPlant.companyId, id));

    response.json(plants);
  });

  // --------------------------------------------------------------------------
  // SPEC-03 draft routes — require session
  // --------------------------------------------------------------------------

  const requireAuthSession = requireSession(pool);

  /** POST /api/companies/draft — create or update the current user's draft. */
  router.post(
    "/companies/draft",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      if (!isAuthoringRole(auth.role)) {
        response.status(403).json({ error: "Forbidden" });
        return;
      }

      const body = validateUpsertBody(request.body);
      if (body === null) {
        response
          .status(400)
          .json({ error: "payload and currentPage (1-3) are required" });
        return;
      }

      const existing = await db
        .select({ id: companyDraft.id })
        .from(companyDraft)
        .where(eq(companyDraft.userId, auth.userId));

      if (existing.length > 0) {
        await db
          .update(companyDraft)
          .set({
            payload: body.payload,
            currentPage: body.currentPage,
            updatedAt: new Date(),
          })
          .where(eq(companyDraft.userId, auth.userId));
        response.json({ id: firstRow(existing).id, created: false });
        return;
      }

      const inserted = await db
        .insert(companyDraft)
        .values({
          userId: auth.userId,
          payload: body.payload,
          currentPage: body.currentPage,
        })
        .returning({ id: companyDraft.id });

      response.status(201).json({ id: firstRow(inserted).id, created: true });
    },
  );

  /** GET /api/companies/draft — fetch the current user's open draft. */
  router.get(
    "/companies/draft",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      if (!isAuthoringRole(auth.role)) {
        response.status(403).json({ error: "Forbidden" });
        return;
      }

      const rows = await db
        .select({
          id: companyDraft.id,
          payload: companyDraft.payload,
          currentPage: companyDraft.currentPage,
        })
        .from(companyDraft)
        .where(eq(companyDraft.userId, auth.userId));

      if (rows.length === 0) {
        response.status(404).json({ error: "No draft found" });
        return;
      }

      response.json(firstRow(rows));
    },
  );

  /** DELETE /api/companies/draft/:draftId — discard a draft. */
  router.delete(
    "/companies/draft/:draftId",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      if (!isAuthoringRole(auth.role)) {
        response.status(403).json({ error: "Forbidden" });
        return;
      }

      const draftId = String(request.params["draftId"] ?? "");
      if (!UUID_PATTERN.test(draftId)) {
        response.status(400).json({ error: "draftId must be a UUID" });
        return;
      }

      const rows = await db
        .select({ userId: companyDraft.userId })
        .from(companyDraft)
        .where(eq(companyDraft.id, draftId));

      if (rows.length === 0) {
        response.status(404).json({ error: "Draft not found" });
        return;
      }

      if (firstRow(rows).userId !== auth.userId) {
        response.status(403).json({ error: "Forbidden" });
        return;
      }

      await db.delete(companyDraft).where(eq(companyDraft.id, draftId));
      // Best-effort: a cancelled or discarded draft must leave no temp file
      // behind (SPEC-05 AC10), but a filesystem hiccup here must not turn a
      // successful draft delete into a failed response.
      await discardTempDocument(draftId).catch(() => undefined);
      response.status(204).send();
    },
  );

  // --------------------------------------------------------------------------
  // SPEC-05 Page 2: MOU document upload
  // --------------------------------------------------------------------------

  /**
   * POST /api/companies/draft/:draftId/mou-document — accepts the signed MOU
   * PDF for the current step of the wizard. Validated and written to a temp
   * location keyed by draftId (SPEC-05 section 4); replacing simply overwrites
   * that same path, so there is never more than one temp file per draft to
   * clean up. The draft's own payload.page2.mouDocument is updated here,
   * server-side, so the metadata survives a refresh even if the browser never
   * calls the ordinary draft-save endpoint again.
   */
  router.post(
    "/companies/draft/:draftId/mou-document",
    requireAuthSession,
    (request: Request, response: Response, next) => {
      mouDocumentUpload.single("file")(request, response, (error: unknown) => {
        if (error === undefined || error === null) {
          next();
          return;
        }
        const isSizeError =
          typeof error === "object" &&
          error !== null &&
          (error as { code?: string }).code === "LIMIT_FILE_SIZE";
        response.status(422).json({
          error: isSizeError
            ? "The file must be 10 MB or smaller"
            : "Upload failed",
        });
      });
    },
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      if (!isAuthoringRole(auth.role)) {
        response.status(403).json({ error: "Forbidden" });
        return;
      }

      const draftId = String(request.params["draftId"] ?? "");
      if (!UUID_PATTERN.test(draftId)) {
        response.status(400).json({ error: "draftId must be a UUID" });
        return;
      }

      const drafts = await db
        .select({
          id: companyDraft.id,
          userId: companyDraft.userId,
          payload: companyDraft.payload,
        })
        .from(companyDraft)
        .where(eq(companyDraft.id, draftId));

      if (drafts.length === 0) {
        response.status(404).json({ error: "Draft not found" });
        return;
      }
      const draft = firstRow(drafts);
      if (draft.userId !== auth.userId) {
        response.status(403).json({ error: "Forbidden" });
        return;
      }

      const file = request.file;
      if (file === undefined) {
        response.status(400).json({ error: "file is required" });
        return;
      }

      // AC2: the mimetype is the browser's own claim and is checked first only
      // to fail fast; the %PDF header on the actual bytes is what a renamed
      // .docx cannot fake.
      const validation = validatePdfBuffer(file.buffer, file.mimetype);
      if (!validation.valid) {
        response.status(422).json({ error: validation.reason });
        return;
      }

      // The scanner (when configured) reads the file from disk, so it is
      // written first and, if it turns out to be infected, discarded again
      // immediately after.
      await writeTempDocument(draftId, file.buffer);
      const scan = await scanForViruses(tempDocumentFilePath(draftId));
      if (!scan.clean) {
        await discardTempDocument(draftId);
        response.status(422).json({ error: scan.reason });
        return;
      }

      const originalFilename = file.originalname.slice(0, 255);
      const payload = draft.payload as DraftPayload;
      const page2 = { ...(payload.page2 ?? {}) };
      page2["mouDocument"] = { originalFilename, fileSizeBytes: file.size };

      await db
        .update(companyDraft)
        .set({ payload: { ...payload, page2 }, updatedAt: new Date() })
        .where(eq(companyDraft.id, draftId));

      response.json({ originalFilename, fileSizeBytes: file.size });
    },
  );

  // --------------------------------------------------------------------------
  // SPEC-04 Page 1 validation
  // --------------------------------------------------------------------------

  /**
   * POST /api/companies/validate-page1 — the server half of SPEC-04 section 4.
   * The format rules themselves live in @mou/domain so the browser and this
   * route cannot disagree; what is added here is the part that needs a
   * database: GST uniqueness, and the duplicate-company check (Q11's default —
   * company name plus plant is unique within a zone). Both run on Next, so the
   * user is told before they leave the page rather than at final save.
   */
  router.post(
    "/companies/validate-page1",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      if (!isAuthoringRole(auth.role)) {
        response.status(403).json({ error: "Forbidden" });
        return;
      }

      const details = readJsonField<Record<string, unknown>>(
        request.body,
        "details",
      );
      if (typeof details !== "object" || details === null) {
        response.status(400).json({ error: "details is required" });
        return;
      }

      const { errors, warnings } = validateCompanyDetails(details);

      // GST uniqueness — only worth a query once the format itself is sound.
      const gstNumber = String(details["gstNumber"] ?? "").trim();
      if (errors["gstNumber"] === undefined && gstNumber !== "") {
        const clashes = await db
          .select({ id: company.id })
          .from(company)
          .where(eq(company.gstNumber, gstNumber));
        if (clashes.length > 0) {
          errors["gstNumber"] = "This GST number is already registered";
        }
      }

      // Duplicate company: the same name owning the same plant, in the same zone.
      const companyName = String(details["companyName"] ?? "").trim();
      const plantName = String(details["plantName"] ?? "").trim();
      const zoneId = String(details["zoneId"] ?? "").trim();
      const canCheckDuplicate =
        errors["companyName"] === undefined &&
        errors["plantName"] === undefined &&
        errors["zoneId"] === undefined &&
        companyName !== "" &&
        plantName !== "" &&
        UUID_PATTERN.test(zoneId);

      if (canCheckDuplicate) {
        const candidates = await db
          .select({ id: company.id })
          .from(company)
          .where(
            and(
              eq(company.zoneId, zoneId),
              sql`lower(${company.companyName}) = ${companyName.toLowerCase()}`,
            ),
          );

        if (candidates.length > 0) {
          const plants = await db
            .select({ id: companyPlant.id })
            .from(companyPlant)
            .where(
              and(
                inArray(
                  companyPlant.companyId,
                  candidates.map((candidate) => candidate.id),
                ),
                sql`lower(${companyPlant.plantName}) = ${plantName.toLowerCase()}`,
              ),
            );

          if (plants.length > 0) {
            errors["companyName"] =
              "A company with this name and plant already exists in this zone";
          }
        }
      }

      response.json({ errors, warnings });
    },
  );

  // --------------------------------------------------------------------------
  // SPEC-03 final save
  // --------------------------------------------------------------------------

  /** POST /api/companies — turn a complete draft into real rows. */
  router.post(
    "/companies",
    requireAuthSession,
    async (request: Request, response: Response) => {
      const auth = requireAuth(request);
      if (!isAuthoringRole(auth.role)) {
        response.status(403).json({ error: "Forbidden" });
        return;
      }

      const draftId = readJsonField<string>(request.body, "draftId");
      if (draftId === undefined || !UUID_PATTERN.test(draftId)) {
        response.status(400).json({ error: "draftId must be a UUID" });
        return;
      }

      // Fetch the draft and lock it (it will be deleted inside the transaction).
      const drafts = await db
        .select({
          id: companyDraft.id,
          userId: companyDraft.userId,
          payload: companyDraft.payload,
        })
        .from(companyDraft)
        .where(eq(companyDraft.id, draftId));

      if (drafts.length === 0) {
        // Idempotency: draft already consumed. Try to find the company that was
        // created from it by looking for a company created by this user recently.
        const recent = await db
          .select({ id: company.id, generatedCode: mou.generatedCode })
          .from(company)
          .innerJoin(mou, eq(mou.companyId, company.id))
          .where(eq(company.createdBy, auth.userId))
          .orderBy(company.createdAt)
          .limit(1);

        if (recent.length > 0) {
          const recentCompany = firstRow(recent);
          response.json({
            companyId: recentCompany.id,
            generatedCode: recentCompany.generatedCode,
          });
          return;
        }

        response.status(404).json({ error: "Draft not found" });
        return;
      }

      const draft = firstRow(drafts);
      if (draft.userId !== auth.userId) {
        response.status(403).json({ error: "Forbidden" });
        return;
      }

      // Validate payload shape minimally — full field validation is SPEC-04/05/06.
      const payload = draft.payload as DraftPayload;
      const page1 = payload.page1;
      const page2 = payload.page2;
      const page3 = payload.page3;

      if (page1 === undefined || page2 === undefined || page3 === undefined) {
        response.status(422).json({ error: "Draft is incomplete" });
        return;
      }

      // Extract required fields for the save (minimal for SPEC-03 shell).
      const zoneId = readJsonField<string>(page1, "zoneId");
      const companyName = readJsonField<string>(page1, "companyName");
      if (zoneId === undefined || companyName === undefined) {
        response.status(422).json({ error: "Draft is incomplete" });
        return;
      }

      // Validate the zone exists. Its code no longer feeds the generated code -
      // SPEC-16 D109 made the code scheme-based and moved it onto the MOU.
      const zoneRows = await db
        .select({ id: zone.id })
        .from(zone)
        .where(eq(zone.id, zoneId));
      if (zoneRows.length === 0) {
        response.status(422).json({ error: "Invalid zone" });
        return;
      }

      // SPEC-04 section 4: Page 1 must be complete and valid before a single row
      // is written. gst_number is UNIQUE, so defaulting a missing GST to "" let
      // exactly one company exist and then collide forever; validating here turns
      // that into a clear 422 listing the offending fields instead of a raw
      // duplicate-key error from the database.
      const page1Validation = validateCompanyDetails(page1);
      if (Object.keys(page1Validation.errors).length > 0) {
        response
          .status(422)
          .json({
            error: "Page 1 is not valid",
            errors: page1Validation.errors,
          });
        return;
      }

      const page1Text = (field: string): string =>
        String(page1[field] ?? "").trim();
      const page1Optional = (field: string): string | undefined => {
        const raw = page1Text(field);
        return raw === "" ? undefined : raw;
      };

      // SPEC-05 section 4: Page 2 must be complete and valid before a single row
      // is written, for the same reason Page 1 is validated above.
      const chargesRaw =
        readJsonField<Record<string, unknown>>(page2, "charges") ?? {};
      const charges: Record<string, string> = {};
      for (const [key, value] of Object.entries(chargesRaw)) {
        charges[key] = String(value ?? "");
      }
      const otherItemsRaw =
        readJsonField<Array<Record<string, unknown>>>(page2, "otherItems") ??
        [];
      const otherItems: OtherChargeRow[] = otherItemsRaw.map((row) => ({
        label: String(row["label"] ?? ""),
        amount: String(row["amount"] ?? ""),
        itemType: String(row["itemType"] ?? ""),
      }));
      const mouDocumentMeta = readJsonField<{
        originalFilename?: unknown;
        fileSizeBytes?: unknown;
      }>(page2, "mouDocument");

      const commercialDetails: CommercialDetails = {
        mouStartDate: String(
          readJsonField<unknown>(page2, "mouStartDate") ?? "",
        ),
        tenureValue: String(readJsonField<unknown>(page2, "tenureValue") ?? ""),
        tenureUnit: String(readJsonField<unknown>(page2, "tenureUnit") ?? ""),
        attendanceCycle: String(
          readJsonField<unknown>(page2, "attendanceCycle") ?? "",
        ),
        stipendDate: String(readJsonField<unknown>(page2, "stipendDate") ?? ""),
        charges,
        otherItems,
        hasMouDocument: mouDocumentMeta !== undefined,
      };

      const page2Validation = validateCommercialDetails(
        commercialDetails,
        new Date().toISOString().slice(0, 10),
      );
      if (Object.keys(page2Validation.errors).length > 0) {
        response
          .status(422)
          .json({
            error: "Page 2 is not valid",
            errors: page2Validation.errors,
          });
        return;
      }

      // hasMouDocument is already true by this point, but the temp file itself
      // could still be missing if the uploads directory was cleared between the
      // upload and this final save.
      if (
        mouDocumentMeta === undefined ||
        !(await tempDocumentExists(draftId))
      ) {
        response
          .status(422)
          .json({ error: "The MOU PDF is missing; please re-upload it" });
        return;
      }
      const mouDocumentOriginalFilename = String(
        mouDocumentMeta.originalFilename ?? "document.pdf",
      ).slice(0, 255);
      const mouDocumentFileSizeBytes = Number(
        mouDocumentMeta.fileSizeBytes ?? 0,
      );

      // SPEC-06 section 4: Page 3 must be complete and valid before a single row
      // is written, for the same reason Page 1 and Page 2 are validated above.
      const scheme = String(readJsonField<unknown>(page3, "scheme") ?? "");
      const traineeCategoriesRaw =
        readJsonField<unknown[]>(page3, "traineeCategories") ?? [];
      const traineeCategories = traineeCategoriesRaw.map((value) =>
        String(value ?? ""),
      );
      const payrollItemsRaw =
        readJsonField<Record<string, Record<string, unknown>>>(
          page3,
          "items",
        ) ?? {};
      const payrollItemAnswers: Record<string, PayrollItemAnswer> = {};
      for (const [key, value] of Object.entries(payrollItemsRaw)) {
        payrollItemAnswers[key] = {
          isApplicable:
            typeof value["isApplicable"] === "boolean"
              ? value["isApplicable"]
              : undefined,
          amount: String(value["amount"] ?? ""),
        };
      }
      const payrollOtherItemsRaw =
        readJsonField<Array<Record<string, unknown>>>(page3, "otherItems") ??
        [];
      const payrollOtherItems: OtherChargeRow[] = payrollOtherItemsRaw.map(
        (row) => ({
          label: String(row["label"] ?? ""),
          amount: String(row["amount"] ?? ""),
          itemType: String(row["itemType"] ?? ""),
        }),
      );

      const payrollDetails: PayrollDetails = {
        scheme,
        traineeCategories,
        items: payrollItemAnswers,
        otherItems: payrollOtherItems,
      };

      const page3Validation = validatePayrollDetails(payrollDetails);
      if (Object.keys(page3Validation.errors).length > 0) {
        response
          .status(422)
          .json({
            error: "Page 3 is not valid",
            errors: page3Validation.errors,
          });
        return;
      }

      try {
        const result = await db.transaction(async (tx) => {
          // Allocate the MOU code outside the long transaction (D7), then use it.
          // SPEC-16 D109: the sequence is per scheme per year, not per zone per year,
          // because the code identifies the MOU rather than the company.
          const year = new Date().getFullYear();
          const generatedCode = await allocateCompanyCode(pool, scheme, year);

          // 1. Insert company. It no longer carries a generated code (D109); it does
          // carry the sector (D107) and the optional purchase contact (D110).
          const companyRow = await tx
            .insert(company)
            .values({
              companyName,
              companyType: page1Text("companyType"),
              // Phase B adds the SPEC-16 required-field rule for sector; until then a
              // draft without one falls back to OTHER, matching the migration's backfill.
              sector:
                page1Text("sector") === "" ? "OTHER" : page1Text("sector"),
              registrationType: page1Text("registrationType"),
              tanNumber: page1Text("tanNumber"),
              gstNumber: page1Text("gstNumber"),
              zoneId,
              addressLine1: page1Text("addressLine1"),
              addressLine2: page1Optional("addressLine2"),
              city: page1Text("city"),
              pinCode: page1Text("pinCode"),
              state: page1Text("state"),
              district: page1Text("district"),
              hrContactName: page1Text("hrContactName"),
              financeHeadContactName: page1Text("financeHeadContactName"),
              contactType: page1Text("contactType"),
              hrContactNumber: page1Text("hrContactNumber"),
              financeHeadContactNumber: page1Text("financeHeadContactNumber"),
              officialEmail: page1Text("officialEmail"),
              purchaseName: page1Optional("purchaseName"),
              purchaseNumber: page1Optional("purchaseNumber"),
              purchaseEmail: page1Optional("purchaseEmail"),
              createdBy: auth.userId,
            })
            .returning({ id: company.id });

          const companyId = firstRow(companyRow).id;

          // 2. Insert plant.
          const plantName =
            readJsonField<string>(page1, "plantName") ?? "Main Plant";
          const plantRow = await tx
            .insert(companyPlant)
            .values({ companyId, plantName })
            .returning({ id: companyPlant.id });
          const plantId = firstRow(plantRow).id;

          // 3. Insert MOU. Page 2 and Page 3 have already been validated above,
          // so every field read here is known-good.
          const mouRow = await tx
            .insert(mou)
            .values({
              generatedCode,
              companyId,
              companyPlantId: plantId,
              scheme,
              mouStartDate: commercialDetails.mouStartDate,
              tenureValue: Number(commercialDetails.tenureValue),
              tenureUnit: commercialDetails.tenureUnit,
              attendanceCycle: commercialDetails.attendanceCycle,
              stipendDate: Number(commercialDetails.stipendDate),
            })
            .returning({ id: mou.id });
          const mouId = firstRow(mouRow).id;

          // 4. Insert commercial items — one row per entered charge (a blank
          // fixed charge gets no row at all; SPEC-05 section 2.2), derived here
          // rather than trusting a client-supplied item list, so itemType for a
          // fixed key always matches the SPEC-01 catalogue.
          const commercialItemRows: (typeof commercialItem.$inferInsert)[] = [];
          for (const key of COMMERCIAL_FIXED_ITEM_KEYS) {
            const raw = (charges[key] ?? "").trim();
            if (raw === "") {
              continue;
            }
            commercialItemRows.push({
              mouId,
              itemKey: key,
              amount: raw,
              itemType: COMMERCIAL_ITEM_BY_KEY[key].itemType ?? "DEDUCTION",
            });
          }
          for (const row of otherItems) {
            const label = row.label.trim();
            const amount = row.amount.trim();
            const itemType = row.itemType.trim();
            if (label === "" && amount === "" && itemType === "") {
              // AC7: a fully empty Other row is ignored, nothing to persist.
              continue;
            }
            commercialItemRows.push({
              mouId,
              itemKey: "OTHER",
              customLabel: label,
              amount,
              itemType,
            });
          }
          if (commercialItemRows.length > 0) {
            await tx.insert(commercialItem).values(commercialItemRows);
          }

          // 5. Insert payroll config.
          const configRow = await tx
            .insert(payrollConfig)
            .values({ mouId })
            .returning({ id: payrollConfig.id });
          const configId = firstRow(configRow).id;

          // 6. Insert trainee categories - already validated above (AC5/AC6:
          // at least one, unique case-insensitively).
          await tx.insert(traineeCategory).values(
            traineeCategories.map((categoryName) => ({
              payrollConfigId: configId,
              categoryName: categoryName.trim(),
            })),
          );

          // 7. Insert payroll items - exactly one row per fixed key, always
          // (SPEC-06 section 3.3), unlike commercial_item's blank-means-no-row
          // (SPEC-05 D31): every one of the 22 items has already been confirmed
          // Yes or No by validatePayrollDetails, and itemType is taken from the
          // catalogue rather than trusted from the client. Plus one row per
          // non-blank Other row.
          const payrollItemRows: (typeof payrollItem.$inferInsert)[] = [];
          for (const key of PAYROLL_FIXED_ITEM_KEYS) {
            const answer = payrollItemAnswers[key];
            const isApplicable = answer?.isApplicable ?? false;
            payrollItemRows.push({
              payrollConfigId: configId,
              itemKey: key,
              isApplicable,
              amount: isApplicable ? answer?.amount.trim() : undefined,
              itemType: PAYROLL_ITEM_BY_KEY[key].itemType ?? "ALLOWANCE",
            });
          }
          for (const row of payrollOtherItems) {
            const label = row.label.trim();
            const amount = row.amount.trim();
            const itemType = row.itemType.trim();
            if (label === "" && amount === "" && itemType === "") {
              // A fully empty Other row is ignored, nothing to persist.
              continue;
            }
            payrollItemRows.push({
              payrollConfigId: configId,
              itemKey: "OTHER",
              customLabel: label,
              isApplicable: true,
              amount,
              itemType,
            });
          }
          await tx.insert(payrollItem).values(payrollItemRows);

          // 8. Promote the temp MOU PDF to permanent storage and record it.
          // Done as late as possible in the transaction: a physical file move
          // cannot be rolled back if a later statement fails, so keeping this
          // right before the final delete minimises that window (the same
          // accepted tradeoff as allocating the company code outside the
          // transaction entirely, D7).
          await promoteTempDocument(draftId, mouId);
          await tx.insert(mouDocument).values({
            mouId,
            filePath: permanentDocumentRelativePath(mouId),
            originalFilename: mouDocumentOriginalFilename,
            fileSizeBytes: mouDocumentFileSizeBytes,
            uploadedBy: auth.userId,
          });

          // 9. Delete draft.
          await tx.delete(companyDraft).where(eq(companyDraft.id, draftId));

          return { companyId, generatedCode };
        });

        // The temp file was already moved out by promoteTempDocument above; this
        // just clears the now-empty draft-tmp directory. Best-effort, since the
        // save itself has already succeeded.
        await discardTempDocument(draftId).catch(() => undefined);

        response.status(201).json(result);
      } catch (error) {
        // A unique-constraint violation here means two requests raced past
        // Page 1 validation (which only ever proves "no conflict existed at
        // that moment") and both tried to insert - the loser gets a clear,
        // actionable 409 instead of the same generic 500 as a genuine fault.
        const conflictMessage = describeUniqueConflict(error);
        if (conflictMessage !== undefined) {
          response.status(409).json({ error: conflictMessage });
          return;
        }
        console.error("Final save failed:", error);
        response.status(500).json({ error: "Save failed" });
      }
    },
  );

  return router;
}
