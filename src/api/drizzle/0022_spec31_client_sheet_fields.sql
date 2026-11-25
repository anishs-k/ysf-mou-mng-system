ALTER TABLE "commercial_item" DROP CONSTRAINT "commercial_item_key_chk";--> statement-breakpoint
ALTER TABLE "company" ADD COLUMN "zonal_manager" varchar(150);--> statement-breakpoint
ALTER TABLE "mou" ADD COLUMN "sign_status" varchar(20);--> statement-breakpoint
ALTER TABLE "mou" ADD COLUMN "mail_confirmation" varchar(3);--> statement-breakpoint
ALTER TABLE "mou" ADD COLUMN "payment_term" varchar(500);--> statement-breakpoint
ALTER TABLE "mou" ADD COLUMN "remark" varchar(500);--> statement-breakpoint
ALTER TABLE "payroll_config" ADD COLUMN "left_trainee_amount" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "payroll_config" ADD COLUMN "left_trainee_note" varchar(500);--> statement-breakpoint
ALTER TABLE "payroll_config" ADD COLUMN "education_fee_payer" varchar(30);--> statement-breakpoint
ALTER TABLE "commercial_item" ADD CONSTRAINT "commercial_item_key_chk" CHECK (item_key IN ('ADMIN_CHARGES', 'INSURANCE', 'SHOES_AND_UNIFORM', 'SUPERVISOR_CHARGES', 'SOURCING_CHARGES', 'EDUCATION_CHARGES', 'TRAINING_CHARGES', 'ASSESSMENT_CHARGES', 'ONE_TIME_REGISTRATION_FEES', 'EXAMINATION_FEES', 'EMPLOYABILITY_TEST_FEES', 'MSBTE_AFFILIATION_FEES', 'OTHER'));--> statement-breakpoint
ALTER TABLE "mou" ADD CONSTRAINT "mou_sign_status_chk" CHECK (sign_status IN ('DRAFT', 'SINGLE_SIGN', 'BOTH_SIGN'));--> statement-breakpoint
ALTER TABLE "mou" ADD CONSTRAINT "mou_mail_confirmation_chk" CHECK (mail_confirmation IN ('YES', 'NO'));--> statement-breakpoint
ALTER TABLE "payroll_config" ADD CONSTRAINT "payroll_config_left_trainee_amount_chk" CHECK (left_trainee_amount >= 0);--> statement-breakpoint
ALTER TABLE "payroll_config" ADD CONSTRAINT "payroll_config_education_fee_payer_chk" CHECK (education_fee_payer IN ('COMPANY', 'DEDUCT_FROM_STIPEND'));