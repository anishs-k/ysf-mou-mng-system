ALTER TABLE "user" DROP CONSTRAINT "user_role_chk";--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_chk" CHECK (role IN ('ADMIN', 'DATA_ENTRY', 'VIEWER', 'HR', 'FINANCE'));