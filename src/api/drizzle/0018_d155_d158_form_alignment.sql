-- D155-D158 (2026-10-21), step 1 of 2: the Add New Company form as the client's UI shows it.
-- Generated schema changes plus four hand-written data steps, placed before the new
-- payroll CHECK: copy the one official email into the HR and Finance emails (D155),
-- restate every tenure in months - the generated end_date is unchanged (D157) - and
-- delete every payroll row other than PF, ESI and TDS, Other rows included (D158).
-- Step 2 (0019) drops official_email and makes the two new emails NOT NULL.
ALTER TABLE "payroll_item" DROP CONSTRAINT "payroll_item_insurance_key_chk";--> statement-breakpoint
ALTER TABLE "payroll_item" DROP CONSTRAINT "payroll_item_insurance_type_chk";--> statement-breakpoint
ALTER TABLE "payroll_item" DROP CONSTRAINT "payroll_item_insurance_gfs_chk";--> statement-breakpoint
ALTER TABLE "payroll_item" DROP CONSTRAINT "payroll_item_insurance_mou_chk";--> statement-breakpoint
ALTER TABLE "payroll_item" DROP CONSTRAINT "payroll_item_key_chk";--> statement-breakpoint
ALTER TABLE "company" ALTER COLUMN "contact_type" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "hr_email" varchar(255);--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "finance_email" varchar(255);--> statement-breakpoint
ALTER TABLE "payroll_item" DROP COLUMN "insurance_type";--> statement-breakpoint
ALTER TABLE "payroll_item" DROP COLUMN "insurance_gfs_amount";--> statement-breakpoint
ALTER TABLE "payroll_item" DROP COLUMN "insurance_mou_amount";--> statement-breakpoint
UPDATE "company" SET "hr_email" = "official_email", "finance_email" = "official_email";--> statement-breakpoint
UPDATE "mou" SET "tenure_value" = "tenure_value" * 12, "tenure_unit" = 'MONTHS' WHERE "tenure_unit" = 'YEARS';--> statement-breakpoint
DELETE FROM "payroll_item" WHERE "item_key" NOT IN ('PF', 'ESI', 'TDS');--> statement-breakpoint
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_key_chk" CHECK (item_key IN ('PF', 'ESI', 'TDS', 'OTHER'));
