CREATE TABLE "user_zone" (
	"user_id" uuid NOT NULL,
	"zone_id" uuid NOT NULL,
	CONSTRAINT "user_zone_user_id_zone_id_pk" PRIMARY KEY("user_id","zone_id")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "all_zones" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user_zone" ADD CONSTRAINT "user_zone_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_zone" ADD CONSTRAINT "user_zone_zone_id_zone_id_fk" FOREIGN KEY ("zone_id") REFERENCES "public"."zone"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_zone_zone_idx" ON "user_zone" USING btree ("zone_id");--> statement-breakpoint
-- Hand-edited (SPEC-21 D130): carry every existing user's SPEC-19 scope over
-- before 0012 drops user.zone_id. NULL meant "every zone", so it becomes
-- all_zones = true; a set zone becomes that user's single user_zone row.
UPDATE "user" SET "all_zones" = ("zone_id" IS NULL);--> statement-breakpoint
INSERT INTO "user_zone" ("user_id", "zone_id")
  SELECT "id", "zone_id" FROM "user" WHERE "zone_id" IS NOT NULL;--> statement-breakpoint
-- Self sign-up is removed (SPEC-21 D131). A request that was never approved must
-- not become a working login once approval_status is gone, so it is deactivated.
UPDATE "user" SET "is_active" = false WHERE "approval_status" <> 'APPROVED';
