/**
 * Purpose: Integration tests for the SPEC-01 section 5 data model - acceptance
 * criteria AC5 to AC14. Every one of these is an assertion about PostgreSQL rather
 * than about TypeScript, so per D13 they run against the docker-compose database
 * through the real generated migrations, and the turbo task is uncached so a stale
 * pass can never be reported. The tests deliberately use raw SQL: the point is to
 * prove what the database enforces, not what Drizzle believes it generated.
 */

import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";

import { allocateCompanyCodeSequence } from "./company-code-repository.ts";
import {
  createTestPool,
  expectSqlState,
  firstRow,
  insertCompany,
  insertMou,
  insertPayrollConfig,
  insertPlant,
  insertUser,
  insertZone,
  resetDatabase,
} from "./test-harness.ts";

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";
const CHECK_VIOLATION = "23514";
const GENERATED_COLUMN_WRITE = "428C9";

const EXPECTED_COLUMNS: Readonly<Record<string, readonly string[]>> = {
  zone: ["id", "code", "name", "is_active"],
  // SPEC-21 D128/D129: zones live in user_zone, and all_zones replaces the NULL zone_id.
  user: ["id", "username", "email", "password_hash", "role", "is_active", "created_at", "full_name", "all_zones"],
  user_zone: ["user_id", "zone_id"],
  // SPEC-02 section 2 additions to the schema.
  session: ["id", "user_id", "created_at", "last_seen_at", "expires_at"],
  login_attempt: ["username", "failed_count", "locked_until", "last_attempt_at"],
  // SPEC-16 D109 re-keyed this from (zone_id, year) to (scheme, year). The
  // migration appends `scheme` after the pre-existing columns, so the physical
  // order is year, last_value, scheme - column order carries no meaning in Postgres.
  company_code_counter: ["year", "last_value", "scheme"],
  company: [
    "id",
    "company_name",
    "company_type",
    "sector",
    "registration_type",
    "tan_number",
    "gst_number",
    "zone_id",
    "address_line_1",
    "address_line_2",
    "city",
    "pin_code",
    "state",
    "district",
    "hr_contact_name",
    "finance_head_contact_name",
    "contact_type",
    "hr_contact_number",
    "finance_head_contact_number",
    "official_email",
    "purchase_name",
    "purchase_number",
    "purchase_email",
    "is_active",
    "created_at",
    "updated_at",
    "created_by",
  ],
  company_plant: ["id", "company_id", "plant_name", "is_active"],
  mou: [
    "id",
    "generated_code",
    "company_id",
    "company_plant_id",
    "scheme",
    "mou_start_date",
    "tenure_value",
    "tenure_unit",
    "end_date",
    "attendance_cycle",
    "stipend_date",
    "version",
    "is_active",
    "created_at",
    "updated_at",
  ],
  commercial_item: [
    "id",
    "mou_id",
    "item_key",
    "custom_label",
    "amount",
    "item_type",
    "period",
    "basis",
  ],
  payroll_config: ["id", "mou_id"],
  trainee_category: [
    "id",
    "payroll_config_id",
    "category_name",
    "qualification",
    "stipend_rate",
    "trainee_count",
  ],
  payroll_item: [
    "id",
    "payroll_config_id",
    "item_key",
    "custom_label",
    "is_applicable",
    "amount",
    "item_type",
    "insurance_type",
    "insurance_gfs_amount",
    "insurance_mou_amount",
  ],
  mou_document: [
    "id",
    "mou_id",
    "file_path",
    "original_filename",
    "file_size_bytes",
    "uploaded_at",
    "uploaded_by",
  ],
  agreement_history: [
    "id",
    "mou_id",
    "version",
    "edit_reason",
    "proof_file_path",
    "remark",
    "snapshot",
    "edited_by",
    "edited_at",
  ],
  company_draft: ["id", "user_id", "payload", "current_page", "created_at", "updated_at"],
  mou_alert: [
    "id",
    "mou_id",
    "threshold_days",
    "triggered_on",
    "acknowledged_at",
    "acknowledged_by",
    "notified_at",
  ],
  scheduled_job_state: ["job_name", "last_run_date"],
  mou_edit_request: [
    "id",
    "mou_id",
    "edit_reason",
    "proof_file_path",
    "remark",
    "loaded_version",
    "created_by",
    "created_at",
    "consumed_at",
  ],
  export_job: ["id", "kind", "status", "file_path", "created_by", "created_at", "expires_at"],
};

const EXPECTED_CHECK_CONSTRAINTS = [
  "zone_code_upper_chk",
  "user_role_chk",
  "login_attempt_username_lower_chk",
  "company_type_chk",
  "company_registration_type_chk",
  "company_contact_type_chk",
  "company_sector_chk",
  "mou_scheme_chk",
  "mou_tenure_unit_chk",
  "mou_tenure_value_chk",
  "mou_stipend_date_chk",
  "commercial_item_key_chk",
  "commercial_item_item_type_chk",
  "commercial_item_amount_chk",
  "commercial_item_custom_label_chk",
  "commercial_item_period_chk",
  "commercial_item_basis_chk",
  "payroll_item_key_chk",
  "payroll_item_item_type_chk",
  "payroll_item_amount_chk",
  "payroll_item_applicable_amount_chk",
  "payroll_item_inapplicable_amount_chk",
  "payroll_item_custom_label_chk",
  // SPEC-16 D108 insurance sub-model.
  "payroll_item_insurance_key_chk",
  "payroll_item_insurance_type_chk",
  "payroll_item_insurance_gfs_chk",
  "payroll_item_insurance_mou_chk",
  // SPEC-16 D107 trainee-category fields.
  "trainee_category_stipend_rate_chk",
  "trainee_category_trainee_count_chk",
  "agreement_history_edit_reason_chk",
  "company_draft_current_page_chk",
  "mou_alert_threshold_chk",
  "mou_edit_request_reason_chk",
  "export_job_kind_chk",
  "export_job_status_chk",
];

const EXPECTED_INDEXES = [
  "agreement_history_mou_version_uq",
  "commercial_item_fixed_uq",
  "commercial_item_mou_idx",
  "company_zone_active_idx",
  "company_name_lower_idx",
  "company_plant_company_name_uq",
  "company_plant_name_lower_idx",
  "mou_company_plant_scheme_uq",
  "mou_active_end_date_idx",
  "mou_company_idx",
  "payroll_item_fixed_uq",
  "payroll_item_config_idx",
  "trainee_category_config_name_uq",
  "session_user_idx",
  "session_expires_at_idx",
  "mou_alert_mou_threshold_uq",
  "mou_edit_request_mou_idx",
  "export_job_expires_at_idx",
  "user_zone_zone_idx",
];

let pool: Pool;

before(async () => {
  pool = await createTestPool();
});

beforeEach(async () => {
  await resetDatabase(pool);
});

after(async () => {
  await pool.end();
});

test("AC5 every section 5 table exists with exactly the stated columns", async () => {
  const { rows } = await pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`,
  );

  const actual = new Map<string, string[]>();
  for (const row of rows) {
    const columns = actual.get(row.table_name) ?? [];
    columns.push(row.column_name);
    actual.set(row.table_name, columns);
  }

  assert.deepEqual([...actual.keys()].sort(), Object.keys(EXPECTED_COLUMNS).sort());
  for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
    // Compared as sets, not sequences. PostgreSQL appends every ADD COLUMN, so
    // physical order reflects migration history rather than schema.ts order;
    // SPEC-16 moved four `company` columns to the tail and nothing depends on
    // their position. What matters is that the columns are exactly these.
    assert.deepEqual(
      [...(actual.get(table) ?? [])].sort(),
      [...expected].sort(),
      `columns of ${table}`,
    );
  }
});

test("AC5 every enum and money column carries its CHECK constraint", async () => {
  const { rows } = await pool.query<{ conname: string }>(
    `SELECT conname FROM pg_constraint WHERE contype = 'c' AND connamespace = 'public'::regnamespace`,
  );
  const names = rows.map((row) => row.conname).sort();
  assert.deepEqual(names, [...EXPECTED_CHECK_CONSTRAINTS].sort());
});

test("AC5 the required unique and lookup indexes exist", async () => {
  const { rows } = await pool.query<{ indexname: string }>(
    `SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`,
  );
  const names = new Set(rows.map((row) => row.indexname));
  for (const expected of EXPECTED_INDEXES) {
    assert.ok(names.has(expected), `missing index ${expected}`);
  }
});

test("AC5 the partial unique indexes really carry their WHERE clause", async () => {
  const { rows } = await pool.query<{ indexname: string; indexdef: string }>(
    `SELECT indexname, indexdef FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN ('mou_company_plant_scheme_uq', 'commercial_item_fixed_uq',
                          'payroll_item_fixed_uq', 'company_zone_active_idx')`,
  );
  const definitions = new Map(rows.map((row) => [row.indexname, row.indexdef]));

  // PostgreSQL rewrites the predicate with explicit casts, e.g.
  // WHERE ((item_key)::text <> 'OTHER'::text), so match loosely on the parts.
  assert.match(definitions.get("mou_company_plant_scheme_uq") ?? "", /WHERE is_active/);
  assert.match(definitions.get("commercial_item_fixed_uq") ?? "", /WHERE .*item_key.*<> 'OTHER'/);
  assert.match(definitions.get("payroll_item_fixed_uq") ?? "", /WHERE .*item_key.*<> 'OTHER'/);
  assert.match(definitions.get("company_zone_active_idx") ?? "", /WHERE is_active/);
});

test("AC5 every foreign key is ON DELETE RESTRICT", async () => {
  const { rows } = await pool.query<{ conname: string; confdeltype: string }>(
    `SELECT conname, confdeltype FROM pg_constraint WHERE contype = 'f'`,
  );
  assert.ok(rows.length > 0, "expected foreign keys to exist");
  const cascading = rows.filter((row) => row.confdeltype !== "r").map((row) => row.conname);
  assert.deepEqual(cascading, [], "every foreign key must use ON DELETE RESTRICT");
});

test("AC5 end_date is a stored generated column", async () => {
  const { rows } = await pool.query<{ is_generated: string; generation_expression: string }>(
    `SELECT is_generated, generation_expression
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'mou' AND column_name = 'end_date'`,
  );
  const column = firstRow(rows);
  assert.equal(column.is_generated, "ALWAYS");
  assert.match(column.generation_expression, /tenure_value/);
});

test("AC6 a second company with the same gst_number is rejected", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  await insertCompany(pool, zoneId, userId, { gstNumber: "27AAAAA0001A1Z5" });

  await expectSqlState(
    insertCompany(pool, zoneId, userId, { gstNumber: "27AAAAA0001A1Z5" }),
    UNIQUE_VIOLATION,
  );
});

test("AC6 a second MOU with the same generated_code is rejected", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);
  const plantId = await insertPlant(pool, companyId);
  await insertMou(pool, companyId, plantId, { generatedCode: "MOU-WILP-2026-0001" });

  // A different scheme isolates the generated_code violation from the
  // one-live-MOU-per-scheme index that AC7 covers.
  await expectSqlState(
    insertMou(pool, companyId, plantId, {
      scheme: "FLEXI",
      generatedCode: "MOU-WILP-2026-0001",
    }),
    UNIQUE_VIOLATION,
  );
});

test("AC7 a second active MOU for the same company, plant and scheme is rejected", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);
  const plantId = await insertPlant(pool, companyId);

  await insertMou(pool, companyId, plantId, { scheme: "WILP" });

  await expectSqlState(
    insertMou(pool, companyId, plantId, { scheme: "WILP" }),
    UNIQUE_VIOLATION,
  );
});

test("AC7 an inactive MOU for the same company, plant and scheme is permitted", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);
  const plantId = await insertPlant(pool, companyId);

  await insertMou(pool, companyId, plantId, { scheme: "WILP" });
  const supersededId = await insertMou(pool, companyId, plantId, { scheme: "WILP", isActive: false });

  assert.ok(supersededId.length > 0);
});

test("AC8 end_date cannot be written directly", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);

  await expectSqlState(
    pool.query(
      `INSERT INTO mou (company_id, scheme, mou_start_date, tenure_value, tenure_unit,
                        attendance_cycle, end_date)
       VALUES ($1, 'WILP', '2026-01-01', 12, 'MONTHS', 'MONTHLY', '2027-01-01')`,
      [companyId],
    ),
    GENERATED_COLUMN_WRITE,
  );
});

test("AC8 end_date recomputes when the tenure changes", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);
  const mouId = await insertMou(pool, companyId, null, {
    startDate: "2026-01-01",
    tenureValue: 12,
    tenureUnit: "MONTHS",
  });

  const read = async (): Promise<string> => {
    const { rows } = await pool.query<{ end_date: string }>(
      `SELECT end_date::text AS end_date FROM mou WHERE id = $1`,
      [mouId],
    );
    return firstRow(rows).end_date;
  };

  assert.equal(await read(), "2026-12-31");
  await pool.query(`UPDATE mou SET tenure_value = 24 WHERE id = $1`, [mouId]);
  assert.equal(await read(), "2027-12-31");
});

test("AC9 a payroll item that is not applicable cannot carry an amount", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);
  const mouId = await insertMou(pool, companyId, null);
  const configId = await insertPayrollConfig(pool, mouId);

  await expectSqlState(
    pool.query(
      `INSERT INTO payroll_item (payroll_config_id, item_key, is_applicable, amount, item_type)
       VALUES ($1, 'BONUS', false, 100.00, 'ALLOWANCE')`,
      [configId],
    ),
    CHECK_VIOLATION,
  );
});

test("AC9 an applicable payroll item must carry an amount", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);
  const mouId = await insertMou(pool, companyId, null);
  const configId = await insertPayrollConfig(pool, mouId);

  await expectSqlState(
    pool.query(
      `INSERT INTO payroll_item (payroll_config_id, item_key, is_applicable, amount, item_type)
       VALUES ($1, 'BONUS', true, NULL, 'ALLOWANCE')`,
      [configId],
    ),
    CHECK_VIOLATION,
  );
});

test("AC9 an applicable payroll item with an amount is accepted", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);
  const mouId = await insertMou(pool, companyId, null);
  const configId = await insertPayrollConfig(pool, mouId);

  await pool.query(
    `INSERT INTO payroll_item (payroll_config_id, item_key, is_applicable, amount, item_type)
     VALUES ($1, 'BONUS', true, 100.00, 'ALLOWANCE')`,
    [configId],
  );
});

test("AC10 an OTHER commercial item without a custom label is rejected", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);
  const mouId = await insertMou(pool, companyId, null);

  await expectSqlState(
    pool.query(
      `INSERT INTO commercial_item (mou_id, item_key, custom_label, amount, item_type)
       VALUES ($1, 'OTHER', NULL, 50.00, 'DEDUCTION')`,
      [mouId],
    ),
    CHECK_VIOLATION,
  );
});

test("AC10 a non-OTHER commercial item with a custom label is rejected", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);
  const mouId = await insertMou(pool, companyId, null);

  await expectSqlState(
    pool.query(
      `INSERT INTO commercial_item (mou_id, item_key, custom_label, amount, item_type)
       VALUES ($1, 'INSURANCE', 'Not allowed here', 50.00, 'DEDUCTION')`,
      [mouId],
    ),
    CHECK_VIOLATION,
  );
});

test("AC11 two rows for the same fixed commercial item key are rejected", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);
  const mouId = await insertMou(pool, companyId, null);

  await pool.query(
    `INSERT INTO commercial_item (mou_id, item_key, amount, item_type)
     VALUES ($1, 'INSURANCE', 10.00, 'DEDUCTION')`,
    [mouId],
  );

  await expectSqlState(
    pool.query(
      `INSERT INTO commercial_item (mou_id, item_key, amount, item_type)
       VALUES ($1, 'INSURANCE', 20.00, 'DEDUCTION')`,
      [mouId],
    ),
    UNIQUE_VIOLATION,
  );
});

test("AC11 two OTHER commercial item rows are permitted", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  const companyId = await insertCompany(pool, zoneId, userId);
  const mouId = await insertMou(pool, companyId, null);

  for (const [label, amount] of [
    ["Uniform stitching", "100.00"],
    ["Tool kit", "250.00"],
  ]) {
    await pool.query(
      `INSERT INTO commercial_item (mou_id, item_key, custom_label, amount, item_type)
       VALUES ($1, 'OTHER', $2, $3, 'DEDUCTION')`,
      [mouId, label, amount],
    );
  }

  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM commercial_item WHERE mou_id = $1 AND item_key = 'OTHER'`,
    [mouId],
  );
  assert.equal(firstRow(rows).count, "2");
});

test("AC12 deleting a zone that still has companies is refused by RESTRICT", async () => {
  const zoneId = await insertZone(pool);
  const userId = await insertUser(pool);
  await insertCompany(pool, zoneId, userId);

  await expectSqlState(pool.query(`DELETE FROM zone WHERE id = $1`, [zoneId]), FOREIGN_KEY_VIOLATION);
});

test("SPEC-21 a user is assigned several zones through user_zone", async () => {
  const userId = await insertUser(pool);
  const west = await insertZone(pool, "WEST", "West");
  const pune = await insertZone(pool, "PUNE", "Pune");
  await pool.query(`INSERT INTO user_zone (user_id, zone_id) VALUES ($1, $2), ($1, $3)`, [userId, west, pune]);

  const { rows } = await pool.query<{ zone_id: string }>(
    `SELECT zone_id FROM user_zone WHERE user_id = $1 ORDER BY zone_id`,
    [userId],
  );
  assert.deepEqual(rows.map((row) => row.zone_id), [west, pune].sort());
});

test("SPEC-21 the same zone cannot be assigned to a user twice", async () => {
  const userId = await insertUser(pool);
  const zoneId = await insertZone(pool);
  await pool.query(`INSERT INTO user_zone (user_id, zone_id) VALUES ($1, $2)`, [userId, zoneId]);

  await expectSqlState(
    pool.query(`INSERT INTO user_zone (user_id, zone_id) VALUES ($1, $2)`, [userId, zoneId]),
    UNIQUE_VIOLATION,
  );
});

test("SPEC-21 a user_zone row must name an existing zone and user", async () => {
  const userId = await insertUser(pool);
  const zoneId = await insertZone(pool);
  const unknown = "00000000-0000-4000-8000-000000000000";

  await expectSqlState(
    pool.query(`INSERT INTO user_zone (user_id, zone_id) VALUES ($1, $2)`, [userId, unknown]),
    FOREIGN_KEY_VIOLATION,
  );
  await expectSqlState(
    pool.query(`INSERT INTO user_zone (user_id, zone_id) VALUES ($1, $2)`, [unknown, zoneId]),
    FOREIGN_KEY_VIOLATION,
  );
});

test("SPEC-21 deleting a zone that is still assigned to a user is refused by RESTRICT", async () => {
  const userId = await insertUser(pool);
  const zoneId = await insertZone(pool);
  await pool.query(`INSERT INTO user_zone (user_id, zone_id) VALUES ($1, $2)`, [userId, zoneId]);

  await expectSqlState(pool.query(`DELETE FROM zone WHERE id = $1`, [zoneId]), FOREIGN_KEY_VIOLATION);
});

test("SPEC-21 a new user is not all-zone unless that is stated explicitly", async () => {
  const { rows } = await pool.query<{ all_zones: boolean }>(
    `INSERT INTO "user" (username, email, password_hash, role)
     VALUES ('plain', 'plain@example.com', 'not-a-real-hash', 'VIEWER') RETURNING all_zones`,
  );
  assert.equal(firstRow(rows).all_zones, false);
});

test("AC13 business_today() returns the Asia/Kolkata date even in a UTC session", async () => {
  const client = await pool.connect();
  try {
    await client.query(`SET TIME ZONE 'UTC'`);
    const { rows } = await client.query<{ today: string }>(
      `SELECT business_today()::text AS today`,
    );
    const istToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(
      new Date(),
    );
    assert.equal(firstRow(rows).today, istToday);
  } finally {
    client.release();
  }
});

test("AC14 fifty concurrent allocations for one scheme-year yield fifty distinct values", async () => {
  // SPEC-16 D109 re-keyed the counter to (scheme, year), so the isolation unit is
  // now the scheme rather than the zone.
  const allocated = await Promise.all(
    Array.from({ length: 50 }, () => allocateCompanyCodeSequence(pool, "WILP", 2026)),
  );

  assert.equal(new Set(allocated).size, 50, "every allocated sequence must be distinct");
  assert.deepEqual(
    [...allocated].sort((left, right) => left - right),
    Array.from({ length: 50 }, (_, index) => index + 1),
  );
});
