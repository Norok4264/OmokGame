import type { RuleGameState } from "@danpan/shared";
import { PROTOCOL_VERSION } from "@danpan/shared";

export type LobbyState = {
  me: { playerId: string; nickname: string; state: string };
  players: Array<{ playerId: string; nickname: string; state: string }>;
  challenges: Array<{ challengeId: string; applicantPlayerId: string; acceptorPlayerId: string; status: string; responseDeadlineUtc: string }>;
  game: Omit<RuleGameState, "status"> & { revision: number; turnDeadlineUtc?: string | null; endReason?: string | null; gameId: string; status: string; color: "WHITE" | "BLACK"; opponentName: string; deadlineUtc?: string; countdownStartedAtUtc?: string | null; ready?: { white: boolean; black: boolean } } | null;
  serverTimeUtc: string;
};

export type SavedSession = { playerId: string; nickname: string; token: string };
export type LobbyStatus = "connecting" | "connected" | "reconnecting" | "failed" | "ended";

const STORAGE_KEY = "danpan-omok-session-v1";

export function loadSavedSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedSession>;
    if (typeof value.playerId !== "string" || typeof value.nickname !== "string" || typeof value.token !== "string") return null;
    return value as SavedSession;
  } catch { return null; }
}

export function clearSavedSession(): void { sessionStorage.removeItem(STORAGE_KEY); }

export class LobbyClient {
  private socket: WebSocket | null = null;
  private stopped = false;
  private reconnecting = false;
  private heartbeat: number | null = null;
  private readonly commands = new Map<string, { resolve: (value: Record<string, unknown>) => void; reject: (reason: Error) => void; timer: number }>();
  private readonly listeners = new Set<(message: Record<string, unknown>) => void>();
  onStatus: (status: LobbyStatus, detail?: string) => void = () => {};
  onSnapshot: (snapshot: LobbyState) => void = () => {};
  onSession: (session: SavedSession, resumed: boolean) => void = () => {};

  subscribe(listener: (message: Record<string, unknown>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async start(nickname: string, saved: SavedSession | null = null): Promise<SavedSession> {
    this.stopped = false;
    this.onStatus("connecting");
    return this.openAndAuthenticate(nickname, saved);
  }

  request(type: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return Promise.reject(new Error("서버와 연결되어 있지 않습니다."));
    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.commands.delete(requestId);
        reject(new Error("서버 응답 시간이 초과되었습니다. 연결을 확인하고 다시 시도하세요."));
      }, 8_000);
      this.commands.set(requestId, { resolve, reject, timer });
      socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, type, requestId, ...body }));
    });
  }

  stop(): void {
    this.stopped = true;
    this.reconnecting = false;
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const [id, command] of this.commands) {
      window.clearTimeout(command.timer);
      command.reject(new Error("세션이 종료되었습니다."));
      this.commands.delete(id);
    }
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, "User ended session");
    this.onStatus("ended");
  }

  private async openAndAuthenticate(nickname: string, saved: SavedSession | null): Promise<SavedSession> {
    const startedAt = Date.now();
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(`${scheme}//${window.location.host}/ws`);
    this.socket = socket;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        error ? reject(error) : resolve();
      };
      const timer = window.setTimeout(() => finish(new Error("8초 안에 서버에 연결하지 못했습니다. 네트워크를 확인하고 재시도하거나 혼자 놀기를 선택하세요.")), 8_000);
      socket.addEventListener("open", () => {
        socket.addEventListener("message", (event) => {
          const message = this.parse(event.data);
          if (!message) return;
          if (message.type === "server.hello") finish();
          this.handleMessage(message);
        });
        socket.addEventListener("error", () => finish(new Error("서버 연결에 실패했습니다. 재시도하거나 혼자 놀기를 선택하세요.")));
        socket.addEventListener("close", (event) => {
          window.clearTimeout(timer);
          if (!settled) finish(new Error(event.code === 4001 ? "서버 최초 인증 시간이 초과되었습니다." : "서버 연결이 닫혔습니다. 재시도해 주세요."));
          this.onSocketClose(socket);
        });
      }, { once: true });
      socket.addEventListener("error", () => finish(new Error("서버 연결에 실패했습니다. 네트워크를 확인하고 재시도하세요.")), { once: true });
      socket.addEventListener("open", () => window.clearTimeout(timer), { once: true });
    });
    if (Date.now() - startedAt >= 8_000) throw new Error("최초 인증에 8초가 넘게 걸렸습니다. 다시 시도해 주세요.");
    const requestId = crypto.randomUUID();
    socket.send(JSON.stringify(saved
      ? { protocolVersion: PROTOCOL_VERSION, type: "session.resume", requestId, token: saved.token }
      : { protocolVersion: PROTOCOL_VERSION, type: "session.start", requestId, nickname }));
    const result = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        reject(new Error("세션 인증이 8초 안에 끝나지 않았습니다. 다시 시도하세요."));
      }, Math.max(1, 8_000 - (Date.now() - startedAt)));
      const onMessage = (message: Record<string, unknown>) => {
        if (message.requestId !== requestId || (message.type !== "command.result" && message.type !== "server.error")) return;
        window.clearTimeout(timer);
        this.listeners.delete(onMessage);
        if (message.type === "server.error") reject(new Error(String(message.message ?? "인증에 실패했습니다.")));
        else resolve(message);
      };
      this.listeners.add(onMessage);
    });
    const data = result.data as { session: SavedSession; resumed: boolean };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data.session));
    this.onSession(data.session, data.resumed);
    this.onStatus("connected");
    this.beginHeartbeat();
    void this.request("lobby.snapshot.request");
    return data.session;
  }

  private handleMessage(message: Record<string, unknown>): void {
    if (message.type === "command.result" && (message.data as any)?.snapshot) { void this.request("lobby.snapshot.request").catch(() => {}); }
    if (message.type === "command.result" || message.type === "server.error") {
      const requestId = String(message.requestId ?? "");
      const command = this.commands.get(requestId);
      if (command) {
        window.clearTimeout(command.timer);
        this.commands.delete(requestId);
        if (message.type === "server.error") command.reject(new Error(String(message.message ?? "요청이 거절되었습니다.")));
        else command.resolve(message.data as Record<string, unknown>);
      }
    }
    if (message.type === "lobby.snapshot" && message.snapshot && typeof message.snapshot === "object") {
      this.onSnapshot(message.snapshot as LobbyState);
    }
    for (const listener of this.listeners) listener(message);
  }

  private parse(data: unknown): Record<string, unknown> | null {
    try { const value: unknown = JSON.parse(String(data)); return value && typeof value === "object" ? value as Record<string, unknown> : null; }
    catch { return null; }
  }

  private beginHeartbeat(): void {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = window.setInterval(() => {
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      const requestId = crypto.randomUUID();
      this.socket.send(JSON.stringify({ protocolVersion: PROTOCOL_VERSION, type: "heartbeat", requestId, sentAtUtc: new Date().toISOString() }));
    }, 10_000);
  }

  private onSocketClose(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.socket = null;
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
    if (!this.stopped) {
      this.onStatus("reconnecting", "연결이 끊겨 복귀 유예 시간 동안 세션 복구를 시도합니다.");
      if (!this.reconnecting) void this.reconnect();
    }
  }

  private async reconnect(): Promise<void> {
    this.reconnecting = true;
    const until = Date.now() + 11_000;
    while (!this.stopped && Date.now() < until) {
      await new Promise((resolve) => window.setTimeout(resolve, 800));
      const session = loadSavedSession();
      if (!session) break;
      try {
        await this.openAndAuthenticate("", session);
        this.reconnecting = false;
        return;
      } catch { /* keep trying during the server reconnect grace */ }
    }
    this.reconnecting = false;
    if (!this.stopped) this.onStatus("failed", "세션 복구 시간이 끝났습니다. 재시도하거나 혼자 놀기를 선택하세요.");
  }
}
