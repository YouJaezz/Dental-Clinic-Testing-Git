CREATE TABLE `patients` (
	`id` text PRIMARY KEY NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`phone` text,
	`notes` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `patients_last_name_idx` ON `patients` (`last_name`);--> statement-breakpoint
CREATE TABLE `procedure_catalog` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text,
	`name` text NOT NULL,
	`unit_price_cents` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'USER' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `visits` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`visit_date` integer NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `visits_patient_id_idx` ON `visits` (`patient_id`);--> statement-breakpoint
CREATE TABLE `visit_procedure_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`catalog_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_cents_snapshot` integer NOT NULL,
	`line_total_cents` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`catalog_id`) REFERENCES `procedure_catalog`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `visit_procedure_lines_visit_id_idx` ON `visit_procedure_lines` (`visit_id`);--> statement-breakpoint
CREATE TABLE `visit_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text NOT NULL,
	`status` text DEFAULT 'COMPLETED' NOT NULL,
	`reference` text,
	`recorded_by_user_id` text,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recorded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `visit_payments_visit_id_idx` ON `visit_payments` (`visit_id`);
