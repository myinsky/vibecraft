CREATE TABLE `donations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`donorName` varchar(100) NOT NULL,
	`amount` int NOT NULL DEFAULT 0,
	`message` text,
	`userId` int,
	`confirmed` boolean NOT NULL DEFAULT false,
	`adminMemo` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `donations_id` PRIMARY KEY(`id`)
);
