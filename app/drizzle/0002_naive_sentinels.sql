CREATE TABLE `baseline_sources` (
	`source_key` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `discovery_lists` ADD `baseline_completed_at` text;