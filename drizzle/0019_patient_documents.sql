CREATE TABLE `patient_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`patient_id` text NOT NULL,
	`visit_id` text,
	`kind` text DEFAULT 'XRAY' NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`caption` text,
	`taken_on` text,
	`data_base64` text NOT NULL,
	`uploaded_by_user_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`patient_id`) REFERENCES `patients`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `patient_documents_patient_id_idx` ON `patient_documents` (`patient_id`);--> statement-breakpoint
CREATE INDEX `patient_documents_visit_id_idx` ON `patient_documents` (`visit_id`);--> statement-breakpoint
CREATE INDEX `patient_documents_created_at_idx` ON `patient_documents` (`created_at`);
