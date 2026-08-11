CREATE TABLE `html_tokens` (
	`token` varchar(64) NOT NULL,
	`pageId` int NOT NULL,
	`sectionId` varchar(100) NOT NULL,
	`isAdmin` tinyint NOT NULL DEFAULT 0,
	`expiresAt` bigint NOT NULL,
	CONSTRAINT `html_tokens_token` PRIMARY KEY(`token`)
);
