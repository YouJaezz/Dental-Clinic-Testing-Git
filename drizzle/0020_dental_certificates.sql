CREATE TABLE `dental_certificates` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`visit_id` text,
	`certificate_number` integer NOT NULL,
	`issued_at` integer NOT NULL,
	`purpose` text NOT NULL,
	`purpose_detail` text,
	`resume_mode` text DEFAULT 'AS_TOLERATED' NOT NULL,
	`resume_date` text,
	`resume_days` integer,
	`remarks` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dental_certificates_number_idx` ON `dental_certificates` (`certificate_number`);--> statement-breakpoint
CREATE INDEX `dental_certificates_patient_id_idx` ON `dental_certificates` (`patient_id`);--> statement-breakpoint
CREATE INDEX `dental_certificates_visit_id_idx` ON `dental_certificates` (`visit_id`);--> statement-breakpoint
CREATE INDEX `dental_certificates_issued_at_idx` ON `dental_certificates` (`issued_at`);--> statement-breakpoint
CREATE TABLE `dental_certificate_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`certificate_id` text NOT NULL,
	`line_id` text,
	`name_snapshot` text NOT NULL,
	`detail_snapshot` text,
	`performed_on` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`certificate_id`) REFERENCES `dental_certificates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`line_id`) REFERENCES `visit_procedure_lines`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `dental_certificate_lines_certificate_id_idx` ON `dental_certificate_lines` (`certificate_id`);
