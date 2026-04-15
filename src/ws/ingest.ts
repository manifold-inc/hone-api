import type { IncomingMessage } from "http";
import {
  registerIngestClient,
  unregisterIngestClient,
  updateHeartbeat,
  broadcastToDashboard,
  type IngestClient,
} from "../lib/ws-hub.js";
import {
  resolveRunIdAndVerifyHotkey,
  touchRun,
  persistWindow,
  persistMiner,
  persistSyncScores,
  persistSlash,
  persistInactivity,
  persistInnerStep,
  persistGatherStatus,
} from "../lib/persist.js";
import {
  ingestWindowSchema,
  minerMetricsSchema,
  syncScoresSchema,
  slashEventSchema,
  inactivityEventSchema,
  innerStepSchema,
  gatherStatusSchema,
} from "../lib/validators.js";
import { db } from "../db/index.js";
import { trainingRuns } from "../db/schema.js";
import { eq } from "drizzle-orm";

type WsSendable = {
  readyState: number;
  OPEN: number;
  send: (data: string) => void;
};

type WsLike = WsSendable & {
  close: (code?: number, reason?: string) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
};

let sr25519VerifyFn: ((m: Uint8Array, s: Uint8Array, pk: Uint8Array) => boolean) | null = null;
let decodeAddressFn: ((addr: string) => Uint8Array) | null = null;

async function ensureCrypto() {
  if (sr25519VerifyFn) return;
  const uc = await import("@polkadot/util-crypto");
  await uc.cryptoWaitReady();
  sr25519VerifyFn = uc.sr25519Verify;
  decodeAddressFn = uc.decodeAddress;
}

function sendJson(ws: WsSendable, data: unknown) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

const WS_MAX_MESSAGES_PER_SEC = 10;

class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  constructor(private maxTokens: number) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }
  consume(): boolean {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.maxTokens);
    this.lastRefill = now;
    if (this.tokens >= 1) {
      this.tokens--;
      return true;
    }
    return false;
  }
}

export function handleIngest(ws: WsLike, _req: IncomingMessage) {
  let client: IngestClient | null = null;
  const bucket = new TokenBucket(WS_MAX_MESSAGES_PER_SEC);

  const authTimeout = setTimeout(() => {
    if (!client?.authenticated) {
      sendJson(ws, { error: "Auth timeout" });
      ws.close(4001, "Auth timeout");
    }
  }, 10_000);

  ws.on("message", async (raw: unknown) => {
    let msg: Record<string, unknown>;
    try {
      const rawStr = String(raw);
      if (rawStr.length > 1_048_576) {
        sendJson(ws, { error: "Message too large" });
        return;
      }
      msg = JSON.parse(rawStr);
    } catch {
      sendJson(ws, { error: "Invalid JSON" });
      return;
    }

    const type = msg.type as string;

    if (type === "auth") {
      await handleAuth(ws, msg, authTimeout, (c: IngestClient) => { client = c; });
      return;
    }

    if (!client?.authenticated) {
      sendJson(ws, { error: "Not authenticated" });
      return;
    }

    if (type === "heartbeat") {
      updateHeartbeat(client.hotkey);
      sendJson(ws, { type: "heartbeat-ack" });
      return;
    }

    if (!bucket.consume()) {
      sendJson(ws, { error: "Rate limit exceeded", type });
      return;
    }

    try {
      await handleMetric(client, type, msg.data as Record<string, unknown>);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : String(e);
      sendJson(ws, { error: errMsg, type });
    }
  });

  ws.on("close", () => {
    clearTimeout(authTimeout);
    if (client) {
      unregisterIngestClient(client.hotkey);
    }
  });

  ws.on("error", () => {
    if (client) {
      unregisterIngestClient(client.hotkey);
    }
  });
}

async function handleAuth(
  ws: WsLike,
  msg: Record<string, unknown>,
  authTimeout: NodeJS.Timeout,
  setClient: (c: IngestClient) => void,
) {
  const { hotkey, nonce, signature, runId } = msg as {
    hotkey: string; nonce: string; signature: string; runId: string;
  };

  if (!hotkey || !nonce || !signature || !runId) {
    sendJson(ws, { error: "Missing auth fields" });
    ws.close(4001, "Missing auth fields");
    return;
  }

  const nonceTs = parseInt(nonce, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(nonceTs) || Math.abs(now - nonceTs) > 30) {
    sendJson(ws, { error: "Invalid or expired nonce" });
    ws.close(4001, "Bad nonce");
    return;
  }

  try {
    await ensureCrypto();
    const message = `${nonce}:ws-auth`;
    const pubKey = decodeAddressFn!(hotkey);
    const sigBytes = Uint8Array.from(Buffer.from(signature, "hex"));
    const msgBytes = new TextEncoder().encode(message);

    if (!sr25519VerifyFn!(msgBytes, sigBytes, pubKey)) {
      sendJson(ws, { error: "Invalid signature" });
      ws.close(4001, "Bad signature");
      return;
    }
  } catch {
    sendJson(ws, { error: "Signature verification failed" });
    ws.close(4001, "Sig error");
    return;
  }

  const { runId: dbRunId, hotkeyMismatch } = await resolveRunIdAndVerifyHotkey(runId, hotkey);
  if (dbRunId === null) {
    sendJson(ws, { error: "Run not found" });
    ws.close(4001, "Run not found");
    return;
  }
  if (hotkeyMismatch) {
    sendJson(ws, { error: "Hotkey does not match run" });
    ws.close(4001, "Hotkey mismatch");
    return;
  }

  const [run] = await db
    .select({ uid: trainingRuns.uid, role: trainingRuns.role })
    .from(trainingRuns)
    .where(eq(trainingRuns.id, dbRunId))
    .limit(1);

  clearTimeout(authTimeout);

  const client: IngestClient = {
    ws,
    hotkey,
    uid: run?.uid ?? null,
    role: run?.role ?? "miner",
    runId: dbRunId,
    externalRunId: runId,
    lastHeartbeat: Date.now(),
    authenticated: true,
  };

  setClient(client);
  registerIngestClient(hotkey, client);
  sendJson(ws, { type: "auth-ok", runId: dbRunId });
}

async function handleMetric(
  client: IngestClient,
  type: string,
  data: Record<string, unknown>,
) {
  if (!data) throw new Error("Missing data field");

  await touchRun(client.runId);

  switch (type) {
    case "window": {
      const parsed = ingestWindowSchema.parse(data);
      const { windowMetrics: wm, uidScores: scores, gradientStats: gs } = parsed;
      if (wm.runId !== client.externalRunId) throw new Error("runId mismatch");
      await persistWindow(client.runId, wm as unknown as Record<string, unknown>, scores as unknown as Array<Record<string, unknown>>, gs as unknown as Record<string, unknown>);
      broadcastToDashboard("metric", { type: "window", runId: client.runId, data: wm });
      sendJson(client.ws, { type: "ack", for: "window", window: wm.window });
      break;
    }
    case "miner": {
      const parsed = minerMetricsSchema.parse(data);
      if (parsed.runId !== client.externalRunId) throw new Error("runId mismatch");
      await persistMiner(client.runId, parsed as unknown as Record<string, unknown>);
      broadcastToDashboard("metric", { type: "miner", runId: client.runId, data: parsed });
      sendJson(client.ws, { type: "ack", for: "miner", window: parsed.window });
      break;
    }
    case "sync-scores": {
      const parsed = syncScoresSchema.parse(data);
      if (parsed.runId !== client.externalRunId) throw new Error("runId mismatch");
      await persistSyncScores(client.runId, parsed.window, parsed.scores as unknown as Array<Record<string, unknown>>);
      broadcastToDashboard("metric", { type: "sync-scores", runId: client.runId, data: parsed });
      sendJson(client.ws, { type: "ack", for: "sync-scores" });
      break;
    }
    case "slash": {
      const parsed = slashEventSchema.parse(data);
      if (parsed.runId !== client.externalRunId) throw new Error("runId mismatch");
      await persistSlash(client.runId, parsed as unknown as Record<string, unknown>);
      broadcastToDashboard("metric", { type: "slash", runId: client.runId, data: parsed });
      sendJson(client.ws, { type: "ack", for: "slash" });
      break;
    }
    case "inactivity": {
      const parsed = inactivityEventSchema.parse(data);
      if (parsed.runId !== client.externalRunId) throw new Error("runId mismatch");
      await persistInactivity(client.runId, parsed as unknown as Record<string, unknown>);
      broadcastToDashboard("metric", { type: "inactivity", runId: client.runId, data: parsed });
      sendJson(client.ws, { type: "ack", for: "inactivity" });
      break;
    }
    case "inner-step": {
      const parsed = innerStepSchema.parse(data);
      if (parsed.runId !== client.externalRunId) throw new Error("runId mismatch");
      await persistInnerStep(client.runId, parsed as unknown as Record<string, unknown>);
      broadcastToDashboard("metric", { type: "inner-step", runId: client.runId, data: parsed });
      break;
    }
    case "gather-status": {
      const parsed = gatherStatusSchema.parse(data);
      if (parsed.runId !== client.externalRunId) throw new Error("runId mismatch");
      await persistGatherStatus(client.runId, parsed.window, parsed.results as unknown as Array<Record<string, unknown>>);
      broadcastToDashboard("metric", { type: "gather-status", runId: client.runId, data: parsed });
      sendJson(client.ws, { type: "ack", for: "gather-status" });
      break;
    }
    default:
      throw new Error(`Unknown message type: ${type}`);
  }
}
