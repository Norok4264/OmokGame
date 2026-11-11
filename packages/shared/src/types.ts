export type Brand<T, Name extends string> = T & { readonly __brand: Name };

export type PlayerId = Brand<string, "PlayerId">;
export type ChallengeId = Brand<string, "ChallengeId">;
export type GameId = Brand<string, "GameId">;
export type RequestId = Brand<string, "RequestId">;
export type ChatMessageId = Brand<string, "ChatMessageId">;
export type GameRevision = Brand<number, "GameRevision">;
export type ChatSequence = Brand<number, "ChatSequence">;
export type UtcInstant = Brand<string, "UtcInstant">;

export type PresenceState = "ONLINE" | "AWAY" | "DISCONNECTED" | "RECONNECTING";
export type ChallengeStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
export type GameStatus = "PREPARING" | "ACTIVE" | "FINISHED" | "ABORTED" | "CANCELLED";
export type GameEndReason =
  | "WIN"
  | "TIMEOUT"
  | "RESIGNATION"
  | "DISCONNECT"
  | "DRAW"
  | "INVALID"
  | "SYSTEM_ABORT";
export type ResultScreenStatus = "CLOSED" | "OPEN" | "SAVING" | "SAVED" | "SAVE_FAILED";
export type StoneColor = "BLACK" | "WHITE";
export type BoardCell = StoneColor | null;

export interface ConnectionSnapshot {
  state: PresenceState;
  changedAtUtc: UtcInstant;
}

export interface ChallengeSnapshot {
  challengeId: ChallengeId;
  applicantPlayerId: PlayerId;
  acceptorPlayerId: PlayerId;
  status: ChallengeStatus;
  revision: number;
  responseDeadlineUtc: UtcInstant;
}

export interface GameSnapshot {
  gameId: GameId;
  status: GameStatus;
  revision: GameRevision;
  whitePlayerId: PlayerId;
  blackPlayerId: PlayerId;
  currentTurnPlayerId: PlayerId | null;
  board: BoardCell[][];
  endReason: GameEndReason | null;
  turnDeadlineUtc: UtcInstant | null;
}

/** Client-owned display state; it is not authoritative game state. */
export interface ResultScreenSnapshot {
  status: ResultScreenStatus;
  gameId: GameId | null;
}

export interface ApplicationSnapshot {
  protocolVersion: number;
  connection: ConnectionSnapshot;
  challenge: ChallengeSnapshot | null;
  game: GameSnapshot | null;
  serverTimeUtc: UtcInstant;
}

/** Runtime-only deadline. Never persist performance.now() values in SQLite. */
export interface MonotonicDeadline {
  clock: "monotonic";
  deadlineMilliseconds: number;
}

export interface PersistedTimestamps {
  createdAtUtc: UtcInstant;
  updatedAtUtc: UtcInstant;
}
