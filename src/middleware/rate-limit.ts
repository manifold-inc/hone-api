import { createMiddleware } from "hono/factory";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_RPM || "100");

const ipHits = new Map<string, { count: number; resetAt: number }>();

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipHits) {
    if (entry.resetAt <= now) ipHits.delete(ip);
  }
}, 30_000);

/**
 * Simple per-IP rate limiter applied before expensive auth middleware.
 * 100 req/min per IP by default, configurable via RATE_LIMIT_RPM.
 */
export const rateLimiter = createMiddleware(async (c, next) => {
  const ip =
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown";

  const now = Date.now();
  let entry = ipHits.get(ip);

  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    ipHits.set(ip, entry);
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    c.header("Retry-After", String(Math.ceil((entry.resetAt - now) / 1000)));
    return c.json({ error: "Rate limit exceeded" }, 429);
  }

  await next();
});
