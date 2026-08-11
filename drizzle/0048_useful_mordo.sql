CREATE TABLE `backup_jobs` (
	`id` varchar(100) NOT NULL,
	`progress` int NOT NULL DEFAULT 0,
	`step` varchar(500) NOT NULL DEFAULT '',
	`done` boolean NOT NULL DEFAULT false,
	`error` text,
	`resultFileKey` varchar(500),
	`resultFileUrl` varchar(500),
	`resultFileSize` int,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `backup_jobs_id` PRIMARY KEY(`id`)
);
