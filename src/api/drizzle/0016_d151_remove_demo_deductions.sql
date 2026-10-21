-- D151: the 10 demo deductions leave the payroll catalogue. Their rows are deleted
-- from every payroll config before the CHECK is rebuilt without them, otherwise the
-- new constraint would refuse the existing rows. Version-history snapshots are JSON
-- and are left as they are; the UI reads them through the catalogue and skips these keys.
ALTER TABLE "payroll_item" DROP CONSTRAINT "payroll_item_key_chk";--> statement-breakpoint
DELETE FROM "payroll_item"
 WHERE "item_key" IN ('ADVANCE', 'CANTEEN_DEDUCTION', 'COURSE_REGISTRATION_FEE', 'DOCUMENT_FEE', 'EXAM_FEE',
                      'INSURANCE_DEDUCTION', 'LEFT_DEDUCTION', 'SHOES_DEDUCTION', 'TRANSPORTATION_DEDUCTION',
                      'UNIFORM_DEDUCTION');--> statement-breakpoint
ALTER TABLE "payroll_item" ADD CONSTRAINT "payroll_item_key_chk" CHECK (item_key IN ('ATTENDANCE_BONUS', 'ACCOMMODATION_ALLOWANCE', 'CONVEYANCE', 'HRA', 'BONUS', 'NIGHT_SHIFT_ALLOWANCE', 'EDUCATION_ALLOWANCE', 'INSURANCE', 'ADMISSION_DEDUCTION', 'COUPON_AMOUNT', 'EDUCATION_FEE', 'JOINING_FEE_DEDUCTION', 'SKILL_DIPLOMA_FEES', 'PF', 'ESI', 'TDS', 'OTHER'));