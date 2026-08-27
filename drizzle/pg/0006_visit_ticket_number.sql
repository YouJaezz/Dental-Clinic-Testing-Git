ALTER TABLE "visits" ADD COLUMN IF NOT EXISTS "ticket_number" integer;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "visits_ticket_number_idx" ON "visits" ("ticket_number");
