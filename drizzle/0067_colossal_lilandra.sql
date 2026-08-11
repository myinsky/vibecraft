CREATE TABLE `proxy_api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyType` varchar(50) NOT NULL,
	`label` varchar(200) NOT NULL DEFAULT '',
	`keyValue` text NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `proxy_api_keys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `proxy_key_page_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyId` int NOT NULL,
	`pageId` int NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `proxy_key_page_links_id` PRIMARY KEY(`id`)
);
