import {
  mysqlTable,
  varchar,
  int,
  float,
  json,
  timestamp,
  text,
  index,
  uniqueIndex,
  bigint,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

export const trainingRuns = mysqlTable(
  "training_runs",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    externalId: varchar("external_id", { length: 36 }).notNull(),
    hotkey: varchar("hotkey", { length: 128 }).notNull(),
    role: mysqlEnum("role", ["validator", "miner"]).notNull(),
    netuid: int("netuid").notNull(),
    uid: int("uid"),
    version: varchar("version", { length: 32 }),
    config: json("config"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_runs_external_id").on(table.externalId),
    index("idx_runs_hotkey").on(table.hotkey),
    index("idx_runs_role_last_seen").on(table.role, table.lastSeenAt),
    index("idx_runs_last_seen").on(table.lastSeenAt),
  ]
);

export const windowMetrics = mysqlTable(
  "window_metrics",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    window: int("window").notNull(),
    globalStep: int("global_step").notNull(),
    block: int("block"),

    lossOwnBefore: float("loss_own_before"),
    lossOwnAfter: float("loss_own_after"),
    lossRandomBefore: float("loss_random_before"),
    lossRandomAfter: float("loss_random_after"),
    lossOwnImprovement: float("loss_own_improvement"),
    lossRandomImprovement: float("loss_random_improvement"),

    outerLr: float("outer_lr"),
    innerLr: float("inner_lr"),

    activeMiners: int("active_miners"),
    gatherSuccessRate: float("gather_success_rate"),
    gatherPeers: int("gather_peers"),
    positivePeersRatio: float("positive_peers_ratio"),
    reserveUsed: int("reserve_used"),

    overlapMean: float("overlap_mean"),
    overlapMax: float("overlap_max"),
    overlapPairsChecked: int("overlap_pairs_checked"),
    overlapPairsOverThreshold: int("overlap_pairs_over_threshold"),
    overlapRatioOverThreshold: float("overlap_ratio_over_threshold"),

    compressMinMedianNorm: float("compress_min_median_norm"),
    compressMaxMedianNorm: float("compress_max_median_norm"),

    gatherIntendedMeanFinal: float("gather_intended_mean_final"),
    gatherActualMeanFinal: float("gather_actual_mean_final"),

    timingWindowTotal: float("timing_window_total"),
    timingPeerUpdate: float("timing_peer_update"),
    timingGather: float("timing_gather"),
    timingEvaluation: float("timing_evaluation"),
    timingModelUpdate: float("timing_model_update"),

    evaluatedUids: int("evaluated_uids"),
    totalNegativeEvals: int("total_negative_evals"),
    totalExcluded: int("total_excluded"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_wm_run_window").on(table.runId, table.window),
    index("idx_wm_run_created").on(table.runId, table.createdAt),
  ]
);

export const uidScores = mysqlTable(
  "uid_scores",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    window: int("window").notNull(),
    uid: int("uid").notNull(),

    gradientScore: float("gradient_score"),
    binaryIndicator: float("binary_indicator"),
    binaryMovingAvg: float("binary_moving_avg"),
    syncScore: float("sync_score"),

    openskillMu: float("openskill_mu"),
    openskillSigma: float("openskill_sigma"),
    openskillOrdinal: float("openskill_ordinal"),

    finalScore: float("final_score"),
    weight: float("weight"),

    lossOwnBefore: float("loss_own_before"),
    lossOwnAfter: float("loss_own_after"),
    lossRandomBefore: float("loss_random_before"),
    lossRandomAfter: float("loss_random_after"),
    improvementOwn: float("improvement_own"),
    improvementRandom: float("improvement_random"),

    evalStatus: varchar("eval_status", { length: 16 }),
    evalSkipReason: varchar("eval_skip_reason", { length: 256 }),
    consecutiveNegatives: int("consecutive_negatives"),
    negativeFrequency: float("negative_frequency"),
    bmaThresholdApplied: boolean("bma_threshold_applied"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_us_run_window").on(table.runId, table.window),
    index("idx_us_run_uid_window").on(table.runId, table.uid, table.window),
  ]
);

export const minerMetrics = mysqlTable(
  "miner_metrics",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    window: int("window").notNull(),
    globalStep: int("global_step").notNull(),

    loss: float("loss"),
    windowEntryLoss: float("window_entry_loss"),
    tokensPerSec: float("tokens_per_sec"),
    batchTokens: bigint("batch_tokens", { mode: "number" }),

    gradNorm: float("grad_norm"),
    weightNorm: float("weight_norm"),
    momentumNorm: float("momentum_norm"),

    gatherSuccessRate: float("gather_success_rate"),
    gatherPeers: int("gather_peers"),

    gpuMemoryAllocated: float("gpu_memory_allocated"),
    gpuMemoryCached: float("gpu_memory_cached"),

    innerLr: float("inner_lr"),

    timing: json("timing"),

    gradientL2Norm: float("gradient_l2_norm"),
    gradientTotalElements: bigint("gradient_total_elements", { mode: "number" }),
    cpuUsage: float("cpu_usage"),
    gpuUtilization: float("gpu_utilization"),

    outerStepApplied: boolean("outer_step_applied"),
    compressedSizeMb: float("compressed_size_mb"),
    uploadSizeMb: float("upload_size_mb"),
    offloadTime: float("offload_time"),
    restoreTime: float("restore_time"),
    skippedPeers: int("skipped_peers"),
    gatherPeerList: json("gather_peer_list"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_mm_run_window").on(table.runId, table.window),
    index("idx_mm_run_created").on(table.runId, table.createdAt),
  ]
);

export const gradientStats = mysqlTable(
  "gradient_stats",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    window: int("window").notNull(),

    meanGradNorm: float("mean_grad_norm"),
    maxGradNorm: float("max_grad_norm"),
    minGradNorm: float("min_grad_norm"),
    medianGradNorm: float("median_grad_norm"),
    gradNormStd: float("grad_norm_std"),
    meanWeightNorm: float("mean_weight_norm"),
    gradToWeightRatio: float("grad_to_weight_ratio"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("idx_gs_run_window").on(table.runId, table.window),
  ]
);

export const syncScores = mysqlTable(
  "sync_scores",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    window: int("window").notNull(),
    uid: int("uid").notNull(),

    l2Norm: float("l2_norm"),
    avgAbsDiff: float("avg_abs_diff"),
    avgStepsBehind: float("avg_steps_behind"),
    maxStepsBehind: int("max_steps_behind"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_ss_run_window").on(table.runId, table.window),
    index("idx_ss_run_uid").on(table.runId, table.uid),
  ]
);

export const slashEvents = mysqlTable(
  "slash_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    window: int("window").notNull(),
    uid: int("uid").notNull(),

    scoreBefore: float("score_before"),
    scoreAfter: float("score_after"),
    reason: varchar("reason", { length: 256 }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_slash_run_window").on(table.runId, table.window),
    index("idx_slash_run_uid").on(table.runId, table.uid),
  ]
);

export const inactivityEvents = mysqlTable(
  "inactivity_events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    window: int("window").notNull(),
    uid: int("uid").notNull(),

    scoreBefore: float("score_before"),
    scoreAfter: float("score_after"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_inact_run_window").on(table.runId, table.window),
    index("idx_inact_run_uid").on(table.runId, table.uid),
  ]
);

export const innerSteps = mysqlTable(
  "inner_steps",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    window: int("window").notNull(),
    innerStep: int("inner_step").notNull(),
    globalStep: int("global_step").notNull(),

    loss: float("loss"),
    batchSize: int("batch_size"),
    batchTokens: int("batch_tokens"),
    innerLr: float("inner_lr"),
    gradNorm: float("grad_norm"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_is_run_window").on(table.runId, table.window),
    index("idx_is_run_created").on(table.runId, table.createdAt),
  ]
);

export const gatherStatus = mysqlTable(
  "gather_status",
  {
    id: bigint("id", { mode: "number" }).primaryKey().autoincrement(),
    runId: bigint("run_id", { mode: "number" }).notNull(),
    window: int("window").notNull(),
    uid: int("uid").notNull(),

    status: varchar("status", { length: 16 }).notNull(),
    reason: varchar("reason", { length: 256 }),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_gs_run_window").on(table.runId, table.window),
    index("idx_gs_run_uid").on(table.runId, table.uid),
  ]
);
