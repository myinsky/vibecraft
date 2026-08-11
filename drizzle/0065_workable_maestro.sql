CREATE TABLE `file_metadata` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`originalFilename` varchar(500) NOT NULL,
	`fileSize` int NOT NULL DEFAULT 0,
	`mimeType` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `file_metadata_id` PRIMARY KEY(`id`),
	CONSTRAINT `file_metadata_fileKey_unique` UNIQUE(`fileKey`)
);
