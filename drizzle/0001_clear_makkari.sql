CREATE TABLE `app_reviews` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appId` int NOT NULL,
	`userId` int NOT NULL,
	`rating` int NOT NULL,
	`content` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `app_reviews_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `post_likes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`postId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `post_likes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`excerpt` text,
	`content` text NOT NULL,
	`thumbnail` varchar(500),
	`category` enum('ai-apps','ai-tools','my-apps','resources') NOT NULL,
	`tag` varchar(50),
	`badge` varchar(30),
	`authorId` int NOT NULL,
	`views` int NOT NULL DEFAULT 0,
	`likes` int NOT NULL DEFAULT 0,
	`published` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `posts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vibe_apps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`description` text NOT NULL,
	`longDescription` text,
	`category` varchar(50),
	`techStack` text,
	`features` text,
	`howToUse` text,
	`downloadUrl` varchar(500),
	`thumbnail` varchar(500),
	`gradient` varchar(200),
	`downloads` int NOT NULL DEFAULT 0,
	`ratingSum` int NOT NULL DEFAULT 0,
	`ratingCount` int NOT NULL DEFAULT 0,
	`authorId` int NOT NULL,
	`published` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vibe_apps_id` PRIMARY KEY(`id`)
);
