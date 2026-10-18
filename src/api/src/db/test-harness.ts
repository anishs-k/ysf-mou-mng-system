/**
 * Purpose: Shared setup for the @mou/api integration tests (SPEC-01 acceptance
 * criteria AC5-AC16). Those criteria are assertions about PostgreSQL itself, so per
 * D13 they run against the docker-compose database and are never cached. This
 * module owns the parts every integration test needs: resolving and creating the
 * dedicated test database so the development data is never truncated, applying the
 * real migrations through the same runner production uses, resetting between tests,
 * and inserting the small fixtures the constraint tests build on.
 */

import type { UserRole } from "@mou/domain";
import { Client, Pool } from "pg";

import { hashPassword } from "../auth/password.ts";
import { runMigrations } from "./migrate.ts";

export const MIGRATION_TABLE = "__drizzle_migrations";

function databaseNameOf(connectionString: string): string {
  return new URL(connectionString).pathname.replace(/^\//, "");
}

function withDatabaseName(connectionString: string, database: string): string {
  const parsed = new URL(connectionString);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * User, host, port and database - what decides whether two URLs reach the same
 * data. The user matters on a shared pooler (Supabase), where two projects share
 * host, port and database name and differ only in `postgres.<project-ref>`.
 */
function databaseIdentity(connectionString: string): string {
  const parsed = new URL(connectionString);
  return `${decodeURIComponent(parsed.username)}@${parsed.hostname.toLowerCase()}:${parsed.port || "5432"}/${databaseNameOf(connectionString)}`;
}

/**
 * TEST_DATABASE_URL wins; otherwise the DATABASE_URL database gets a _test suffix.
 * resetDatabase() truncates every table, so a TEST_DATABASE_URL that points back
 * at the DATABASE_URL database is refused rather than allowed to wipe it.
 */
export function testDatabaseUrl(): string {
  const explicit = process.env["TEST_DATABASE_URL"];
  if (explicit !== undefined && explicit !== "") {
    const base = process.env["DATABASE_URL"];
    if (base !== undefined && base !== "" && databaseIdentity(base) === databaseIdentity(explicit)) {
      throw new Error("TEST_DATABASE_URL points at the DATABASE_URL database; the tests would truncate it. Use a separate database.");
    }
    return explicit;
  }
  const base = process.env["DATABASE_URL"];
  if (base === undefined || base === "") {
    throw new Error("Set TEST_DATABASE_URL or DATABASE_URL - see environment.sh and .env.example");
  }
  return withDatabaseName(base, `${databaseNameOf(base)}_test`);
}

/** Creates the test database on first run; connecting to it must not create it. */
export async function ensureTestDatabase(connectionString: string): Promise<void> {
  const database = databaseNameOf(connectionString);
  if (!/^[A-Za-z0-9_]+$/.test(database)) {
    throw new Error(`Unsupported database name in the test connection string: "${database}"`);
  }
  const client = new Client({ connectionString: withDatabaseName(connectionString, "postgres") });
  await client.connect();
  try {
    const existing = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
    if (existing.rowCount === 0) {
      await client.query(`CREATE DATABASE "${database}"`);
    }
  } finally {
    await client.end();
  }
}

/** Migrates the test database and returns a pool connected to it. */
export async function createTestPool(): Promise<Pool> {
  const connectionString = testDatabaseUrl();
  await ensureTestDatabase(connectionString);
  await runMigrations(connectionString);
  return new Pool({ connectionString });
}

/** Empties every application table. The migration history table is left alone. */
export async function resetDatabase(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> $1`,
    [MIGRATION_TABLE],
  );
  if (rows.length === 0) {
    return;
  }
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(", ");
  await pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

export function firstRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) {
    throw new Error("Expected the statement to return a row");
  }
  return row;
}

/** Asserts that a statement fails with a specific PostgreSQL SQLSTATE. */
export async function expectSqlState(statement: Promise<unknown>, sqlState: string): Promise<void> {
  try {
    await statement;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code !== sqlState) {
      throw new Error(`Expected SQLSTATE ${sqlState} but received ${String(code)}: ${String(error)}`);
    }
    return;
  }
  throw new Error(`Expected SQLSTATE ${sqlState} but the statement succeeded`);
}

export async function insertZone(pool: Pool, code = "WEST", name = "West"): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO zone (code, name) VALUES ($1, $2) RETURNING id`,
    [code, name],
  );
  return firstRow(rows).id;
}

export async function insertUser(pool: Pool, username = "admin"): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO "user" (username, email, password_hash, role, approval_status)
     VALUES ($1, $2, 'not-a-real-hash', 'ADMIN', 'APPROVED') RETURNING id`,
    [username, `${username}@example.com`],
  );
  return firstRow(rows).id;
}

export interface CredentialedUser {
  readonly id: string;
  readonly username: string;
  readonly password: string;
  readonly role: UserRole;
}

/** A user whose password is a real scrypt hash, so the login flow can be exercised. */
export async function insertUserWithPassword(
  pool: Pool,
  options: {
    readonly username?: string;
    readonly password?: string;
    readonly role?: UserRole;
    readonly isActive?: boolean;
    /** SPEC-19: the zone the user is restricted to; omitted means every zone. */
    readonly zoneId?: string;
    /** SPEC-20: fixtures are trusted users, so APPROVED unless a test says otherwise. */
    readonly approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  } = {},
): Promise<CredentialedUser> {
  const username = options.username ?? "admin";
  const password = options.password ?? "correct-password";
  const role = options.role ?? "ADMIN";
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO "user" (username, email, password_hash, role, is_active, zone_id, approval_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      username,
      `${username}@example.com`,
      await hashPassword(password),
      role,
      options.isActive ?? true,
      options.zoneId ?? null,
      options.approvalStatus ?? "APPROVED",
    ],
  );
  return { id: firstRow(rows).id, username, password, role };
}

let companySequence = 0;

export interface CompanyFixtureOptions {
  readonly companyName?: string;
  readonly gstNumber?: string;
  readonly sector?: string;
}

export async function insertCompany(
  pool: Pool,
  zoneId: string,
  createdBy: string,
  options: CompanyFixtureOptions = {},
): Promise<string> {
  companySequence += 1;
  const suffix = String(companySequence).padStart(4, "0");
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO company (
       company_name, company_type, sector, registration_type, tan_number, gst_number,
       zone_id, address_line_1, city, pin_code, state, district,
       hr_contact_name, finance_head_contact_name, contact_type,
       hr_contact_number, finance_head_contact_number, official_email, created_by
     ) VALUES (
       $1, 'PRIVATE_SECTOR', $2, 'COMPANY', 'TANP12345C', $3,
       $4, '1 Test Road', 'Pune', '411001', 'Maharashtra', 'Pune',
       'HR Name', 'Finance Head Name', 'MOBILE', '9876543210', '9876543211', $5, $6
     ) RETURNING id`,
    [
      options.companyName ?? `Test Company ${suffix}`,
      options.sector ?? "OTHER",
      options.gstNumber ?? `27AAAAA${suffix}A1Z5`,
      zoneId,
      `company${suffix}@example.com`,
      createdBy,
    ],
  );
  return firstRow(rows).id;
}

export async function insertPlant(pool: Pool, companyId: string, plantName = "Plant One"): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO company_plant (company_id, plant_name) VALUES ($1, $2) RETURNING id`,
    [companyId, plantName],
  );
  return firstRow(rows).id;
}

export interface MouFixtureOptions {
  readonly scheme?: string;
  readonly startDate?: string;
  readonly tenureValue?: number;
  readonly tenureUnit?: string;
  readonly isActive?: boolean;
  readonly generatedCode?: string;
}

let mouSequence = 0;

export async function insertMou(
  pool: Pool,
  companyId: string,
  companyPlantId: string | null,
  options: MouFixtureOptions = {},
): Promise<string> {
  mouSequence += 1;
  const scheme = options.scheme ?? "WILP";
  const generatedCode = options.generatedCode ?? `MOU-${scheme}-2026-${String(mouSequence).padStart(4, "0")}`;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO mou (
       generated_code, company_id, company_plant_id, scheme, mou_start_date, tenure_value, tenure_unit,
       attendance_cycle, stipend_date, is_active
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'MONTHLY', 5, $8) RETURNING id`,
    [
      generatedCode,
      companyId,
      companyPlantId,
      scheme,
      options.startDate ?? "2026-01-01",
      options.tenureValue ?? 12,
      options.tenureUnit ?? "MONTHS",
      options.isActive ?? true,
    ],
  );
  return firstRow(rows).id;
}

/**
 * Inserts an MOU whose generated `end_date` lands exactly `daysFromToday`
 * days from `business_today()`, by asking Postgres itself to invert the
 * generated column's own formula (`start + 1 month - 1 day`) rather than
 * computing calendar months in JS - the two stay consistent by construction,
 * including across month-length edge cases, since both directions use the
 * same interval arithmetic. Used by SPEC-08/12 tests that need an exact
 * days-remaining value regardless of what day the suite happens to run on.
 */
export async function insertMouEndingIn(
  pool: Pool,
  companyId: string,
  companyPlantId: string | null,
  daysFromToday: number,
  options: Omit<MouFixtureOptions, "startDate" | "tenureValue" | "tenureUnit"> = {},
): Promise<string> {
  const { rows } = await pool.query<{ start_date: string }>(
    `SELECT (business_today() + ($1 * INTERVAL '1 day') + INTERVAL '1 day' - INTERVAL '1 month')::date::text AS start_date`,
    [daysFromToday],
  );
  const startDate = firstRow(rows).start_date;
  return insertMou(pool, companyId, companyPlantId, {
    ...options,
    startDate,
    tenureValue: 1,
    tenureUnit: "MONTHS",
  });
}

export async function insertPayrollConfig(pool: Pool, mouId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO payroll_config (mou_id) VALUES ($1) RETURNING id`,
    [mouId],
  );
  return firstRow(rows).id;
}

export interface CommercialItemFixtureOptions {
  readonly customLabel?: string;
  readonly amount?: string;
  readonly itemType?: string;
  readonly period?: string;
  readonly basis?: string;
}

/** Used by SPEC-07/11/13 tests that read commercial_item rows back through a view. */
export async function insertCommercialItem(
  pool: Pool,
  mouId: string,
  itemKey: string,
  options: CommercialItemFixtureOptions = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO commercial_item (mou_id, item_key, custom_label, amount, item_type, period, basis)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [
      mouId,
      itemKey,
      options.customLabel ?? null,
      options.amount ?? null,
      options.itemType ?? "DEDUCTION",
      options.period ?? null,
      options.basis ?? null,
    ],
  );
  return firstRow(rows).id;
}

export async function insertTraineeCategory(
  pool: Pool,
  payrollConfigId: string,
  categoryName: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO trainee_category (payroll_config_id, category_name) VALUES ($1, $2) RETURNING id`,
    [payrollConfigId, categoryName],
  );
  return firstRow(rows).id;
}

export interface PayrollItemFixtureOptions {
  readonly customLabel?: string;
  readonly isApplicable?: boolean;
  readonly amount?: string;
  readonly itemType?: string;
}

export async function insertPayrollItem(
  pool: Pool,
  payrollConfigId: string,
  itemKey: string,
  options: PayrollItemFixtureOptions = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO payroll_item (payroll_config_id, item_key, custom_label, is_applicable, amount, item_type)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      payrollConfigId,
      itemKey,
      options.customLabel ?? null,
      options.isApplicable ?? true,
      options.amount ?? null,
      options.itemType ?? "ALLOWANCE",
    ],
  );
  return firstRow(rows).id;
}

export interface MouDocumentFixtureOptions {
  readonly filePath?: string;
  readonly originalFilename?: string;
  readonly fileSizeBytes?: number;
}

export async function insertMouDocument(
  pool: Pool,
  mouId: string,
  uploadedBy: string,
  options: MouDocumentFixtureOptions = {},
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO mou_document (mou_id, file_path, original_filename, file_size_bytes, uploaded_by)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      mouId,
      options.filePath ?? "mou/test/document.pdf",
      options.originalFilename ?? "document.pdf",
      options.fileSizeBytes ?? 1024,
      uploadedBy,
    ],
  );
  return firstRow(rows).id;
}
