export interface IngestClient {
  ws: { readyState: number; OPEN: number; send: (data: string) => void; close: (code?: number, reason?: string) => void };
  hotkey: string;
  uid: number | null;
  role: string;
  runId: number;
  externalRunId: string;
  lastHeartbeat: number;
  authenticated: boolean;
}

export interface LivenessEntry {
  hotkey: string;
  uid: number | null;
  role: string;
  status: "online" | "offline";
}

type WsLike = { readyState: number; OPEN: number; send: (data: string) => void };

const ingestClients = new Map<string, IngestClient>();
const dashboardSubscribers = new Set<WsLike>();

function sendJson(ws: WsLike, data: unknown) {
  try {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(data));
    }
  } catch {}
}

export function broadcastToDashboard(event: string, data: unknown) {
  const msg = { event, ...((data && typeof data === "object") ? data : { data }) };
  for (const ws of dashboardSubscribers) {
    sendJson(ws, msg);
  }
}

export function registerIngestClient(hotkey: string, client: IngestClient) {
  ingestClients.set(hotkey, client);
  broadcastToDashboard("liveness", {
    hotkey: client.hotkey,
    uid: client.uid,
    role: client.role,
    status: "online",
  });
}

export function unregisterIngestClient(hotkey: string) {
  const client = ingestClients.get(hotkey);
  if (client) {
    ingestClients.delete(hotkey);
    broadcastToDashboard("liveness", {
      hotkey: client.hotkey,
      uid: client.uid,
      role: client.role,
      status: "offline",
    });
  }
}

export function updateHeartbeat(hotkey: string) {
  const client = ingestClients.get(hotkey);
  if (client) {
    client.lastHeartbeat = Date.now();
  }
}

export function getIngestClient(hotkey: string): IngestClient | undefined {
  return ingestClients.get(hotkey);
}

export function addDashboardSubscriber(ws: WsLike) {
  dashboardSubscribers.add(ws);
}

export function removeDashboardSubscriber(ws: WsLike) {
  dashboardSubscribers.delete(ws);
}

export function getLivenessSnapshot(): LivenessEntry[] {
  const entries: LivenessEntry[] = [];
  for (const client of ingestClients.values()) {
    entries.push({
      hotkey: client.hotkey,
      uid: client.uid,
      role: client.role,
      status: "online",
    });
  }
  return entries;
}

// Heartbeat timeout. The Python reporter sends every 15s, but the
// asyncio loop on the miner is shared with the training thread --
// during a 12-second CUDA-bound inner step the event loop barely
// runs, so the heartbeat task can be late. With the previous 30s
// threshold (only 2x the heartbeat interval) the server was killing
// the WS during normal training and the client got stuck retrying
// (and eventually permanently disabled, see DashboardReporter
// _ws_max_failures). Bump to 120s -- 8x heartbeat interval -- so
// even multi-step asyncio pauses don't trigger a disconnect.
const HEARTBEAT_TIMEOUT_MS = 120_000;

setInterval(() => {
  const now = Date.now();
  for (const [hotkey, client] of ingestClients) {
    if (now - client.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
      console.log(`[ws-hub] heartbeat timeout for ${hotkey}, disconnecting`);
      try { client.ws.close(4002, "Heartbeat timeout"); } catch {}
      unregisterIngestClient(hotkey);
    }
  }
}, 10_000);
