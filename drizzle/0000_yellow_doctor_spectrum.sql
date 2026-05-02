CREATE TABLE `eval_results` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`version` varchar(64) NOT NULL,
	`project` varchar(128) NOT NULL,
	`window` int NOT NULL,
	`global_step` int,
	`task` varchar(64) NOT NULL,
	`metric_name` varchar(64) NOT NULL,
	`score` float NOT NULL,
	`num_fewshot` int DEFAULT 0,
	`n_samples` int,
	`eval_duration_s` float,
	`started_at` timestamp,
	`completed_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `eval_results_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_eval_unique` UNIQUE(`version`,`window`,`task`,`metric_name`)
);
--> statement-breakpoint
CREATE TABLE `gather_status` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` bigint NOT NULL,
	`window` int NOT NULL,
	`uid` int NOT NULL,
	`status` varchar(16) NOT NULL,
	`reason` varchar(256),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gather_status_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gradient_stats` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` bigint NOT NULL,
	`window` int NOT NULL,
	`mean_grad_norm` float,
	`max_grad_norm` float,
	`min_grad_norm` float,
	`median_grad_norm` float,
	`grad_norm_std` float,
	`mean_weight_norm` float,
	`grad_to_weight_ratio` float,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `gradient_stats_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_gs_run_window` UNIQUE(`run_id`,`window`)
);
--> statement-breakpoint
CREATE TABLE `inactivity_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` bigint NOT NULL,
	`window` int NOT NULL,
	`uid` int NOT NULL,
	`score_before` float,
	`score_after` float,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inactivity_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inner_steps` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` bigint NOT NULL,
	`window` int NOT NULL,
	`inner_step` int NOT NULL,
	`global_step` int NOT NULL,
	`loss` float,
	`batch_size` int,
	`batch_tokens` int,
	`inner_lr` float,
	`grad_norm` float,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inner_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `miner_metrics` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` bigint NOT NULL,
	`window` int NOT NULL,
	`global_step` int NOT NULL,
	`loss` float,
	`window_entry_loss` float,
	`tokens_per_sec` float,
	`batch_tokens` bigint,
	`grad_norm` float,
	`weight_norm` float,
	`momentum_norm` float,
	`gather_success_rate` float,
	`gather_peers` int,
	`gpu_memory_allocated` float,
	`gpu_memory_cached` float,
	`inner_lr` float,
	`timing` json,
	`gradient_l2_norm` float,
	`gradient_total_elements` bigint,
	`cpu_usage` float,
	`gpu_utilization` float,
	`outer_step_applied` boolean,
	`compressed_size_mb` float,
	`upload_size_mb` float,
	`offload_time` float,
	`restore_time` float,
	`skipped_peers` int,
	`gather_peer_list` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `miner_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_mm_run_window` UNIQUE(`run_id`,`window`)
);
--> statement-breakpoint
CREATE TABLE `slash_events` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` bigint NOT NULL,
	`window` int NOT NULL,
	`uid` int NOT NULL,
	`score_before` float,
	`score_after` float,
	`reason` varchar(256),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `slash_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sync_scores` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` bigint NOT NULL,
	`window` int NOT NULL,
	`uid` int NOT NULL,
	`l2_norm` float,
	`avg_abs_diff` float,
	`avg_steps_behind` float,
	`max_steps_behind` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sync_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `training_runs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`external_id` varchar(36) NOT NULL,
	`hotkey` varchar(128) NOT NULL,
	`role` enum('validator','miner') NOT NULL,
	`netuid` int NOT NULL,
	`uid` int,
	`version` varchar(32),
	`project` varchar(64),
	`model_size` varchar(32),
	`config` json,
	`started_at` timestamp NOT NULL DEFAULT (now()),
	`last_seen_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `training_runs_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_runs_external_id` UNIQUE(`external_id`)
);
--> statement-breakpoint
CREATE TABLE `uid_scores` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` bigint NOT NULL,
	`window` int NOT NULL,
	`uid` int NOT NULL,
	`gradient_score` float,
	`binary_indicator` float,
	`binary_moving_avg` float,
	`sync_score` float,
	`openskill_mu` float,
	`openskill_sigma` float,
	`openskill_ordinal` float,
	`final_score` float,
	`weight` float,
	`loss_own_before` float,
	`loss_own_after` float,
	`loss_random_before` float,
	`loss_random_after` float,
	`improvement_own` float,
	`improvement_random` float,
	`eval_status` varchar(16),
	`eval_skip_reason` varchar(256),
	`consecutive_negatives` int,
	`negative_frequency` float,
	`bma_threshold_applied` boolean,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `uid_scores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `window_metrics` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`run_id` bigint NOT NULL,
	`window` int NOT NULL,
	`global_step` int NOT NULL,
	`block` int,
	`loss_own_before` float,
	`loss_own_after` float,
	`loss_random_before` float,
	`loss_random_after` float,
	`loss_own_improvement` float,
	`loss_random_improvement` float,
	`outer_lr` float,
	`inner_lr` float,
	`active_miners` int,
	`gather_success_rate` float,
	`gather_peers` int,
	`positive_peers_ratio` float,
	`reserve_used` int,
	`overlap_mean` float,
	`overlap_max` float,
	`overlap_pairs_checked` int,
	`overlap_pairs_over_threshold` int,
	`overlap_ratio_over_threshold` float,
	`compress_min_median_norm` float,
	`compress_max_median_norm` float,
	`gather_intended_mean_final` float,
	`gather_actual_mean_final` float,
	`timing_window_total` float,
	`timing_peer_update` float,
	`timing_gather` float,
	`timing_evaluation` float,
	`timing_model_update` float,
	`evaluated_uids` int,
	`total_negative_evals` int,
	`total_excluded` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `window_metrics_id` PRIMARY KEY(`id`),
	CONSTRAINT `idx_wm_run_window` UNIQUE(`run_id`,`window`)
);
--> statement-breakpoint
CREATE INDEX `idx_eval_version_created` ON `eval_results` (`version`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_eval_task_created` ON `eval_results` (`task`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_eval_version_window` ON `eval_results` (`version`,`window`);--> statement-breakpoint
CREATE INDEX `idx_gs_run_window` ON `gather_status` (`run_id`,`window`);--> statement-breakpoint
CREATE INDEX `idx_gs_run_uid` ON `gather_status` (`run_id`,`uid`);--> statement-breakpoint
CREATE INDEX `idx_inact_run_window` ON `inactivity_events` (`run_id`,`window`);--> statement-breakpoint
CREATE INDEX `idx_inact_run_uid` ON `inactivity_events` (`run_id`,`uid`);--> statement-breakpoint
CREATE INDEX `idx_is_run_window` ON `inner_steps` (`run_id`,`window`);--> statement-breakpoint
CREATE INDEX `idx_is_run_created` ON `inner_steps` (`run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_mm_run_created` ON `miner_metrics` (`run_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_slash_run_window` ON `slash_events` (`run_id`,`window`);--> statement-breakpoint
CREATE INDEX `idx_slash_run_uid` ON `slash_events` (`run_id`,`uid`);--> statement-breakpoint
CREATE INDEX `idx_ss_run_window` ON `sync_scores` (`run_id`,`window`);--> statement-breakpoint
CREATE INDEX `idx_ss_run_uid` ON `sync_scores` (`run_id`,`uid`);--> statement-breakpoint
CREATE INDEX `idx_runs_hotkey` ON `training_runs` (`hotkey`);--> statement-breakpoint
CREATE INDEX `idx_runs_role_last_seen` ON `training_runs` (`role`,`last_seen_at`);--> statement-breakpoint
CREATE INDEX `idx_runs_last_seen` ON `training_runs` (`last_seen_at`);--> statement-breakpoint
CREATE INDEX `idx_runs_project_version` ON `training_runs` (`project`,`version`);--> statement-breakpoint
CREATE INDEX `idx_us_run_window` ON `uid_scores` (`run_id`,`window`);--> statement-breakpoint
CREATE INDEX `idx_us_run_uid_window` ON `uid_scores` (`run_id`,`uid`,`window`);--> statement-breakpoint
CREATE INDEX `idx_wm_run_created` ON `window_metrics` (`run_id`,`created_at`);