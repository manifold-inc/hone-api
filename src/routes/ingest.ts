import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  trainingRuns,
  windowMetrics,
  uidScores,
  minerMetrics,
  gradientStats,
} from "../db/schema.js";
import {
  registerRunSchema,
  ingestWindowSchema,
  minerMetricsSchema,
} from "../lib/validators.js";
import { eq } from "drizzle-orm";
import { apiKeyAuth } from "../middleware/auth.js";

const ingest = new Hono();
ingest.use("/*", apiKeyAuth);

async function resolveRunId(externalId: string): Promise<number | null> {
  const [row] = await db
    .select({ id: trainingRuns.id })
    .from(trainingRuns)
    .where(eq(trainingRuns.externalId, externalId))
    .limit(1);
  return row?.id ?? null;
}

ingest.post("/run", async (c) => {
  const body = await c.req.json();
  const parsed = registerRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;
  const existingId = await resolveRunId(data.id);

  if (existingId !== null) {
    await db
      .update(trainingRuns)
      .set({ lastSeenAt: new Date() })
      .where(eq(trainingRuns.id, existingId));
    return c.json({ status: "updated", id: data.id });
  }

  await db.insert(trainingRuns).values({
    externalId: data.id,
    hotkey: data.hotkey,
    role: data.role,
    netuid: data.netuid,
    uid: data.uid,
    version: data.version,
    config: data.config,
  });

  return c.json({ status: "created", id: data.id }, 201);
});

ingest.post("/window", async (c) => {
  const body = await c.req.json();
  const parsed = ingestWindowSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const { windowMetrics: wm, uidScores: scores, gradientStats: gs } = parsed.data;
  const runId = await resolveRunId(wm.runId);
  if (runId === null) {
    return c.json({ error: "Run not found" }, 404);
  }

  await db
    .update(trainingRuns)
    .set({ lastSeenAt: new Date() })
    .where(eq(trainingRuns.id, runId));

  const { runId: _rid, ...wmRest } = wm;
  await db.insert(windowMetrics).values({ runId, ...wmRest });

  if (scores && scores.length > 0) {
    const scoreRows = scores.map((s) => ({
      runId,
      window: wm.window,
      ...s,
    }));
    await db.insert(uidScores).values(scoreRows);
  }

  if (gs) {
    await db.insert(gradientStats).values({
      runId,
      window: wm.window,
      ...gs,
    });
  }

  return c.json({ status: "ok" }, 201);
});

ingest.post("/miner", async (c) => {
  const body = await c.req.json();
  const parsed = minerMetricsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const runId = await resolveRunId(parsed.data.runId);
  if (runId === null) {
    return c.json({ error: "Run not found" }, 404);
  }

  await db
    .update(trainingRuns)
    .set({ lastSeenAt: new Date() })
    .where(eq(trainingRuns.id, runId));

  const { runId: _rid, ...rest } = parsed.data;
  await db.insert(minerMetrics).values({ runId, ...rest });

  return c.json({ status: "ok" }, 201);
});

export { ingest };
