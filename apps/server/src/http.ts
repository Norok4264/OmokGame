import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { PROTOCOL_VERSION, parseClientJson, type ClientMessage, type RequestId, type UtcInstant } from "@danpan/shared";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import type { SqliteDatabase } from "./storage/database.js";
import { isDatabaseReady } from "./storage/database.js";

export interface ApplicationServer {
  httpServer: Server;
  webSocketServer: WebSocketServer;
}

function respondJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

function handleHttpRequest(request: IncomingMessage, response: ServerResponse, db: SqliteDatabase): void {
  const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
  if (request.method === "GET" && pathname === "/healthz") {
    respondJson(response, 200, { status: "ok", service: "danpan-omok-server" });
    return;
  }

  if (request.method === "GET" && pathname === "/readyz") {
    const ready = isDatabaseReady(db);
    respondJson(response, ready ? 200 : 503, {
      status: ready ? "ready" : "not-ready",
      checks: { sqlite: ready },
    });
    return;
  }

  respondJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found" } });
}

function sendError(socket: WebSocket, requestId: RequestId | null, code: string, message: string): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    type: "server.error",
    requestId,
    ok: false,
    code,
    message,
    snapshot: null,
  }));
}

function sendCommandResult(socket: WebSocket, requestId: RequestId, data: Record<string, unknown>): void {
  socket.send(JSON.stringify({
    protocolVersion: PROTOCOL_VERSION,
    type: "command.result",
    requestId,
    ok: true,
    data,
  }));
}

function rawDataToBuffer(data: RawData): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data);
  if (Buffer.isBuffer(data)) return data;
  return Buffer.from(data);
}

function handleClientMessage(socket: WebSocket, raw: Buffer): void {
  const parsed = parseClientJson(raw.toString("utf8"));
  if (!parsed.ok) {
    sendError(socket, null, parsed.error.code, parsed.error.message);
    return;
  }

  const message: ClientMessage = parsed.value;
  if (message.type === "client.hello") {
    sendCommandResult(socket, message.requestId, { accepted: true, protocolVersion: PROTOCOL_VERSION });
    return;
  }
  if (message.type === "heartbeat") {
    socket.send(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      type: "heartbeat.ack",
      requestId: message.requestId,
      serverTimeUtc: new Date().toISOString() as UtcInstant,
    }));
    return;
  }

  sendError(socket, message.requestId, "NOT_IMPLEMENTED", "Application commands are added in later stages");
}

export function createApplicationServer(db: SqliteDatabase): ApplicationServer {
  const httpServer = createServer((request, response) => handleHttpRequest(request, response, db));
  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024, perMessageDeflate: false });

  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (socket) => {
    socket.send(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      type: "server.hello",
      serverBuild: "0.1.0",
      serverTimeUtc: new Date().toISOString() as UtcInstant,
    }));
    socket.on("message", (data) => handleClientMessage(socket, rawDataToBuffer(data)));
  });

  return { httpServer, webSocketServer };
}
