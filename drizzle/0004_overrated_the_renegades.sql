CREATE TABLE `home_sections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sectionKey` varchar(50) NOT NULL,
	`title` varchar(100) NOT NULL,
	`subtitle` text,
	`categoryPath` varchar(100),
	`sortOrder` int NOT NULL DEFAULT 0,
	`visible` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `home_sections_id` PRIMARY KEY(`id`),
	CONSTRAINT `home_sections_sectionKey_unique` UNIQUE(`sectionKey`)
);
--> statement-breakpoint
CREATE TABLE `nav_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`label` varchar(50) NOT NULL,
	`path` varchar(200) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`visible` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `nav_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sidebar_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`side` enum('left','right') NOT NULL,
	`itemType` enum('ad','link','slot') NOT NULL DEFAULT 'ad',
	`title` varchar(100) NOT NULL,
	`description` text,
	`url` varchar(500),
	`bgColor` varchar(50),
	`textColor` varchar(50),
	`btnText` varchar(50),
	`btnColor` varchar(50),
	`badge` varchar(30),
	`price` varchar(50),
	`sortOrder` int NOT NULL DEFAULT 0,
	`visible` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sidebar_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `site_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`configKey` varchar(100) NOT NULL,
	`configValue` text,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `site_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `site_config_configKey_unique` UNIQUE(`configKey`)
);
