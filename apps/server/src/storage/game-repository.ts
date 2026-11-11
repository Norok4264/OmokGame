import type { GameStatus } from "@danpan/shared";
import type { SqliteDatabase } from "./database.js";

export interface PersistGameTransition {
  actorPlayerId: string;
  requestId: string;
  requestHash: string;
  gameId: string;
  expectedRevision: number;
  nextRevision: number;
  status: GameStatus;
  endReason: string | null;
  stateJson: string;
  responseJson: string;
  committedAtUtc: string;
  move?: { playerId: string; x: number; y: number; color: "BLACK" | "WHITE" };
}

export interface CreatePersistedGame {
  actorPlayerId: string;
  requestId: string;
  requestHash: string;
  gameId: string;
  challengeId?: string;
  whitePlayerId: string;
  blackPlayerId: string;
  stateJson: string;
  responseJson: string;
  createdAtUtc: string;
}

export type PersistGameResult =
  | { kind: "committed"; responseJson: string; revision: number }
  | { kind: "replayed"; responseJson: string };

export class RequestIdConflictError extends Error {
  constructor() {
    super("requestId was already used with a different payload");
    this.name = "RequestIdConflictError";
  }
}

export class RevisionConflictError extends Error {
  constructor() {
    super("game revision is stale or the game does not exist");
    this.name = "RevisionConflictError";
  }
}

/** Atomically create a game and store its successful idempotency response. */
export function createPersistedGame(db: SqliteDatabase, input: CreatePersistedGame): PersistGameResult {
  const transaction = db.transaction((): PersistGameResult => {
    const prior = db
      .prepare("SELECT request_hash, response_json FROM successful_requests WHERE actor_player_id = ? AND request_id = ?")
      .get(input.actorPlayerId, input.requestId) as { request_hash: string; response_json: string } | undefined;
    if (prior) {
      if (prior.request_hash !== input.requestHash) throw new RequestIdConflictError();
      return { kind: "replayed", responseJson: prior.response_json };
    }

    db.prepare(`INSERT INTO games
      (game_id, challenge_id, white_player_id, black_player_id, status, revision, state_json, created_at_utc, updated_at_utc)
      VALUES (?, ?, ?, ?, 'PREPARING', 0, ?, ?, ?)`)
      .run(input.gameId, input.challengeId ?? null, input.whitePlayerId, input.blackPlayerId,
        input.stateJson, input.createdAtUtc, input.createdAtUtc);
    db.prepare(`INSERT INTO successful_requests
      (actor_player_id, request_id, request_hash, entity_type, entity_id, response_json, created_at_utc)
      VALUES (?, ?, ?, 'GAME', ?, ?, ?)`)
      .run(input.actorPlayerId, input.requestId, input.requestHash, input.gameId, input.responseJson, input.createdAtUtc);
    return { kind: "committed", responseJson: input.responseJson, revision: 0 };
  });
  return transaction.immediate();
}

/**
 * Persist a validated transition and its successful idempotency record atomically.
 * The caller may publish the returned state to memory or WebSocket clients only
 * after this function returns from COMMIT.
 */
export function persistGameTransition(
  db: SqliteDatabase,
  input: PersistGameTransition,
): PersistGameResult {
  if (input.nextRevision !== input.expectedRevision + 1) {
    throw new RangeError("nextRevision must be exactly expectedRevision + 1");
  }

  const transaction = db.transaction((): PersistGameResult => {
    const prior = db
      .prepare(
        `SELECT request_hash, response_json
         FROM successful_requests WHERE actor_player_id = ? AND request_id = ?`,
      )
      .get(input.actorPlayerId, input.requestId) as
      | { request_hash: string; response_json: string }
      | undefined;

    if (prior) {
      if (prior.request_hash !== input.requestHash) throw new RequestIdConflictError();
      return { kind: "replayed", responseJson: prior.response_json };
    }

    const update = db
      .prepare(
        `UPDATE games
         SET status = ?, end_reason = ?, revision = ?, state_json = ?, updated_at_utc = ?
         WHERE game_id = ? AND revision = ?`,
      )
      .run(
        input.status,
        input.endReason,
        input.nextRevision,
        input.stateJson,
        input.committedAtUtc,
        input.gameId,
        input.expectedRevision,
      );

    if (update.changes !== 1) throw new RevisionConflictError();

    if (input.move) {
      db.prepare(`INSERT INTO game_moves
        (game_id, revision, request_id, player_id, x, y, color, accepted_at_utc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(input.gameId, input.nextRevision, input.requestId, input.move.playerId,
          input.move.x, input.move.y, input.move.color, input.committedAtUtc);
    }

    db.prepare(
      `INSERT INTO successful_requests
       (actor_player_id, request_id, request_hash, entity_type, entity_id, response_json, created_at_utc)
       VALUES (?, ?, ?, 'GAME', ?, ?, ?)`,
    ).run(
      input.actorPlayerId,
      input.requestId,
      input.requestHash,
      input.gameId,
      input.responseJson,
      input.committedAtUtc,
    );

    return { kind: "committed", responseJson: input.responseJson, revision: input.nextRevision };
  });

  return transaction.immediate();
}
