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
import { eq, desc, and, gte, lte, sql } from "drizzle-orm";

const runs = new Hono();

runs.get("/", async (c) => {
  const role = c.req.query("role");
  const hotkey = c.req.query("hotkey");
  const limit = Math.min(parseInt(c.req.query("limit") || "50"), 200);
  const offset = parseInt(c.req.query("offset") || "0");

  const conditions = [];
  if (role) conditions.push(eq(trainingRuns.role, role as "validator" | "miner"));
  if (hotkey) conditions.push(eq(trainingRuns.hotkey, hotkey));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, countResult] = await Promise.all([
    db
      .select()
      .from(trainingRuns)
      .where(where)
      .orderBy(desc(trainingRuns.lastSeenAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(trainingRuns)
      .where(where),
  ]);

  return c.json({ runs: rows, total: countResult[0].count });
});

async function resolveId(idOrExternal: string): Promise<number | null> {
  const asNum = parseInt(idOrExternal);
  if (!isNaN(asNum)) {
    const [row] = await db
      .select({ id: trainingRuns.id })
      .from(trainingRuns)
      .where(eq(trainingRuns.id, asNum))
      .limit(1);
    if (row) return row.id;
  }
  const [row] = await db
    .select({ id: trainingRuns.id })
    .from(trainingRuns)
    .where(eq(trainingRuns.externalId, idOrExternal))
    .limit(1);
  return row?.id ?? null;
}

runs.get("/:id", async (c) => {
  const rawId = c.req.param("id");
  const runId = await resolveId(rawId);
  if (runId === null) {
    return c.json({ error: "Run not found" }, 404);
  }

  const [run, latestWindow, latestMiner] = await Promise.all([
    db.select().from(trainingRuns).where(eq(trainingRuns.id, runId)).limit(1),
    db
      .select()
      .from(windowMetrics)
      .where(eq(windowMetrics.runId, runId))
      .orderBy(desc(windowMetrics.window))
      .limit(1),
    db
      .select()
      .from(minerMetrics)
      .where(eq(minerMetrics.runId, runId))
      .orderBy(desc(minerMetrics.window))
      .limit(1),
  ]);

  return c.json({
    run: run[0],
    latestWindow: latestWindow[0] || null,
    latestMiner: latestMiner[0] || null,
  });
});

runs.get("/:id/windows", async (c) => {
  const rawId = c.req.param("id");
  const runId = await resolveId(rawId);
  if (runId === null) return c.json({ error: "Run not found" }, 404);

  const limit = Math.min(parseInt(c.req.query("limit") || "100"), 1000);
  const offset = parseInt(c.req.query("offset") || "0");
  const from = c.req.query("from");
  const to = c.req.query("to");

  const conditions = [eq(windowMetrics.runId, runId)];
  if (from) conditions.push(gte(windowMetrics.createdAt, new Date(from)));
  if (to) conditions.push(lte(windowMetrics.createdAt, new Date(to)));

  const rows = await db
    .select()
    .from(windowMetrics)
    .where(and(...conditions))
    .orderBy(desc(windowMetrics.window))
    .limit(limit)
    .offset(offset);

  return c.json({ windows: rows });
});

runs.get("/:id/scores", async (c) => {
  const rawId = c.req.param("id");
  const runId = await resolveId(rawId);
  if (runId === null) return c.json({ error: "Run not found" }, 404);

  const uid = c.req.query("uid");
  const limit = Math.min(parseInt(c.req.query("limit") || "500"), 5000);
  const offset = parseInt(c.req.query("offset") || "0");

  const conditions = [eq(uidScores.runId, runId)];
  if (uid) conditions.push(eq(uidScores.uid, parseInt(uid)));

  const rows = await db
    .select()
    .from(uidScores)
    .where(and(...conditions))
    .orderBy(desc(uidScores.window))
    .limit(limit)
    .offset(offset);

  return c.json({ scores: rows });
});

runs.get("/:id/miners", async (c) => {
  const rawId = c.req.param("id");
  const runId = await resolveId(rawId);
  if (runId === null) return c.json({ error: "Run not found" }, 404);

  const limit = Math.min(parseInt(c.req.query("limit") || "100"), 1000);
  const offset = parseInt(c.req.query("offset") || "0");

  const rows = await db
    .select()
    .from(minerMetrics)
    .where(eq(minerMetrics.runId, runId))
    .orderBy(desc(minerMetrics.window))
    .limit(limit)
    .offset(offset);

  return c.json({ miners: rows });
});

runs.get("/:id/gradients", async (c) => {
  const rawId = c.req.param("id");
  const runId = await resolveId(rawId);
  if (runId === null) return c.json({ error: "Run not found" }, 404);

  const limit = Math.min(parseInt(c.req.query("limit") || "100"), 1000);
  const offset = parseInt(c.req.query("offset") || "0");

  const rows = await db
    .select()
    .from(gradientStats)
    .where(eq(gradientStats.runId, runId))
    .orderBy(desc(gradientStats.window))
    .limit(limit)
    .offset(offset);

  return c.json({ gradients: rows });
});

runs.get("/:id/sync-scores", async (c) => {
  const rawId = c.req.param("id");
  const runId = await resolveId(rawId);
  if (runId === null) return c.json({ error: "Run not found" }, 404);

  const uid = c.req.query("uid");
  const limit = Math.min(parseInt(c.req.query("limit") || "500"), 5000);
  const offset = parseInt(c.req.query("offset") || "0");

  const conditions = [eq(syncScores.runId, runId)];
  if (uid) conditions.push(eq(syncScores.uid, parseInt(uid)));

  const rows = await db
    .select()
    .from(syncScores)
    .where(and(...conditions))
    .orderBy(desc(syncScores.window))
    .limit(limit)
    .offset(offset);

  return c.json({ syncScores: rows });
});

runs.get("/:id/slashes", async (c) => {
  const rawId = c.req.param("id");
  const runId = await resolveId(rawId);
  if (runId === null) return c.json({ error: "Run not found" }, 404);

  const uid = c.req.query("uid");
  const limit = Math.min(parseInt(c.req.query("limit") || "100"), 1000);
  const offset = parseInt(c.req.query("offset") || "0");

  const conditions = [eq(slashEvents.runId, runId)];
  if (uid) conditions.push(eq(slashEvents.uid, parseInt(uid)));

  const rows = await db
    .select()
    .from(slashEvents)
    .where(and(...conditions))
    .orderBy(desc(slashEvents.window))
    .limit(limit)
    .offset(offset);

  return c.json({ slashes: rows });
});

runs.get("/:id/inactivity", async (c) => {
  const rawId = c.req.param("id");
  const runId = await resolveId(rawId);
  if (runId === null) return c.json({ error: "Run not found" }, 404);

  const uid = c.req.query("uid");
  const limit = Math.min(parseInt(c.req.query("limit") || "100"), 1000);
  const offset = parseInt(c.req.query("offset") || "0");

  const conditions = [eq(inactivityEvents.runId, runId)];
  if (uid) conditions.push(eq(inactivityEvents.uid, parseInt(uid)));

  const rows = await db
    .select()
    .from(inactivityEvents)
    .where(and(...conditions))
    .orderBy(desc(inactivityEvents.window))
    .limit(limit)
    .offset(offset);

  return c.json({ inactivity: rows });
});

export { runs };
