ALTER TABLE `posts` ADD `isPinned` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `posts` ADD `pinnedAt` timestamp;