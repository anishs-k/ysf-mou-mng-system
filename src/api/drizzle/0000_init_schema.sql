CREATE TABLE "agreement_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mou_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"edit_reason" varchar(40) NOT NULL,
	"proof_file_path" text,
	"remark" varchar(500),
	"snapshot" jsonb NOT NULL,
	"edited_by" uuid NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agreement_history_edit_reason_chk" CHECK (edit_reason IN ('COMMUNICATION_FROM_HR', 'ADDENDUM_IN_AGREEMENT', 'CHANGE_IN_STATUTORY_COMPLIANCE'))
);
--> statement-breakpoint
CREATE TABLE "commercial_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mou_id" uuid NOT NULL,
	"item_key" varchar(40) NOT NULL,
	"custom_label" varchar(100),
	"amount" numeric(12, 2),
	"item_type" varchar(10) NOT NULL,
	CONSTRAINT "commercial_item_key_chk" CHECK (item_key IN ('ADMIN_CHARGES', 'INSURANCE', 'SHOES_AND_UNIFORM', 'SUPERVISOR_CHARGES', 'SOURCING_CHARGES', 'EDUCATION_CHARGES', 'TRAINING_CHARGES', 'ASSESSMENT_CHARGES', 'ONE_TIME_REGISTRATION_FEES', 'CANTEEN_DEDUCTION', 'COUPON_AMOUNT', 'DOCUMENT_FEE', 'JOINING_FEE', 'LEFT_DEDUCTION', 'SKILL_DIPLOMA_FEES', 'TRANSPORTATION_DEDUCTION', 'OTHER')),
	CONSTRAINT "commercial_item_item_type_chk" CHECK (item_type IN ('ALLOWANCE', 'DEDUCTION')),
	CONSTRAINT "commercial_item_amount_chk" CHECK (amount >= 0),
	CONSTRAINT "commercial_item_custom_label_chk" CHECK ((item_key = 'OTHER') = (custom_label IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generated_code" varchar(30) NOT NULL,
	"company_name" varchar(150) NOT NULL,
	"company_type" varchar(20) NOT NULL,
	"registration_type" varchar(20) NOT NULL,
	"tan_number" varchar(10) NOT NULL,
	"gst_number" varchar(15) NOT NULL,
	"zone_id" uuid NOT NULL,
	"address_line_1" varchar(200) NOT NULL,
	"address_line_2" varchar(200),
	"city" varchar(100) NOT NULL,
	"pin_code" varchar(6) NOT NULL,
	"state" varchar(100) NOT NULL,
	"district" varchar(100) NOT NULL,
	"hr_contact_name" varchar(150) NOT NULL,
	"finance_head_contact_name" varchar(150) NOT NULL,
	"contact_type" varchar(10) NOT NULL,
	"hr_contact_number" varchar(20) NOT NULL,
	"finance_head_contact_number" varchar(20) NOT NULL,
	"official_email" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid NOT NULL,
	CONSTRAINT "company_generated_code_unique" UNIQUE("generated_code"),
	CONSTRAINT "company_gst_number_unique" UNIQUE("gst_number"),
	CONSTRAINT "company_type_chk" CHECK (company_type IN ('CENTRAL_GOVT', 'CENTRAL_PSU', 'CO_OPERATIVE', 'PRIVATE_SECTOR', 'STATE_GOVT', 'STATE_PSU')),
	CONSTRAINT "company_registration_type_chk" CHECK (registration_type IN ('PROPRIETORSHIP', 'COMPANY', 'PARTNERSHIP', 'HUF', 'TRUST', 'SOCIETY', 'ASSOCIATION', 'LOCAL_AUTHORITY', 'OTHERS', 'GOVERNMENT')),
	CONSTRAINT "company_contact_type_chk" CHECK (contact_type IN ('MOBILE', 'LAN'))
);
--> statement-breakpoint
CREATE TABLE "company_code_counter" (
	"zone_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"last_value" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "company_code_counter_zone_id_year_pk" PRIMARY KEY("zone_id","year")
);
--> statement-breakpoint
CREATE TABLE "company_draft" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"current_page" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_draft_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "company_draft_current_page_chk" CHECK (current_page BETWEEN 1 AND 3)
);
--> statement-breakpoint
CREATE TABLE "company_plant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plant_name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mou" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"company_plant_id" uuid,
	"scheme" varchar(20) NOT NULL,
	"mou_start_date" date NOT NULL,
	"tenure_value" integer NOT NULL,
	"tenure_unit" varchar(10) NOT NULL,
	"end_date" date GENERATED ALWAYS AS ((mou_start_date + (tenure_value * CASE tenure_unit WHEN 'YEARS' THEN 12 ELSE 1 END) * INTERVAL '1 month' - INTERVAL '1 day')::date) STORED,
	"attendance_cycle" varchar(50) NOT NULL,
	"stipend_date" smallint,
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mou_scheme_chk" CHECK (scheme IN ('WILP', 'BOC_AND_DVOC', 'MSBTE', 'FLEXI')),
	CONSTRAINT "mou_tenure_unit_chk" CHECK (tenure_unit IN ('MONTHS', 'YEARS')),
	CONSTRAINT "mou_tenure_value_chk" CHECK (tenure_value > 0),
	CONSTRAINT "mou_stipend_date_chk" CHECK (stipend_date BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE "mou_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mou_id" uuid NOT NULL,
	"file_path" text NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mou_id" uuid NOT NULL,
	CONSTRAINT "payroll_config_mou_id_unique" UNIQUE("mou_id")
);
--> statement-breakpoint
CREATE TABLE "payroll_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_config_id" uuid NOT NULL,
	"item_key" varchar(40) NOT NULL,
	"custom_label" varchar(100),
	"is_applicable" boolean NOT NULL,
	"amount" numeric(12, 2),
	"item_type" varchar(10) NOT NULL,
	CONSTRAINT "payroll_item_key_chk" CHECK (item_key IN ('ATTENDANCE_BONUS', 'FIRST_YEAR_ALLOWANCE', 'SECOND_YEAR_ALLOWANCE', 'THIRD_YEAR_ALLOWANCE', 'ACCOMMODATION_ALLOWANCE', 'ARREARS', 'BONUS', 'CANTEEN_ALLOWANCE', 'CONVEYANCE', 'DOCUMENT_FEE', 'EDUCATION_ALLOWANCE', 'EX_GRATIA', 'FOUNDRY_ALLOWANCE', 'LEAVE_ENCASHMENT', 'LEAVE_WITH_WAGES', 'NIGHT_SHIFT_ALLOWANCE', 'REIMBURSEMENT_OF_EDUCATION_CHARGES', 'SPECIAL_ALLOWANCE', 'REGISTRATION_FEE', 'TRAVELLING_ALLOWANCE', 'UNIFORM_REFUND', 'WASHING_ALLOWANCE', 'OTHER')),
	CONSTRAINT "payroll_item_item_type_chk" CHECK (item_type IN ('ALLOWANCE', 'DEDUCTION')),
	CONSTRAINT "payroll_item_amount_chk" CHECK (amount >= 0),
	CONSTRAINT "payroll_item_applicable_amount_chk" CHECK (NOT is_applicable OR amount IS NOT NULL),
	CONSTRAINT "payroll_item_inapplicable_amount_chk" CHECK (is_applicable OR amount IS NULL),
	CONSTRAINT "payroll_item_custom_label_chk" CHECK ((item_key = 'OTHER') = (custom_label IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "trainee_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payroll_config_id" uuid NOT NULL,
	"category_name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_username_unique" UNIQUE("username"),
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_role_chk" CHECK (role IN ('ADMIN', 'DATA_ENTRY', 'VIEWER'))
);
--> statement-breakpoint
CREATE TABLE "zone" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(10) NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "zone_code_unique" UNIQUE("code"),
	CONSTRAINT "zone_name_unique" UNIQUE("name"),
	CONSTRAINT "zone_code_upper_chk" CHECK (code = upper(code))
);
--> statement-breakpoint
ALTER TABLE "agreement_history" ADD CONSTRAINT "agreement_history_mou_id_mou_id_fk" FOREIGN KEY ("mou_id") REFERENCES "public"."mou"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_history" ADD CONSTRAINT "agreement_history_edited_by_user_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_item" ADD CONSTRAINT "commercial_item_mou_id_mou_id_fk" FOREIGN KEY ("mou_id") REFERENCES "public"."mou"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_code_counter" ADD CONSTRAINT "company_code_counter_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_draft" ADD CONSTRAINT "company_draft_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_plant" ADD CONSTRAINT "company_plant_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou" ADD CONSTRAINT "mou_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou" ADD CONSTRAINT "mou_company_plant_id_company_plant_id_fk" FOREIGN KEY ("company_plant_id") REFERENCES "public"."company_plant"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou_document" ADD CONSTRAINT "mou_document_mou_id_mou_id_fk" FOREIGN KEY ("mou_id") REFERENCES "public"."mou"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou_document" ADD CONSTRAINT "mou_document_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_config" ADD CONSTRAINT "payroll_config_mou_id_mou_id_fk" FOREIGN KEY ("mou_id") REFERENCES "public"."mou"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_payroll_config_id_payroll_config_id_fk" FOREIGN KEY ("payroll_config_id") REFERENCES "public"."payroll_config"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trainee_category" ADD CONSTRAINT "trainee_category_payroll_config_id_payroll_config_id_fk" FOREIGN KEY ("payroll_config_id") REFERENCES "public"."payroll_config"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agreement_history_mou_version_uq" ON "agreement_history" USING btree ("mou_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "commercial_item_fixed_uq" ON "commercial_item" USING btree ("mou_id","item_key") WHERE item_key <> 'OTHER';--> statement-breakpoint
CREATE INDEX "commercial_item_mou_idx" ON "commercial_item" USING btree ("mou_id");--> statement-breakpoint
CREATE INDEX "company_zone_active_idx" ON "company" USING btree (zone_id) WHERE is_active;--> statement-breakpoint
CREATE INDEX "company_name_lower_idx" ON "company" USING btree (lower(company_name));--> statement-breakpoint
CREATE UNIQUE INDEX "company_plant_company_name_uq" ON "company_plant" USING btree ("company_id",lower(plant_name));--> statement-breakpoint
CREATE INDEX "company_plant_name_lower_idx" ON "company_plant" USING btree (lower(plant_name));--> statement-breakpoint
CREATE UNIQUE INDEX "mou_company_plant_scheme_uq" ON "mou" USING btree ("company_id","company_plant_id","scheme") WHERE is_active;--> statement-breakpoint
CREATE INDEX "mou_active_end_date_idx" ON "mou" USING btree ("is_active","end_date");--> statement-breakpoint
CREATE INDEX "mou_company_idx" ON "mou" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_item_fixed_uq" ON "payroll_item" USING btree ("payroll_config_id","item_key") WHERE item_key <> 'OTHER';--> statement-breakpoint
CREATE INDEX "payroll_item_config_idx" ON "payroll_item" USING btree ("payroll_config_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trainee_category_config_name_uq" ON "trainee_category" USING btree ("payroll_config_id",lower(category_name));