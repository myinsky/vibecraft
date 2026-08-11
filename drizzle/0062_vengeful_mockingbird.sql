CREATE TABLE `page_upgrade_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pageId` int NOT NULL,
	`pageTitle` varchar(300) NOT NULL DEFAULT '',
	`sectionsJson` mediumtext NOT NULL DEFAULT '[]',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`note` varchar(200) DEFAULT '',
	CONSTRAINT `page_upgrade_history_id` PRIMARY KEY(`id`)
);
