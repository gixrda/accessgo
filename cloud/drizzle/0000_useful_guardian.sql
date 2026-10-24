CREATE TABLE `geocode_cache` (
	`key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `provider_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`next_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`description` text NOT NULL,
	`created_at_ms` integer NOT NULL,
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reports_owner_created_idx` ON `reports` (`user_id`,`created_at_ms`);--> statement-breakpoint
CREATE INDEX `reports_created_idx` ON `reports` (`created_at_ms`);