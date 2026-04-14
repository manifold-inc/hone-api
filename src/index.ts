import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ingest } from "./routes/ingest.js";
import { runs } from "./routes/runs.js";
import { stats } from "./routes/stats.js";
import { handleIngest } from "./ws/ingest.js";
import { handleDashboard } from "./ws/dashboard.js";
import { startRetentionJob } from "./lib/retention.js";
import { startRedisConsumer } from "./lib/redis-consumer.js";
import { apiKeyAuth } from "./middleware/auth.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-api-key", "x-hotkey", "x-nonce", "x-signature"],
  })
);

app.route("/ingest", ingest);
app.use("/api/*", apiKeyAuth);
app.route("/api/runs", runs);
app.route("/api/stats", stats);

app.get("/health", (c) => c.json({ status: "ok" }));

const port = parseInt(process.env.PORT || "3001");

startRetentionJob();
startRedisConsumer().catch((e) => {
  console.error("[redis-consumer] Failed to start:", e);
});

const httpServer = serve({ fetch: app.fetch, port });

async function setupWebSockets() {
  // Dynamic import to avoid TS errors when types aren't installed yet
  const { WebSocketServer } = await import("ws");
  const wss = new WebSocketServer({ noServer: true });

  (httpServer as import("http").Server).on("upgrade", (req, socket, head) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);

    if (url.pathname === "/ws/ingest") {
      wss.handleUpgrade(req, socket, head, (ws) => handleIngest(ws, req));
    } else if (url.pathname === "/ws/dashboard") {
      wss.handleUpgrade(req, socket, head, (ws) => handleDashboard(ws));
    } else {
      socket.destroy();
    }
  });

  console.log("[ws] WebSocket upgrade handler registered");
}

setupWebSockets().catch((e) => {
  console.error("[ws] Failed to setup WebSocket server:", e);
  console.log("[ws] Falling back to HTTP-only mode");
});

console.log(`hone-api listening on port ${port} (HTTP + WebSocket)`);
