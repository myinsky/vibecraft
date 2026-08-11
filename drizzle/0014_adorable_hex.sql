CREATE TABLE `category_comment_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryKey` varchar(100) NOT NULL,
	`commentsEnabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `category_comment_settings_id` PRIMARY KEY(`id`),
	CONSTRAINT `category_comment_settings_categoryKey_unique` UNIQUE(`categoryKey`)
);
--> statement-breakpoint
CREATE TABLE `post_view_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`visitorType` enum('admin','author','logged_in','guest') NOT NULL DEFAULT 'guest',
	`referrer` varchar(500) DEFAULT '',
	`referrerDomain` varchar(200) DEFAULT '',
	`referrerType` enum('direct','search','social','internal','external','share') NOT NULL DEFAULT 'direct',
	`userAgent` varchar(500) DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `post_view_logs_id` PRIMARY KEY(`id`)
);
