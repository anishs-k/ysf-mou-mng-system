CREATE TABLE "export_job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" varchar(10) NOT NULL,
	"status" varchar(10) DEFAULT 'pending' NOT NULL,
	"file_path" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "export_job_kind_chk" CHECK (kind IN ('excel', 'pdf')),
	CONSTRAINT "export_job_status_chk" CHECK (status IN ('pending', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "export_job" ADD CONSTRAINT "export_job_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "export_job_expires_at_idx" ON "export_job" USING btree ("expires_at");