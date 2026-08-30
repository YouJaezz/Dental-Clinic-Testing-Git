CREATE TABLE "dental_certificates" (
	"id" text PRIMARY KEY NOT NULL,
	"patient_id" text NOT NULL,
	"visit_id" text,
	"certificate_number" integer NOT NULL,
	"issued_at" timestamptz NOT NULL,
	"purpose" text NOT NULL,
	"purpose_detail" text,
	"resume_mode" text DEFAULT 'AS_TOLERATED' NOT NULL,
	"resume_date" text,
	"resume_days" integer,
	"remarks" text,
	"created_by_user_id" text,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "dental_certificates" ADD CONSTRAINT "dental_certificates_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dental_certificates" ADD CONSTRAINT "dental_certificates_visit_id_visits_id_fk" FOREIGN KEY ("visit_id") REFERENCES "public"."visits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dental_certificates" ADD CONSTRAINT "dental_certificates_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "dental_certificates_number_idx" ON "dental_certificates" USING btree ("certificate_number");--> statement-breakpoint
CREATE INDEX "dental_certificates_patient_id_idx" ON "dental_certificates" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "dental_certificates_visit_id_idx" ON "dental_certificates" USING btree ("visit_id");--> statement-breakpoint
CREATE INDEX "dental_certificates_issued_at_idx" ON "dental_certificates" USING btree ("issued_at");--> statement-breakpoint
CREATE TABLE "dental_certificate_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"certificate_id" text NOT NULL,
	"line_id" text,
	"name_snapshot" text NOT NULL,
	"detail_snapshot" text,
	"performed_on" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "dental_certificate_lines" ADD CONSTRAINT "dental_certificate_lines_certificate_id_dental_certificates_id_fk" FOREIGN KEY ("certificate_id") REFERENCES "public"."dental_certificates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dental_certificate_lines" ADD CONSTRAINT "dental_certificate_lines_line_id_visit_procedure_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."visit_procedure_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dental_certificate_lines_certificate_id_idx" ON "dental_certificate_lines" USING btree ("certificate_id");
