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

const HEARTBEAT_TIMEOUT_MS = 30_000;

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
