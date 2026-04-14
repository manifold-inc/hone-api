/**
 * Redis Streams consumer for hone-api.
 *
 * Reads signed metric messages from Redis Streams, verifies SR25519
 * signatures, persists to MySQL, and broadcasts to dashboard WS clients.
 *
 * Stream key pattern: metrics:{netuid}:{hotkey}
 * Each message fields: type, hotkey, runId, nonce, signature, data (JSON)
 */
import {
  resolveRunIdAndVerifyHotkey,
  touchRun,
  persistWindow,
  persistMiner,
  persistSyncScores,
  persistSlash,
  persistInactivity,
  persistInnerStep,
} from "./persist.js";
import {
  ingestWindowSchema,
  minerMetricsSchema,
  syncScoresSchema,
  slashEventSchema,
  inactivityEventSchema,
  innerStepSchema,
} from "./validators.js";
import { broadcastToDashboard } from "./ws-hub.js";
import { createHash } from "crypto";

const CONSUMER_GROUP = "hone-api";
const CONSUMER_NAME = `worker-${process.pid}`;
const BATCH_SIZE = 50;
const BLOCK_MS = 2000;
const NONCE_WINDOW_SECONDS = 60;

let sr25519VerifyFn: ((m: Uint8Array, s: Uint8Array, pk: Uint8Array) => boolean) | null = null;
let decodeAddressFn: ((addr: string) => Uint8Array) | null = null;

async function ensureCrypto() {
  if (sr25519VerifyFn) return;
  const uc = await import("@polkadot/util-crypto");
  await uc.cryptoWaitReady();
  sr25519VerifyFn = uc.sr25519Verify;
  decodeAddressFn = uc.decodeAddress;
}

interface StreamMessage {
  type: string;
  hotkey: string;
  runId: string;
  nonce: string;
  signature: string;
  data: string;
}

function verifySignature(msg: StreamMessage): boolean {
  if (!sr25519VerifyFn || !decodeAddressFn) return false;

  const nonceTs = parseInt(msg.nonce, 10);
  const now = Math.floor(Date.now() / 1000);
  if (isNaN(nonceTs) || Math.abs(now - nonceTs) > NONCE_WINDOW_SECONDS) {
    return false;
  }

  try {
    const bodyHash = createHash("sha256").update(msg.data).digest("hex");
    const message = `${msg.nonce}:${bodyHash}`;
    const pubKey = decodeAddressFn(msg.hotkey);
    const sigBytes = Uint8Array.from(Buffer.from(msg.signature, "hex"));
    const msgBytes = new TextEncoder().encode(message);
    return sr25519VerifyFn(msgBytes, sigBytes, pubKey);
  } catch {
    return false;
  }
}

function parseStreamKey(key: string): { netuid: string; hotkey: string } | null {
  const parts = key.split(":");
  if (parts.length !== 3 || parts[0] !== "metrics") return null;
  return { netuid: parts[1], hotkey: parts[2] };
}

async function processMessage(msg: StreamMessage): Promise<void> {
  const { runId: dbRunId, hotkeyMismatch } = await resolveRunIdAndVerifyHotkey(
    msg.runId,
    msg.hotkey,
  );
  if (dbRunId === null || hotkeyMismatch) return;

  await touchRun(dbRunId);

  const data = JSON.parse(msg.data) as Record<string, unknown>;

  switch (msg.type) {
    case "window": {
      const parsed = ingestWindowSchema.parse(data);
      const { windowMetrics: wm, uidScores: scores, gradientStats: gs } = parsed;
      await persistWindow(
        dbRunId,
        wm as unknown as Record<string, unknown>,
        scores as unknown as Array<Record<string, unknown>>,
        gs as unknown as Record<string, unknown>,
      );
      broadcastToDashboard("metric", { type: "window", runId: dbRunId, data: wm });
      break;
    }
    case "miner": {
      const parsed = minerMetricsSchema.parse(data);
      await persistMiner(dbRunId, parsed as unknown as Record<string, unknown>);
      broadcastToDashboard("metric", { type: "miner", runId: dbRunId, data: parsed });
      break;
    }
    case "sync-scores": {
      const parsed = syncScoresSchema.parse(data);
      await persistSyncScores(
        dbRunId,
        parsed.window,
        parsed.scores as unknown as Array<Record<string, unknown>>,
      );
      broadcastToDashboard("metric", { type: "sync-scores", runId: dbRunId, data: parsed });
      break;
    }
    case "slash": {
      const parsed = slashEventSchema.parse(data);
      await persistSlash(dbRunId, parsed as unknown as Record<string, unknown>);
      broadcastToDashboard("metric", { type: "slash", runId: dbRunId, data: parsed });
      break;
    }
    case "inactivity": {
      const parsed = inactivityEventSchema.parse(data);
      await persistInactivity(dbRunId, parsed as unknown as Record<string, unknown>);
      broadcastToDashboard("metric", { type: "inactivity", runId: dbRunId, data: parsed });
      break;
    }
    case "inner-step": {
      const parsed = innerStepSchema.parse(data);
      await persistInnerStep(dbRunId, parsed as unknown as Record<string, unknown>);
      broadcastToDashboard("metric", { type: "inner-step", runId: dbRunId, data: parsed });
      break;
    }
    default:
      console.warn(`[redis-consumer] Unknown message type: ${msg.type}`);
  }
}

export async function startRedisConsumer(): Promise<void> {
  const redisUrl = process.env.UPSTASH_REDIS_URL;
  if (!redisUrl) {
    console.log("[redis-consumer] No UPSTASH_REDIS_URL set, skipping Redis consumer");
    return;
  }

  await ensureCrypto();

  let Redis: typeof import("ioredis").default;
  try {
    const mod = await import("ioredis");
    Redis = mod.default;
  } catch {
    console.warn("[redis-consumer] ioredis not installed, skipping Redis consumer");
    return;
  }

  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    console.log("[redis-consumer] Connected to Redis");
  } catch (e) {
    console.error("[redis-consumer] Failed to connect to Redis:", e);
    return;
  }

  const streamPattern = "metrics:*";

  async function ensureConsumerGroup(streamKey: string) {
    try {
      await redis.call("XGROUP", "CREATE", streamKey, CONSUMER_GROUP, "0", "MKSTREAM");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes("BUSYGROUP")) throw e;
    }
  }

  async function discoverStreams(): Promise<string[]> {
    try {
      const keys = await redis.keys(streamPattern);
      return keys;
    } catch {
      return [];
    }
  }

  let running = true;

  async function consumeLoop() {
    while (running) {
      try {
        const streams = await discoverStreams();
        if (streams.length === 0) {
          await new Promise((r) => setTimeout(r, 5000));
          continue;
        }

        for (const s of streams) {
          await ensureConsumerGroup(s);
        }

        const xreadArgs: string[] = [
          "XREADGROUP",
          "GROUP", CONSUMER_GROUP, CONSUMER_NAME,
          "COUNT", String(BATCH_SIZE),
          "BLOCK", String(BLOCK_MS),
          "STREAMS",
          ...streams,
          ...streams.map(() => ">"),
        ];

        const results = await redis.call(...xreadArgs as [string, ...string[]]) as
          Array<[string, Array<[string, string[]]>]> | null;
        if (!results) continue;

        for (const [streamKey, messages] of results) {
          const keyInfo = parseStreamKey(streamKey);
          if (!keyInfo) continue;

          for (const [messageId, fields] of messages) {
            const fieldMap: Record<string, string> = {};
            for (let i = 0; i < fields.length; i += 2) {
              fieldMap[fields[i]] = fields[i + 1];
            }

            const msg: StreamMessage = {
              type: fieldMap.type ?? "",
              hotkey: fieldMap.hotkey ?? "",
              runId: fieldMap.runId ?? "",
              nonce: fieldMap.nonce ?? "",
              signature: fieldMap.signature ?? "",
              data: fieldMap.data ?? "{}",
            };

            if (msg.hotkey !== keyInfo.hotkey) {
              console.warn(
                `[redis-consumer] Hotkey mismatch: stream=${keyInfo.hotkey} msg=${msg.hotkey}`,
              );
              await redis.call("XACK", streamKey, CONSUMER_GROUP, messageId);
              continue;
            }

            if (!verifySignature(msg)) {
              console.warn(
                `[redis-consumer] Invalid signature for ${msg.hotkey} type=${msg.type}`,
              );
              await redis.call("XACK", streamKey, CONSUMER_GROUP, messageId);
              continue;
            }

            try {
              await processMessage(msg);
            } catch (e) {
              console.error(
                `[redis-consumer] Error processing ${msg.type} from ${msg.hotkey}:`,
                e instanceof Error ? e.message : e,
              );
            }

            await redis.call("XACK", streamKey, CONSUMER_GROUP, messageId);
          }
        }
      } catch (e) {
        console.error("[redis-consumer] Consumer loop error:", e instanceof Error ? e.message : e);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  consumeLoop().catch((e) => {
    console.error("[redis-consumer] Fatal error:", e);
  });

  process.on("SIGTERM", () => {
    running = false;
    redis.quit().catch(() => {});
  });
}
