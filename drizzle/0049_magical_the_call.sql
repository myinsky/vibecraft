CREATE TABLE `ad_inquiries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`email` varchar(320) NOT NULL,
	`company` varchar(200),
	`adType` enum('banner','sponsored','newsletter','other') NOT NULL DEFAULT 'banner',
	`period` varchar(100),
	`budget` varchar(100),
	`message` text NOT NULL,
	`userId` int,
	`confirmed` boolean NOT NULL DEFAULT false,
	`adminMemo` text,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `ad_inquiries_id` PRIMARY KEY(`id`)
);
