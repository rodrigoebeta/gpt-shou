CREATE TABLE `discovery_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`revision` integer NOT NULL,
	`anchor_source_key` text,
	`pages` integer NOT NULL,
	`completed` integer NOT NULL,
	`updated_at` text NOT NULL
);
