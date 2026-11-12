import BetterSqlite3 from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { isDatabaseReady } from "./database.js";
import { runMigrations } from "./migrations.js";
import {
  createPersistedGame,
  persistGameTransition,
  RequestIdConflictError,
  RevisionConflictError,
} from "./game-repository.js";

function fixture() {
  const db = new BetterSqlite3(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  db.prepare("INSERT INTO players (player_id,nickname_key,nickname_display,created_at_utc) VALUES (?,?,?,?)")
    .run("p-white", "white", "White", "2026-11-11T00:00:00.000Z");
  db.prepare("INSERT INTO players (player_id,nickname_key,nickname_display,created_at_utc) VALUES (?,?,?,?)")
    .run("p-black", "black", "Black", "2026-11-11T00:00:00.000Z");
  db.prepare(`INSERT INTO games
    (game_id,white_player_id,black_player_id,status,revision,state_json,created_at_utc,updated_at_utc)
    VALUES (?,?,?,?,?,?,?,?)`)
    .run("g-1", "p-white", "p-black", "ACTIVE", 0, "{}", "2026-11-11T00:00:00.000Z", "2026-11-11T00:00:00.000Z");
  return db;
}

describe("SQLite migrations and atomic game repository", () => {
  it("applies migrations idempotently and reports ready", () => {
    const db = fixture();
    runMigrations(db);
    expect(isDatabaseReady(db)).toBe(true);
    expect(db.prepare("SELECT COUNT(*) AS count FROM schema_migrations").get()).toMatchObject({ count: 2 });
    db.close();
  });

  it("creates a game and successful request record atomically, then replays creation", () => {
    const db = new BetterSqlite3(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    db.prepare("INSERT INTO players (player_id,nickname_key,nickname_display,created_at_utc) VALUES (?,?,?,?)")
      .run("p-white", "white", "White", "2026-11-11T00:00:00.000Z");
    db.prepare("INSERT INTO players (player_id,nickname_key,nickname_display,created_at_utc) VALUES (?,?,?,?)")
      .run("p-black", "black", "Black", "2026-11-11T00:00:00.000Z");
    const input = {
      actorPlayerId: "p-white", requestId: "create-1", requestHash: "sha256:create-1",
      gameId: "g-created", whitePlayerId: "p-white", blackPlayerId: "p-black",
      stateJson: "{}", responseJson: JSON.stringify({ gameId: "g-created", revision: 0 }),
      createdAtUtc: "2026-11-11T00:00:00.000Z",
    };
    expect(createPersistedGame(db, input)).toMatchObject({ kind: "committed", revision: 0 });
    expect(createPersistedGame(db, input)).toEqual({ kind: "replayed", responseJson: input.responseJson });
    expect(db.prepare("SELECT status, revision FROM games WHERE game_id = ?").get("g-created"))
      .toMatchObject({ status: "PREPARING", revision: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM successful_requests WHERE request_id = ?").get("create-1"))
      .toMatchObject({ count: 1 });
    db.close();
  });

  it("commits a transition and successful request record together, then replays the saved response", () => {
    const db = fixture();
    const input = {
      actorPlayerId: "p-white",
      requestId: "r-1",
      requestHash: "sha256:move-1",
      gameId: "g-1",
      expectedRevision: 0,
      nextRevision: 1,
      status: "ACTIVE" as const,
      endReason: null,
      stateJson: JSON.stringify({ revision: 1, move: [7, 7] }),
      responseJson: JSON.stringify({ accepted: true, revision: 1 }),
      committedAtUtc: "2026-11-11T00:00:01.000Z",
      move: { playerId: "p-white", x: 7, y: 7, color: "WHITE" as const },
    };

    const first = persistGameTransition(db, input);
    const replay = persistGameTransition(db, input);
    expect(first).toMatchObject({ kind: "committed", revision: 1 });
    expect(replay).toEqual({ kind: "replayed", responseJson: input.responseJson });
    expect(db.prepare("SELECT revision FROM games WHERE game_id = ?").get("g-1")).toMatchObject({ revision: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM successful_requests").get()).toMatchObject({ count: 1 });
    expect(db.prepare("SELECT revision, x, y, color FROM game_moves WHERE game_id = ?").get("g-1"))
      .toMatchObject({ revision: 1, x: 7, y: 7, color: "WHITE" });
    db.close();
  });

  it("rejects changed payloads for a reused requestId and stale revisions", () => {
    const db = fixture();
    const base = {
      actorPlayerId: "p-white",
      requestId: "r-1",
      requestHash: "first",
      gameId: "g-1",
      expectedRevision: 0,
      nextRevision: 1,
      status: "ACTIVE" as const,
      endReason: null,
      stateJson: "{}",
      responseJson: "{}",
      committedAtUtc: "2026-11-11T00:00:01.000Z",
    };
    persistGameTransition(db, base);

    expect(() => persistGameTransition(db, { ...base, requestHash: "different" })).toThrow(RequestIdConflictError);
    expect(() => persistGameTransition(db, {
      ...base,
      requestId: "r-2",
      requestHash: "second",
      expectedRevision: 0,
      nextRevision: 1,
    })).toThrow(RevisionConflictError);
    expect(db.prepare("SELECT revision FROM games WHERE game_id = ?").get("g-1")).toMatchObject({ revision: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM successful_requests").get()).toMatchObject({ count: 1 });
    db.close();
  });
});
