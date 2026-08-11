CREATE TABLE `coupang_click_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`btnText` varchar(200) NOT NULL,
	`productId` varchar(100),
	`postId` int,
	`clickedAt` bigint NOT NULL,
	CONSTRAINT `coupang_click_logs_id` PRIMARY KEY(`id`)
);
