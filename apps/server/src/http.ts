import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import type { SqliteDatabase } from "./storage/database.js";
import { isDatabaseReady } from "./storage/database.js";
import { LobbyCoordinator, type LobbyTiming } from "./lobby.js";
import { reconcileUnfinished } from "./storage/recovery.js";
import { runMigrations } from "./storage/migrations.js";
import { DEVELOPMENT_ORIGINS, LIMITS } from "./limits.js";
import { purgeExpiredRecords } from "./storage/retention.js";

export interface ApplicationServer {
  httpServer: Server;
  webSocketServer: WebSocketServer;
  lobby: LobbyCoordinator;
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function handleHttpRequest(request: IncomingMessage, response: ServerResponse, db: SqliteDatabase, available: () => boolean): void {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (request.method === "GET" && pathname === "/healthz") {
    respondJson(response, 200, { status: "ok", service: "danpan-omok-server" });
    return;
  }

  if (request.method === "GET" && pathname === "/readyz") {
    const ready = available() && isDatabaseReady(db);
    respondJson(response, ready ? 200 : 503, {
      status: ready ? "ready" : "not-ready",
      checks: { sqlite: ready },
    });
    return;
  }

  respondJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
}

export function createApplicationServer(db: SqliteDatabase, timing?: LobbyTiming, allowedOrigins: readonly string[] = DEVELOPMENT_ORIGINS): ApplicationServer {
  runMigrations(db);
  reconcileUnfinished(db); // before listen/upgrade/readiness are exposed
  purgeExpiredRecords(db);
  const httpServer = createServer((request, response) => handleHttpRequest(request, response, db, () => lobby.isReady()));
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: LIMITS.inputBytes, perMessageDeflate: false });

  httpServer.on("upgrade", (request, socket, head) => {
    if(!request.headers.origin || !allowedOrigins.includes(request.headers.origin)){
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");return;
    }
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/ws" || !lobby.isReady()) {
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  const lobby = new LobbyCoordinator(db, webSocketServer, timing);

  return { httpServer, webSocketServer, lobby };
}
