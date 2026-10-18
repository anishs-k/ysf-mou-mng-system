ALTER TABLE "user" ALTER COLUMN "username" SET DATA TYPE varchar(255);--> statement-breakpoint
-- Hand-edited (SPEC-20 D122): every user that exists now is APPROVED - a plain
-- DEFAULT 'PENDING' would lock out the only ADMIN. The column is added with
-- DEFAULT 'APPROVED' to backfill, then the default becomes 'PENDING' so only
-- rows inserted from here on (self sign-ups) start out pending.
ALTER TABLE "user" ADD COLUMN "approval_status" varchar(10) DEFAULT 'APPROVED' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "approval_status" SET DEFAULT 'PENDING';--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "full_name" varchar(150);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "approval_decided_by" uuid;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "approval_decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_approval_decided_by_user_id_fk" FOREIGN KEY ("approval_decided_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_approval_status_chk" CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED'));