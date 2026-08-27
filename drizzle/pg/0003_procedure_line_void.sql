ALTER TABLE "visit_procedure_lines" ADD COLUMN "voided_at" timestamp;
--> statement-breakpoint
ALTER TABLE "visit_procedure_lines" ADD COLUMN "voided_by_user_id" text REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "visit_procedure_lines" ADD COLUMN "void_reason" text;
