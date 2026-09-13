/**
 * Purpose: The demonstration dataset of SPEC-16 section 6 Phase E - 65 companies
 * and 120 MOUs, so the dashboards, search, exports and the expiry alerts have
 * something realistic to render before any real data exists.
 *
 * This is deliberately NOT part of `npm run db:seed`. That seed (zones and the
 * ADMIN user) is reference data the application cannot run without; this one is
 * synthetic volume for demos and screenshots, and AC30 requires that it is
 * referenced by no migration, no CI job and not by `db:seed` itself. It is
 * therefore an explicitly-invoked script, `npm run db:seed:demo`.
 *
 * Every value is synthetic on purpose, which is risk R2's mitigation: the TAN and
 * GST numbers carry a `DEMO` prefix and the emails use the reserved `.invalid`
 * TLD (RFC 2606), so no seeded row can be mistaken for a real company or be mailed
 * by accident. Nothing here is production data and nothing here should be restored
 * into production.
 *
 * The dataset is generated, not hand-written: company attributes cycle the
 * @mou/domain master lists and every MOU's payroll rows are derived from the
 * PAYROLL_ITEMS catalogue, so the data satisfies the schema's invariants by
 * construction rather than by luck. That is what AC28 and AC29 assert.
 *
 * Idempotent: if any demo row is already present the script inserts nothing and
 * reports zeroes, so re-running it cannot double the dataset.
 */

import {
  COMMERCIAL_ITEMS,
  COMPANY_TYPES,
  CONTACT_TYPES,
  INSURANCE_TYPES,
  PAYROLL_FIXED_ITEM_KEYS,
  PAYROLL_ITEM_BY_KEY,
  REGISTRATION_TYPES,
  SECTORS,
  type InsuranceType,
} from "@mou/domain";
import { Pool } from "pg";

import { allocateCompanyCode } from "../company-code-repository.ts";
import { ZONE_SEED } from "./zones.ts";

/** AC27. 65 companies carrying 120 MOUs across 19 zones and 6 schemes. */
export const DEMO_COMPANY_COUNT = 65;
export const DEMO_MOU_COUNT = 120;
export const DEMO_ZONE_COUNT = 19;

/**
 * Six of the seven schemes. FLEXI is left out so the demo exercises a realistic
 * mix rather than every value in the enum.
 */
const DEMO_SCHEMES = ["NAPS", "NATS", "WILP", "BVOC", "DVOC", "MSBTE"] as const;

/** Marks a row as seeded, and keeps the synthetic TAN/GST unmistakably fake. */
const DEMO_PREFIX = "DEMO";

/**
 * How many MOUs a company holds. With every company holding one or two, the count
 * that must hold two is the surplus of MOUs over companies - 120 - 65 = 55 - so the
 * first 55 companies hold two schemes and the remaining ten hold one.
 */
function mouCountFor(companyIndex: number): number {
  return companyIndex < DEMO_MOU_COUNT - DEMO_COMPANY_COUNT ? 2 : 1;
}

export interface DemoSeedResult {
  readonly companies: number;
  readonly plants: number;
  readonly mous: number;
  readonly traineeCategories: number;
  readonly payrollItems: number;
  readonly commercialItems: number;
}

interface CityForZone {
  readonly city: string;
  readonly district: string;
  readonly state: string;
}

/**
 * The city, district and state each demo company reports. Keyed by zone code so a
 * Pune company does not end up in Chennai; any zone outside the 19 used falls back
 * to Pune rather than failing.
 */
const CITY_BY_ZONE: Readonly<Record<string, CityForZone>> = {
  AHILYANGR: { city: "Ahilya Nagar", district: "Ahilya Nagar", state: "Maharashtra" },
  ASSAM: { city: "Guwahati", district: "Kamrup", state: "Assam" },
  CHENNAI: { city: "Chennai", district: "Chennai", state: "Tamil Nadu" },
  CHIPLUN: { city: "Chiplun", district: "Ratnagiri", state: "Maharashtra" },
  COIMBATORE: { city: "Coimbatore", district: "Coimbatore", state: "Tamil Nadu" },
  DAMAN: { city: "Daman", district: "Daman", state: "Daman and Diu" },
  GOA: { city: "Panaji", district: "North Goa", state: "Goa" },
  GJSANAND: { city: "Sanand", district: "Ahmedabad", state: "Gujarat" },
  GJVADODARA: { city: "Vadodara", district: "Vadodara", state: "Gujarat" },
  HARIDWAR: { city: "Haridwar", district: "Haridwar", state: "Uttarakhand" },
  JAMSHEDPUR: { city: "Jamshedpur", district: "East Singhbhum", state: "Jharkhand" },
  KARNATAKA: { city: "Bengaluru", district: "Bengaluru Urban", state: "Karnataka" },
  KOLHAPUR: { city: "Kolhapur", district: "Kolhapur", state: "Maharashtra" },
  MP: { city: "Indore", district: "Indore", state: "Madhya Pradesh" },
  MUMBAI: { city: "Mumbai", district: "Mumbai City", state: "Maharashtra" },
  NASHIK: { city: "Nashik", district: "Nashik", state: "Maharashtra" },
  NCRHARYANA: { city: "Gurugram", district: "Gurugram", state: "Haryana" },
  NCRNOIDA: { city: "Noida", district: "Gautam Buddha Nagar", state: "Uttar Pradesh" },
  PUNE: { city: "Pune", district: "Pune", state: "Maharashtra" },
};

const FALLBACK_CITY: CityForZone = { city: "Pune", district: "Pune", state: "Maharashtra" };

/**
 * Company names are built from two lists whose indices advance at coprime-ish
 * rates, which keeps all 65 distinct without an ugly numeric suffix: the prefix
 * cycles every 24 companies and the suffix advances once per full cycle.
 */
const NAME_PREFIXES = [
  "Aarvee", "Bharat", "Chaitanya", "Deccan", "Ekata", "Falcon", "Giriraj", "Hindustan",
  "Indrayani", "Jyoti", "Kalyani", "Lokmanya", "Mahalasa", "Nandini", "Omkar", "Prathamesh",
  "Rajhans", "Sahyadri", "Tulsi", "Udyog", "Vaibhav", "Waman", "Yashwant", "Zeal",
] as const;

const NAME_SUFFIXES = [
  "Industries", "Enterprises", "Engineering", "Manufacturing", "Solutions", "Technologies",
  "Works", "Systems",
] as const;

const TENURE_VALUES = [12, 24, 36] as const;
const TRAINEE_CATEGORIES = [
  { categoryName: "ITI Trainee", qualification: "ITI (2 year)" },
  { categoryName: "Diploma Trainee", qualification: "Diploma (3 year)" },
] as const;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/**
 * A deterministic amount in rupees. Derived from the two indices so a given MOU
 * always generates the same figures and the dataset is reproducible.
 */
function demoAmount(mouIndex: number, keyIndex: number): string {
  return (250 + ((mouIndex * 17 + keyIndex * 29) % 45) * 50).toFixed(2);
}

function insuranceTypeFor(mouIndex: number): InsuranceType {
  return INSURANCE_TYPES[mouIndex % INSURANCE_TYPES.length] ?? "TOPUP";
}

async function firstValue<T>(query: Promise<{ rows: T[] }>, message: string): Promise<T> {
  const { rows } = await query;
  const row = rows[0];
  if (row === undefined) {
    throw new Error(message);
  }
  return row;
}

/** Resolves the ADMIN row seeded by `npm run db:seed`; every row needs created_by. */
async function requireUserId(pool: Pool): Promise<string> {
  const row = await firstValue(
    pool.query<{ id: string }>(
      `SELECT id FROM "user" WHERE role = 'ADMIN' AND is_active ORDER BY created_at LIMIT 1`,
    ),
    `No active ADMIN user found. Run "npm run db:seed" first.`,
  );
  return row.id;
}

/** Resolves the ids of the first DEMO_ZONE_COUNT zones, in seed order. */
async function requireZoneIds(pool: Pool): Promise<readonly string[]> {
  const codes = ZONE_SEED.slice(0, DEMO_ZONE_COUNT).map((zone) => zone.code);
  const { rows } = await pool.query<{ id: string; code: string }>(
    `SELECT id, code FROM zone WHERE code = ANY($1::text[])`,
    [codes],
  );
  if (rows.length < DEMO_ZONE_COUNT) {
    throw new Error(
      `Only ${rows.length} of the ${DEMO_ZONE_COUNT} demo zones exist. Run "npm run db:seed" first.`,
    );
  }
  const byCode = new Map(rows.map((row) => [row.code, row.id]));
  return codes.map((code) => byCode.get(code) ?? "");
}

async function insertCompany(
  pool: Pool,
  index: number,
  zoneCode: string,
  zoneId: string,
  userId: string,
): Promise<string> {
  const city = CITY_BY_ZONE[zoneCode] ?? FALLBACK_CITY;
  const serial = pad(index + 1, 2);
  const name = `${NAME_PREFIXES[index % NAME_PREFIXES.length]} ${
    NAME_SUFFIXES[Math.floor(index / NAME_PREFIXES.length) % NAME_SUFFIXES.length]
  }`;
  // Roughly half the companies record an optional purchase contact, so the demo
  // exercises both the filled and the empty branch of wizard Page 1.
  const hasPurchase = index % 2 === 0;

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO company (
       company_name, company_type, sector, registration_type, tan_number, gst_number,
       zone_id, address_line_1, address_line_2, city, pin_code, state, district,
       hr_contact_name, finance_head_contact_name, contact_type,
       hr_contact_number, finance_head_contact_number, official_email,
       purchase_name, purchase_number, purchase_email, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     RETURNING id`,
    [
      name,
      COMPANY_TYPES[index % COMPANY_TYPES.length],
      SECTORS[index % SECTORS.length],
      REGISTRATION_TYPES[index % REGISTRATION_TYPES.length],
      `${DEMO_PREFIX}${pad(index + 1, 6)}`,
      `${DEMO_PREFIX}${pad(index + 1, 11)}`,
      zoneId,
      `Plot No. ${index + 1}, MIDC Industrial Area`,
      index % 3 === 0 ? "Near State Highway" : null,
      city.city,
      String(400000 + ((index * 137) % 99000)).padStart(6, "0"),
      city.state,
      city.district,
      `HR Contact ${serial}`,
      `Finance Head ${serial}`,
      CONTACT_TYPES[index % CONTACT_TYPES.length],
      String(9000000000 + index),
      String(9100000000 + index),
      `demo.company.${serial}@example.invalid`,
      hasPurchase ? `Purchase Contact ${serial}` : null,
      hasPurchase ? String(9200000000 + index) : null,
      hasPurchase ? `demo.purchase.${serial}@example.invalid` : null,
      userId,
    ],
  );
  return rows[0]?.id ?? "";
}

async function insertPlant(pool: Pool, companyId: string, plantName: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO company_plant (company_id, plant_name) VALUES ($1, $2) RETURNING id`,
    [companyId, plantName],
  );
  return rows[0]?.id ?? "";
}

async function insertMou(
  pool: Pool,
  companyId: string,
  plantId: string,
  scheme: string,
  mouIndex: number,
): Promise<string> {
  // Spread start dates across 2025 and early 2026 so the expiry alerts have
  // MOUs in every bucket - expired, expiring soon and active.
  const startOffsetDays = (mouIndex * 5) % 540;
  const startDate = new Date(Date.UTC(2025, 0, 1) + startOffsetDays * 86_400_000);
  const tenureValue = TENURE_VALUES[mouIndex % TENURE_VALUES.length] ?? 12;
  const generatedCode = await allocateCompanyCode(pool, scheme, startDate.getUTCFullYear());

  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO mou (
       generated_code, company_id, company_plant_id, scheme, mou_start_date,
       tenure_value, tenure_unit, attendance_cycle, stipend_date
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      generatedCode,
      companyId,
      plantId,
      scheme,
      startDate.toISOString().slice(0, 10),
      tenureValue,
      tenureValue === 36 ? "YEARS" : "MONTHS",
      "Monthly (1st to last day)",
      (mouIndex % 28) + 1,
    ],
  );
  return rows[0]?.id ?? "";
}

/** One payroll_config per MOU, then the trainee categories the wizard captures. */
async function insertPayrollConfig(pool: Pool, mouId: string, mouIndex: number): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO payroll_config (mou_id) VALUES ($1) RETURNING id`,
    [mouId],
  );
  const configId = rows[0]?.id ?? "";

  for (const [categoryIndex, category] of TRAINEE_CATEGORIES.entries()) {
    await pool.query(
      `INSERT INTO trainee_category (
         payroll_config_id, category_name, qualification, stipend_rate, trainee_count
       ) VALUES ($1,$2,$3,$4,$5)`,
      [
        configId,
        category.categoryName,
        category.qualification,
        // The two CHECKs reject negatives, so these stay positive by construction.
        (8000 + ((mouIndex * 11 + categoryIndex * 7) % 40) * 250).toFixed(2),
        10 + ((mouIndex * 3 + categoryIndex) % 25),
      ],
    );
  }
  return configId;
}

/**
 * AC29: exactly the 23 fixed catalogue rows per MOU. Applicability is derived from
 * the two indices, and every row then satisfies the coupling CHECKs - an
 * inapplicable row carries no amount, a non-INSURANCE row carries no insurance
 * column, and an applicable INSURANCE row carries the amounts its type requires.
 */
async function insertPayrollItems(pool: Pool, configId: string, mouIndex: number): Promise<number> {
  let inserted = 0;
  const insuranceType = insuranceTypeFor(mouIndex);

  for (const [keyIndex, key] of PAYROLL_FIXED_ITEM_KEYS.entries()) {
    const definition = PAYROLL_ITEM_BY_KEY[key];
    const isApplicable = (mouIndex + keyIndex) % 3 !== 0;
    const amount = isApplicable ? demoAmount(mouIndex, keyIndex) : null;

    let insuranceTypeValue: string | null = null;
    let gfsAmount: string | null = null;
    let mouAmount: string | null = null;
    if (key === "INSURANCE" && isApplicable) {
      insuranceTypeValue = insuranceType;
      if (insuranceType === "TOPUP" || insuranceType === "BOTH") {
        gfsAmount = (500 + ((mouIndex * 13) % 20) * 25).toFixed(2);
      }
      if (insuranceType === "RECOVERY" || insuranceType === "BOTH") {
        mouAmount = (400 + ((mouIndex * 7) % 15) * 20).toFixed(2);
      }
    }

    await pool.query(
      `INSERT INTO payroll_item (
         payroll_config_id, item_key, custom_label, is_applicable, amount, item_type,
         insurance_type, insurance_gfs_amount, insurance_mou_amount
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        configId,
        key,
        null,
        isApplicable,
        amount,
        definition.itemType,
        insuranceTypeValue,
        gfsAmount,
        mouAmount,
      ],
    );
    inserted += 1;
  }
  return inserted;
}

/**
 * A small commercial set per MOU, including the period and basis of D108 and an
 * occasional "Other" row - the only key allowed to carry a custom label.
 */
async function insertCommercialItems(pool: Pool, mouId: string, mouIndex: number): Promise<number> {
  const fixed = COMMERCIAL_ITEMS.filter((item) => item.key !== "OTHER").slice(0, 3);
  let inserted = 0;

  for (const [index, item] of fixed.entries()) {
    await pool.query(
      `INSERT INTO commercial_item (mou_id, item_key, amount, item_type, period, basis)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        mouId,
        item.key,
        demoAmount(mouIndex, index + 5),
        item.itemType,
        item.key === "ONE_TIME_REGISTRATION_FEES" ? "ONE_TIME" : "MONTHLY",
        item.key === "ONE_TIME_REGISTRATION_FEES" ? "FLAT" : "PER_TRAINEE_PER_MONTH",
      ],
    );
    inserted += 1;
  }

  if (mouIndex % 5 === 0) {
    await pool.query(
      `INSERT INTO commercial_item (mou_id, item_key, custom_label, amount, item_type, period, basis)
       VALUES ($1,'OTHER',$2,$3,$4,$5,$6)`,
      [mouId, "Misc Recovery", demoAmount(mouIndex, 9), "DEDUCTION", null, null],
    );
    inserted += 1;
  }
  return inserted;
}

/** True when demo rows are already present, which makes the seed idempotent. */
async function hasDemoData(pool: Pool): Promise<boolean> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM company WHERE gst_number LIKE $1`,
    [`${DEMO_PREFIX}%`],
  );
  return Number(rows[0]?.count ?? "0") > 0;
}

/**
 * Seeds the demo dataset. Returns the number of rows inserted per table; a second
 * call inserts nothing and returns zeroes.
 */
export async function seedDemo(pool: Pool): Promise<DemoSeedResult> {
  if (await hasDemoData(pool)) {
    return {
      companies: 0,
      plants: 0,
      mous: 0,
      traineeCategories: 0,
      payrollItems: 0,
      commercialItems: 0,
    };
  }

  const userId = await requireUserId(pool);
  const zoneIds = await requireZoneIds(pool);

  const result = { companies: 0, plants: 0, mous: 0, traineeCategories: 0, payrollItems: 0, commercialItems: 0 };
  let mouIndex = 0;

  await pool.query("BEGIN");
  try {
    for (let companyIndex = 0; companyIndex < DEMO_COMPANY_COUNT; companyIndex += 1) {
      const zoneIndex = companyIndex % DEMO_ZONE_COUNT;
      const zoneCode = ZONE_SEED[zoneIndex]?.code ?? "PUNE";
      const zoneId = zoneIds[zoneIndex] ?? "";
      const companyId = await insertCompany(pool, companyIndex, zoneCode, zoneId, userId);
      result.companies += 1;

      // A company holding two MOUs holds two plants, so the
      // (company, plant, scheme) unique index is satisfied on plant as well as
      // on scheme - AC28.
      const plantIds: string[] = [];
      for (let plantNumber = 1; plantNumber <= mouCountFor(companyIndex); plantNumber += 1) {
        plantIds.push(await insertPlant(pool, companyId, `Unit ${plantNumber}`));
        result.plants += 1;
      }

      for (const [mouNumber, plantId] of plantIds.entries()) {
        const scheme = DEMO_SCHEMES[(companyIndex + mouNumber * 3) % DEMO_SCHEMES.length] ?? "NAPS";
        const mouId = await insertMou(pool, companyId, plantId, scheme, mouIndex);
        result.mous += 1;

        const configId = await insertPayrollConfig(pool, mouId, mouIndex);
        result.traineeCategories += TRAINEE_CATEGORIES.length;
        result.payrollItems += await insertPayrollItems(pool, configId, mouIndex);
        result.commercialItems += await insertCommercialItems(pool, mouId, mouIndex);

        mouIndex += 1;
      }
    }
    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    throw error;
  }

  return result;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`${name} must be set - see environment.sh and .env.example`);
  }
  return value;
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: requireEnv("DATABASE_URL") });
  try {
    const result = await seedDemo(pool);
    if (result.companies === 0) {
      console.log("Demo data is already present - nothing inserted.");
      return;
    }
    console.log(
      `Demo seed: ${result.companies} companies, ${result.plants} plants, ${result.mous} MOUs, ` +
        `${result.traineeCategories} trainee categories, ${result.payrollItems} payroll items, ` +
        `${result.commercialItems} commercial items.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
