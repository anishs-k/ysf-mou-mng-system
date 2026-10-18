ALTER TABLE "mou_document" ADD COLUMN "document_date" date;--> statement-breakpoint
ALTER TABLE "mou_document" ADD COLUMN "valid_until" date;--> statement-breakpoint
ALTER TABLE "mou_document" ADD COLUMN "reference_number" varchar(100);--> statement-breakpoint
ALTER TABLE "mou_document" ADD CONSTRAINT "mou_document_valid_until_chk" CHECK (valid_until >= document_date);