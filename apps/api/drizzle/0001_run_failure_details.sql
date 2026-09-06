ALTER TABLE `runs` ADD `failed_files` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `runs` ADD `retry_of_run_id` text;
