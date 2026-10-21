-- D155, step 2 of 2: the HR and Finance emails are required and official_email goes.
-- Run together with 0018 and the code that reads hr_email / finance_email.
ALTER TABLE "company" ALTER COLUMN "hr_email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company" ALTER COLUMN "finance_email" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "company" DROP COLUMN "official_email";