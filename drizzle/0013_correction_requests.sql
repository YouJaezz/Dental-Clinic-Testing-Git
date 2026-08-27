CREATE TABLE `correction_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`visit_id` text NOT NULL,
	`line_id` text NOT NULL,
	`requested_by_user_id` text NOT NULL,
	`reason` text NOT NULL,
	`resolved_by_user_id` text,
	`resolved_at` integer,
	`resolution_note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolved_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `correction_requests_status_idx` ON `correction_requests` (`status`);
--> statement-breakpoint
CREATE INDEX `correction_requests_line_id_idx` ON `correction_requests` (`line_id`);
