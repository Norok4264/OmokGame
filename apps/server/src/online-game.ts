import { createHash } from "node:crypto";
import { createRuleGame, playMove, type RuleGameState, type StoneColor } from "@danpan/shared";
import type { SqliteDatabase } from "./storage/database.js";
import { reconcileUnfinished } from "./storage/recovery.js";
type Row = { game_id: string; white_player_id: string; black_player_id: string; status: string; revision: number; state_json: string; end_reason: string | null };
export class OnlineGames {
  private unavailable = false;
  private disconnected = new Map<string, number>();
  private deadlines = new Map<string, number>();
  constructor(private db: SqliteDatabase, private publish: () => void, readonly turnMs = 60_000) {}
  markUnavailable() { this.unavailable = true; }
  ensureStorageReady(): boolean {
    try {
      this.db.prepare("SELECT 1").get();
      if (this.unavailable) {
        reconcileUnfinished(this.db);
        this.deadlines.clear(); this.disconnected.clear();
        this.unavailable = false;
        this.publish();
      }
      return true;
    } catch { this.unavailable = true; return false; }
  }
  disconnectedPlayer(actor: string, graceMs = 60_000) {
    this.sweep();
    if (!this.disconnected.has(actor)) this.disconnected.set(actor, performance.now() + graceMs);
    this.sweep();
  }
  reconnectedPlayer(actor: string) { this.sweep(); this.disconnected.delete(actor); }
  forgetPlayer(actor: string) { this.disconnected.delete(actor); }
  snapshot(id: string) {
    const row = this.db.prepare("SELECT * FROM games WHERE game_id=?").get(id) as Row | undefined;
    return row ? { ...JSON.parse(row.state_json), gameId: id, status: row.status, revision: row.revision, endReason: row.end_reason } : null;
  }
  start(id: string) {
    if (!this.ensureStorageReady()) throw new Error("STORAGE_UNAVAILABLE");
    const row = this.db.prepare("SELECT * FROM games WHERE game_id=?").get(id) as Row;
    if (row.status !== "PREPARING") return false;
    this.commit(row, row.black_player_id, `system:start:${id}`, "start", { ...createRuleGame(), turnDeadlineUtc: new Date(Date.now() + this.turnMs).toISOString() }, "ACTIVE", null);
    this.deadlines.set(id, performance.now() + this.turnMs);
    return true;
  }
  command(actor: string, input: Record<string, unknown>) {
    if (!this.ensureStorageReady()) throw new Error("STORAGE_UNAVAILABLE");
    this.sweep();
    if (this.unavailable) throw new Error("STORAGE_UNAVAILABLE");
    const id = String(input.gameId), requestId = String(input.requestId);
    const payload = { type: input.type, gameId: id, expectedRevision: input.expectedRevision, ...(input.type === "game.move.propose" ? { x: input.x, y: input.y } : {}) };
    const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
    const prior = this.db.prepare("SELECT * FROM successful_requests WHERE actor_player_id=? AND request_id=?").get(actor, requestId) as { request_hash: string; response_json: string } | undefined;
    if (prior) {
      if (prior.request_hash !== hash) throw new Error("REQUEST_ID_CONFLICT");
      return { ...JSON.parse(prior.response_json), replayed: true, snapshot: this.snapshot(id) };
    }
    const row = this.db.prepare("SELECT * FROM games WHERE game_id=?").get(id) as Row | undefined;
    if (!row || ![row.white_player_id, row.black_player_id].includes(actor)) throw new Error("NOT_GAME_PARTICIPANT");
    if (input.type === "game.snapshot.request") return { snapshot: this.snapshot(id) };
    if (row.status !== "ACTIVE") throw new Error("GAME_NOT_ACTIVE");
    if (this.expire(row)) throw new Error("TURN_EXPIRED");
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== row.revision) throw new Error("STALE_REVISION");
    const color: StoneColor = actor === row.black_player_id ? "BLACK" : "WHITE";
    const state = JSON.parse(row.state_json) as RuleGameState;
    let next: object, status = "FINISHED", reason: string | null;
    if (input.type === "game.resign") {
      next = { ...state, status: "FINISHED", nextColor: null, result: { kind: "WIN", winner: color === "BLACK" ? "WHITE" : "BLACK" }, turnDeadlineUtc: null };
      reason = "RESIGNATION";
    } else {
      const move = playMove(state, { x: input.x as number, y: input.y as number }, color);
      if (!move.ok) throw new Error(move.error);
      status = move.state.status;
      reason = status === "ACTIVE" ? null : move.state.result?.kind === "DRAW" ? "DRAW" : "WIN";
      next = { ...move.state, turnDeadlineUtc: status === "ACTIVE" ? new Date(Date.now() + this.turnMs).toISOString() : null };
    }
    const result = this.commit(row, actor, requestId, hash, next, status, reason, input.type === "game.move.propose" ? { x: input.x, y: input.y, color } : undefined);
    if (status === "ACTIVE") this.deadlines.set(id, performance.now() + this.turnMs); else this.deadlines.delete(id);
    this.publish();
    return { ...result, snapshot: this.snapshot(id) };
  }
  private commit(row: Row, actor: string, requestId: string, hash: string, state: object, status: string, reason: string | null, move?: Record<string, unknown>) {
    const response = { gameId: row.game_id, approvedRevision: row.revision + 1 };
    try { this.db.transaction(() => {
      const now = new Date().toISOString();
      const update = this.db.prepare("UPDATE games SET state_json=?,status=?,end_reason=?,revision=revision+1,updated_at_utc=?,ended_at_utc=? WHERE game_id=? AND revision=?")
        .run(JSON.stringify(state), status, reason, now, status === "ACTIVE" ? null : now, row.game_id, row.revision);
      if (update.changes !== 1) throw new Error("STALE_REVISION");
      if (["FINISHED", "ABORTED"].includes(status)) this.db.prepare("INSERT OR IGNORE INTO result_rooms(game_id,expires_at_utc) VALUES(?,?)")
        .run(row.game_id, new Date(Date.parse(now) + 300_000).toISOString());
      if (move) this.db.prepare("INSERT INTO game_moves(game_id,revision,request_id,player_id,x,y,color,accepted_at_utc) VALUES(?,?,?,?,?,?,?,?)")
        .run(row.game_id, row.revision + 1, requestId, actor, move.x, move.y, move.color, now);
      this.db.prepare("INSERT INTO successful_requests VALUES(?,?,?,'GAME',?,?,?)").run(actor, requestId, hash, row.game_id, JSON.stringify(response), now);
    }).immediate(); } catch (error) { this.markUnavailable(); throw error; }
    return response;
  }
  private expire(row: Row): boolean {
    if (!this.deadlines.has(row.game_id)) {
      const utc = JSON.parse(row.state_json).turnDeadlineUtc;
      this.deadlines.set(row.game_id, performance.now() + Math.max(0, Date.parse(utc ?? new Date().toISOString()) - Date.now()));
    }
    const turn = this.deadlines.get(row.game_id)!;
    const white = this.disconnected.get(row.white_player_id);
    const black = this.disconnected.get(row.black_player_id);
    const recovery = Math.min(white ?? Infinity, black ?? Infinity);
    const now = performance.now();
    const state = JSON.parse(row.state_json) as RuleGameState;
    if (Math.min(turn, recovery) <= now) {
      const timeout = turn <= recovery;
      const loser = timeout ? state.nextColor : (white ?? Infinity) <= (black ?? Infinity) ? "WHITE" : "BLACK";
      const winner = loser === "BLACK" ? "WHITE" : "BLACK";
      this.commit(row, row.black_player_id, `system:end:${row.game_id}:${row.revision}`, "deadline", { ...state, status: "FINISHED", nextColor: null, result: { kind: "WIN", winner }, turnDeadlineUtc: null }, "FINISHED", timeout ? "TIMEOUT" : "DISCONNECT");
    } else if (white !== undefined && black !== undefined) {
      this.abort(row.game_id, "DISCONNECT"); return true;
    } else return false;
    this.deadlines.delete(row.game_id);
    this.publish();
    return true;
  }
  sweep() {
    if (!this.ensureStorageReady()) return;
    const rows = this.db.prepare("SELECT * FROM games WHERE status='ACTIVE'").all() as Row[];
    for (const row of rows) {
      try {
        const state = JSON.parse(row.state_json);
        if (!Array.isArray(state.board) || state.board.length !== 15 || state.board.some((r: unknown) => !Array.isArray(r) || r.length !== 15 || r.some(c => c !== null && c !== "BLACK" && c !== "WHITE")) || !["BLACK", "WHITE"].includes(state.nextColor)) this.abort(row.game_id);
        else this.expire(row);
      } catch { this.markUnavailable(); break; }
    }
  }
  abort(id: string, reason = "SYSTEM_ABORT") {
    const row = this.db.prepare("SELECT * FROM games WHERE game_id=?").get(id) as Row;
    if (!row || !["ACTIVE", "PREPARING"].includes(row.status)) return;
    let state: object;
    try { state = JSON.parse(row.state_json); } catch { state = createRuleGame(); }
    this.commit(row, row.black_player_id, `system:abort:${id}:${row.revision}`, "abort", { ...state, status: "FINISHED", nextColor: null, result: null, turnDeadlineUtc: null }, "ABORTED", reason);
    this.deadlines.delete(id);
    this.publish();
  }
}
