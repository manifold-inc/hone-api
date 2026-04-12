import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ingest } from "./routes/ingest.js";
import { runs } from "./routes/runs.js";
import { stats } from "./routes/stats.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-api-key"],
  })
);

app.route("/ingest", ingest);
app.route("/api/runs", runs);
app.route("/api/stats", stats);

app.get("/health", (c) => c.json({ status: "ok" }));

const port = parseInt(process.env.PORT || "3001");

console.log(`hone-api listening on port ${port}`);
serve({ fetch: app.fetch, port });
