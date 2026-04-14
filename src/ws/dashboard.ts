import {
  addDashboardSubscriber,
  removeDashboardSubscriber,
  getLivenessSnapshot,
} from "../lib/ws-hub.js";

type WsLike = {
  readyState: number;
  OPEN: number;
  send: (data: string) => void;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  close: (code?: number, reason?: string) => void;
};

function sendJson(ws: WsLike, data: unknown) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

const dashboardToken = process.env.DASHBOARD_TOKEN || "";

export function handleDashboard(ws: WsLike) {
  if (!dashboardToken) {
    activateSubscriber(ws);
    return;
  }

  const authTimeout = setTimeout(() => {
    sendJson(ws, { error: "Auth timeout" });
    ws.close(4001, "Auth timeout");
  }, 10_000);

  ws.on("message", (raw: unknown) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === "auth") {
        if (msg.token === dashboardToken) {
          clearTimeout(authTimeout);
          activateSubscriber(ws);
          sendJson(ws, { type: "auth-ok" });
        } else {
          sendJson(ws, { error: "Invalid token" });
          ws.close(4001, "Bad token");
        }
        return;
      }
      if (msg.type === "ping") {
        sendJson(ws, { type: "pong" });
      }
    } catch {}
  });

  ws.on("close", () => clearTimeout(authTimeout));
  ws.on("error", () => clearTimeout(authTimeout));
}

function activateSubscriber(ws: WsLike) {
  addDashboardSubscriber(ws);

  sendJson(ws, {
    event: "liveness-snapshot",
    clients: getLivenessSnapshot(),
  });

  ws.on("message", (raw: unknown) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === "ping") {
        sendJson(ws, { type: "pong" });
      }
    } catch {}
  });

  ws.on("close", () => {
    removeDashboardSubscriber(ws);
  });

  ws.on("error", () => {
    removeDashboardSubscriber(ws);
  });
}
