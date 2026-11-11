import type { SqliteDatabase } from "./database.js";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const migrations: readonly Migration[] = [
  {
    version: 1,
    name: "initial_persistent_game_state",
    sql: `
      CREATE TABLE players (
        player_id TEXT PRIMARY KEY,
        nickname_key TEXT NOT NULL UNIQUE,
        nickname_display TEXT NOT NULL,
        created_at_utc TEXT NOT NULL
      );

      CREATE TABLE player_sessions (
        session_id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL REFERENCES players(player_id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_at_utc TEXT NOT NULL,
        expires_at_utc TEXT NOT NULL,
        ended_at_utc TEXT
      );

      CREATE TABLE challenges (
        challenge_id TEXT PRIMARY KEY,
        applicant_player_id TEXT NOT NULL REFERENCES players(player_id),
        acceptor_player_id TEXT NOT NULL REFERENCES players(player_id),
        status TEXT NOT NULL CHECK (status IN ('PENDING','ACCEPTED','DECLINED','CANCELLED','EXPIRED')),
        revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
        created_at_utc TEXT NOT NULL,
        response_deadline_utc TEXT NOT NULL,
        updated_at_utc TEXT NOT NULL,
        CHECK (applicant_player_id <> acceptor_player_id)
      );

      CREATE TABLE games (
        game_id TEXT PRIMARY KEY,
        challenge_id TEXT REFERENCES challenges(challenge_id),
        white_player_id TEXT NOT NULL REFERENCES players(player_id),
        black_player_id TEXT NOT NULL REFERENCES players(player_id),
        status TEXT NOT NULL CHECK (status IN ('PREPARING','ACTIVE','FINISHED','ABORTED','CANCELLED')),
        end_reason TEXT CHECK (end_reason IS NULL OR end_reason IN ('WIN','TIMEOUT','RESIGNATION','DISCONNECT','DRAW','INVALID','SYSTEM_ABORT')),
        revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
        state_json TEXT NOT NULL,
        created_at_utc TEXT NOT NULL,
        updated_at_utc TEXT NOT NULL,
        ended_at_utc TEXT,
        CHECK (white_player_id <> black_player_id),
        CHECK ((status IN ('FINISHED','ABORTED','CANCELLED')) OR end_reason IS NULL)
      );

      CREATE TABLE game_moves (
        game_id TEXT NOT NULL REFERENCES games(game_id) ON DELETE CASCADE,
        revision INTEGER NOT NULL CHECK (revision > 0),
        request_id TEXT NOT NULL,
        player_id TEXT NOT NULL REFERENCES players(player_id),
        x INTEGER NOT NULL CHECK (x BETWEEN 0 AND 14),
        y INTEGER NOT NULL CHECK (y BETWEEN 0 AND 14),
        color TEXT NOT NULL CHECK (color IN ('BLACK','WHITE')),
        accepted_at_utc TEXT NOT NULL,
        PRIMARY KEY (game_id, revision),
        UNIQUE (game_id, request_id)
      );

      CREATE TABLE successful_requests (
        actor_player_id TEXT NOT NULL REFERENCES players(player_id),
        request_id TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('CHALLENGE','GAME')),
        entity_id TEXT NOT NULL,
        response_json TEXT NOT NULL,
        created_at_utc TEXT NOT NULL,
        PRIMARY KEY (actor_player_id, request_id)
      );

      CREATE INDEX challenges_by_participant_status
        ON challenges(status, applicant_player_id, acceptor_player_id);
      CREATE INDEX games_by_player_status
        ON games(status, white_player_id, black_player_id);
      CREATE INDEX sessions_by_expiry ON player_sessions(expires_at_utc);
    `,
  },
];

export function runMigrations(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at_utc TEXT NOT NULL
    );
  `);

  const hasMigration = db.prepare("SELECT 1 AS applied FROM schema_migrations WHERE version = ?");
  const recordMigration = db.prepare(
    "INSERT INTO schema_migrations (version, name, applied_at_utc) VALUES (?, ?, ?)",
  );

  for (const migration of migrations) {
    const found = hasMigration.get(migration.version);
    if (found) continue;

    const apply = db.transaction(() => {
      db.exec(migration.sql);
      recordMigration.run(migration.version, migration.name, new Date().toISOString());
    });
    apply.immediate();
  }
}
