import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRuleGame } from "@danpan/shared";
import { OnlineGames } from "./online-game.js";
import { runMigrations } from "./storage/migrations.js";
import { reconcileUnfinished } from "./storage/recovery.js";
import { createApplicationServer } from "./http.js";
function fixture(turnMs = 60000) {
  const db = new Database(":memory:"); runMigrations(db);
  const now = new Date().toISOString();
  for (const p of ["b", "w"]) db.prepare("INSERT INTO players VALUES(?,?,?,?)").run(p,p,p,now);
  db.prepare("INSERT INTO games(game_id,white_player_id,black_player_id,status,revision,state_json,created_at_utc,updated_at_utc) VALUES('g','w','b','PREPARING',0,?,?,?)").run(JSON.stringify(createRuleGame()),now,now);
  const games = new OnlineGames(db, () => {}, turnMs); games.start("g");
  return { db, games };
}
describe("B01–B06 recovery deadlines and storage boundaries", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date", "performance", "setTimeout", "clearTimeout", "setInterval", "clearInterval"] }); vi.setSystemTime(new Date("2026-11-12T00:00:00Z")); });
  afterEach(() => vi.useRealTimers());
  it("B03 reconnect preserves the original turn deadline and expired results precede reconnect", () => {
    const { db, games } = fixture();
    try {
      const deadline = games.snapshot("g").turnDeadlineUtc;
      games.disconnectedPlayer("b"); vi.advanceTimersByTime(30000); games.reconnectedPlayer("b");
      expect(games.snapshot("g").turnDeadlineUtc).toBe(deadline);
      vi.advanceTimersByTime(30000); games.reconnectedPlayer("b");
      expect(games.snapshot("g")).toMatchObject({ endReason: "TIMEOUT", result: { winner: "WHITE" } });
    } finally { db.close(); }
  });
  it("B02 delayed sweeps choose the earliest deadline, with timeout winning equality", () => {
    const first = fixture(120000);
    try { first.games.disconnectedPlayer("w"); vi.advanceTimersByTime(150000); first.games.sweep(); expect(first.games.snapshot("g")).toMatchObject({ endReason: "DISCONNECT", result: { winner: "BLACK" } }); } finally { first.db.close(); }
    const tie = fixture();
    try { tie.games.disconnectedPlayer("w"); vi.advanceTimersByTime(90000); tie.games.sweep(); expect(tie.games.snapshot("g")).toMatchObject({ endReason: "TIMEOUT", result: { winner: "WHITE" } }); } finally { tie.db.close(); }
  });
  it("B04 both disconnected aborts, but a timeout already due or a committed win survives", () => {
    const both = fixture();
    try { both.games.disconnectedPlayer("b"); vi.advanceTimersByTime(1000); both.games.disconnectedPlayer("w"); expect(both.games.snapshot("g")).toMatchObject({ status: "ABORTED", endReason: "DISCONNECT", result: null }); } finally { both.db.close(); }
    const late = fixture();
    try { late.games.disconnectedPlayer("b"); vi.advanceTimersByTime(60000); late.games.disconnectedPlayer("w"); expect(late.games.snapshot("g").endReason).toBe("TIMEOUT"); } finally { late.db.close(); }
    const win = fixture();
    try { win.games.command("w", { type: "game.resign", gameId: "g", requestId: "won", expectedRevision: 1 }); win.games.disconnectedPlayer("b"); win.games.disconnectedPlayer("w"); expect(win.games.snapshot("g")).toMatchObject({ status: "FINISHED", endReason: "RESIGNATION", result: { winner: "BLACK" } }); } finally { win.db.close(); }
  });
  it("B06 failed storage blocks timeouts, recovery aborts unfinished games and preserves approvals", () => {
    const { db, games } = fixture();
    try {
      const move = { type: "game.move.propose", gameId: "g", requestId: "committed", expectedRevision: 1, x: 0, y: 0 };
      games.command("b", move);
      db.exec("CREATE TRIGGER outage BEFORE UPDATE ON games BEGIN SELECT RAISE(ABORT, 'outage'); END;");
      expect(() => games.command("w", { type: "game.resign", gameId: "g", requestId: "failure", expectedRevision: 2 })).toThrow("outage");
      vi.advanceTimersByTime(120000); games.sweep();
      expect(games.snapshot("g")).toMatchObject({ status: "ACTIVE", revision: 2 });
      db.exec("DROP TRIGGER outage"); games.sweep();
      expect(games.snapshot("g")).toMatchObject({ status: "ABORTED", endReason: "SYSTEM_ABORT", result: null });
      expect(games.command("b", move)).toMatchObject({ replayed: true, approvedRevision: 2, snapshot: { status: "ABORTED" } });
    } finally { db.close(); }
  });
  it("B06 startup reconciles preparing/active atomically and retains final rows", () => {
    const { db, games } = fixture();
    try {
      const now = new Date().toISOString();
      for (const [id,status] of [["prep","PREPARING"],["final","FINISHED"]]) db.prepare("INSERT INTO games(game_id,white_player_id,black_player_id,status,revision,state_json,created_at_utc,updated_at_utc) VALUES(?,'w','b',?,7,?,?,?)").run(id,status,JSON.stringify(createRuleGame()),now,now);
      const final = db.prepare("SELECT * FROM games WHERE game_id='final'").get();
      reconcileUnfinished(db); reconcileUnfinished(db);
      expect(games.snapshot("g")).toMatchObject({ status: "ABORTED", endReason: "SYSTEM_ABORT", revision: 2 });
      expect(games.snapshot("prep")).toMatchObject({ status: "CANCELLED", revision: 8 });
      expect(db.prepare("SELECT * FROM games WHERE game_id='final'").get()).toEqual(final);
    } finally { db.close(); }
  });
  it("B06 startup cannot expose a server when unfinished-state reconciliation fails",()=>{
    const {db,games}=fixture();
    try {
      db.exec("CREATE TRIGGER broken_start BEFORE UPDATE ON games BEGIN SELECT RAISE(ABORT, 'startup failure'); END;");
      expect(()=>createApplicationServer(db)).toThrow("startup failure");
      expect(games.snapshot("g").status).toBe("ACTIVE");
      db.exec("DROP TRIGGER broken_start");
      const app=createApplicationServer(db);
      expect(app.httpServer.listening).toBe(false); expect(app.lobby.isReady()).toBe(true);
      expect(games.snapshot("g").status).toBe("ABORTED");
      app.lobby.close(); app.webSocketServer.close();
    } finally { db.close(); }
  });
  it("B06 read failure blocks processing and recovery does not charge outage time",()=>{
    const {db,games}=fixture();
    try {
      const spy=vi.spyOn(db,"prepare").mockImplementationOnce(()=>{throw new Error("read outage");});
      expect(games.ensureStorageReady()).toBe(false); spy.mockRestore();
      vi.advanceTimersByTime(120000); games.sweep();
      expect(games.snapshot("g")).toMatchObject({status:"ABORTED",endReason:"SYSTEM_ABORT",result:null});
    } finally { db.close(); }
  });
});
