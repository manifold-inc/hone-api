declare module "ws" {
  import { Server as HttpServer } from "http";
  import { IncomingMessage } from "http";
  import { Duplex } from "stream";

  class WebSocket {
    static readonly OPEN: number;
    readonly readyState: number;
    readonly OPEN: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: string, cb: (...args: unknown[]) => void): void;
  }

  class WebSocketServer {
    constructor(options: { noServer: boolean });
    handleUpgrade(
      req: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      cb: (ws: WebSocket) => void
    ): void;
  }

  export { WebSocket, WebSocketServer };
}
