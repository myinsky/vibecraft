CREATE TABLE `category_ad_slots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`categoryKey` varchar(100) NOT NULL,
	`slot1Code` text,
	`slot2Code` text,
	`slot3Code` text,
	`disabled` tinyint NOT NULL DEFAULT 0,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `category_ad_slots_id` PRIMARY KEY(`id`),
	CONSTRAINT `category_ad_slots_categoryKey_unique` UNIQUE(`categoryKey`)
);
