ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "date_of_birth" timestamptz;
--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN IF NOT EXISTS "civil_status" text;
