import type {
  ApplicationSnapshot,
  ChallengeId,
  ChatMessageId,
  ChatSequence,
  GameId,
  GameRevision,
  PlayerId,
  RequestId,
  UtcInstant,
} from "./types.js";

export const PROTOCOL_VERSION = 1 as const;

export interface ClientEnvelope {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: string;
  requestId: RequestId;
}

export type ClientMessage =
  | (ClientEnvelope & { type: "client.hello"; clientBuild: string })
  | (ClientEnvelope & { type: "lobby.snapshot.request" })
  | (ClientEnvelope & { type: "challenge.create"; targetPlayerId: PlayerId })
  | (ClientEnvelope & { type: "challenge.respond"; challengeId: ChallengeId; accept: boolean })
  | (ClientEnvelope & { type: "challenge.cancel"; challengeId: ChallengeId })
  | (ClientEnvelope & { type: "game.ready"; gameId: GameId; revision: GameRevision })
  | (ClientEnvelope & {
      type: "game.move.propose";
      gameId: GameId;
      revision: GameRevision;
      x: number;
      y: number;
    })
  | (ClientEnvelope & { type: "game.retry.request"; gameId: GameId; revision: GameRevision })
  | (ClientEnvelope & {
      type: "game.retry.respond";
      gameId: GameId;
      revision: GameRevision;
      accept: boolean;
    })
  | (ClientEnvelope & {
      type: "chat.send";
      gameId: GameId;
      messageId: ChatMessageId;
      body: string;
    })
  | (ClientEnvelope & { type: "heartbeat"; sentAtUtc: UtcInstant });

export interface ServerHello {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "server.hello";
  serverBuild: string;
  serverTimeUtc: UtcInstant;
}

export interface CommandSuccess {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "command.result";
  requestId: RequestId;
  ok: true;
  data: Record<string, unknown>;
}

export interface CommandFailure {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "server.error";
  requestId: RequestId | null;
  ok: false;
  code: string;
  message: string;
  snapshot: ApplicationSnapshot | null;
}

export interface ServerSnapshotMessage {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "snapshot";
  requestId: RequestId | null;
  snapshot: ApplicationSnapshot;
}

export interface ChatMessageEvent {
  protocolVersion: typeof PROTOCOL_VERSION;
  type: "chat.message";
  gameId: GameId;
  messageId: ChatMessageId;
  sequence: ChatSequence;
  senderPlayerId: PlayerId;
  body: string;
  createdAtUtc: UtcInstant;
}

export type ServerMessage =
  | ServerHello
  | CommandSuccess
  | CommandFailure
  | ServerSnapshotMessage
  | ChatMessageEvent
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      type: "game.event";
      gameId: GameId;
      revision: GameRevision;
      event: Record<string, unknown>;
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      type: "challenge.event";
      challengeId: ChallengeId;
      revision: number;
      event: Record<string, unknown>;
    }
  | {
      protocolVersion: typeof PROTOCOL_VERSION;
      type: "heartbeat.ack";
      requestId: RequestId;
      serverTimeUtc: UtcInstant;
    };

export interface ValidationIssue {
  code: "INVALID_JSON" | "INVALID_ENVELOPE" | "UNSUPPORTED_VERSION" | "UNKNOWN_TYPE" | "INVALID_FIELD";
  message: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: ValidationIssue };

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, maxLength = 200): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function integer(value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function utcInstant(value: unknown): value is UtcInstant {
  return typeof value === "string" && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value);
}

function failed(code: ValidationIssue["code"], message: string): ParseResult<never> {
  return { ok: false, error: { code, message } };
}

function parseEnvelope(value: unknown): ParseResult<JsonRecord> {
  if (!isRecord(value)) return failed("INVALID_ENVELOPE", "Message must be a JSON object");
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    return failed("UNSUPPORTED_VERSION", `Expected protocol version ${PROTOCOL_VERSION}`);
  }
  if (!text(value.type, 80) || !text(value.requestId, 128)) {
    return failed("INVALID_ENVELOPE", "type and requestId are required");
  }
  return { ok: true, value };
}

export function parseClientMessage(input: unknown): ParseResult<ClientMessage> {
  const envelope = parseEnvelope(input);
  if (!envelope.ok) return envelope;
  const value = envelope.value;
  const type = value.type;
  const bad = (field: string): ParseResult<never> => failed("INVALID_FIELD", `Invalid ${field}`);

  switch (type) {
    case "client.hello":
      if (!text(value.clientBuild, 80)) return bad("clientBuild");
      break;
    case "lobby.snapshot.request":
      break;
    case "challenge.create":
      if (!text(value.targetPlayerId, 128)) return bad("targetPlayerId");
      break;
    case "challenge.respond":
      if (!text(value.challengeId, 128) || typeof value.accept !== "boolean") return bad("challenge response");
      break;
    case "challenge.cancel":
      if (!text(value.challengeId, 128)) return bad("challengeId");
      break;
    case "game.ready":
    case "game.retry.request":
      if (!text(value.gameId, 128) || !integer(value.revision)) return bad("gameId/revision");
      break;
    case "game.move.propose":
      if (
        !text(value.gameId, 128) ||
        !integer(value.revision) ||
        !integer(value.x, 0, 14) ||
        !integer(value.y, 0, 14)
      ) return bad("move coordinates or revision");
      break;
    case "game.retry.respond":
      if (!text(value.gameId, 128) || !integer(value.revision) || typeof value.accept !== "boolean") {
        return bad("retry response");
      }
      break;
    case "chat.send":
      if (!text(value.gameId, 128) || !text(value.messageId, 128) || !text(value.body, 200)) {
        return bad("chat payload");
      }
      break;
    case "heartbeat":
      if (!utcInstant(value.sentAtUtc)) return bad("sentAtUtc");
      break;
    default:
      return failed("UNKNOWN_TYPE", `Unsupported client message type: ${String(type)}`);
  }

  return { ok: true, value: value as unknown as ClientMessage };
}

export function parseServerMessage(input: unknown): ParseResult<ServerMessage> {
  if (!isRecord(input)) return failed("INVALID_ENVELOPE", "Message must be a JSON object");
  if (input.protocolVersion !== PROTOCOL_VERSION) {
    return failed("UNSUPPORTED_VERSION", `Expected protocol version ${PROTOCOL_VERSION}`);
  }
  if (!text(input.type, 80)) return failed("INVALID_ENVELOPE", "type is required");

  switch (input.type) {
    case "server.hello":
      if (!text(input.serverBuild, 80) || !utcInstant(input.serverTimeUtc)) return failed("INVALID_FIELD", "Invalid server hello");
      break;
    case "command.result":
      if (!text(input.requestId, 128) || input.ok !== true || !isRecord(input.data)) return failed("INVALID_FIELD", "Invalid command result");
      break;
    case "server.error":
      if (
        !(input.requestId === null || text(input.requestId, 128)) ||
        input.ok !== false ||
        !text(input.code, 80) ||
        !text(input.message, 500) ||
        !(input.snapshot === null || isRecord(input.snapshot))
      ) return failed("INVALID_FIELD", "Invalid server error");
      break;
    case "snapshot":
      if (!(input.requestId === null || text(input.requestId, 128)) || !isRecord(input.snapshot)) {
        return failed("INVALID_FIELD", "Invalid snapshot envelope");
      }
      break;
    case "chat.message":
      if (
        !text(input.gameId, 128) || !text(input.messageId, 128) || !integer(input.sequence, 1) ||
        !text(input.senderPlayerId, 128) || !text(input.body, 200) || !utcInstant(input.createdAtUtc)
      ) return failed("INVALID_FIELD", "Invalid chat event");
      break;
    case "game.event":
      if (!text(input.gameId, 128) || !integer(input.revision, 1) || !isRecord(input.event)) return failed("INVALID_FIELD", "Invalid game event");
      break;
    case "challenge.event":
      if (!text(input.challengeId, 128) || !integer(input.revision, 1) || !isRecord(input.event)) return failed("INVALID_FIELD", "Invalid challenge event");
      break;
    case "heartbeat.ack":
      if (!text(input.requestId, 128) || !utcInstant(input.serverTimeUtc)) return failed("INVALID_FIELD", "Invalid heartbeat acknowledgement");
      break;
    default:
      return failed("UNKNOWN_TYPE", `Unsupported server message type: ${input.type}`);
  }

  return { ok: true, value: input as unknown as ServerMessage };
}

export function parseClientJson(raw: string): ParseResult<ClientMessage> {
  try {
    return parseClientMessage(JSON.parse(raw) as unknown);
  } catch {
    return failed("INVALID_JSON", "Message is not valid JSON");
  }
}

export function parseServerJson(raw: string): ParseResult<ServerMessage> {
  try {
    return parseServerMessage(JSON.parse(raw) as unknown);
  } catch {
    return failed("INVALID_JSON", "Message is not valid JSON");
  }
}
