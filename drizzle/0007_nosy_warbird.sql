CREATE TABLE `legal_pages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(50) NOT NULL,
	`title` varchar(200) NOT NULL,
	`content` text NOT NULL DEFAULT '',
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `legal_pages_id` PRIMARY KEY(`id`),
	CONSTRAINT `legal_pages_slug_unique` UNIQUE(`slug`)
);
