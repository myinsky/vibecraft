CREATE TABLE `category_write_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`categoryKey` varchar(50) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `category_write_permissions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','sub_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `custom_pages` ADD `titleAlign` varchar(10) DEFAULT 'left';--> statement-breakpoint
ALTER TABLE `users` ADD `isOwner` boolean DEFAULT false NOT NULL;