import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ingest } from "./routes/ingest.js";
import { runs } from "./routes/runs.js";
import { stats } from "./routes/stats.js";
import { stream } from "./routes/stream.js";

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
app.route("/api/runs", runs);
app.route("/api/stats", stats);
app.route("/api/stream", stream);

app.get("/health", (c) => c.json({ status: "ok" }));

import { startRetentionJob } from "./lib/retention.js";

const port = parseInt(process.env.PORT || "3001");

startRetentionJob();

console.log(`hone-api listening on port ${port}`);
serve({ fetch: app.fetch, port });
