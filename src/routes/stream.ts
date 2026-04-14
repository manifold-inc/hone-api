import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { db } from "../db/index.js";
import { windowMetrics, minerMetrics, trainingRuns } from "../db/schema.js";
import { eq, desc } from "drizzle-orm";

const stream = new Hono();

/**
 * SSE endpoint for live dashboard updates.
 * Polls the DB every 5s and pushes new metrics to connected clients.
 * Falls back gracefully -- clients can always use the REST API + React Query polling.
 */
stream.get("/run/:id", async (c) => {
  const rawId = c.req.param("id");
  const runIdNum = parseInt(rawId);

  const [run] = await db
    .select({ id: trainingRuns.id, role: trainingRuns.role })
    .from(trainingRuns)
    .where(
      isNaN(runIdNum)
        ? eq(trainingRuns.externalId, rawId)
        : eq(trainingRuns.id, runIdNum)
    )
    .limit(1);

  if (!run) {
    return c.json({ error: "Run not found" }, 404);
  }

  return streamSSE(c, async (sseStream) => {
    let lastWindowId = 0;
    let lastMinerMetricId = 0;

    while (true) {
      try {
        if (run.role === "validator") {
          const rows = await db
            .select()
            .from(windowMetrics)
            .where(eq(windowMetrics.runId, run.id))
            .orderBy(desc(windowMetrics.id))
            .limit(1);

          if (rows.length > 0 && rows[0].id > lastWindowId) {
            lastWindowId = rows[0].id;
            await sseStream.writeSSE({
              event: "window",
              data: JSON.stringify(rows[0]),
            });
          }
        } else {
          const rows = await db
            .select()
            .from(minerMetrics)
            .where(eq(minerMetrics.runId, run.id))
            .orderBy(desc(minerMetrics.id))
            .limit(1);

          if (rows.length > 0 && rows[0].id > lastMinerMetricId) {
            lastMinerMetricId = rows[0].id;
            await sseStream.writeSSE({
              event: "miner",
              data: JSON.stringify(rows[0]),
            });
          }
        }
      } catch {
        break;
      }

      await sseStream.sleep(5000);
    }
  });
});

export { stream };
