/**
 * Purpose: The complete persistent data model of SPEC-01 section 5 as a Drizzle
 * schema - the single source of truth that drizzle-kit turns into the SQL
 * migrations and from which the @mou/api types are inferred. It encodes the four
 * repo-wide decisions that are easy to get wrong: every id is a UUID with
 * gen_random_uuid() (D9), every foreign key is ON DELETE RESTRICT and deletion is
 * soft via is_active (D12), every enum column is varchar guarded by a CHECK built
 * from the @mou/domain unions (D11), and every money column is NUMERIC(12,2) so it
 * arrives in TypeScript as a string (D10). mou.end_date is a generated column (D5)
 * so it can never drift from the start date or the tenure.
 *
 * SPEC-02 adds the two authentication tables - `session` and `login_attempt` - to
 * this same file, so the schema stays the single place the database shape is
 * declared.
 *
 * SPEC-16 revises the model: `generated_code` moves from `company` to `mou` (D109)
 * because the code identifies an agreement rather than a company, `company` gains
 * `sector` and the three purchase columns (D107, D110), `trainee_category` gains
 * qualification, stipend rate and trainee count (D107), `commercial_item` gains a
 * period and basis (D108), `payroll_item` gains the insurance sub-model (D108), and
 * `company_code_counter` is re-keyed to (scheme, year).
 */

import { sql, type SQL } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import {
  APPROVAL_STATUSES,
  COMMERCIAL_BASES,
  COMMERCIAL_ITEM_KEYS,
  COMMERCIAL_PERIODS,
  COMPANY_TYPES,
  CONTACT_TYPES,
  EDIT_AGREEMENT_REASONS,
  INSURANCE_ITEM_KEY,
  INSURANCE_TYPES,
  ITEM_TYPES,
  PAYROLL_ITEM_KEYS,
  REGISTRATION_TYPES,
  SCHEMES,
  SECTORS,
  TENURE_UNITS,
  USER_ROLES,
} from "@mou/domain";

const OTHER_ITEM_KEY = "OTHER";

/** Renders a value list for a CHECK predicate; the values are compile-time constants. */
function sqlList(values: readonly string[]): string {
  return values.map((value) => `'${value}'`).join(", ");
}

function enumCheck(name: string, column: string, values: readonly string[]): SQL {
  return sql.raw(`${column} IN (${sqlList(values)})`);
}

/** The SPEC-01 section 6.1 formula, owned by Postgres so it cannot drift (D5). */
const END_DATE_EXPRESSION = sql.raw(
  `(mou_start_date + (tenure_value * CASE tenure_unit WHEN 'YEARS' THEN 12 ELSE 1 END) * INTERVAL '1 month' - INTERVAL '1 day')::date`,
);

/** Section 5.11. `user` is a reserved word in Postgres, so Drizzle always quotes it. */
export const user = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** SPEC-20 D123: 255, because a signed-up user's username is their email. */
    username: varchar("username", { length: 255 }).notNull().unique(),
    email: varchar("email", { length: 255 }).notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: varchar("role", { length: 20 }).notNull(),
    /** SPEC-19 D117: the one zone this user may see; NULL means every zone. */
    zoneId: uuid("zone_id").references(() => zone.id, { onDelete: "restrict" }),
    /** SPEC-20: only APPROVED users may sign in; the migration backfilled existing rows (D122). */
    approvalStatus: varchar("approval_status", { length: 10 }).notNull().default("PENDING"),
    fullName: varchar("full_name", { length: 150 }),
    approvalDecidedBy: uuid("approval_decided_by").references((): AnyPgColumn => user.id, { onDelete: "restrict" }),
    approvalDecidedAt: timestamp("approval_decided_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("user_role_chk", enumCheck("user_role_chk", "role", USER_ROLES)),
    check("user_approval_status_chk", enumCheck("user_approval_status_chk", "approval_status", APPROVAL_STATUSES)),
  ],
);

/**
 * SPEC-02 section 2. Server-side session store. A row is the session: logging out
 * deletes it and the 30-minute inactivity rule is a sliding `expires_at`, so a
 * session can be invalidated for real rather than merely having its cookie
 * cleared client-side. The cookie carries only this row's id, which is opaque and
 * unguessable; no user data is held in the cookie.
 */
export const session = pgTable(
  "session",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("session_user_idx").on(t.userId), index("session_expires_at_idx").on(t.expiresAt)],
);

/**
 * SPEC-02 section 2.1. Consecutive failed logins per username, used to lock an
 * account out after five attempts for fifteen minutes. It is a table rather than
 * an in-memory counter so the rule survives a restart and holds across processes.
 * The key is the lower-cased username or email exactly as the user typed it, so a
 * failed attempt against a username that does not exist is still counted - the
 * lockout must not become a way to discover which usernames are real.
 */
export const loginAttempt = pgTable(
  "login_attempt",
  {
    username: varchar("username", { length: 255 }).primaryKey(),
    failedCount: integer("failed_count").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [check("login_attempt_username_lower_chk", sql.raw("username = lower(username)"))],
);

/** Section 5.1. */
export const zone = pgTable(
  "zone",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: varchar("code", { length: 10 }).notNull().unique(),
    name: varchar("name", { length: 100 }).notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
  },
  () => [check("zone_code_upper_chk", sql.raw("code = upper(code)"))],
);

/**
 * Section 5.13 - supports the generated code in SPEC-16 section 3.3. Not a business
 * table. Re-keyed by D109 from (zone_id, year) to (scheme, year): the code now
 * identifies an MOU rather than a company, so the sequence restarts per scheme per
 * year and the zone reference is gone.
 */
export const companyCodeCounter = pgTable(
  "company_code_counter",
  {
    scheme: varchar("scheme", { length: 20 }).notNull(),
    year: smallint("year").notNull(),
    lastValue: integer("last_value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.scheme, t.year] })],
);

/**
 * Section 5.2. SPEC-16 dropped `generated_code` from here - it now lives on `mou`
 * (D109) - and added `sector` (D107) plus the optional purchase contact (D110).
 */
export const company = pgTable(
  "company",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyName: varchar("company_name", { length: 150 }).notNull(),
    companyType: varchar("company_type", { length: 20 }).notNull(),
    sector: varchar("sector", { length: 30 }).notNull(),
    registrationType: varchar("registration_type", { length: 20 }).notNull(),
    tanNumber: varchar("tan_number", { length: 10 }).notNull(),
    gstNumber: varchar("gst_number", { length: 15 }).notNull().unique(),
    zoneId: uuid("zone_id")
      .notNull()
      .references(() => zone.id, { onDelete: "restrict" }),
    addressLine1: varchar("address_line_1", { length: 200 }).notNull(),
    addressLine2: varchar("address_line_2", { length: 200 }),
    city: varchar("city", { length: 100 }).notNull(),
    pinCode: varchar("pin_code", { length: 6 }).notNull(),
    state: varchar("state", { length: 100 }).notNull(),
    district: varchar("district", { length: 100 }).notNull(),
    hrContactName: varchar("hr_contact_name", { length: 150 }).notNull(),
    financeHeadContactName: varchar("finance_head_contact_name", { length: 150 }).notNull(),
    contactType: varchar("contact_type", { length: 10 }).notNull(),
    hrContactNumber: varchar("hr_contact_number", { length: 20 }).notNull(),
    financeHeadContactNumber: varchar("finance_head_contact_number", { length: 20 }).notNull(),
    officialEmail: varchar("official_email", { length: 255 }).notNull(),
    purchaseName: varchar("purchase_name", { length: 150 }),
    purchaseNumber: varchar("purchase_number", { length: 20 }),
    purchaseEmail: varchar("purchase_email", { length: 255 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  () => [
    check("company_type_chk", enumCheck("company_type_chk", "company_type", COMPANY_TYPES)),
    check("company_sector_chk", enumCheck("company_sector_chk", "sector", SECTORS)),
    check(
      "company_registration_type_chk",
      enumCheck("company_registration_type_chk", "registration_type", REGISTRATION_TYPES),
    ),
    check("company_contact_type_chk", enumCheck("company_contact_type_chk", "contact_type", CONTACT_TYPES)),
    index("company_zone_active_idx")
      .on(sql.raw("zone_id"))
      .where(sql.raw("is_active")),
    index("company_name_lower_idx").on(sql.raw("lower(company_name)")),
  ],
);

/** Section 5.3. */
export const companyPlant = pgTable(
  "company_plant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "restrict" }),
    plantName: varchar("plant_name", { length: 100 }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
  },
  (t) => [
    uniqueIndex("company_plant_company_name_uq").on(t.companyId, sql.raw("lower(plant_name)")),
    index("company_plant_name_lower_idx").on(sql.raw("lower(plant_name)")),
  ],
);

/**
 * Section 5.4. One row per agreement, mutated in place; superseded states live in
 * agreement_history (D4). SPEC-16 D109 moved the generated code onto this table,
 * since a company running two schemes holds two agreements and so two codes.
 */
export const mou = pgTable(
  "mou",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    generatedCode: varchar("generated_code", { length: 30 }).notNull().unique(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "restrict" }),
    companyPlantId: uuid("company_plant_id").references(() => companyPlant.id, {
      onDelete: "restrict",
    }),
    scheme: varchar("scheme", { length: 20 }).notNull(),
    mouStartDate: date("mou_start_date").notNull(),
    tenureValue: integer("tenure_value").notNull(),
    tenureUnit: varchar("tenure_unit", { length: 10 }).notNull(),
    endDate: date("end_date").generatedAlwaysAs(END_DATE_EXPRESSION),
    attendanceCycle: varchar("attendance_cycle", { length: 50 }).notNull(),
    stipendDate: smallint("stipend_date"),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mou_company_plant_scheme_uq")
      .on(t.companyId, t.companyPlantId, t.scheme)
      .where(sql.raw("is_active")),
    index("mou_active_end_date_idx").on(t.isActive, t.endDate),
    index("mou_company_idx").on(t.companyId),
    check("mou_scheme_chk", enumCheck("mou_scheme_chk", "scheme", SCHEMES)),
    check("mou_tenure_unit_chk", enumCheck("mou_tenure_unit_chk", "tenure_unit", TENURE_UNITS)),
    check("mou_tenure_value_chk", sql.raw("tenure_value > 0")),
    check("mou_stipend_date_chk", sql.raw("stipend_date BETWEEN 1 AND 31")),
  ],
);

/** Section 5.5 - one row per entered charge, shaped like payroll_item (D8). */
export const commercialItem = pgTable(
  "commercial_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mouId: uuid("mou_id")
      .notNull()
      .references(() => mou.id, { onDelete: "restrict" }),
    itemKey: varchar("item_key", { length: 40 }).notNull(),
    customLabel: varchar("custom_label", { length: 100 }),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    itemType: varchar("item_type", { length: 10 }).notNull(),
    period: varchar("period", { length: 20 }),
    basis: varchar("basis", { length: 30 }),
  },
  (t) => [
    uniqueIndex("commercial_item_fixed_uq")
      .on(t.mouId, t.itemKey)
      .where(sql.raw(`item_key <> '${OTHER_ITEM_KEY}'`)),
    index("commercial_item_mou_idx").on(t.mouId),
    check(
      "commercial_item_key_chk",
      enumCheck("commercial_item_key_chk", "item_key", COMMERCIAL_ITEM_KEYS),
    ),
    check("commercial_item_item_type_chk", enumCheck("commercial_item_item_type_chk", "item_type", ITEM_TYPES)),
    check("commercial_item_amount_chk", sql.raw("amount >= 0")),
    check(
      "commercial_item_custom_label_chk",
      sql.raw(`(item_key = '${OTHER_ITEM_KEY}') = (custom_label IS NOT NULL)`),
    ),
    // SPEC-16 D108. Both are optional; the CHECKs only constrain them when present,
    // since a NULL passes an `IN` test as unknown rather than false.
    check("commercial_item_period_chk", enumCheck("commercial_item_period_chk", "period", COMMERCIAL_PERIODS)),
    check("commercial_item_basis_chk", enumCheck("commercial_item_basis_chk", "basis", COMMERCIAL_BASES)),
  ],
);

/** Section 5.6 - one-to-one with mou; the scheme is read from mou, never duplicated. */
export const payrollConfig = pgTable("payroll_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  mouId: uuid("mou_id")
    .notNull()
    .unique()
    .references(() => mou.id, { onDelete: "restrict" }),
});

/**
 * Section 5.7. At least one row per config is enforced in application code (SPEC-06).
 * SPEC-16 D107 adds the three descriptive fields the v2 design shows on each category
 * card. All three are optional, so a category row captured before this change stays
 * valid.
 */
export const traineeCategory = pgTable(
  "trainee_category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payrollConfigId: uuid("payroll_config_id")
      .notNull()
      .references(() => payrollConfig.id, { onDelete: "restrict" }),
    categoryName: varchar("category_name", { length: 100 }).notNull(),
    qualification: varchar("qualification", { length: 150 }),
    stipendRate: numeric("stipend_rate", { precision: 12, scale: 2 }),
    traineeCount: integer("trainee_count"),
  },
  (t) => [
    uniqueIndex("trainee_category_config_name_uq").on(
      t.payrollConfigId,
      sql.raw("lower(category_name)"),
    ),
    check("trainee_category_stipend_rate_chk", sql.raw("stipend_rate >= 0")),
    check("trainee_category_trainee_count_chk", sql.raw("trainee_count >= 0")),
  ],
);

/** Section 5.8. Exactly one row per fixed key plus zero or more "Other" rows. */
export const payrollItem = pgTable(
  "payroll_item",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    payrollConfigId: uuid("payroll_config_id")
      .notNull()
      .references(() => payrollConfig.id, { onDelete: "restrict" }),
    itemKey: varchar("item_key", { length: 40 }).notNull(),
    customLabel: varchar("custom_label", { length: 100 }),
    isApplicable: boolean("is_applicable").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }),
    itemType: varchar("item_type", { length: 10 }).notNull(),
    insuranceType: varchar("insurance_type", { length: 10 }),
    insuranceGfsAmount: numeric("insurance_gfs_amount", { precision: 12, scale: 2 }),
    insuranceMouAmount: numeric("insurance_mou_amount", { precision: 12, scale: 2 }),
  },
  (t) => [
    uniqueIndex("payroll_item_fixed_uq")
      .on(t.payrollConfigId, t.itemKey)
      .where(sql.raw(`item_key <> '${OTHER_ITEM_KEY}'`)),
    index("payroll_item_config_idx").on(t.payrollConfigId),
    check("payroll_item_key_chk", enumCheck("payroll_item_key_chk", "item_key", PAYROLL_ITEM_KEYS)),
    check("payroll_item_item_type_chk", enumCheck("payroll_item_item_type_chk", "item_type", ITEM_TYPES)),
    check("payroll_item_amount_chk", sql.raw("amount >= 0")),
    check("payroll_item_applicable_amount_chk", sql.raw("NOT is_applicable OR amount IS NOT NULL")),
    check("payroll_item_inapplicable_amount_chk", sql.raw("is_applicable OR amount IS NULL")),
    check(
      "payroll_item_custom_label_chk",
      sql.raw(`(item_key = '${OTHER_ITEM_KEY}') = (custom_label IS NOT NULL)`),
    ),
    // SPEC-16 D108. The insurance sub-model belongs to the INSURANCE key alone, so a
    // half-written or misplaced one is rejected outright rather than left to the
    // application to police.
    check(
      "payroll_item_insurance_key_chk",
      sql.raw(
        `(item_key = '${INSURANCE_ITEM_KEY}') OR (insurance_type IS NULL AND insurance_gfs_amount IS NULL AND insurance_mou_amount IS NULL)`,
      ),
    ),
    check(
      "payroll_item_insurance_type_chk",
      enumCheck("payroll_item_insurance_type_chk", "insurance_type", INSURANCE_TYPES),
    ),
    check("payroll_item_insurance_gfs_chk", sql.raw("insurance_gfs_amount >= 0")),
    check("payroll_item_insurance_mou_chk", sql.raw("insurance_mou_amount >= 0")),
  ],
);

/**
 * Section 5.9. Files are stored outside the web root; only the path is kept here.
 * The Upload MoU screen also captures the document's own date, validity and
 * reference number - all optional, so rows uploaded before them stay valid.
 */
export const mouDocument = pgTable(
  "mou_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mouId: uuid("mou_id")
      .notNull()
      .references(() => mou.id, { onDelete: "restrict" }),
    filePath: text("file_path").notNull(),
    originalFilename: varchar("original_filename", { length: 255 }).notNull(),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }).notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    documentDate: date("document_date"),
    validUntil: date("valid_until"),
    referenceNumber: varchar("reference_number", { length: 100 }),
  },
  () => [check("mou_document_valid_until_chk", sql.raw("valid_until >= document_date"))],
);

/** Section 5.10. Append-only - no UPDATE or DELETE path exists at any role. */
export const agreementHistory = pgTable(
  "agreement_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mouId: uuid("mou_id")
      .notNull()
      .references(() => mou.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    editReason: varchar("edit_reason", { length: 40 }).notNull(),
    proofFilePath: text("proof_file_path"),
    remark: varchar("remark", { length: 500 }),
    snapshot: jsonb("snapshot").notNull(),
    editedBy: uuid("edited_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("agreement_history_mou_version_uq").on(t.mouId, t.version),
    check(
      "agreement_history_edit_reason_chk",
      enumCheck("agreement_history_edit_reason_chk", "edit_reason", EDIT_AGREEMENT_REASONS),
    ),
  ],
);

/** Section 5.12. One open draft per user; used only by the wizard in SPEC-03. */
export const companyDraft = pgTable(
  "company_draft",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "restrict" }),
    payload: jsonb("payload").notNull(),
    currentPage: smallint("current_page").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [check("company_draft_current_page_chk", sql.raw("current_page BETWEEN 1 AND 3"))],
);

/** SPEC-08 section 3.1. One row per (MOU, threshold) that has ever been raised
 * - the unique index is what makes "safe to run twice on the same day" and
 * "catch up any threshold crossed" the same guarantee: an INSERT ... ON
 * CONFLICT DO NOTHING can never duplicate a row regardless of how many times
 * or how late the job runs. */
export const mouAlert = pgTable(
  "mou_alert",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mouId: uuid("mou_id")
      .notNull()
      .references(() => mou.id, { onDelete: "restrict" }),
    thresholdDays: smallint("threshold_days").notNull(),
    triggeredOn: date("triggered_on").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    acknowledgedBy: uuid("acknowledged_by").references(() => user.id, { onDelete: "restrict" }),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("mou_alert_mou_threshold_uq").on(t.mouId, t.thresholdDays),
    check("mou_alert_threshold_chk", sql.raw("threshold_days IN (30, 60, 90)")),
  ],
);

/** SPEC-08 section 3: tracks the expiry job's own progress so a missed day is
 * caught up on the next run instead of silently skipped (AC3). Not a business
 * table - one row per named job, keyed by name so a second scheduled job
 * later does not need a second table. */
export const scheduledJobState = pgTable("scheduled_job_state", {
  jobName: varchar("job_name", { length: 100 }).primaryKey(),
  lastRunDate: date("last_run_date").notNull(),
});

/** SPEC-10 section 7. Ephemeral, single-use - modeled on company_draft (D21):
 * the reason (and proof, and remark) must exist BEFORE any field becomes
 * editable, and the request's own id is the edit token a PUT must present.
 * `consumed_at` makes a token single-use; there is no UPDATE path for a
 * consumed row, only a fresh POST for a new attempt. */
export const mouEditRequest = pgTable(
  "mou_edit_request",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    mouId: uuid("mou_id")
      .notNull()
      .references(() => mou.id, { onDelete: "restrict" }),
    editReason: varchar("edit_reason", { length: 40 }).notNull(),
    proofFilePath: text("proof_file_path"),
    remark: varchar("remark", { length: 500 }),
    loadedVersion: integer("loaded_version").notNull(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (t) => [
    index("mou_edit_request_mou_idx").on(t.mouId),
    check(
      "mou_edit_request_reason_chk",
      enumCheck("mou_edit_request_reason_chk", "edit_reason", EDIT_AGREEMENT_REASONS),
    ),
  ],
);

/** SPEC-13 section 5. A generated export lives on disk for 24 hours; this
 * row is what makes it reachable only through an authenticated download
 * endpoint (never a guessable URL) and what a cleanup job deletes once
 * expired. Under the 5,000-company threshold a job is generated
 * synchronously and inserted already `ready`; over it, inserted `pending`
 * and updated once a fire-and-forget generation finishes. */
export const exportJob = pgTable(
  "export_job",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: varchar("kind", { length: 10 }).notNull(),
    status: varchar("status", { length: 10 }).notNull().default("pending"),
    filePath: text("file_path"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check("export_job_kind_chk", sql.raw("kind IN ('excel', 'pdf')")),
    check("export_job_status_chk", sql.raw("status IN ('pending', 'ready', 'failed')")),
    index("export_job_expires_at_idx").on(t.expiresAt),
  ],
);

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type LoginAttempt = typeof loginAttempt.$inferSelect;
export type Zone = typeof zone.$inferSelect;
export type Company = typeof company.$inferSelect;
export type CompanyPlant = typeof companyPlant.$inferSelect;
export type Mou = typeof mou.$inferSelect;
export type CommercialItem = typeof commercialItem.$inferSelect;
export type PayrollConfig = typeof payrollConfig.$inferSelect;
export type TraineeCategory = typeof traineeCategory.$inferSelect;
export type PayrollItem = typeof payrollItem.$inferSelect;
export type MouDocument = typeof mouDocument.$inferSelect;
export type AgreementHistory = typeof agreementHistory.$inferSelect;
export type MouEditRequest = typeof mouEditRequest.$inferSelect;
export type ExportJob = typeof exportJob.$inferSelect;
export type CompanyDraft = typeof companyDraft.$inferSelect;
export type CompanyCodeCounter = typeof companyCodeCounter.$inferSelect;
export type MouAlert = typeof mouAlert.$inferSelect;
export type ScheduledJobState = typeof scheduledJobState.$inferSelect;
