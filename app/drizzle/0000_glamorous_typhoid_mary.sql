CREATE TABLE `installations` (
	`id` integer PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`settings` text NOT NULL,
	`taxonomy` text NOT NULL,
	`taxonomy_revision` integer DEFAULT 1 NOT NULL,
	`run_id` text,
	`lease_epoch` integer DEFAULT 0 NOT NULL,
	`lease_expires` text,
	`cursor` text DEFAULT '{"new_saves":null,"initial_import":null}' NOT NULL,
	`cooldowns` text DEFAULT '[]' NOT NULL,
	`reclassification` text
);
--> statement-breakpoint
CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`tool` text NOT NULL,
	`input_sha` text NOT NULL,
	`result` text NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `references` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`source_key` text NOT NULL,
	`source_url` text NOT NULL,
	`creator` text,
	`collections` text DEFAULT '[]' NOT NULL,
	`discovered_at` text NOT NULL,
	`saved_at` text,
	`save_order` integer,
	`revision` integer DEFAULT 1 NOT NULL,
	`outcome` text DEFAULT 'pending' NOT NULL,
	`removed` integer DEFAULT 0 NOT NULL,
	`manual_categories` integer DEFAULT 0 NOT NULL,
	`manual_topics` integer DEFAULT 0 NOT NULL,
	`analysis` text,
	`classification` text DEFAULT '{"category_ids":[],"topic_ids":[]}' NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`result_sha` text,
	`cover` text,
	`cover_key` text,
	`failure` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `references_source_key_unique` ON `references` (`source_key`);--> statement-breakpoint
CREATE TABLE `runs` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`epoch` integer NOT NULL,
	`trigger` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`outcome` text DEFAULT 'running' NOT NULL
);
