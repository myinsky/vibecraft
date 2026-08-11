CREATE TABLE `custom_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(200) NOT NULL,
	`title` varchar(300) NOT NULL,
	`description` varchar(500) DEFAULT '',
	`sectionsJson` text NOT NULL DEFAULT '[]',
	`published` boolean NOT NULL DEFAULT false,
	`showInNav` boolean NOT NULL DEFAULT false,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `custom_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `custom_pages_slug_unique` UNIQUE(`slug`)
);
