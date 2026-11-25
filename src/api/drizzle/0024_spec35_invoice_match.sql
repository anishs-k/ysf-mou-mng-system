ALTER TABLE "mou" ADD COLUMN "invoice_match" varchar(10);--> statement-breakpoint
ALTER TABLE "mou" ADD COLUMN "invoice_remark" varchar(500);--> statement-breakpoint
ALTER TABLE "mou" ADD CONSTRAINT "mou_invoice_match_chk" CHECK (invoice_match IN ('MATCH', 'NO_MATCH'));