-- D153: the commercial catalogue keeps only its 9 core charges. The 7 payroll-style
-- deductions had no rows on live data (2026-10-21); the DELETE makes the CHECK rebuild
-- safe on any other database. Version-history snapshots are left as they are; every
-- reader walks the catalogue, so these keys are simply not shown.
ALTER TABLE "commercial_item" DROP CONSTRAINT "commercial_item_key_chk";--> statement-breakpoint
DELETE FROM "commercial_item"
 WHERE "item_key" IN ('CANTEEN_DEDUCTION', 'COUPON_AMOUNT', 'DOCUMENT_FEE', 'JOINING_FEE', 'LEFT_DEDUCTION',
                      'SKILL_DIPLOMA_FEES', 'TRANSPORTATION_DEDUCTION');--> statement-breakpoint
ALTER TABLE "commercial_item" ADD CONSTRAINT "commercial_item_key_chk" CHECK (item_key IN ('ADMIN_CHARGES', 'INSURANCE', 'SHOES_AND_UNIFORM', 'SUPERVISOR_CHARGES', 'SOURCING_CHARGES', 'EDUCATION_CHARGES', 'TRAINING_CHARGES', 'ASSESSMENT_CHARGES', 'ONE_TIME_REGISTRATION_FEES', 'OTHER'));