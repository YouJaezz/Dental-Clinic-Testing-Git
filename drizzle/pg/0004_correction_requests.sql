CREATE TABLE "correction_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"visit_id" text NOT NULL,
	"line_id" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"reason" text NOT NULL,
	"resolved_by_user_id" text,
	"resolved_at" timestamp,
	"resolution_note" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "correction_requests" ADD CONSTRAINT "correction_requests_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "correction_requests_status_idx" ON "correction_requests" ("status");
--> statement-breakpoint
CREATE INDEX "correction_requests_line_id_idx" ON "correction_requests" ("line_id");
