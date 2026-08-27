ALTER TABLE `procedure_catalog` ADD `pricing_mode` text DEFAULT 'FIXED' NOT NULL;
--> statement-breakpoint
ALTER TABLE `procedure_catalog` ADD `level_prices_json` text;
--> statement-breakpoint
ALTER TABLE `visit_procedure_lines` ADD `procedure_level_id_snapshot` text;
--> statement-breakpoint
ALTER TABLE `visit_procedure_lines` ADD `procedure_level_label_snapshot` text;
