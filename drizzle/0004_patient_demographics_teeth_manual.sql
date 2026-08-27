ALTER TABLE `patients` ADD `age` integer;
--> statement-breakpoint
ALTER TABLE `patients` ADD `gender` text;
--> statement-breakpoint
ALTER TABLE `patients` ADD `address` text;
--> statement-breakpoint
ALTER TABLE `patients` ADD `contact_number` text;
--> statement-breakpoint
ALTER TABLE `patients` ADD `medical_history` text;
--> statement-breakpoint
UPDATE `procedure_catalog` SET `pricing_mode` = 'MANUAL', `unit_price_cents` = 0, `level_prices_json` = NULL WHERE `pricing_mode` = 'BY_LEVEL';
--> statement-breakpoint
CREATE TABLE `visit_teeth` (
	`id` text PRIMARY KEY NOT NULL,
	`visit_id` text NOT NULL,
	`tooth_number` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`visit_id`) REFERENCES `visits`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `visit_teeth_visit_tooth_unique` ON `visit_teeth` (`visit_id`, `tooth_number`);
--> statement-breakpoint
CREATE INDEX `visit_teeth_visit_id_idx` ON `visit_teeth` (`visit_id`);
