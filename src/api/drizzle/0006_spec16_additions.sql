ALTER TABLE "mou" DROP CONSTRAINT "mou_scheme_chk";--> statement-breakpoint
ALTER TABLE "payroll_item" DROP CONSTRAINT "payroll_item_key_chk";--> statement-breakpoint
ALTER TABLE "commercial_item" ADD COLUMN "period" varchar(20);--> statement-breakpoint
ALTER TABLE "commercial_item" ADD COLUMN "basis" varchar(30);--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "sector" varchar(30);--> statement-breakpoint
-- SPEC-16 section 3.1: backfill existing rows with OTHER, then tighten. Adding the
-- column as NOT NULL would fail outright on any database that already holds
-- companies, so the backfill has to be part of the migration.
UPDATE "company" SET "sector" = 'OTHER' WHERE "sector" IS NULL;--> statement-breakpoint
ALTER TABLE "company" ALTER COLUMN "sector" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "purchase_name" varchar(150);--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "purchase_number" varchar(20);--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "purchase_email" varchar(255);--> statement-breakpoint
ALTER TABLE "company_code_counter" ADD COLUMN "scheme" varchar(20);--> statement-breakpoint
ALTER TABLE "mou" ADD COLUMN "generated_code" varchar(30);--> statement-breakpoint
-- Section 3.2 adds the code as NOT NULL UNIQUE, so existing MOUs need one. It
-- cannot be copied from company.generated_code: that column is dropped by 0007 and
-- a company holding two agreements would produce a duplicate anyway. The code is
-- rebuilt in the new MOU-<SCHEME>-<YYYY>-<NNNN> form, numbered per scheme and
-- start year, which is unique by construction. 0007 seeds the counter from these
-- rows so the next allocation cannot reuse a number.
UPDATE "mou" m
   SET "generated_code" = 'MOU-' || m."scheme" || '-' || to_char(m."mou_start_date", 'YYYY') || '-' ||
       lpad(s."seq"::text, 4, '0')
  FROM (SELECT "id",
               row_number() OVER (PARTITION BY "scheme", EXTRACT(YEAR FROM "mou_start_date")
                                  ORDER BY "mou_start_date", "id") AS "seq"
          FROM "mou") s
 WHERE s."id" = m."id";--> statement-breakpoint
ALTER TABLE "mou" ALTER COLUMN "generated_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_item" ADD COLUMN "insurance_type" varchar(10);--> statement-breakpoint
ALTER TABLE "payroll_item" ADD COLUMN "insurance_gfs_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "payroll_item" ADD COLUMN "insurance_mou_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "trainee_category" ADD COLUMN "qualification" varchar(150);--> statement-breakpoint
ALTER TABLE "trainee_category" ADD COLUMN "stipend_rate" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "trainee_category" ADD COLUMN "trainee_count" integer;--> statement-breakpoint
ALTER TABLE "mou" ADD CONSTRAINT "mou_generated_code_unique" UNIQUE("generated_code");--> statement-breakpoint
ALTER TABLE "commercial_item" ADD CONSTRAINT "commercial_item_period_chk" CHECK (period IN ('MONTHLY', 'QUARTERLY', 'ONE_TIME', 'ANNUAL'));--> statement-breakpoint
ALTER TABLE "commercial_item" ADD CONSTRAINT "commercial_item_basis_chk" CHECK (basis IN ('FLAT', 'PER_TRAINEE_PER_MONTH', 'PRO_RATA', 'ON_PAYABLE_STIPEND', 'OTHER'));--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_sector_chk" CHECK (sector IN ('AUTOMOBILE', 'BANKING_AND_FINANCE', 'CHEMICAL', 'CONSTRUCTION', 'DEFENCE', 'EDUCATION', 'ELECTRONICS_AND_IT', 'ENGINEERING', 'FMCG', 'HEALTHCARE', 'LOGISTICS', 'MANUFACTURING', 'PHARMACEUTICAL', 'POWER_AND_ENERGY', 'RETAIL', 'TEXTILE', 'OTHER'));--> statement-breakpoint
ALTER TABLE "mou" ADD CONSTRAINT "mou_scheme_chk" CHECK (scheme IN ('NAPS', 'NATS', 'WILP', 'BVOC', 'DVOC', 'FLEXI', 'MSBTE'));--> statement-breakpoint
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_insurance_key_chk" CHECK ((item_key = 'INSURANCE') OR (insurance_type IS NULL AND insurance_gfs_amount IS NULL AND insurance_mou_amount IS NULL));--> statement-breakpoint
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_insurance_type_chk" CHECK (insurance_type IN ('TOPUP', 'RECOVERY', 'BOTH'));--> statement-breakpoint
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_insurance_gfs_chk" CHECK (insurance_gfs_amount >= 0);--> statement-breakpoint
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_insurance_mou_chk" CHECK (insurance_mou_amount >= 0);--> statement-breakpoint
-- Section 2.6 replaced the payroll catalogue, and 15 of the 22 old keys have no
-- counterpart in the new 24-key list. Those rows are folded into "Other" with the
-- old name kept as the label rather than deleted, so no captured amount is lost -
-- Other rows repeat freely, so a config is not limited to one. This runs while the
-- old item_key CHECK is dropped (it is, at the top of this migration) and before
-- the new one is added below, so the folded values are validated like any other write.
UPDATE "payroll_item"
   SET "custom_label" = initcap(replace("item_key", '_', ' ')),
       "item_key" = 'OTHER'
 WHERE "item_key" NOT IN (
  'ATTENDANCE_BONUS', 'ACCOMMODATION_ALLOWANCE', 'CONVEYANCE', 'HRA', 'BONUS',
  'NIGHT_SHIFT_ALLOWANCE', 'EDUCATION_ALLOWANCE', 'INSURANCE',
  'ADMISSION_DEDUCTION', 'ADVANCE', 'CANTEEN_DEDUCTION', 'COUPON_AMOUNT',
  'COURSE_REGISTRATION_FEE', 'DOCUMENT_FEE', 'EDUCATION_FEE', 'EXAM_FEE',
  'INSURANCE_DEDUCTION', 'JOINING_FEE_DEDUCTION', 'LEFT_DEDUCTION',
  'SHOES_DEDUCTION', 'SKILL_DIPLOMA_FEES', 'TRANSPORTATION_DEDUCTION',
  'UNIFORM_DEDUCTION', 'OTHER'
);--> statement-breakpoint
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_key_chk" CHECK (item_key IN ('ATTENDANCE_BONUS', 'ACCOMMODATION_ALLOWANCE', 'CONVEYANCE', 'HRA', 'BONUS', 'NIGHT_SHIFT_ALLOWANCE', 'EDUCATION_ALLOWANCE', 'INSURANCE', 'ADMISSION_DEDUCTION', 'ADVANCE', 'CANTEEN_DEDUCTION', 'COUPON_AMOUNT', 'COURSE_REGISTRATION_FEE', 'DOCUMENT_FEE', 'EDUCATION_FEE', 'EXAM_FEE', 'INSURANCE_DEDUCTION', 'JOINING_FEE_DEDUCTION', 'LEFT_DEDUCTION', 'SHOES_DEDUCTION', 'SKILL_DIPLOMA_FEES', 'TRANSPORTATION_DEDUCTION', 'UNIFORM_DEDUCTION', 'OTHER'));--> statement-breakpoint
ALTER TABLE "trainee_category" ADD CONSTRAINT "trainee_category_stipend_rate_chk" CHECK (stipend_rate >= 0);--> statement-breakpoint
ALTER TABLE "trainee_category" ADD CONSTRAINT "trainee_category_trainee_count_chk" CHECK (trainee_count >= 0);