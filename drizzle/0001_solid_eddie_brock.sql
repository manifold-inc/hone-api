ALTER TABLE `window_metrics` ADD `timing_outer_step_decode` float;--> statement-breakpoint
ALTER TABLE `window_metrics` ADD `timing_outer_step_merge` float;--> statement-breakpoint
ALTER TABLE `window_metrics` ADD `timing_outer_step_apply` float;--> statement-breakpoint
ALTER TABLE `window_metrics` ADD `timing_peer_eval_seconds_per_uid_p50` float;--> statement-breakpoint
ALTER TABLE `window_metrics` ADD `timing_peer_eval_seconds_per_uid_p95` float;--> statement-breakpoint
ALTER TABLE `window_metrics` ADD `timing_peer_eval_seconds_per_uid_max` float;--> statement-breakpoint
ALTER TABLE `window_metrics` ADD `upload_bytes_per_fragment_p50` bigint;--> statement-breakpoint
ALTER TABLE `window_metrics` ADD `upload_bytes_per_fragment_max` bigint;--> statement-breakpoint
ALTER TABLE `window_metrics` ADD `outer_steps_per_chain_window` float;--> statement-breakpoint
ALTER TABLE `window_metrics` ADD `effective_tokens_per_second` float;