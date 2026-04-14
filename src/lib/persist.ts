/**
 * Shared persistence functions used by both HTTP ingest routes and WebSocket ingest.
 */
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
import { eq } from "drizzle-orm";

export async function resolveRunIdAndVerifyHotkey(
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

export async function touchRun(runId: number) {
  await db
    .update(trainingRuns)
    .set({ lastSeenAt: new Date() })
    .where(eq(trainingRuns.id, runId));
}

export async function persistWindow(
  runId: number,
  wm: Record<string, unknown>,
  scores?: Array<Record<string, unknown>>,
  gs?: Record<string, unknown>
) {
  const { runId: _rid, ...wmRest } = wm;
  await db.insert(windowMetrics).values({ runId, ...wmRest } as never);

  if (scores && scores.length > 0) {
    const scoreRows = scores.map((s) => ({
      runId,
      window: wm.window as number,
      ...s,
    }));
    await db.insert(uidScores).values(scoreRows as never);
  }

  if (gs) {
    await db.insert(gradientStats).values({
      runId,
      window: wm.window as number,
      ...gs,
    } as never);
  }
}

export async function persistMiner(
  runId: number,
  data: Record<string, unknown>
) {
  const { runId: _rid, ...rest } = data;
  await db.insert(minerMetrics).values({ runId, ...rest } as never);
}

export async function persistSyncScores(
  runId: number,
  window: number,
  scores: Array<Record<string, unknown>>
) {
  if (scores.length === 0) return;
  const rows = scores.map((s) => ({ runId, window, ...s }));
  await db.insert(syncScores).values(rows as never);
}

export async function persistSlash(
  runId: number,
  data: Record<string, unknown>
) {
  const { runId: _rid, ...rest } = data;
  await db.insert(slashEvents).values({ runId, ...rest } as never);
}

export async function persistInactivity(
  runId: number,
  data: Record<string, unknown>
) {
  const { runId: _rid, ...rest } = data;
  await db.insert(inactivityEvents).values({ runId, ...rest } as never);
}
