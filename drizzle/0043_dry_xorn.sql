CREATE TABLE `comment_likes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`commentId` int NOT NULL,
	`userId` varchar(255) NOT NULL,
	`targetType` enum('comment','ai_reply') NOT NULL DEFAULT 'comment',
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `comment_likes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `comments` MODIFY COLUMN `postId` int;--> statement-breakpoint
ALTER TABLE `comments` ADD `pageId` int;--> statement-breakpoint
ALTER TABLE `comments` ADD `likeCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `comments` ADD `aiReplyLikeCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `nav_items` ADD `introHtml` text;