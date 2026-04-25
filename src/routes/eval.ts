import { Hono } from "hono";
import { db } from "../db/index.js";
import { evalResults } from "../db/schema.js";
import { evalIngestSchema } from "../lib/validators.js";
import { evalApiKeyAuth } from "../middleware/auth.js";
import { and, desc, eq, sql } from "drizzle-orm";

// /ingest/eval -- WRITE endpoint, gated by evalApiKeyAuth (strict
// API_KEY check; rejects when env is unset). Receives one window of
// benchmark scores from the hone evaluator and inserts (with upsert
// on the (version, window, task, metricName) unique key) so a
// re-evaluation of the same window cleanly overwrites instead of
// duplicating rows.
export const evalIngest = new Hono();
evalIngest.use("/*", evalApiKeyAuth);

evalIngest.post("/", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (body === null) {
    return c.json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = evalIngestSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }
  const data = parsed.data;

  // Build the rows. We pass startedAt/completedAt verbatim onto every
  // row; per-row eval_duration_s already captures finer-grained timing
  // and the bundle-level timestamps make it easy to find "all rows
  // from this evaluator iteration" in SQL.
  const startedAt = data.startedAt ? new Date(data.startedAt) : null;
  const completedAt = data.completedAt ? new Date(data.completedAt) : null;

  const rows = data.results.map((r) => ({
    version: data.version,
    project: data.project,
    window: data.window,
    globalStep: data.globalStep ?? null,
    task: r.task,
    metricName: r.metricName,
    score: r.score,
    numFewshot: r.numFewshot ?? 0,
    nSamples: r.nSamples ?? null,
    evalDurationS: r.evalDurationS ?? null,
    startedAt,
    completedAt,
  }));

  // PlanetScale-MySQL: ON DUPLICATE KEY UPDATE so re-running an eval
  // for the same (version, window, task, metricName) refreshes the
  // score in place instead of stacking rows. Drizzle's mysql driver
  // exposes onDuplicateKeyUpdate on the insert builder.
  await db
    .insert(evalResults)
    .values(rows)
    .onDuplicateKeyUpdate({
      set: {
        score: sql`VALUES(score)`,
        globalStep: sql`VALUES(global_step)`,
        numFewshot: sql`VALUES(num_fewshot)`,
        nSamples: sql`VALUES(n_samples)`,
        evalDurationS: sql`VALUES(eval_duration_s)`,
        startedAt: sql`VALUES(started_at)`,
        completedAt: sql`VALUES(completed_at)`,
      },
    });

  return c.json({ inserted: rows.length });
});

// /api/eval -- READ endpoints, mounted under /api/* so they inherit
// the existing apiKeyAuth (lenient when API_KEY unset, strict when
// set). The dashboard fetches via the Next proxy, which forwards the
// dashboard's own x-api-key.
export const evalRead = new Hono();

// GET /api/eval?version=X&task=Y&limit=N
// Returns time-series rows ordered newest first. Default limit 5000
// (covers months of evaluations at our cadence).
evalRead.get("/", async (c) => {
  const version = c.req.query("version");
  const task = c.req.query("task");
  const metric = c.req.query("metric"); // e.g. "acc_norm" to filter charts
  const limit = Math.min(parseInt(c.req.query("limit") || "5000"), 20000);
  const offset = parseInt(c.req.query("offset") || "0");

  const conditions = [];
  if (version) conditions.push(eq(evalResults.version, version));
  if (task) conditions.push(eq(evalResults.task, task));
  if (metric) conditions.push(eq(evalResults.metricName, metric));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select()
    .from(evalResults)
    .where(where)
    .orderBy(desc(evalResults.window), desc(evalResults.createdAt))
    .limit(limit)
    .offset(offset);

  return c.json({ results: rows });
});

// GET /api/eval/latest?version=X[&metric=acc_norm]
// Returns the most-recent score per task for the given version (and
// optional metric filter). Used by the per-task headline tiles on the
// overview page so we can render "current 0.487" without pulling the
// full history.
evalRead.get("/latest", async (c) => {
  const version = c.req.query("version");
  const metric = c.req.query("metric") || "acc_norm";
  if (!version) {
    return c.json({ error: "version query param required" }, 400);
  }

  // PlanetScale supports window functions; we pick the row with the
  // largest window per task and filter on metric. This is a single
  // round-trip and avoids per-task fan-out queries.
  const rows = await db.execute(sql`
    SELECT er.task, er.score, er.window, er.global_step AS globalStep,
           er.metric_name AS metricName, er.created_at AS createdAt,
           er.eval_duration_s AS evalDurationS, er.n_samples AS nSamples
    FROM eval_results er
    INNER JOIN (
      SELECT task, MAX(window) AS max_window
      FROM eval_results
      WHERE version = ${version} AND metric_name = ${metric}
      GROUP BY task
    ) m ON m.task = er.task AND m.max_window = er.window
    WHERE er.version = ${version} AND er.metric_name = ${metric}
    ORDER BY er.task ASC
  `);

  // ``db.execute`` returns the raw driver rows; the planetscale-serverless
  // driver returns ``{ rows: [...] }``. Normalise.
  const rawRows: any[] =
    Array.isArray((rows as any).rows)
      ? (rows as any).rows
      : Array.isArray(rows)
      ? (rows as any)
      : [];

  const latest: Record<string, {
    score: number;
    window: number;
    globalStep: number | null;
    metricName: string;
    createdAt: string;
    evalDurationS: number | null;
    nSamples: number | null;
  }> = {};
  for (const r of rawRows) {
    latest[r.task] = {
      score: Number(r.score),
      window: Number(r.window),
      globalStep: r.globalStep === null ? null : Number(r.globalStep),
      metricName: String(r.metricName),
      createdAt: String(r.createdAt),
      evalDurationS:
        r.evalDurationS === null ? null : Number(r.evalDurationS),
      nSamples: r.nSamples === null ? null : Number(r.nSamples),
    };
  }
  return c.json({ latest });
});

// GET /api/eval/tasks?version=X
// Returns the distinct list of task names that have ever been
// evaluated for the version. Lets the dashboard render a card per
// task without having to walk the full results array client-side.
evalRead.get("/tasks", async (c) => {
  const version = c.req.query("version");
  if (!version) {
    return c.json({ error: "version query param required" }, 400);
  }
  const rows = await db
    .selectDistinct({ task: evalResults.task })
    .from(evalResults)
    .where(eq(evalResults.version, version))
    .orderBy(evalResults.task);
  return c.json({ tasks: rows.map((r) => r.task) });
});
