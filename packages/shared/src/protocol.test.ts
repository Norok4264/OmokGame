import { describe, expect, it } from "vitest";
import { parseClientJson, parseServerJson, PROTOCOL_VERSION } from "./index.js";

describe("shared protocol validation", () => {
  it("accepts a valid move proposal with a bounded coordinate", () => {
    const parsed = parseClientJson(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      type: "game.move.propose",
      requestId: "req-1",
      gameId: "game-1",
      expectedRevision: 3,
      x: 14,
      y: 0,
    }));

    expect(parsed.ok).toBe(true);
  });

  it("rejects unsupported protocol versions and out-of-range coordinates", () => {
    const wrongVersion = parseClientJson(JSON.stringify({ protocolVersion: 2, type: "heartbeat", requestId: "req-1" }));
    const wrongCoordinate = parseClientJson(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      type: "game.move.propose",
      requestId: "req-2",
      gameId: "game-1",
      expectedRevision: 0,
      x: 15,
      y: 0,
    }));

    expect(wrongVersion.ok).toBe(false);
    expect(wrongCoordinate.ok).toBe(false);
  });

  it("validates a success response and rejects malformed chat sequences", () => {
    const success = parseServerJson(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      type: "command.result",
      requestId: "req-3",
      ok: true,
      data: {},
    }));
    const invalidChat = parseServerJson(JSON.stringify({
      protocolVersion: PROTOCOL_VERSION,
      type: "chat.message",
      gameId: "game-1",
      messageId: "msg-1",
      sequence: 0,
      senderPlayerId: "player-1",
      body: "hello",
      createdAtUtc: "2026-11-11T00:00:00Z",
    }));

    expect(success.ok).toBe(true);
    expect(invalidChat.ok).toBe(false);
  });
});
