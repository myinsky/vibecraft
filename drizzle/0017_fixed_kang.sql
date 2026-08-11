CREATE TABLE `publish_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`postId` int,
	`title` varchar(200) NOT NULL,
	`category` varchar(50) NOT NULL,
	`status` enum('published','draft','scheduled') NOT NULL DEFAULT 'published',
	`scheduledAt` timestamp,
	`keyName` varchar(100) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `publish_logs_id` PRIMARY KEY(`id`)
);
