ALTER TABLE `users` ADD `isFeaturedDeveloper` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `featuredOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `bio` text;--> statement-breakpoint
ALTER TABLE `users` ADD `profileImage` varchar(500);