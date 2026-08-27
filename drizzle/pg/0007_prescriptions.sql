CREATE TABLE "medicine_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"default_dose" text,
	"default_instructions" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "prescriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"visit_id" text,
	"prescription_number" integer NOT NULL,
	"prescribed_at" timestamptz NOT NULL,
	"notes" text,
	"created_by_user_id" text,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "prescriptions_number_idx" ON "prescriptions" USING btree ("prescription_number");--> statement-breakpoint
CREATE INDEX "prescriptions_patient_id_idx" ON "prescriptions" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "prescriptions_visit_id_idx" ON "prescriptions" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "prescriptions_prescribed_at_idx" ON "prescriptions" USING btree ("prescribed_at");--> statement-breakpoint
CREATE TABLE "prescription_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"prescription_id" text NOT NULL,
	"catalog_id" text NOT NULL,
	"name_snapshot" text NOT NULL,
	"dose_strength" text,
	"instructions" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "prescription_lines" ADD CONSTRAINT "prescription_lines_prescription_id_prescriptions_id_fk" FOREIGN KEY ("prescription_id") REFERENCES "public"."prescriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prescription_lines" ADD CONSTRAINT "prescription_lines_catalog_id_medicine_catalog_id_fk" FOREIGN KEY ("catalog_id") REFERENCES "public"."medicine_catalog"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prescription_lines_prescription_id_idx" ON "prescription_lines" USING btree ("prescription_id");
