ALTER TABLE `window_metrics` ADD `timing_gather_quorum_seconds` float;--> statement-breakpoint
ALTER TABLE `window_metrics` ADD `timing_gather_grace_seconds` float;--> statement-breakpoint
ALTER TABLE `window_metrics` ADD `timing_outer_step_overlap_saved_seconds` float;