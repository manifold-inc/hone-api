import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  trainingRuns,
  windowMetrics,
  uidScores,
  minerMetrics,
  slashEvents,
  inactivityEvents,
} from "../db/schema.js";
import { sql, desc, eq, and, gte } from "drizzle-orm";

const stats = new Hono();

stats.get("/network", async (c) => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

  const [runCounts, recentLoss] = await Promise.all([
    db
      .select({
        activeRuns: sql<number>`count(*)`,
        activeValidators: sql<number>`sum(case when ${trainingRuns.role} = 'validator' and ${trainingRuns.lastSeenAt} >= ${fiveMinAgo} then 1 else 0 end)`,
        activeMiners: sql<number>`sum(case when ${trainingRuns.role} = 'miner' and ${trainingRuns.lastSeenAt} >= ${fiveMinAgo} then 1 else 0 end)`,
      })
      .from(trainingRuns)
      .where(sql`${trainingRuns.lastSeenAt} >= ${fiveMinAgo}`),

    db
      .select({
        window: windowMetrics.window,
        globalStep: windowMetrics.globalStep,
        lossOwnBefore: windowMetrics.lossOwnBefore,
        lossOwnAfter: windowMetrics.lossOwnAfter,
        lossOwnImprovement: windowMetrics.lossOwnImprovement,
        gatherSuccessRate: windowMetrics.gatherSuccessRate,
        activeMiners: windowMetrics.activeMiners,
        evaluatedUids: windowMetrics.evaluatedUids,
        createdAt: windowMetrics.createdAt,
      })
      .from(windowMetrics)
      .orderBy(desc(windowMetrics.id))
      .limit(50),
  ]);

  const rc = runCounts[0];
  const reversed = recentLoss.reverse();
  const latest = reversed.length > 0 ? reversed[reversed.length - 1] : null;

  return c.json({
    activeRuns: rc?.activeRuns ?? 0,
    activeValidators: rc?.activeValidators ?? 0,
    activeMiners: rc?.activeMiners ?? 0,
    totalWindows: reversed.length,
    latestWindow: latest,
    recentLoss: reversed,
  });
});

stats.get("/leaderboard", async (c) => {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const limit = Math.min(parseInt(c.req.query("limit") || "256"), 512);

  const rows = await db.execute(sql`
    SELECT
      us.uid,
      us.gradient_score AS gradientScore,
      us.binary_indicator AS binaryIndicator,
      us.binary_moving_avg AS binaryMovingAvg,
      us.sync_score AS syncScore,
      us.openskill_mu AS openskillMu,
      us.openskill_sigma AS openskillSigma,
      us.openskill_ordinal AS openskillOrdinal,
      us.final_score AS finalScore,
      us.weight,
      us.window,
      us.created_at AS createdAt,
      tr.hotkey
    FROM uid_scores us
    INNER JOIN (
      SELECT uid, MAX(id) AS max_id
      FROM uid_scores
      WHERE run_id IN (
        SELECT id FROM training_runs
        WHERE role = 'validator'
          AND last_seen_at >= ${fiveMinAgo}
      )
      GROUP BY uid
    ) latest ON us.id = latest.max_id
    INNER JOIN training_runs tr ON tr.id = (
      SELECT run_id FROM uid_scores WHERE id = latest.max_id LIMIT 1
    )
    ORDER BY us.final_score DESC
    LIMIT ${limit}
  `);

  return c.json({ leaderboard: rows.rows ?? rows });
});

stats.get("/uid/:uid", async (c) => {
  const uid = parseInt(c.req.param("uid"));
  if (isNaN(uid)) return c.json({ error: "Invalid UID" }, 400);

  const limit = Math.min(parseInt(c.req.query("limit") || "500"), 2000);

  const [scores, slashes, inactivity] = await Promise.all([
    db
      .select()
      .from(uidScores)
      .where(eq(uidScores.uid, uid))
      .orderBy(desc(uidScores.window))
      .limit(limit),

    db
      .select()
      .from(slashEvents)
      .where(eq(slashEvents.uid, uid))
      .orderBy(desc(slashEvents.window))
      .limit(100),

    db
      .select()
      .from(inactivityEvents)
      .where(eq(inactivityEvents.uid, uid))
      .orderBy(desc(inactivityEvents.window))
      .limit(100),
  ]);

  const latest = scores.length > 0 ? scores[0] : null;

  return c.json({
    uid,
    latestScore: latest,
    scores,
    slashes,
    inactivity,
  });
});

export { stats };
