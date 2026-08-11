CREATE TABLE `post_scroll_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`depth10` int NOT NULL DEFAULT 0,
	`depth20` int NOT NULL DEFAULT 0,
	`depth30` int NOT NULL DEFAULT 0,
	`depth40` int NOT NULL DEFAULT 0,
	`depth50` int NOT NULL DEFAULT 0,
	`depth60` int NOT NULL DEFAULT 0,
	`depth70` int NOT NULL DEFAULT 0,
	`depth80` int NOT NULL DEFAULT 0,
	`depth90` int NOT NULL DEFAULT 0,
	`depth100` int NOT NULL DEFAULT 0,
	`totalVisits` int NOT NULL DEFAULT 0,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `post_scroll_stats_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `visit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` varchar(64) NOT NULL,
	`path` varchar(500) NOT NULL,
	`postId` int,
	`userId` int,
	`userRole` enum('guest','user','admin') NOT NULL DEFAULT 'guest',
	`deviceType` enum('desktop','mobile','tablet','other') NOT NULL DEFAULT 'other',
	`browser` varchar(50),
	`os` varchar(50),
	`referrer` varchar(500),
	`referrerType` enum('direct','search','social','referral','other') NOT NULL DEFAULT 'direct',
	`duration` int NOT NULL DEFAULT 0,
	`scrollDepth` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `visit_logs_id` PRIMARY KEY(`id`)
);
