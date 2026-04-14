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
};

function sendJson(ws: WsLike, data: unknown) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

export function handleDashboard(ws: WsLike) {
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
