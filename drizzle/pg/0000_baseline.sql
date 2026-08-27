CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text DEFAULT 'USER' NOT NULL,
	"created_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires_at" timestamptz NOT NULL,
	"created_at" timestamptz NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" text PRIMARY KEY NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone" text,
	"contact_number" text,
	"age" integer,
	"gender" text,
	"address" text,
	"medical_history" text,
	"notes" text,
	"created_at" timestamptz NOT NULL,
	"deleted_at" timestamptz
);
--> statement-breakpoint
CREATE INDEX "patients_last_name_idx" ON "patients" USING btree ("last_name");
--> statement-breakpoint
CREATE TABLE "visits" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"visit_date" timestamptz NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"notes" text,
	"created_at" timestamptz NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visits" ADD CONSTRAINT "visits_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "visits_patient_id_idx" ON "visits" USING btree ("patient_id");
--> statement-breakpoint
CREATE TABLE "procedure_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"pricing_mode" text DEFAULT 'FIXED' NOT NULL,
	"level_prices_json" text,
	"dentist_notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamptz NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visit_procedure_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"visit_id" text NOT NULL,
	"catalog_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents_snapshot" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"procedure_level_id_snapshot" text,
	"procedure_level_label_snapshot" text,
	"tooth_numbers_json" text,
	"line_notes" text,
	"created_at" timestamptz NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visit_procedure_lines" ADD CONSTRAINT "visit_procedure_lines_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "visit_procedure_lines" ADD CONSTRAINT "visit_procedure_lines_catalog_id_procedure_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."procedure_catalog"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "visit_procedure_lines_visit_id_idx" ON "visit_procedure_lines" USING btree ("visit_id");
--> statement-breakpoint
CREATE TABLE "visit_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"visit_id" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'COMPLETED' NOT NULL,
	"reference" text,
	"recorded_by_user_id" text,
	"recorded_at" timestamptz NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visit_payments" ADD CONSTRAINT "visit_payments_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "visit_payments" ADD CONSTRAINT "visit_payments_recorded_by_user_id_users_id_fk" FOREIGN KEY ("recorded_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "visit_payments_visit_id_idx" ON "visit_payments" USING btree ("visit_id");
