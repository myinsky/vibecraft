CREATE TABLE `comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` varchar(255) NOT NULL,
	`userName` varchar(255) NOT NULL,
	`content` text NOT NULL,
	`isHidden` boolean NOT NULL DEFAULT false,
	`aiReply` text,
	`aiRepliedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `comments_id` PRIMARY KEY(`id`)
);
