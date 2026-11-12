import { randomUUID } from "node:crypto";
import { createRuleGame } from "@danpan/shared";
import type { SqliteDatabase } from "./database.js";
export function reconcileUnfinished(db: SqliteDatabase): void {
  db.transaction(() => {
    const rows = db.prepare("SELECT * FROM games WHERE status IN ('PREPARING','ACTIVE')").all() as Array<{ game_id: string; status: string; revision: number; state_json: string; black_player_id: string }>;
    const now = new Date().toISOString();
    for (const row of rows) {
      const status = row.status === "PREPARING" ? "CANCELLED" : "ABORTED";
      const reason = row.status === "PREPARING" ? null : "SYSTEM_ABORT";
      let state; try { state = JSON.parse(row.state_json); } catch { state = createRuleGame(); }
      state = { ...state, status: "FINISHED", nextColor: null, result: null, turnDeadlineUtc: null };
      db.prepare("UPDATE games SET status=?,end_reason=?,state_json=?,revision=revision+1,ended_at_utc=?,updated_at_utc=? WHERE game_id=? AND revision=?")
        .run(status, reason, JSON.stringify(state), now, now, row.game_id, row.revision);
      db.prepare("INSERT INTO successful_requests VALUES(?,?,?,'GAME',?,?,?)")
        .run(row.black_player_id, `system:recovery:${randomUUID()}`, "recovery", row.game_id, JSON.stringify({ gameId: row.game_id, status, endReason: reason, approvedRevision: row.revision + 1 }), now);
    }
    db.prepare("DELETE FROM game_preparation").run();
    db.prepare("UPDATE challenges SET status='CANCELLED',revision=revision+1,updated_at_utc=? WHERE status='PENDING'").run(now);
  }).immediate();
}
