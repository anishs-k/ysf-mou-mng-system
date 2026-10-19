ALTER TABLE "user" DROP CONSTRAINT "user_approval_status_chk";--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_zone_id_zone_id_fk";
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "user_approval_decided_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "zone_id";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "approval_status";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "approval_decided_by";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "approval_decided_at";