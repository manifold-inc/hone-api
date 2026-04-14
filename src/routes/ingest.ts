import { Hono } from "hono";
import { db } from "../db/index.js";
import {
  trainingRuns,
  windowMetrics,
  uidScores,
  minerMetrics,
  gradientStats,
  syncScores,
  slashEvents,
  inactivityEvents,
} from "../db/schema.js";
import {
  registerRunSchema,
  ingestWindowSchema,
  minerMetricsSchema,
  syncScoresSchema,
  slashEventSchema,
  inactivityEventSchema,
} from "../lib/validators.js";
import { eq, and } from "drizzle-orm";
import { hotkeyAuth } from "../middleware/auth.js";
import { rateLimiter } from "../middleware/rate-limit.js";

const ingest = new Hono();
ingest.use("/*", rateLimiter);
ingest.use("/*", hotkeyAuth);

async function resolveRunId(externalId: string): Promise<number | null> {
  const [row] = await db
    .select({ id: trainingRuns.id })
    .from(trainingRuns)
    .where(eq(trainingRuns.externalId, externalId))
    .limit(1);
  return row?.id ?? null;
}

async function resolveRunIdAndVerifyHotkey(
  externalId: string,
  hotkey: string
): Promise<{ runId: number | null; hotkeyMismatch: boolean }> {
  const [row] = await db
    .select({ id: trainingRuns.id, hotkey: trainingRuns.hotkey })
    .from(trainingRuns)
    .where(eq(trainingRuns.externalId, externalId))
    .limit(1);

  if (!row) return { runId: null, hotkeyMismatch: false };
  if (row.hotkey !== hotkey) return { runId: row.id, hotkeyMismatch: true };
  return { runId: row.id, hotkeyMismatch: false };
}

ingest.post("/run", async (c) => {
  const body = await c.req.json();
  const parsed = registerRunSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const data = parsed.data;
  const signerHotkey = c.req.header("x-hotkey")!;

  if (data.hotkey !== signerHotkey) {
    return c.json({ error: "Hotkey in body does not match signer" }, 403);
  }

  const { runId: existingId, hotkeyMismatch } = await resolveRunIdAndVerifyHotkey(
    data.id,
    signerHotkey
  );

  if (existingId !== null) {
    if (hotkeyMismatch) {
      return c.json({ error: "Run belongs to a different hotkey" }, 403);
    }
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

  const signerHotkey = c.req.header("x-hotkey")!;
  const { windowMetrics: wm, uidScores: scores, gradientStats: gs } = parsed.data;
  const { runId, hotkeyMismatch } = await resolveRunIdAndVerifyHotkey(wm.runId, signerHotkey);

  if (runId === null) return c.json({ error: "Run not found" }, 404);
  if (hotkeyMismatch) return c.json({ error: "Run belongs to a different hotkey" }, 403);

  await db
    .update(trainingRuns)
    .set({ lastSeenAt: new Date() })
    .where(eq(trainingRuns.id, runId));

  const { runId: _rid, ...wmRest } = wm;
  await db.insert(windowMetrics).values({ runId, ...wmRest });

  if (scores && scores.length > 0) {
    const scoreRows = scores.map((s: (typeof scores)[number]) => ({
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

  const signerHotkey = c.req.header("x-hotkey")!;
  const { runId, hotkeyMismatch } = await resolveRunIdAndVerifyHotkey(
    parsed.data.runId,
    signerHotkey
  );

  if (runId === null) return c.json({ error: "Run not found" }, 404);
  if (hotkeyMismatch) return c.json({ error: "Run belongs to a different hotkey" }, 403);

  await db
    .update(trainingRuns)
    .set({ lastSeenAt: new Date() })
    .where(eq(trainingRuns.id, runId));

  const { runId: _rid, ...rest } = parsed.data;
  await db.insert(minerMetrics).values({ runId, ...rest });

  return c.json({ status: "ok" }, 201);
});

ingest.post("/sync-scores", async (c) => {
  const body = await c.req.json();
  const parsed = syncScoresSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const signerHotkey = c.req.header("x-hotkey")!;
  const { runId, hotkeyMismatch } = await resolveRunIdAndVerifyHotkey(
    parsed.data.runId,
    signerHotkey
  );

  if (runId === null) return c.json({ error: "Run not found" }, 404);
  if (hotkeyMismatch) return c.json({ error: "Run belongs to a different hotkey" }, 403);

  const rows = parsed.data.scores.map((s) => ({
    runId,
    window: parsed.data.window,
    ...s,
  }));

  if (rows.length > 0) {
    await db.insert(syncScores).values(rows);
  }

  return c.json({ status: "ok" }, 201);
});

ingest.post("/slash", async (c) => {
  const body = await c.req.json();
  const parsed = slashEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const signerHotkey = c.req.header("x-hotkey")!;
  const { runId, hotkeyMismatch } = await resolveRunIdAndVerifyHotkey(
    parsed.data.runId,
    signerHotkey
  );

  if (runId === null) return c.json({ error: "Run not found" }, 404);
  if (hotkeyMismatch) return c.json({ error: "Run belongs to a different hotkey" }, 403);

  const { runId: _rid, ...rest } = parsed.data;
  await db.insert(slashEvents).values({ runId, ...rest });

  return c.json({ status: "ok" }, 201);
});

ingest.post("/inactivity", async (c) => {
  const body = await c.req.json();
  const parsed = inactivityEventSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  const signerHotkey = c.req.header("x-hotkey")!;
  const { runId, hotkeyMismatch } = await resolveRunIdAndVerifyHotkey(
    parsed.data.runId,
    signerHotkey
  );

  if (runId === null) return c.json({ error: "Run not found" }, 404);
  if (hotkeyMismatch) return c.json({ error: "Run belongs to a different hotkey" }, 403);

  const { runId: _rid, ...rest } = parsed.data;
  await db.insert(inactivityEvents).values({ runId, ...rest });

  return c.json({ status: "ok" }, 201);
});

export { ingest };
