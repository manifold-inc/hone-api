import { Hono } from "hono";
import { db } from "../db/index.js";
import { trainingRuns, windowMetrics } from "../db/schema.js";
import { sql, desc } from "drizzle-orm";

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
  const latest = recentLoss.length > 0 ? recentLoss[recentLoss.length - 1] : null;

  return c.json({
    activeRuns: rc?.activeRuns ?? 0,
    activeValidators: rc?.activeValidators ?? 0,
    activeMiners: rc?.activeMiners ?? 0,
    totalWindows: reversed.length,
    latestWindow: latest,
    recentLoss: reversed,
  });
});

export { stats };
