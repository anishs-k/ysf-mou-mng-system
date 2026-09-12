CREATE TABLE "mou_alert" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mou_id" uuid NOT NULL,
	"threshold_days" smallint NOT NULL,
	"triggered_on" date NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"acknowledged_by" uuid,
	"notified_at" timestamp with time zone,
	CONSTRAINT "mou_alert_threshold_chk" CHECK (threshold_days IN (30, 60, 90))
);
--> statement-breakpoint
CREATE TABLE "scheduled_job_state" (
	"job_name" varchar(100) PRIMARY KEY NOT NULL,
	"last_run_date" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mou_alert" ADD CONSTRAINT "mou_alert_mou_id_mou_id_fk" FOREIGN KEY ("mou_id") REFERENCES "public"."mou"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mou_alert" ADD CONSTRAINT "mou_alert_acknowledged_by_user_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mou_alert_mou_threshold_uq" ON "mou_alert" USING btree ("mou_id","threshold_days");