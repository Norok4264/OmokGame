import Database from "better-sqlite3";
import { describe, it, expect } from "vitest";
import { createRuleGame } from "@danpan/shared";
import { runMigrations } from "./storage/migrations.js";
import { OnlineGames } from "./online-game.js";
function setup(turnMs = 60000) {
  const db = new Database(":memory:"); runMigrations(db);
  const now = new Date().toISOString();
  for (const id of ["white", "black", "outsider"]) db.prepare("INSERT INTO players VALUES(?,?,?,?)").run(id,id,id,now);
  db.prepare("INSERT INTO games(game_id,white_player_id,black_player_id,status,revision,state_json,created_at_utc,updated_at_utc) VALUES('g','white','black','PREPARING',0,?,?,?)").run(JSON.stringify(createRuleGame()),now,now);
  let publications = 0;
  const games = new OnlineGames(db, () => publications++, turnMs); games.start("g");
  const send = (actor: string, id: string, x: number, y: number, revision = games.snapshot("g").revision) => games.command(actor, { type: "game.move.propose", gameId: "g", requestId: id, expectedRevision: revision, x, y });
  return { db, games, send, publications: () => publications };
}
describe("authoritative persisted online rules", () => {
  it("replays the original approval after a turn change and after victory; rejects conflicting IDs", () => {
    const { db, games, send } = setup();
    try {
      const first = send("black", "first", 0, 0, 1);
      expect(first.approvedRevision).toBe(2);
      expect(send("black", "first", 0, 0, 1)).toMatchObject({ replayed: true, approvedRevision: 2 });
      expect(() => send("black", "first", 1, 0, 1)).toThrow("REQUEST_ID_CONFLICT");
      for (let x = 1; x < 5; x++) { send("white", `w${x}`, x, 2); send("black", `b${x}`, x, 0); }
      expect(games.snapshot("g")).toMatchObject({ status: "FINISHED", endReason: "WIN", result: { winner: "BLACK" } });
      expect(send("black", "first", 0, 0, 1)).toMatchObject({ approvedRevision: 2, snapshot: { status: "FINISHED", revision: 10 } });
      expect(db.prepare("SELECT count(*) AS n FROM game_moves").get()).toEqual({ n: 9 });
    } finally { db.close(); }
  });
  it("rejects outsiders, stale revisions, invalid points, occupied cells and wrong turns without changes", () => {
    const { db, games, send } = setup();
    try {
      expect(() => send("outsider", "p", 0, 0)).toThrow("NOT_GAME_PARTICIPANT");
      expect(() => send("white", "t", 0, 0)).toThrow("WRONG_TURN");
      expect(() => send("black", "r", 0, 0, 0)).toThrow("STALE_REVISION");
      expect(() => send("black", "x", 15, 0)).toThrow("OUT_OF_BOUNDS");
      expect(() => send("black", "fraction", .5, 0)).toThrow("INVALID_COORDINATE");
      send("black", "good", 0, 0);
      expect(() => send("white", "occupied", 0, 0)).toThrow("OCCUPIED");
      expect(games.snapshot("g").revision).toBe(2);
    } finally { db.close(); }
  });
  it("rolls back state, move and request record on storage failure and never publishes victory", () => {
    const { db, games, send, publications } = setup();
    try {
      for (let x=0; x<4; x++) { send("black", `setup-b${x}`, x, 0); send("white", `setup-w${x}`, x, 2); }
      const beforePublications = publications();
      db.exec("CREATE TRIGGER fail_request BEFORE INSERT ON successful_requests BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END;");
      expect(() => send("black", "lost", 4, 0)).toThrow("injected storage failure");
      expect(games.snapshot("g").revision).toBe(9);
      expect(games.snapshot("g").board[0][4]).toBeNull();
      expect(games.snapshot("g").status).toBe("ACTIVE");
      expect(publications()).toBe(beforePublications);
      db.exec("DROP TRIGGER fail_request");
      send("black", "lost", 4, 0, 9);
      expect(games.snapshot("g")).toMatchObject({ revision: 10, status: "FINISHED", result: { winner: "BLACK" } });
    } finally { db.close(); }
  });
  it("persists resignation once and replays it after the end", () => {
    const { db, games } = setup();
    try {
      const input = { type: "game.resign", gameId: "g", requestId: "resign", expectedRevision: 1 };
      games.command("white", input); games.command("white", input);
      expect(games.snapshot("g")).toMatchObject({ revision: 2, endReason: "RESIGNATION", result: { winner: "BLACK" } });
    } finally { db.close(); }
  });
  it("times out once using the server deadline and records a system abort without a winner", async () => {
    const { db, games, send } = setup(20);
    try {
      await new Promise(resolve => setTimeout(resolve, 40));
      expect(() => send("black", "late", 0, 0)).toThrow("TURN_EXPIRED");
      games.sweep(); games.sweep();
      expect(games.snapshot("g")).toMatchObject({ revision: 2, endReason: "TIMEOUT", result: { winner: "WHITE" } });
    } finally { db.close(); }
    const other = setup();
    try { other.games.abort("g"); other.games.abort("g"); expect(other.games.snapshot("g")).toMatchObject({ revision: 2, status: "ABORTED", result: null }); }
    finally { other.db.close(); }
  });
});
