CREATE TABLE `ad_click_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`position` varchar(100) NOT NULL,
	`slotNum` int NOT NULL DEFAULT 1,
	`postId` int,
	`clickedAt` bigint NOT NULL,
	CONSTRAINT `ad_click_logs_id` PRIMARY KEY(`id`)
);
