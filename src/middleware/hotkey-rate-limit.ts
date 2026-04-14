import { createMiddleware } from "hono/factory";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = parseInt(process.env.HOTKEY_RATE_LIMIT || "60");

const hotkeyHits = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of hotkeyHits) {
    if (entry.resetAt <= now) hotkeyHits.delete(key);
  }
}, 30_000);

/**
 * Per-hotkey rate limiter. Runs AFTER auth so the hotkey is verified.
 * Limits each hotkey to MAX_REQUESTS per minute regardless of IP.
 */
export const hotkeyRateLimiter = createMiddleware(async (c, next) => {
  const hotkey = c.req.header("x-hotkey");
  if (!hotkey) {
    await next();
    return;
  }

  const now = Date.now();
  let entry = hotkeyHits.get(hotkey);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    hotkeyHits.set(hotkey, entry);
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    return c.json({ error: "Hotkey rate limit exceeded" }, 429);
  }

  await next();
});
