CREATE TABLE `backup_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`fileUrl` varchar(500) NOT NULL,
	`fileSize` int NOT NULL DEFAULT 0,
	`countsJson` text NOT NULL DEFAULT '{}',
	`isAuto` boolean NOT NULL DEFAULT false,
	`scheduleCronTaskUid` varchar(65),
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `backup_history_id` PRIMARY KEY(`id`)
);
