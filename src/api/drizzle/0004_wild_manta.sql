CREATE TABLE "mou_edit_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mou_id" uuid NOT NULL,
	"edit_reason" varchar(40) NOT NULL,
	"proof_file_path" text,
	"remark" varchar(500),
	"loaded_version" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"consumed_at" timestamp with time zone,
	CONSTRAINT "mou_edit_request_reason_chk" CHECK (edit_reason IN ('COMMUNICATION_FROM_HR', 'ADDENDUM_IN_AGREEMENT', 'CHANGE_IN_STATUTORY_COMPLIANCE'))
);
--> statement-breakpoint
ALTER TABLE "mou_edit_request" ADD CONSTRAINT "mou_edit_request_mou_id_mou_id_fk" FOREIGN KEY ("mou_id") REFERENCES "public"."mou"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou_edit_request" ADD CONSTRAINT "mou_edit_request_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mou_edit_request_mou_idx" ON "mou_edit_request" USING btree ("mou_id");