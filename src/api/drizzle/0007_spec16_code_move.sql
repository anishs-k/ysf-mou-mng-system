ALTER TABLE "company" DROP CONSTRAINT "company_generated_code_unique";--> statement-breakpoint
ALTER TABLE "company_code_counter" DROP CONSTRAINT "company_code_counter_zone_id_zone_id_fk";
--> statement-breakpoint
ALTER TABLE "company_code_counter" DROP CONSTRAINT "company_code_counter_zone_id_year_pk";--> statement-breakpoint
-- The counter is a derived cache of sequence numbers, and every number it holds was
-- allocated under the old (zone_id, year) keying. Those values are meaningless
-- under (scheme, year), so the table is emptied rather than migrated - leaving the
-- old rows would both block SET NOT NULL and hand out numbers already used.
DELETE FROM "company_code_counter";--> statement-breakpoint
ALTER TABLE "company_code_counter" ALTER COLUMN "scheme" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company_code_counter" ADD CONSTRAINT "company_code_counter_scheme_year_pk" PRIMARY KEY("scheme","year");--> statement-breakpoint
ALTER TABLE "company" DROP COLUMN "generated_code";--> statement-breakpoint
ALTER TABLE "company_code_counter" DROP COLUMN "zone_id";--> statement-breakpoint
-- Seed the counter from the MOUs that 0006 backfilled, so the next allocation for a
-- scheme-year continues after its highest existing number instead of colliding
-- with it. A fresh database has no MOUs, so this inserts nothing.
INSERT INTO "company_code_counter" ("scheme", "year", "last_value")
SELECT "scheme", EXTRACT(YEAR FROM "mou_start_date")::smallint, count(*)::integer
  FROM "mou"
 GROUP BY "scheme", EXTRACT(YEAR FROM "mou_start_date");