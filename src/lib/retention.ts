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
} from "../db/schema.js";
import { sql, lte } from "drizzle-orm";

const DEFAULT_RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || "30");

/**
 * Deletes metrics older than the retention period.
 * Runs periodically as a background job.
 */
export async function cleanupOldMetrics(retentionDays = DEFAULT_RETENTION_DAYS) {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const tables = [
    { name: "window_metrics", table: windowMetrics, col: windowMetrics.createdAt },
    { name: "miner_metrics", table: minerMetrics, col: minerMetrics.createdAt },
    { name: "uid_scores", table: uidScores, col: uidScores.createdAt },
    { name: "gradient_stats", table: gradientStats, col: gradientStats.createdAt },
    { name: "sync_scores", table: syncScores, col: syncScores.createdAt },
    { name: "slash_events", table: slashEvents, col: slashEvents.createdAt },
    { name: "inactivity_events", table: inactivityEvents, col: inactivityEvents.createdAt },
    { name: "inner_steps", table: innerSteps, col: innerSteps.createdAt },
  ];

  for (const { name, table, col } of tables) {
    try {
      const result = await db.delete(table).where(lte(col, cutoff));
      console.log(`[retention] cleaned ${name} (cutoff: ${cutoff.toISOString()})`);
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
