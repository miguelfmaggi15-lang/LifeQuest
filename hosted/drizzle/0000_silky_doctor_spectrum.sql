CREATE TABLE `player_sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`room_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`status` text DEFAULT 'lobby' NOT NULL,
	`game_type` text DEFAULT 'life' NOT NULL,
	`board_size` integer DEFAULT 60 NOT NULL,
	`state_json` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_code_unique` ON `rooms` (`code`);