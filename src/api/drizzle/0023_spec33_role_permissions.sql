CREATE TABLE "role_permission" (
	"role" varchar(20) NOT NULL,
	"permission" varchar(40) NOT NULL,
	CONSTRAINT "role_permission_role_permission_pk" PRIMARY KEY("role","permission"),
	CONSTRAINT "role_permission_role_chk" CHECK (role IN ('DATA_ENTRY', 'HR', 'FINANCE', 'VIEWER')),
	CONSTRAINT "role_permission_permission_chk" CHECK (permission IN ('company.create', 'company.view', 'company.edit', 'contacts.view', 'contacts.edit', 'commercial.view', 'commercial.edit', 'payroll.view', 'payroll.edit', 'documents.view', 'documents.upload', 'agreement.edit', 'alerts.ack', 'export.data', 'contacts.export'))
);
--> statement-breakpoint
CREATE TABLE "role_permission_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" varchar(20) NOT NULL,
	"added" jsonb NOT NULL,
	"removed" jsonb NOT NULL,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_permission_audit" ADD CONSTRAINT "role_permission_audit_changed_by_user_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "role_permission_audit_role_idx" ON "role_permission_audit" USING btree ("role","changed_at");--> statement-breakpoint
-- SPEC-33: seed SPEC-32's matrix (ROLE_PERMISSIONS) for the four editable roles; ADMIN has no rows.
INSERT INTO "role_permission" ("role", "permission") VALUES
  ('DATA_ENTRY', 'company.create'),
  ('DATA_ENTRY', 'company.view'),
  ('DATA_ENTRY', 'company.edit'),
  ('DATA_ENTRY', 'contacts.view'),
  ('DATA_ENTRY', 'contacts.edit'),
  ('DATA_ENTRY', 'commercial.view'),
  ('DATA_ENTRY', 'commercial.edit'),
  ('DATA_ENTRY', 'payroll.view'),
  ('DATA_ENTRY', 'payroll.edit'),
  ('DATA_ENTRY', 'documents.view'),
  ('DATA_ENTRY', 'documents.upload'),
  ('DATA_ENTRY', 'alerts.ack'),
  ('DATA_ENTRY', 'export.data'),
  ('HR', 'company.create'),
  ('HR', 'company.view'),
  ('HR', 'company.edit'),
  ('HR', 'contacts.view'),
  ('HR', 'contacts.edit'),
  ('HR', 'commercial.view'),
  ('HR', 'payroll.view'),
  ('HR', 'payroll.edit'),
  ('HR', 'documents.view'),
  ('HR', 'documents.upload'),
  ('HR', 'agreement.edit'),
  ('HR', 'alerts.ack'),
  ('HR', 'export.data'),
  ('HR', 'contacts.export'),
  ('FINANCE', 'company.create'),
  ('FINANCE', 'company.view'),
  ('FINANCE', 'contacts.view'),
  ('FINANCE', 'commercial.view'),
  ('FINANCE', 'commercial.edit'),
  ('FINANCE', 'payroll.view'),
  ('FINANCE', 'payroll.edit'),
  ('FINANCE', 'documents.view'),
  ('FINANCE', 'documents.upload'),
  ('FINANCE', 'agreement.edit'),
  ('FINANCE', 'alerts.ack'),
  ('FINANCE', 'export.data'),
  ('FINANCE', 'contacts.export'),
  ('VIEWER', 'company.view'),
  ('VIEWER', 'commercial.view'),
  ('VIEWER', 'payroll.view'),
  ('VIEWER', 'documents.view');