import { OnlineGames } from "./online-game.js";
import { Rooms } from "./rooms.js";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { createRuleGame, parseClientMessage, PROTOCOL_VERSION, validateNickname, roomErrorMessage } from "@danpan/shared";
import type { ClientMessage } from "@danpan/shared";
import { WebSocket, type WebSocketServer } from "ws";
import type { SqliteDatabase } from "./storage/database.js";
import { LIMITS, admitRequest, assertGameCapacity, sendBounded } from "./limits.js";
import { purgeExpiredRecords } from "./storage/retention.js";

export interface LobbyTiming {
  authTimeoutMs: number;
  reconnectGraceMs: number;
  sessionLifetimeMs: number;
  challengeLifetimeMs: number;
  sameTargetCooldownMs: number;
  preparationLifetimeMs: number;
  startCountdownMs: number;
}

export const DEFAULT_LOBBY_TIMING: LobbyTiming = {
  authTimeoutMs: 5_000,
  reconnectGraceMs: 60_000,
  sessionLifetimeMs: 24 * 60 * 60 * 1_000,
  challengeLifetimeMs: 30_000,
  sameTargetCooldownMs: 10_000,
  preparationLifetimeMs: 10_000,
  startCountdownMs: 3_000,
};

type PlayerId = string;
type Session = { playerId: PlayerId; tokenHash: string };
type SocketState = { playerId: PlayerId | null; resultGameId?:string; authTimer: NodeJS.Timeout; helloSeen: boolean; lastValid: number; lastHeartbeat: number };
type PlayerSummary = { playerId: string; nickname: string; state: "WAITING" | "RESPONDING" | "IN_GAME" | "RECONNECTING" };
type LobbySnapshot = {
  me: { playerId: string; nickname: string; state: PlayerSummary["state"] };
  players: PlayerSummary[];
  challenges: Array<{ challengeId: string; applicantPlayerId: string; acceptorPlayerId: string; status: string; responseDeadlineUtc: string }>;
  game: { gameId: string; status: string; color: "WHITE" | "BLACK"; opponentName: string; deadlineUtc?: string; countdownStartedAtUtc?: string | null; ready?: { white: boolean; black: boolean } } | null;
  serverTimeUtc: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function send(socket: WebSocket, message: Record<string, unknown>): void {
  sendBounded(socket,{ protocolVersion: PROTOCOL_VERSION, ...message });
}

function sendError(socket: WebSocket, requestId: string | null, code: string, message: string): void {
  send(socket, { type: "server.error", requestId, ok: false, code, message, snapshot: null });
}

function sendResult(socket: WebSocket, requestId: string, data: Record<string, unknown>): void {
  send(socket, { type: "command.result", requestId, ok: true, data });
}

function requestHash(message: ClientMessage): string {
  return createHash("sha256").update(JSON.stringify(message)).digest("hex");
}

export class LobbyCoordinator {
  private readonly rooms: Rooms;
  private readonly online: OnlineGames;
  private storageReady = true;
  private closed = false;
  private readonly sockets = new Map<WebSocket, SocketState>();
  private readonly playerSockets = new Map<PlayerId, WebSocket>();
  private readonly graceTimers = new Map<PlayerId, NodeJS.Timeout>();
  private readonly sweepTimer: NodeJS.Timeout;
  private readonly countdownTimers = new Map<string, NodeJS.Timeout>();
  private readonly challengeDeadlines = new Map<string, number>();
  private readonly preparationDeadlines = new Map<string, number>();
  private readonly countdownDeadlines = new Map<string, number>();
  private readonly requestWindows=new Map<PlayerId,number[]>();
  private readonly unauthWindows=new WeakMap<WebSocket,number[]>();
  private nextPurge=0;

  constructor(private readonly db: SqliteDatabase, private readonly wss: WebSocketServer, private readonly timing: LobbyTiming = DEFAULT_LOBBY_TIMING) {
    this.rooms = new Rooms(db, p => this.playerSockets.has(p), () => this.broadcastSnapshots(), timing.preparationLifetimeMs);
    this.online = new OnlineGames(db, id => {
      if(!id){this.broadcastSnapshots();return;}
      const row=this.db.prepare("SELECT white_player_id,black_player_id FROM games WHERE game_id=?").get(id) as {white_player_id:string;black_player_id:string};
      for(const player of [row.white_player_id,row.black_player_id]){const socket=this.playerSockets.get(player);if(socket)this.sendSnapshot(socket,player);}
    });
    const monotonicNow = performance.now();
    const utcNow = Date.now();
    const pending = this.db.prepare("SELECT challenge_id,response_deadline_utc FROM challenges WHERE status='PENDING'").all() as Array<{ challenge_id: string; response_deadline_utc: string }>;
    for (const item of pending) this.challengeDeadlines.set(item.challenge_id, monotonicNow + Math.max(0, Date.parse(item.response_deadline_utc) - utcNow));
    const preparations = this.db.prepare("SELECT game_id,deadline_utc,countdown_started_at_utc FROM game_preparation").all() as
      Array<{ game_id: string; deadline_utc: string; countdown_started_at_utc: string | null }>;
    for (const item of preparations) {
      this.preparationDeadlines.set(item.game_id, monotonicNow + Math.max(0, Date.parse(item.deadline_utc) - utcNow));
      if (item.countdown_started_at_utc) this.countdownDeadlines.set(item.game_id, monotonicNow + Math.max(0, this.timing.startCountdownMs - (utcNow - Date.parse(item.countdown_started_at_utc))));
    }
    this.sweepTimer = setInterval(() => { try { this.sweep(); } catch { this.online.markUnavailable(); } }, 250);
    this.sweepTimer.unref();
    wss.on("connection", (socket, request) => this.attach(socket, request));
  }

  close(): void {
    this.closed = true;
    clearInterval(this.sweepTimer);
    for (const timer of this.graceTimers.values()) clearTimeout(timer);
    for (const timer of this.countdownTimers.values()) clearTimeout(timer);
    for (const state of this.sockets.values()) clearTimeout(state.authTimer);
    this.graceTimers.clear();
    this.countdownTimers.clear();
  }

  private attach(socket: WebSocket, _request: IncomingMessage): void {
    send(socket, { type: "server.hello", serverBuild: "0.1.0", serverTimeUtc: new Date().toISOString() });
    const state: SocketState = { playerId: null, helloSeen: false, lastValid: performance.now(), lastHeartbeat: performance.now(), authTimer: setTimeout(() => {
      if (state.playerId === null) socket.close(4001, "Authentication timeout");
    }, this.timing.authTimeoutMs) };
    state.authTimer.unref();
    this.sockets.set(socket, state);
    socket.on("message", (raw) => { try { this.onMessage(socket, state, raw.toString()); } catch { this.online.markUnavailable(); sendError(socket, null, "STORAGE_UNAVAILABLE", "저장소 장애로 대국 처리를 중지했습니다."); } });
    socket.on("close", () => { try { this.onClose(socket, state); } catch { this.online.markUnavailable(); } });
    socket.on("error", () => socket.close());
  }

  private onMessage(socket: WebSocket, state: SocketState, raw: string): void {
    if(this.closed)return;
    if (state.playerId && this.playerSockets.get(state.playerId) !== socket) return;
    const history=state.playerId ? this.requestWindows.get(state.playerId)??[] : this.unauthWindows.get(socket)??[];
    if(state.playerId)this.requestWindows.set(state.playerId,history);else this.unauthWindows.set(socket,history);
    if(!admitRequest(history,performance.now())){sendError(socket,null,"RATE_LIMITED","10초에 100건까지 요청할 수 있습니다. 잠시 후 상태를 조회하세요.");return;}
    if (!this.isReady()) { sendError(socket, null, "STORAGE_UNAVAILABLE", "저장소 복구를 기다립니다."); return; }
    this.sweep();
    if (state.playerId && this.playerSockets.get(state.playerId) !== socket) return;
    let message: ClientMessage;
    try {
      const value: unknown = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid message");
      const input = value as Record<string, unknown>;
      if (input.protocolVersion !== PROTOCOL_VERSION || typeof input.type !== "string" || typeof input.requestId !== "string" || !input.requestId || input.requestId.length>128) throw new Error("invalid envelope");
      if(state.resultGameId){
        if(!this.db.prepare("SELECT 1 FROM games WHERE game_id=? AND ended_at_utc>?").get(state.resultGameId,new Date(Date.now()-LIMITS.retentionMs).toISOString())){socket.close(4004,"Stored result expired");return;}
        if(input.type==="game.result.leave"){this.endSession(socket,state,input.requestId);return;}
        const allowed=["heartbeat","session.end","lobby.snapshot.request","game.snapshot.request"];
        if(!allowed.includes(input.type)||(input.type==="game.snapshot.request"&&input.gameId!==state.resultGameId)){sendError(socket,input.requestId,"RESULT_QUERY_ONLY","보관 결과 조회 전용입니다. 새 이용은 홈에서 시작하세요.");return;}
      }
      if (["game.result.leave", "game.retry.request", "game.retry.cancel", "game.retry.respond", "chat.send"].includes(String(input.type))) {
        if (!state.playerId) { sendError(socket,input.requestId,"AUTH_REQUIRED","세션 인증이 필요합니다."); return; }
        if (!input.requestId || input.requestId.length>128 || typeof input.gameId !== "string" || !input.gameId || input.gameId.length>128) throw new Error("invalid room envelope");
        state.lastValid=performance.now();
        try {
          const result=this.rooms.command(state.playerId,input);
          if (typeof result.newGameId === "string") {
            const prep=this.db.prepare("SELECT deadline_utc FROM game_preparation WHERE game_id=?").get(result.newGameId) as {deadline_utc:string}|undefined;
            if(prep && !this.preparationDeadlines.has(result.newGameId)) this.preparationDeadlines.set(result.newGameId,performance.now()+Math.max(0,Date.parse(prep.deadline_utc)-Date.now()));
          }
          sendResult(socket,input.requestId,result);
        } catch(error) {
          if(error && typeof error === "object" && "code" in error && String(error.code).startsWith("SQLITE")) this.online.markUnavailable();
          const code=error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "ROOM_OPERATION_FAILED";
          const wait=error&&typeof error==="object"&&"retryAfterMs" in error?Number(error.retryAfterMs):0;
          sendError(socket,input.requestId,code,roomErrorMessage(code)+(wait>0?` 약 ${Math.ceil(wait/1000)}초 후 재시도하세요.`:""));
          this.sendSnapshot(socket,state.playerId);
        }
        return;
      }
      if (["game.move.propose", "game.resign", "game.snapshot.request"].includes(String(input.type))) {
        if (!input.requestId || input.requestId.length > 128 || typeof input.gameId !== "string" || !input.gameId || input.gameId.length > 128) throw new Error("invalid game envelope");
        if (!state.playerId) { sendError(socket, input.requestId as string, "AUTH_REQUIRED", "세션 인증이 필요합니다."); return; }
        state.lastValid = performance.now();
        try { sendResult(socket, input.requestId as string, this.online.command(state.playerId, input)); }
        catch (error) { if (error && typeof error === "object" && "code" in error && String(error.code).startsWith("SQLITE")) this.online.markUnavailable(); send(socket, { type: "server.error", requestId: input.requestId, ok: false, code: error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : "STORAGE_FAILED", message: "요청을 승인하지 못했습니다. 최신 상태를 확인하세요.", snapshot: null }); this.sendSnapshot(socket, state.playerId); }
        return;
      }
      if (input.type === "client.hello") {
        state.helloSeen = true;
        sendResult(socket, input.requestId as string, { accepted: true, protocolVersion: PROTOCOL_VERSION });
        return;
      }
      if (input.type === "session.start" && typeof input.nickname === "string" && input.nickname.length <= 80) message = input as unknown as ClientMessage;
      else if (input.type === "session.resume" && typeof input.token === "string" && input.token.length >= 40 && input.token.length <= 256) message = input as unknown as ClientMessage;
      else if (input.type === "session.end" && input.protocolVersion === PROTOCOL_VERSION) message = input as unknown as ClientMessage;
      else {
        const parsed = parseClientMessage(input);
        if (!parsed.ok) { sendError(socket, input.requestId as string, parsed.error.code, parsed.error.message); return; }
        message = parsed.value;
      }
    } catch {
      sendError(socket, null, "INVALID_MESSAGE", "요청 형식이 올바르지 않습니다.");
      return;
    }

    state.lastValid = performance.now();
    if (message.type === "session.start") { this.startSession(socket, state, message.requestId, message.nickname); return; }
    if (message.type === "session.resume") { this.resumeSession(socket, state, message.requestId, message.token); return; }
    if (message.type === "heartbeat") {
      send(socket, { type: "heartbeat.ack", requestId: message.requestId, serverTimeUtc: new Date().toISOString() });
      return;
    }
    if (!state.playerId) { sendError(socket, message.requestId, "AUTH_REQUIRED", "먼저 세션을 인증해 주세요."); return; }
    if (message.type === "session.end") { this.endSession(socket, state, message.requestId); return; }
    if (message.type === "lobby.snapshot.request") {
      this.sendSnapshot(socket, state.playerId);
      sendResult(socket, message.requestId, { accepted: true });
      return;
    }
    if (message.type === "challenge.create") { this.createChallenge(socket, state.playerId, message.requestId, String(message.targetPlayerId)); return; }
    if (message.type === "challenge.cancel") { this.cancelChallenge(socket, state.playerId, message.requestId, String(message.challengeId)); return; }
    if (message.type === "challenge.respond") { this.respondChallenge(socket, state.playerId, message.requestId, String(message.challengeId), message.accept); return; }
    if (message.type === "game.cancel") { this.cancelPreparingGame(socket, state.playerId, message.requestId, String(message.gameId)); return; }
    if (message.type === "game.ready") { this.readyGame(socket, state.playerId, message.requestId, String(message.gameId)); return; }
    sendError(socket, message.requestId, "NOT_IMPLEMENTED", "이 대국 명령은 아직 연결되지 않았습니다.");
  }

  private startSession(socket: WebSocket, state: SocketState, requestId: string, input: string): void {
    if (state.playerId) { sendError(socket, requestId, "SESSION_ALREADY_AUTHENTICATED", "이미 인증된 세션입니다."); return; }
    if(new Set([...this.playerSockets.keys(),...this.graceTimers.keys()]).size>=LIMITS.sessions){sendError(socket,requestId,"SESSION_CAPACITY","온라인 40세션이 사용 중입니다. 잠시 후 재시도하거나 혼자 놀기를 이용하세요.");return;}
    const now = new Date();
    const nowIso = now.toISOString();
    const normalized = input.trim() ? validateNickname(input) : null;
    if (normalized && !normalized.ok) { sendError(socket, requestId, normalized.code, normalized.message); return; }
    const playerId = randomUUID();
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const sessionId = randomUUID();
    try {
      const transaction = this.db.transaction(() => {
        this.releaseExpiredClaims(nowIso);
        let nickname = normalized?.ok ? normalized.display : "";
        let key = normalized?.ok ? normalized.key : "";
        if (!normalized) {
          let number = 1;
          while (this.db.prepare("SELECT 1 FROM players WHERE nickname_key = ?").get(`guest${number}`)) number += 1;
          nickname = `guest${number}`;
          key = nickname;
        }
        if (this.db.prepare("SELECT 1 FROM players WHERE nickname_key = ?").get(key)) throw new LobbyError("NICKNAME_TAKEN", "이미 사용 중인 닉네임입니다. 다른 이름을 입력해 주세요.");
        this.db.prepare("INSERT INTO players(player_id,nickname_key,nickname_display,created_at_utc) VALUES(?,?,?,?)")
          .run(playerId, key, nickname, nowIso);
        this.db.prepare(`INSERT INTO player_sessions(session_id,player_id,token_hash,created_at_utc,expires_at_utc)
          VALUES(?,?,?,?,?)`).run(sessionId, playerId, tokenHash, nowIso, new Date(now.getTime() + this.timing.sessionLifetimeMs).toISOString());
        return nickname;
      });
      const nickname = transaction.immediate() as string;
      this.authenticate(socket, state, playerId);
      sendResult(socket, requestId, { session: { playerId, nickname, token }, resumed: false });
      this.broadcastSnapshots();
    } catch (error) {
      if (error instanceof LobbyError) sendError(socket, requestId, error.code, error.message);
      else sendError(socket, requestId, "SESSION_CREATE_FAILED", "세션을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }

  private resumeSession(socket: WebSocket, state: SocketState, requestId: string, token: string): void {
    if (state.playerId) { sendError(socket, requestId, "SESSION_ALREADY_AUTHENTICATED", "이미 인증된 연결입니다."); return; }
    const row = this.db.prepare(`SELECT ps.player_id, p.nickname_display FROM player_sessions ps
      JOIN players p ON p.player_id=ps.player_id
      WHERE ps.token_hash=? AND ps.result_access_revoked=0 AND ps.ended_at_utc IS NULL AND (ps.expires_at_utc>? OR EXISTS(
        SELECT 1 FROM games g WHERE g.status IN ('PREPARING','ACTIVE') AND (g.white_player_id=ps.player_id OR g.black_player_id=ps.player_id)))`).get(hashToken(token), new Date().toISOString()) as
      | { player_id: string; nickname_display: string } | undefined;
    if(!row){
      const result=this.db.prepare(`SELECT ps.player_id,p.nickname_display,g.game_id FROM player_sessions ps JOIN players p ON p.player_id=ps.player_id
        JOIN games g ON g.white_player_id=ps.player_id OR g.black_player_id=ps.player_id
        WHERE ps.token_hash=? AND ps.result_access_revoked=0 AND g.status IN ('FINISHED','ABORTED') AND g.ended_at_utc>?
        ORDER BY g.ended_at_utc DESC LIMIT 1`).get(hashToken(token),new Date(Date.now()-LIMITS.retentionMs).toISOString()) as {player_id:string;nickname_display:string;game_id:string}|undefined;
      if(result){
        if(new Set([...this.playerSockets.keys(),...this.graceTimers.keys()]).size>=LIMITS.sessions&&!this.playerSockets.has(result.player_id)&&!this.graceTimers.has(result.player_id)){sendError(socket,requestId,"SESSION_CAPACITY","잠시 후 다시 조회하세요.");return;}
        state.resultGameId=result.game_id;this.authenticate(socket,state,result.player_id);
        sendResult(socket,requestId,{session:{playerId:result.player_id,nickname:result.nickname_display,token},resumed:true,resultQueryOnly:true});this.sendSnapshot(socket,result.player_id);return;
      }
    }
    if (!row) { sendError(socket, requestId, "SESSION_INVALID", "저장된 세션을 복구할 수 없습니다. 새 이용을 시작해 주세요."); return; }
    if(!this.playerSockets.has(row.player_id)&&!this.graceTimers.has(row.player_id)&&new Set([...this.playerSockets.keys(),...this.graceTimers.keys()]).size>=LIMITS.sessions){sendError(socket,requestId,"SESSION_CAPACITY","온라인 세션이 가득 찼습니다. 잠시 후 재시도하세요.");return;}
    this.authenticate(socket, state, row.player_id);
    sendResult(socket, requestId, { session: { playerId: row.player_id, nickname: row.nickname_display, token }, resumed: true });
    this.sendSnapshot(socket, row.player_id);
    this.broadcastSnapshots();
  }

  private authenticate(socket: WebSocket, state: SocketState, playerId: string): void {
    this.online.reconnectedPlayer(playerId);
    clearTimeout(state.authTimer);
    state.playerId = playerId;
    const previous = this.playerSockets.get(playerId);
    this.playerSockets.set(playerId, socket);
    if (previous && previous !== socket) previous.close(4002, "Session resumed on a new connection");
    const grace = this.graceTimers.get(playerId);
    if (grace) clearTimeout(grace);
    this.graceTimers.delete(playerId);
  }

  private endSession(socket: WebSocket, state: SocketState, requestId: string): void {
    const playerId = state.playerId;
    if (!playerId) return;
    const nowIso = new Date().toISOString();
    if(state.resultGameId){
      this.db.prepare("UPDATE player_sessions SET result_access_revoked=1 WHERE player_id=?").run(playerId);
      this.playerSockets.delete(playerId);state.playerId=null;delete state.resultGameId;this.requestWindows.delete(playerId);sendResult(socket,requestId,{ended:true});return;
    }
    if(this.db.prepare("SELECT 1 FROM games WHERE status='ACTIVE' AND (white_player_id=? OR black_player_id=?)").get(playerId,playerId)){
      sendError(socket,requestId,"ACTIVE_GAME_REQUIRES_RESIGN","진행 중인 대국은 먼저 기권을 확인하고 결과를 받은 뒤 새 이용을 시작하세요.");return;
    }
    this.terminatePendingState(playerId, nowIso);
    this.db.prepare("UPDATE player_sessions SET ended_at_utc=?,result_access_revoked=1 WHERE player_id=? AND ended_at_utc IS NULL").run(nowIso, playerId);
    this.playerSockets.delete(playerId);
    state.playerId = null;
    this.requestWindows.delete(playerId);
    this.rooms.disconnect(playerId);
    sendResult(socket, requestId, { ended: true });
    this.releasePlayerName(playerId);
    this.broadcastSnapshots();
  }

  private onClose(socket: WebSocket, state: SocketState): void {
    clearTimeout(state.authTimer);
    this.sockets.delete(socket);
    if (this.closed) return;
    const playerId = state.playerId;
    if (!playerId || this.playerSockets.get(playerId) !== socket) return;
    this.playerSockets.delete(playerId);
    this.online.disconnectedPlayer(playerId, this.timing.reconnectGraceMs);
    this.rooms.disconnect(playerId);
    try { this.cancelPreparingGames(playerId); } catch { this.online.markUnavailable(); }
    const timer = setTimeout(() => {
      if (this.graceTimers.get(playerId) !== timer || this.playerSockets.has(playerId)) return;
      this.graceTimers.delete(playerId);
      if (!this.isReady()) return;
      try {
      this.online.sweep();
      const endedAt = new Date().toISOString();
      this.terminatePendingState(playerId, endedAt);
      this.db.prepare("UPDATE player_sessions SET ended_at_utc=? WHERE player_id=? AND ended_at_utc IS NULL").run(endedAt, playerId);
      this.releasePlayerName(playerId);
      this.online.forgetPlayer(playerId);
      this.requestWindows.delete(playerId);
      this.broadcastSnapshots();
      } catch { this.online.markUnavailable(); }
    }, this.timing.reconnectGraceMs);
    timer.unref();
    this.graceTimers.set(playerId, timer);
    this.broadcastSnapshots();
  }

  private terminatePendingState(playerId: string, nowIso: string): void {
    const challengeIds = this.db.prepare("SELECT challenge_id FROM challenges WHERE status='PENDING' AND (applicant_player_id=? OR acceptor_player_id=?)")
      .all(playerId, playerId) as Array<{ challenge_id: string }>;
    const gameIds = this.db.prepare("SELECT game_id FROM games WHERE status='PREPARING' AND (white_player_id=? OR black_player_id=?)")
      .all(playerId, playerId) as Array<{ game_id: string }>;
    const transaction = this.db.transaction(() => {
      this.db.prepare(`UPDATE challenges SET status='CANCELLED',revision=revision+1,updated_at_utc=?
        WHERE status='PENDING' AND (applicant_player_id=? OR acceptor_player_id=?)`).run(nowIso, playerId, playerId);
      this.db.prepare(`UPDATE games SET status='CANCELLED',end_reason=NULL,revision=revision+1,updated_at_utc=?,ended_at_utc=?
        WHERE status='PREPARING' AND (white_player_id=? OR black_player_id=?)`).run(nowIso, nowIso, playerId, playerId);
      this.db.prepare(`DELETE FROM game_preparation WHERE game_id IN
        (SELECT game_id FROM games WHERE status='CANCELLED' AND (white_player_id=? OR black_player_id=?))`).run(playerId, playerId);
    });
    transaction.immediate();
    for (const item of challengeIds) this.challengeDeadlines.delete(item.challenge_id);
    for (const item of gameIds) {
      this.preparationDeadlines.delete(item.game_id);
      this.countdownDeadlines.delete(item.game_id);
    }
  }

  private cancelPreparingGames(playerId: string): void {
    const nowIso = new Date().toISOString();
    const gameIds = this.db.prepare("SELECT game_id FROM games WHERE status='PREPARING' AND (white_player_id=? OR black_player_id=?)")
      .all(playerId, playerId) as Array<{ game_id: string }>;
    const transaction = this.db.transaction(() => {
      this.db.prepare(`UPDATE games SET status='CANCELLED',end_reason=NULL,revision=revision+1,updated_at_utc=?,ended_at_utc=?
        WHERE status='PREPARING' AND (white_player_id=? OR black_player_id=?)`).run(nowIso, nowIso, playerId, playerId);
      this.db.prepare(`DELETE FROM game_preparation WHERE game_id IN
        (SELECT game_id FROM games WHERE status='CANCELLED' AND (white_player_id=? OR black_player_id=?))`).run(playerId, playerId);
    });
    transaction.immediate();
    for (const item of gameIds) {
      this.preparationDeadlines.delete(item.game_id);
      this.countdownDeadlines.delete(item.game_id);
    }
  }

  private createChallenge(socket: WebSocket, actor: string, requestId: string, target: string): void {
    if (actor === target) { sendError(socket, requestId, "SELF_CHALLENGE", "자기 자신에게 신청할 수 없습니다."); return; }
    const now = new Date();
    const nowIso = now.toISOString();
    const challengeId = randomUUID();
    try {
      const transaction = this.db.transaction(() => {
        this.releaseExpiredClaims(nowIso);
        if (!this.playerSockets.has(target)) throw new LobbyError("PLAYER_UNAVAILABLE", "상대가 현재 대기열에 없습니다.");
        const active = this.db.prepare(`SELECT 1 FROM challenges WHERE status='PENDING' AND
          (applicant_player_id=? OR acceptor_player_id=?) LIMIT 1`).get(actor, actor);
        if (active) throw new LobbyError("CHALLENGE_LIMIT", "응답 중인 신청이 있습니다. 먼저 응답하거나 취소해 주세요.");
        const game = this.db.prepare("SELECT 1 FROM games WHERE status IN ('PREPARING','ACTIVE') AND (white_player_id=? OR black_player_id=?) LIMIT 1").get(actor, actor);
        if (game) throw new LobbyError("PLAYER_IN_GAME", "대국을 마친 뒤 다시 신청할 수 있습니다.");
        const targetBusy = this.db.prepare(`SELECT 1 FROM challenges WHERE status='PENDING' AND
          (applicant_player_id=? OR acceptor_player_id=?)`).get(target, target) ||
          this.db.prepare("SELECT 1 FROM games WHERE status IN ('PREPARING','ACTIVE') AND (white_player_id=? OR black_player_id=?)").get(target, target);
        if (targetBusy) throw new LobbyError("PLAYER_UNAVAILABLE", "상대가 다른 신청에 응답 중이거나 대국 중입니다.");
        const cooldown = this.db.prepare("SELECT max(updated_at_utc) AS requested_at_utc FROM challenges WHERE applicant_player_id=? AND acceptor_player_id=? AND status<>'PENDING'")
          .get(actor, target) as { requested_at_utc: string } | undefined;
        if (cooldown?.requested_at_utc && now.getTime() - Date.parse(cooldown.requested_at_utc) < this.timing.sameTargetCooldownMs) {
          throw new LobbyError("CHALLENGE_COOLDOWN", "같은 상대에게는 10초 뒤 다시 신청할 수 있습니다.");
        }
        this.db.prepare(`INSERT INTO challenges(challenge_id,applicant_player_id,acceptor_player_id,status,revision,created_at_utc,response_deadline_utc,updated_at_utc)
          VALUES(?,?,?,'PENDING',1,?,?,?)`).run(challengeId, actor, target,
          new Date(now.getTime() + this.timing.challengeLifetimeMs).toISOString(), nowIso, nowIso);
        this.db.prepare(`INSERT INTO challenge_cooldowns(applicant_player_id,acceptor_player_id,requested_at_utc)
          VALUES(?,?,?) ON CONFLICT(applicant_player_id,acceptor_player_id) DO UPDATE SET requested_at_utc=excluded.requested_at_utc`)
          .run(actor, target, nowIso);
      });
      transaction.immediate();
      this.challengeDeadlines.set(challengeId, performance.now() + this.timing.challengeLifetimeMs);
      sendResult(socket, requestId, { challengeId, status: "PENDING", role: "APPLICANT", colorOnAccept: "WHITE" });
      this.broadcastSnapshots();
    } catch (error) { this.sendLobbyError(socket, requestId, error); }
  }

  private cancelChallenge(socket: WebSocket, actor: string, requestId: string, challengeId: string): void {
    const transaction = this.db.transaction(() => {
      const row = this.db.prepare("SELECT applicant_player_id,status FROM challenges WHERE challenge_id=?").get(challengeId) as
        | { applicant_player_id: string; status: string } | undefined;
      if (!row || row.applicant_player_id !== actor) throw new LobbyError("NOT_CHALLENGE_APPLICANT", "이 신청을 취소할 권한이 없습니다.");
      const update = this.db.prepare("UPDATE challenges SET status='CANCELLED',revision=revision+1,updated_at_utc=? WHERE challenge_id=? AND status='PENDING'")
        .run(new Date().toISOString(), challengeId);
      if (update.changes !== 1) throw new LobbyError("CHALLENGE_CLOSED", "이미 응답되었거나 종료된 신청입니다.");
    });
    try { transaction.immediate(); this.challengeDeadlines.delete(challengeId); sendResult(socket, requestId, { challengeId, status: "CANCELLED" }); this.broadcastSnapshots(); }
    catch (error) { this.sendLobbyError(socket, requestId, error); }
  }

  private respondChallenge(socket: WebSocket, actor: string, requestId: string, challengeId: string, accept: boolean): void {
    const now = new Date();
    const nowIso = now.toISOString();
    const gameId = randomUUID();
    let created = false;
    let replayed = false;
    let responseData: Record<string, unknown> = {};
    const hash = requestHash({ protocolVersion: PROTOCOL_VERSION, type: "challenge.respond", requestId, challengeId, accept } as ClientMessage);
    const transaction = this.db.transaction(() => {
      const prior = this.db.prepare("SELECT request_hash,response_json FROM successful_requests WHERE actor_player_id=? AND request_id=?")
        .get(actor, requestId) as { request_hash: string; response_json: string } | undefined;
      if (prior) {
        if (prior.request_hash !== hash) throw new LobbyError("REQUEST_ID_CONFLICT", "같은 요청 ID에 다른 내용을 보낼 수 없습니다.");
        responseData = JSON.parse(prior.response_json) as Record<string, unknown>;
        replayed = true;
        return;
      }
      const challenge = this.db.prepare("SELECT * FROM challenges WHERE challenge_id=?").get(challengeId) as
        | { applicant_player_id: string; acceptor_player_id: string; status: string; response_deadline_utc: string } | undefined;
      if (!challenge || challenge.acceptor_player_id !== actor) throw new LobbyError("NOT_CHALLENGE_RECIPIENT", "이 신청에 응답할 권한이 없습니다.");
      if (challenge.status !== "PENDING") throw new LobbyError("CHALLENGE_CLOSED", "이 신청은 이미 응답되었거나 종료되었습니다.");
      if ((this.challengeDeadlines.get(challengeId) ?? performance.now()) <= performance.now()) {
        this.db.prepare("UPDATE challenges SET status='EXPIRED',revision=revision+1,updated_at_utc=? WHERE challenge_id=? AND status='PENDING'").run(nowIso, challengeId);
        throw new LobbyError("CHALLENGE_EXPIRED", "신청 응답 시간이 만료되었습니다.");
      }
      const status = accept ? "ACCEPTED" : "DECLINED";
      const update = this.db.prepare("UPDATE challenges SET status=?,revision=revision+1,updated_at_utc=? WHERE challenge_id=? AND status='PENDING'")
        .run(status, nowIso, challengeId);
      if (update.changes !== 1) throw new LobbyError("CHALLENGE_CLOSED", "다른 요청이 먼저 신청을 처리했습니다.");
      if (!accept) {
        responseData = { challengeId, status: "DECLINED", gameId: null };
        this.db.prepare(`INSERT INTO successful_requests(actor_player_id,request_id,request_hash,entity_type,entity_id,response_json,created_at_utc)
          VALUES(?,?,?,'CHALLENGE',?,?,?)`).run(actor, requestId, hash, challengeId, JSON.stringify(responseData), nowIso);
        return;
      }
      const occupied = this.db.prepare("SELECT 1 FROM games WHERE status IN ('PREPARING','ACTIVE') AND ((white_player_id IN (?,?) OR black_player_id IN (?,?))) LIMIT 1")
        .get(challenge.applicant_player_id, challenge.acceptor_player_id, challenge.applicant_player_id, challenge.acceptor_player_id);
      if (occupied) throw new LobbyError("PLAYER_IN_GAME", "참가자 중 한 명이 이미 대국 중입니다.");
      try{assertGameCapacity(this.db);}catch{throw new LobbyError("GAME_CAPACITY","동시 대국 20판이 진행 중입니다. 잠시 후 재시도하세요.");}
      const state = JSON.stringify({ status: "PREPARING", board: createRuleGame().board, ready: { white: false, black: false } });
      this.db.prepare(`INSERT INTO games(game_id,challenge_id,white_player_id,black_player_id,status,revision,state_json,created_at_utc,updated_at_utc)
        VALUES(?,?,?,?, 'PREPARING',0,?,?,?)`).run(gameId, challengeId, challenge.applicant_player_id, challenge.acceptor_player_id, state, nowIso, nowIso);
      this.db.prepare("INSERT INTO game_preparation(game_id,deadline_utc) VALUES(?,?)")
        .run(gameId, new Date(now.getTime() + this.timing.preparationLifetimeMs).toISOString());
      created = true;
      responseData = { challengeId, status: "ACCEPTED", gameId };
      this.db.prepare(`INSERT INTO successful_requests(actor_player_id,request_id,request_hash,entity_type,entity_id,response_json,created_at_utc)
        VALUES(?,?,?,'GAME',?,?,?)`).run(actor, requestId, hash, gameId, JSON.stringify(responseData), nowIso);
    });
    try {
      transaction.immediate();
      this.challengeDeadlines.delete(challengeId);
      if (created) this.preparationDeadlines.set(gameId, performance.now() + this.timing.preparationLifetimeMs);
      sendResult(socket, requestId, responseData);
      this.broadcastSnapshots();
      if (created && !replayed) this.broadcastGame(gameId, { status: "PREPARING", whitePlayerId: this.db.prepare("SELECT white_player_id FROM games WHERE game_id=?").pluck().get(gameId), blackPlayerId: actor, revision: 0 });
    } catch (error) { this.sendLobbyError(socket, requestId, error); this.broadcastSnapshots(); }
  }

  private readyGame(socket: WebSocket, actor: string, requestId: string, gameId: string): void {
    const now = new Date();
    let countdownBegan = false;
    const transaction = this.db.transaction(() => {
      const game = this.db.prepare("SELECT white_player_id,black_player_id,status FROM games WHERE game_id=?").get(gameId) as
        | { white_player_id: string; black_player_id: string; status: string } | undefined;
      if (!game || (game.white_player_id !== actor && game.black_player_id !== actor)) throw new LobbyError("NOT_GAME_PARTICIPANT", "이 대국을 준비할 권한이 없습니다.");
      if (game.status !== "PREPARING") throw new LobbyError("GAME_NOT_PREPARING", "대국 준비 시간이 끝났습니다.");
      const column = game.white_player_id === actor ? "white_ready" : "black_ready";
      this.db.prepare(`UPDATE game_preparation SET ${column}=1 WHERE game_id=?`).run(gameId);
      const prep = this.db.prepare("SELECT * FROM game_preparation WHERE game_id=?").get(gameId) as
        { white_ready: number; black_ready: number; countdown_started_at_utc: string | null };
      if (prep.white_ready && prep.black_ready && !prep.countdown_started_at_utc) {
        this.db.prepare("UPDATE game_preparation SET countdown_started_at_utc=? WHERE game_id=?").run(now.toISOString(), gameId);
        countdownBegan = true;
      }
    });
    try {
      transaction.immediate();
      if (countdownBegan) this.countdownDeadlines.set(gameId, performance.now() + this.timing.startCountdownMs);
      sendResult(socket, requestId, { gameId, ready: true });
      this.broadcastSnapshots();
    } catch (error) { this.sendLobbyError(socket, requestId, error); }
  }

  private cancelPreparingGame(socket: WebSocket, actor: string, requestId: string, gameId: string): void {
    const nowIso = new Date().toISOString();
    const hash = requestHash({ protocolVersion: PROTOCOL_VERSION, type: "game.cancel", requestId, gameId } as ClientMessage);
    let responseData: Record<string, unknown> = {};
    const transaction = this.db.transaction(() => {
      const prior = this.db.prepare("SELECT request_hash,response_json FROM successful_requests WHERE actor_player_id=? AND request_id=?")
        .get(actor, requestId) as { request_hash: string; response_json: string } | undefined;
      if (prior) {
        if (prior.request_hash !== hash) throw new LobbyError("REQUEST_ID_CONFLICT", "같은 요청 ID에 다른 내용을 보낼 수 없습니다.");
        responseData = JSON.parse(prior.response_json) as Record<string, unknown>;
        return;
      }
      const game = this.db.prepare("SELECT white_player_id,black_player_id,status FROM games WHERE game_id=?").get(gameId) as
        | { white_player_id: string; black_player_id: string; status: string } | undefined;
      if (!game || (game.white_player_id !== actor && game.black_player_id !== actor)) throw new LobbyError("NOT_GAME_PARTICIPANT", "이 대국을 취소할 권한이 없습니다.");
      if (game.status !== "PREPARING") throw new LobbyError("GAME_ALREADY_STARTED", "시작한 대국은 준비 취소로 종료할 수 없습니다.");
      const updated = this.db.prepare("UPDATE games SET status='CANCELLED',end_reason=NULL,revision=revision+1,updated_at_utc=?,ended_at_utc=? WHERE game_id=? AND status='PREPARING'")
        .run(nowIso, nowIso, gameId);
      if (updated.changes !== 1) throw new LobbyError("GAME_ALREADY_STARTED", "대국이 먼저 시작되었거나 취소되었습니다.");
      this.db.prepare("DELETE FROM game_preparation WHERE game_id=?").run(gameId);
      responseData = { gameId, status: "CANCELLED", endReason: null };
      this.db.prepare(`INSERT INTO successful_requests(actor_player_id,request_id,request_hash,entity_type,entity_id,response_json,created_at_utc)
        VALUES(?,?,?,'GAME',?,?,?)`).run(actor, requestId, hash, gameId, JSON.stringify(responseData), nowIso);
    });
    try {
      transaction.immediate();
      this.preparationDeadlines.delete(gameId);
      this.countdownDeadlines.delete(gameId);
      sendResult(socket, requestId, responseData);
      this.broadcastSnapshots();
      this.broadcastGame(gameId, { status: "CANCELLED", endReason: null });
    } catch (error) { this.sendLobbyError(socket, requestId, error); }
  }

  private sendSnapshot(socket: WebSocket, playerId: string): void {
    const row = this.db.prepare("SELECT nickname_display FROM players WHERE player_id=?").get(playerId) as { nickname_display: string } | undefined;
    if (!row) return;
    const resultId=this.sockets.get(socket)?.resultGameId;
    if(resultId){
      const game=this.db.prepare(`SELECT g.*,w.nickname_display AS whiteName,b.nickname_display AS blackName FROM games g
        JOIN players w ON w.player_id=g.white_player_id JOIN players b ON b.player_id=g.black_player_id
        WHERE game_id=? AND status IN ('FINISHED','ABORTED') AND ended_at_utc>? AND (white_player_id=? OR black_player_id=?)`).get(resultId,new Date(Date.now()-LIMITS.retentionMs).toISOString(),playerId,playerId) as {white_player_id:string;whiteName:string;blackName:string}|undefined;
      if(!game){socket.close(4004,"Stored result expired");return;}
      send(socket,{type:"lobby.snapshot",snapshot:{me:{playerId,nickname:row.nickname_display,state:"RESULT_QUERY_ONLY"},players:[],challenges:[],
        game:{...this.online.snapshot(resultId),gameId:resultId,color:game.white_player_id===playerId?"WHITE":"BLACK",opponentName:game.white_player_id===playerId?game.blackName:game.whiteName,
          whiteName:game.whiteName,blackName:game.blackName,messages:[],resultRoom:null,readOnlyResult:true},serverTimeUtc:new Date().toISOString()}});return;
    }
    const challenges = this.db.prepare(`SELECT challenge_id AS challengeId, applicant_player_id AS applicantPlayerId,
      acceptor_player_id AS acceptorPlayerId,status,response_deadline_utc AS responseDeadlineUtc FROM challenges
      WHERE status='PENDING' AND (applicant_player_id=? OR acceptor_player_id=?) ORDER BY created_at_utc`).all(playerId, playerId) as LobbySnapshot["challenges"];
    const players = this.db.prepare(`SELECT p.player_id,p.nickname_display FROM players p WHERE p.player_id<>? AND (
      EXISTS(SELECT 1 FROM player_sessions s WHERE s.player_id=p.player_id AND s.ended_at_utc IS NULL AND s.expires_at_utc>?) OR
      EXISTS(SELECT 1 FROM challenges c WHERE c.status='PENDING' AND (c.applicant_player_id=p.player_id OR c.acceptor_player_id=p.player_id)) OR
      EXISTS(SELECT 1 FROM games g WHERE g.status IN ('PREPARING','ACTIVE') AND (g.white_player_id=p.player_id OR g.black_player_id=p.player_id)))
      ORDER BY p.nickname_display`).all(playerId, new Date().toISOString()) as Array<{ player_id: string; nickname_display: string }>;
    const gameRow = this.db.prepare(`SELECT g.game_id,g.status,g.white_player_id,g.black_player_id,g.revision,
      p.nickname_display AS opponent_name,prep.deadline_utc,prep.countdown_started_at_utc
      FROM games g JOIN players p ON p.player_id=CASE WHEN g.white_player_id=? THEN g.black_player_id ELSE g.white_player_id END
      LEFT JOIN game_preparation prep ON prep.game_id=g.game_id
      LEFT JOIN result_rooms rr ON rr.game_id=g.game_id
      WHERE (g.white_player_id=? OR g.black_player_id=?) AND (g.status IN ('PREPARING','ACTIVE') OR
        (g.status IN ('FINISHED','ABORTED') AND rr.closed=0 AND CASE WHEN g.white_player_id=? THEN rr.white_left ELSE rr.black_left END=0))
      ORDER BY CASE WHEN g.status IN ('PREPARING','ACTIVE') THEN 0 ELSE 1 END,g.created_at_utc DESC LIMIT 1`)
      .get(playerId, playerId, playerId, playerId) as { game_id: string; status: string; white_player_id: string; black_player_id: string; opponent_name: string; deadline_utc?: string; countdown_started_at_utc?: string | null } | undefined;
    const myPending = challenges.length > 0;
    const presenceOnline = this.playerSockets.has(playerId);
    const myState: PlayerSummary["state"] = gameRow && ["PREPARING", "ACTIVE"].includes(gameRow.status) ? "IN_GAME" : myPending ? "RESPONDING" : presenceOnline ? "WAITING" : "RECONNECTING";
    const snapshot: LobbySnapshot = {
      me: { playerId, nickname: row.nickname_display, state: myState },
      players: [
        { playerId, nickname: row.nickname_display, state: myState },
        ...players.map((p) => {
          const pending = this.db.prepare("SELECT 1 FROM challenges WHERE status='PENDING' AND (applicant_player_id=? OR acceptor_player_id=?)").get(p.player_id,p.player_id);
          const inGame = this.db.prepare("SELECT 1 FROM games WHERE status IN ('PREPARING','ACTIVE') AND (white_player_id=? OR black_player_id=?)").get(p.player_id,p.player_id);
          return { playerId: p.player_id, nickname: p.nickname_display,
            state: inGame ? "IN_GAME" : pending ? "RESPONDING" : this.playerSockets.has(p.player_id) ? "WAITING" : "RECONNECTING" } as PlayerSummary;
        }),
      ],
      challenges,
      game: gameRow ? { ...this.online.snapshot(gameRow.game_id), ...this.rooms.metadata(gameRow.game_id,playerId), gameId: gameRow.game_id, status: gameRow.status,
        color: gameRow.white_player_id === playerId ? "WHITE" : "BLACK", opponentName: gameRow.opponent_name,
        ...(gameRow.deadline_utc ? { deadlineUtc: gameRow.deadline_utc } : {}),
        ...(gameRow.countdown_started_at_utc !== undefined ? { countdownStartedAtUtc: gameRow.countdown_started_at_utc } : {}),
        ...(gameRow.status === "PREPARING" ? { ready: this.readyBits(gameRow.game_id) } : {}) } : null,
      serverTimeUtc: new Date().toISOString(),
    };
    send(socket, { type: "lobby.snapshot", snapshot });
  }

  private broadcastSnapshots(): void {
    for (const [playerId, socket] of this.playerSockets) this.sendSnapshot(socket, playerId);
  }

  private broadcastGame(gameId: string, event: Record<string, unknown>): void {
    const row = this.db.prepare("SELECT white_player_id,black_player_id,revision FROM games WHERE game_id=?").get(gameId) as
      | { white_player_id: string; black_player_id: string; revision: number } | undefined;
    if (!row) return;
    for (const playerId of [row.white_player_id, row.black_player_id]) {
      const socket = this.playerSockets.get(playerId);
      if (socket) send(socket, { type: "game.event", gameId, revision: row.revision, event });
    }
  }

  private readyBits(gameId: string): { white: boolean; black: boolean } {
    const prep = this.db.prepare("SELECT white_ready,black_ready FROM game_preparation WHERE game_id=?").get(gameId) as
      | { white_ready: number; black_ready: number } | undefined;
    return { white: prep?.white_ready === 1, black: prep?.black_ready === 1 };
  }

  private sendLobbyError(socket: WebSocket, requestId: string, error: unknown): void {
    if (error instanceof LobbyError) sendError(socket, requestId, error.code, error.message);
    else sendError(socket, requestId, "LOBBY_OPERATION_FAILED", "요청을 처리하지 못했습니다. 대기열을 새로 고쳐 주세요.");
  }

  private releaseExpiredClaims(nowIso: string): void {
    this.db.prepare(`UPDATE player_sessions SET ended_at_utc=? WHERE ended_at_utc IS NULL AND expires_at_utc<=? AND NOT EXISTS(
      SELECT 1 FROM games g WHERE g.status IN ('PREPARING','ACTIVE') AND (g.white_player_id=player_sessions.player_id OR g.black_player_id=player_sessions.player_id))`).run(nowIso, nowIso);
    const players = this.db.prepare(`SELECT p.player_id FROM players p WHERE
      NOT EXISTS(SELECT 1 FROM player_sessions s WHERE s.player_id=p.player_id AND s.ended_at_utc IS NULL AND s.expires_at_utc>?) AND
      NOT EXISTS(SELECT 1 FROM challenges c WHERE c.status='PENDING' AND (c.applicant_player_id=p.player_id OR c.acceptor_player_id=p.player_id)) AND
      NOT EXISTS(SELECT 1 FROM games g WHERE g.status IN ('PREPARING','ACTIVE') AND (g.white_player_id=p.player_id OR g.black_player_id=p.player_id))`).all(nowIso) as Array<{ player_id: string }>;
    for (const row of players) {
      if (!this.playerSockets.has(row.player_id) && !this.graceTimers.has(row.player_id)) this.db.prepare("UPDATE players SET nickname_key=? WHERE player_id=?")
        .run(`released:${row.player_id}`, row.player_id);
    }
  }

  private releasePlayerName(playerId: string): void {
    const nowIso = new Date().toISOString();
    this.db.prepare(`UPDATE players SET nickname_key=? WHERE player_id=? AND
      NOT EXISTS(SELECT 1 FROM challenges c WHERE c.status='PENDING' AND (c.applicant_player_id=? OR c.acceptor_player_id=?)) AND
      NOT EXISTS(SELECT 1 FROM games g WHERE g.status IN ('PREPARING','ACTIVE') AND (g.white_player_id=? OR g.black_player_id=?)) AND
      NOT EXISTS(SELECT 1 FROM player_sessions s WHERE s.player_id=? AND s.ended_at_utc IS NULL AND s.expires_at_utc>?)`)
      .run(`released:${playerId}`, playerId, playerId, playerId, playerId, playerId, playerId, nowIso);
  }

  isReady(): boolean {
    if(this.closed)return false;
    const ready = this.online.ensureStorageReady();
    if (ready !== this.storageReady) {
      this.storageReady = ready;
      for (const socket of this.playerSockets.values()) send(socket, { type: "server.storage", available: ready });
    }
    return ready;
  }
  private sweep(): void {
    if (!this.isReady()) return;
    this.online.sweep();
    this.rooms.sweep();
    for (const [socket, state] of this.sockets) {
      if (!state.playerId || this.playerSockets.get(state.playerId) !== socket) continue;
      if (performance.now() - state.lastValid >= 30_000) { this.onClose(socket, state); socket.close(4003, "Heartbeat timeout"); }
      else if (performance.now() - state.lastHeartbeat >= 15_000) { state.lastHeartbeat = performance.now(); send(socket, { type: "heartbeat.request" }); }
    }
    this.online.sweep();
    const now = new Date();
    const nowIso = now.toISOString();
    const monoNow = performance.now();
    const expiredIds = Array.from(this.challengeDeadlines).filter(([, deadline]) => deadline <= monoNow).map(([id]) => id);
    for (const challengeId of expiredIds) {
      this.db.prepare("UPDATE challenges SET status='EXPIRED',revision=revision+1,updated_at_utc=? WHERE challenge_id=? AND status='PENDING'").run(nowIso, challengeId);
      this.challengeDeadlines.delete(challengeId);
    }
    const prepRows = this.db.prepare(`SELECT game_id,countdown_started_at_utc FROM game_preparation`).all() as Array<{ game_id: string; countdown_started_at_utc: string | null }>;
    let cancelledCount = 0;
    let startedCount = 0;
    for (const item of prepRows) {
      if (!item.countdown_started_at_utc && (this.preparationDeadlines.get(item.game_id) ?? 0) <= monoNow) {
        const cancelled = this.db.prepare("UPDATE games SET status='CANCELLED',end_reason=NULL,revision=revision+1,ended_at_utc=?,updated_at_utc=? WHERE game_id=? AND status='PREPARING'")
          .run(nowIso, nowIso, item.game_id);
        if (cancelled.changes) cancelledCount += 1;
        this.db.prepare("DELETE FROM game_preparation WHERE game_id=?").run(item.game_id);
        this.preparationDeadlines.delete(item.game_id);
        this.countdownDeadlines.delete(item.game_id);
      } else if (item.countdown_started_at_utc && (this.countdownDeadlines.get(item.game_id) ?? 0) <= monoNow) {
        try { if (!this.online.start(item.game_id)) continue; } catch { continue; }
        startedCount += 1;
        this.db.prepare("DELETE FROM game_preparation WHERE game_id=?").run(item.game_id);
        this.preparationDeadlines.delete(item.game_id);
        this.countdownDeadlines.delete(item.game_id);
        this.broadcastGame(item.game_id, { status: "ACTIVE", startedAtUtc: nowIso });
      }
    }
    if (expiredIds.length || cancelledCount || startedCount) this.broadcastSnapshots();
    this.releaseExpiredClaims(nowIso);
    if(monoNow>=this.nextPurge){
      purgeExpiredRecords(this.db,now.getTime(),[...this.playerSockets.keys(),...this.graceTimers.keys()]);
      this.nextPurge=monoNow+60_000;
    }
  }
}

class LobbyError extends Error {
  constructor(readonly code: string, message: string) { super(message); }
}
