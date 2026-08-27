ALTER TABLE `visit_procedure_lines` ADD `voided_at` integer;
--> statement-breakpoint
ALTER TABLE `visit_procedure_lines` ADD `voided_by_user_id` text REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `visit_procedure_lines` ADD `void_reason` text;
