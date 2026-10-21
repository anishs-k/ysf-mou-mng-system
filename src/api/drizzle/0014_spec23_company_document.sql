CREATE TABLE "company_document" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"document_type" varchar(30) NOT NULL,
	"file_path" text NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(50) NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" uuid NOT NULL,
	CONSTRAINT "company_document_type_chk" CHECK (document_type IN ('GST_CERTIFICATE', 'REGISTRATION_CERTIFICATE'))
);
--> statement-breakpoint
ALTER TABLE "company_document" ADD CONSTRAINT "company_document_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_document" ADD CONSTRAINT "company_document_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "company_document_company_idx" ON "company_document" USING btree ("company_id");