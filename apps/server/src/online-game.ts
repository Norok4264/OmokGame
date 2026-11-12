import { createHash } from "node:crypto";
import { createRuleGame, playMove, type RuleGameState, type StoneColor } from "@danpan/shared";
import type { SqliteDatabase } from "./storage/database.js";
type Row = { game_id: string; white_player_id: string; black_player_id: string; status: string; revision: number; state_json: string; end_reason: string | null };
export class OnlineGames {
  private deadlines = new Map<string, number>();
  constructor(private db: SqliteDatabase, private publish: () => void, readonly turnMs = 60_000) {}
  snapshot(id: string) {
    const row = this.db.prepare("SELECT * FROM games WHERE game_id=?").get(id) as Row | undefined;
    return row ? { ...JSON.parse(row.state_json), gameId: id, status: row.status, revision: row.revision, endReason: row.end_reason } : null;
  }
  start(id: string) {
    const row = this.db.prepare("SELECT * FROM games WHERE game_id=?").get(id) as Row;
    if (row.status !== "PREPARING") return;
    this.commit(row, row.black_player_id, `system:start:${id}`, "start", { ...createRuleGame(), turnDeadlineUtc: new Date(Date.now() + this.turnMs).toISOString() }, "ACTIVE", null);
    this.deadlines.set(id, performance.now() + this.turnMs);
  }
  command(actor: string, input: Record<string, unknown>) {
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
    this.db.transaction(() => {
      const now = new Date().toISOString();
      const update = this.db.prepare("UPDATE games SET state_json=?,status=?,end_reason=?,revision=revision+1,updated_at_utc=?,ended_at_utc=? WHERE game_id=? AND revision=?")
        .run(JSON.stringify(state), status, reason, now, status === "ACTIVE" ? null : now, row.game_id, row.revision);
      if (update.changes !== 1) throw new Error("STALE_REVISION");
      if (move) this.db.prepare("INSERT INTO game_moves(game_id,revision,request_id,player_id,x,y,color,accepted_at_utc) VALUES(?,?,?,?,?,?,?,?)")
        .run(row.game_id, row.revision + 1, requestId, actor, move.x, move.y, move.color, now);
      this.db.prepare("INSERT INTO successful_requests VALUES(?,?,?,'GAME',?,?,?)").run(actor, requestId, hash, row.game_id, JSON.stringify(response), now);
    }).immediate();
    return response;
  }
  private expire(row: Row): boolean {
    if (!this.deadlines.has(row.game_id)) {
      const utc = JSON.parse(row.state_json).turnDeadlineUtc;
      this.deadlines.set(row.game_id, performance.now() + Math.max(0, Date.parse(utc ?? new Date().toISOString()) - Date.now()));
    }
    if (performance.now() < this.deadlines.get(row.game_id)!) return false;
    const state = JSON.parse(row.state_json) as RuleGameState;
    const winner = state.nextColor === "BLACK" ? "WHITE" : "BLACK";
    this.commit(row, row.black_player_id, `system:timeout:${row.game_id}:${row.revision}`, "timeout", { ...state, status: "FINISHED", nextColor: null, result: { kind: "WIN", winner }, turnDeadlineUtc: null }, "FINISHED", "TIMEOUT");
    this.deadlines.delete(row.game_id);
    this.publish();
    return true;
  }
  sweep() {
    const rows = this.db.prepare("SELECT * FROM games WHERE status='ACTIVE'").all() as Row[];
    for (const row of rows) {
      try {
        const state = JSON.parse(row.state_json);
        if (!Array.isArray(state.board) || state.board.length !== 15 || state.board.some((r: unknown) => !Array.isArray(r) || r.length !== 15 || r.some(c => c !== null && c !== "BLACK" && c !== "WHITE")) || !["BLACK", "WHITE"].includes(state.nextColor)) this.abort(row.game_id);
        else this.expire(row);
      } catch { /* no publication; retry persistence next sweep */ }
    }
  }
  abort(id: string) {
    const row = this.db.prepare("SELECT * FROM games WHERE game_id=?").get(id) as Row;
    if (!row || !["ACTIVE", "PREPARING"].includes(row.status)) return;
    let state: object;
    try { state = JSON.parse(row.state_json); } catch { state = createRuleGame(); }
    this.commit(row, row.black_player_id, `system:abort:${id}:${row.revision}`, "abort", { ...state, status: "FINISHED", nextColor: null, result: null, turnDeadlineUtc: null }, "ABORTED", "SYSTEM_ABORT");
    this.deadlines.delete(id);
    this.publish();
  }
}
