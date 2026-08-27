ALTER TABLE `visit_procedure_lines` ADD `void_category` text;
--> statement-breakpoint
UPDATE `visit_procedure_lines` SET `void_category` = 'ERROR' WHERE `voided_at` IS NOT NULL AND `void_category` IS NULL;
