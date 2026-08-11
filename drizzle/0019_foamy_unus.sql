ALTER TABLE `users` ADD `canWrite` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `canDownload` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `memo` text;--> statement-breakpoint
ALTER TABLE `users` ADD `isBanned` boolean DEFAULT false NOT NULL;