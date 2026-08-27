CREATE TABLE `medicine_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`name` text NOT NULL,
	`default_dose` text,
	`default_instructions` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `prescriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`visit_id` text,
	`prescription_number` integer NOT NULL,
	`prescribed_at` integer NOT NULL,
	`notes` text,
	`created_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prescriptions_number_idx` ON `prescriptions` (`prescription_number`);--> statement-breakpoint
CREATE INDEX `prescriptions_patient_id_idx` ON `prescriptions` (`patient_id`);--> statement-breakpoint
CREATE INDEX `prescriptions_visit_id_idx` ON `prescriptions` (`visit_id`);--> statement-breakpoint
CREATE INDEX `prescriptions_prescribed_at_idx` ON `prescriptions` (`prescribed_at`);--> statement-breakpoint
CREATE TABLE `prescription_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`prescription_id` text NOT NULL,
	`catalog_id` text NOT NULL,
	`name_snapshot` text NOT NULL,
	`dose_strength` text,
	`instructions` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`prescription_id`) REFERENCES `prescriptions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`catalog_id`) REFERENCES `medicine_catalog`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `prescription_lines_prescription_id_idx` ON `prescription_lines` (`prescription_id`);
