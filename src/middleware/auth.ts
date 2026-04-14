import { createMiddleware } from "hono/factory";
import { createHash } from "crypto";

let cryptoReady = false;
let sr25519Verify: ((message: Uint8Array, signature: Uint8Array, publicKey: Uint8Array) => boolean) | null = null;
let decodeAddress: ((address: string) => Uint8Array) | null = null;

async function ensureCrypto() {
  if (cryptoReady) return;
  const utilCrypto = await import("@polkadot/util-crypto");
  await utilCrypto.cryptoWaitReady();
  sr25519Verify = utilCrypto.sr25519Verify;
  decodeAddress = utilCrypto.decodeAddress;
  cryptoReady = true;
}

const NONCE_WINDOW_SECONDS = 30;
const MAX_BODY_BYTES = 1_048_576; // 1MB

const nonceCache = new Map<string, number>();

function pruneNonceCache() {
  const cutoff = Date.now() - NONCE_WINDOW_SECONDS * 2 * 1000;
  for (const [key, ts] of nonceCache) {
    if (ts < cutoff) nonceCache.delete(key);
  }
}

setInterval(pruneNonceCache, 30_000);

/**
 * Bittensor hotkey signature authentication middleware.
 *
 * Verifies sr25519 signatures on ingest requests. Each request must include:
 *   x-hotkey:    SS58 address of the signer
 *   x-nonce:     Unix timestamp (seconds)
 *   x-signature: Hex-encoded sr25519 signature of "{nonce}:{sha256(body)}"
 */
export const hotkeyAuth = createMiddleware(async (c, next) => {
  const hotkey = c.req.header("x-hotkey");
  const nonce = c.req.header("x-nonce");
  const signature = c.req.header("x-signature");

  if (!hotkey || !nonce || !signature) {
    return c.json({ error: "Missing authentication headers (x-hotkey, x-nonce, x-signature)" }, 401);
  }

  const nonceTs = parseInt(nonce, 10);
  if (isNaN(nonceTs)) {
    return c.json({ error: "Invalid nonce" }, 401);
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - nonceTs) > NONCE_WINDOW_SECONDS) {
    return c.json({ error: "Nonce expired or too far in future" }, 401);
  }

  const nonceKey = `${hotkey}:${nonce}`;
  if (nonceCache.has(nonceKey)) {
    return c.json({ error: "Nonce already used" }, 401);
  }

  const contentLength = parseInt(c.req.header("content-length") || "0", 10);
  if (contentLength > MAX_BODY_BYTES) {
    return c.json({ error: "Request body too large" }, 413);
  }

  const bodyBytes = await c.req.arrayBuffer();
  const bodyHash = createHash("sha256")
    .update(new Uint8Array(bodyBytes))
    .digest("hex");

  const message = `${nonce}:${bodyHash}`;

  try {
    await ensureCrypto();

    const publicKey = decodeAddress!(hotkey);
    const sigBytes = Uint8Array.from(Buffer.from(signature, "hex"));
    const msgBytes = new TextEncoder().encode(message);

    const valid = sr25519Verify!(msgBytes, sigBytes, publicKey);
    if (!valid) {
      return c.json({ error: "Invalid signature" }, 401);
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return c.json({ error: `Signature verification failed: ${msg}` }, 401);
  }

  nonceCache.set(nonceKey, Date.now());

  c.set("hotkey", hotkey);

  await next();
});

/**
 * Legacy API key auth -- DEPRECATED, kept only for non-ingest admin routes.
 * Not used on ingest endpoints.
 */
export const apiKeyAuth = createMiddleware(async (c, next) => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) {
    await next();
    return;
  }

  const provided = c.req.header("x-api-key");
  if (provided !== apiKey) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});
