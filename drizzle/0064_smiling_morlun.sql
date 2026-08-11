CREATE TABLE `slug_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`oldSlug` varchar(300) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `slug_history_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `posts` ADD `customSlug` varchar(255);--> statement-breakpoint
ALTER TABLE `vibe_apps` ADD `originalFilename` varchar(500);