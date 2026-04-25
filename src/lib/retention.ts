import { db } from "../db/index.js";
import {
  windowMetrics,
  minerMetrics,
  uidScores,
  gradientStats,
  syncScores,
  slashEvents,
  inactivityEvents,
  innerSteps,
  evalResults,
} from "../db/schema.js";
import { sql, lte } from "drizzle-orm";

const DEFAULT_RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || "30");

// Benchmark scores are intentionally retained longer than per-window
// telemetry: they're sparse (one bundle per ~5min eval cadence vs
// thousands of rows per window) and they're the data the dashboard's
// long-horizon "scores over time" charts read from. Operator can
// override via EVAL_RETENTION_DAYS env. Default 365 days.
const DEFAULT_EVAL_RETENTION_DAYS = parseInt(
  process.env.EVAL_RETENTION_DAYS || "365",
);

/**
 * Deletes metrics older than the retention period.
 * Runs periodically as a background job.
 */
export async function cleanupOldMetrics(
  retentionDays = DEFAULT_RETENTION_DAYS,
  evalRetentionDays = DEFAULT_EVAL_RETENTION_DAYS,
) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const evalCutoff = new Date(
    Date.now() - evalRetentionDays * 24 * 60 * 60 * 1000,
  );
  const tables = [
    { name: "window_metrics", table: windowMetrics, col: windowMetrics.createdAt, cutoff },
    { name: "miner_metrics", table: minerMetrics, col: minerMetrics.createdAt, cutoff },
    { name: "uid_scores", table: uidScores, col: uidScores.createdAt, cutoff },
    { name: "gradient_stats", table: gradientStats, col: gradientStats.createdAt, cutoff },
    { name: "sync_scores", table: syncScores, col: syncScores.createdAt, cutoff },
    { name: "slash_events", table: slashEvents, col: slashEvents.createdAt, cutoff },
    { name: "inactivity_events", table: inactivityEvents, col: inactivityEvents.createdAt, cutoff },
    { name: "inner_steps", table: innerSteps, col: innerSteps.createdAt, cutoff },
    { name: "eval_results", table: evalResults, col: evalResults.createdAt, cutoff: evalCutoff },
  ];

  for (const { name, table, col, cutoff: tCutoff } of tables) {
    try {
      const result = await db.delete(table).where(lte(col, tCutoff));
      console.log(`[retention] cleaned ${name} (cutoff: ${tCutoff.toISOString()})`);
    } catch (e) {
      console.error(`[retention] error cleaning ${name}:`, e);
    }
  }
}

/**
 * Start a periodic cleanup interval.
 */
export function startRetentionJob(intervalHours = 6) {
  cleanupOldMetrics();
  setInterval(() => cleanupOldMetrics(), intervalHours * 60 * 60 * 1000);
  console.log(
    `[retention] job started: ${DEFAULT_RETENTION_DAYS}d retention, runs every ${intervalHours}h`
  );
}
