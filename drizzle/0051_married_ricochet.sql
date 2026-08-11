CREATE TABLE `coupang_product_cache` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyword` varchar(200) NOT NULL,
	`products` text NOT NULL,
	`cachedAt` bigint NOT NULL,
	CONSTRAINT `coupang_product_cache_id` PRIMARY KEY(`id`)
);
