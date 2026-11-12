import { once } from "node:events";
import BetterSqlite3 from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { createApplicationServer } from "./http.js";
import { DEFAULT_LOBBY_TIMING } from "./lobby.js";
import { runMigrations } from "./storage/migrations.js";

type Message = Record<string, any>;

class TestClient {
  private readonly messages: Message[] = [];
  private readonly waiters: Array<{ predicate: (message: Message) => boolean; resolve: (message: Message) => void; reject: (error: Error) => void }> = [];
  constructor(readonly socket: WebSocket) {
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString()) as Message;
      const index = this.waiters.findIndex((waiter) => waiter.predicate(message));
      if (index >= 0) this.waiters.splice(index, 1)[0]!.resolve(message);
      else this.messages.push(message);
    });
  }

  send(type: string, requestId: string, body: Record<string, unknown> = {}): void {
    this.socket.send(JSON.stringify({ protocolVersion: 1, type, requestId, ...body }));
  }

  waitFor(predicate: (message: Message) => boolean, timeout = 2000): Promise<Message> {
    const found = this.messages.findIndex(predicate);
    if (found >= 0) return Promise.resolve(this.messages.splice(found, 1)[0]!);
    return new Promise((resolve, reject) => {
      const waiter = { predicate, resolve, reject };
      this.waiters.push(waiter);
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        reject(new Error("Timed out waiting for WebSocket message"));
      }, timeout);
      timer.unref();
    });
  }

  command(requestId: string): Promise<Message> {
    return this.waitFor((message) => message.type === "command.result" && message.requestId === requestId ||
      message.type === "server.error" && message.requestId === requestId);
  }

  close(): void { this.socket.close(); }
}

describe("real WebSocket sessions and challenge lifecycle", () => {
  it("normalizes names, issues opaque sessions, rejects duplicates, and atomically creates one game on accept/cancel race", async () => {
    const db = new BetterSqlite3(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    const app = createApplicationServer(db);
    app.httpServer.listen(0, "127.0.0.1");
    await once(app.httpServer, "listening");
    const address = app.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const url = `ws://127.0.0.1:${address.port}/ws`;
    const clients: TestClient[] = [];
    const connect = async () => {
      const socket = new WebSocket(url);
      const client = new TestClient(socket);
      await once(socket, "open");
      clients.push(client);
      await client.waitFor((message) => message.type === "server.hello");
      return client;
    };
    const authenticate = async (client: TestClient, nickname: string, requestId: string, token?: string) => {
      if (token) client.send("session.resume", requestId, { token });
      else client.send("session.start", requestId, { nickname });
      const response = await client.command(requestId);
      return response;
    };

    try {
      let alice = await connect();
      const bob = await connect();
      const aliceResult = await authenticate(alice, "  Ａlice  ", "auth-alice");
      const bobResult = await authenticate(bob, "Bobby", "auth-bob");
      expect(aliceResult.data.session.nickname).toBe("Alice");
      expect(aliceResult.data.session.token).toHaveLength(43);
      expect(aliceResult.data.session.token).not.toContain("/");
      const tokenHash = db.prepare("SELECT token_hash FROM player_sessions WHERE player_id=?").get(aliceResult.data.session.playerId) as { token_hash: string };
      expect(tokenHash.token_hash).not.toBe(aliceResult.data.session.token);

      const duplicate = await connect();
      const duplicateResult = await authenticate(duplicate, "alice", "auth-duplicate");
      expect(duplicateResult).toMatchObject({ type: "server.error", code: "NICKNAME_TAKEN" });

      const resumed = await connect();
      const resumeResult = await authenticate(resumed, "", "auth-resume", aliceResult.data.session.token);
      expect(resumeResult.data.resumed).toBe(true);
      expect(resumeResult.data.session.playerId).toBe(aliceResult.data.session.playerId);
      alice = resumed;

      alice.send("challenge.create", "challenge-create-a", { targetPlayerId: bobResult.data.session.playerId });
      bob.send("challenge.create", "challenge-create-b", { targetPlayerId: aliceResult.data.session.playerId });
      const [createA, createB] = await Promise.all([alice.command("challenge-create-a"), bob.command("challenge-create-b")]);
      const successfulCreate = [createA, createB].filter((result) => result.type === "command.result");
      const rejectedCreate = [createA, createB].filter((result) => result.type === "server.error");
      expect(successfulCreate).toHaveLength(1);
      expect(rejectedCreate).toHaveLength(1);
      expect(rejectedCreate[0]).toMatchObject({ code: "CHALLENGE_LIMIT" });
      const challengeId = successfulCreate[0]!.data.challengeId as string;
      const applicant = createA.type === "command.result" ? alice : bob;
      const recipient = applicant === alice ? bob : alice;
      const applicantId = applicant === alice ? aliceResult.data.session.playerId : bobResult.data.session.playerId;
      const recipientId = recipient === alice ? aliceResult.data.session.playerId : bobResult.data.session.playerId;

      applicant.send("challenge.respond", "unauthorized-response", { challengeId, accept: true });
      expect(await applicant.command("unauthorized-response")).toMatchObject({ type: "server.error", code: "NOT_CHALLENGE_RECIPIENT" });

      recipient.send("challenge.respond", "accept", { challengeId, accept: true });
      applicant.send("challenge.cancel", "cancel-race", { challengeId });
      const [acceptResult, cancelResult] = await Promise.all([recipient.command("accept"), applicant.command("cancel-race")]);
      const gameCount = (db.prepare("SELECT COUNT(*) AS count FROM games WHERE challenge_id=?").get(challengeId) as { count: number }).count;
      expect(gameCount).toBeLessThanOrEqual(1);
      expect([acceptResult.type, cancelResult.type].filter((type) => type === "command.result")).toHaveLength(1);
      if (acceptResult.type === "command.result") {
        expect(gameCount).toBe(1);
        expect(db.prepare("SELECT white_player_id,black_player_id,status FROM games WHERE challenge_id=?").get(challengeId))
        .toMatchObject({ white_player_id: applicantId, black_player_id: recipientId, status: "PREPARING" });
        bob.send("game.ready", "bob-ready", { gameId: acceptResult.data.gameId, revision: 0 });
        expect(await bob.command("bob-ready")).toMatchObject({ type: "command.result", data: { ready: true } });
        applicant.send("game.ready", "applicant-ready", { gameId: acceptResult.data.gameId, revision: 0 });
        expect(await applicant.command("applicant-ready")).toMatchObject({ type: "command.result", data: { ready: true } });
        const prep = db.prepare("SELECT white_ready,black_ready,countdown_started_at_utc FROM game_preparation WHERE game_id=?")
          .get(acceptResult.data.gameId) as { white_ready: number; black_ready: number; countdown_started_at_utc: string | null };
        expect(prep).toMatchObject({ white_ready: 1, black_ready: 1 });
        expect(prep.countdown_started_at_utc).toBeTruthy();
        const activeDeadline = Date.now() + 6_000;
        while (Date.now() < activeDeadline) {
          const status = (db.prepare("SELECT status FROM games WHERE game_id=?").get(acceptResult.data.gameId) as { status: string }).status;
          if (status === "ACTIVE") break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        expect(db.prepare("SELECT status FROM games WHERE game_id=?").get(acceptResult.data.gameId)).toMatchObject({ status: "ACTIVE" });
        const activeSnapshot = await applicant.waitFor((message) => message.type === "lobby.snapshot" && message.snapshot?.game?.status === "ACTIVE");
        expect(activeSnapshot.snapshot.game.color).toBe("WHITE");
        const revision = activeSnapshot.snapshot.game.revision;
        applicant.send("game.move.propose", "wrong-turn", { gameId: acceptResult.data.gameId, expectedRevision: revision, x: 0, y: 0 });
        expect(await applicant.command("wrong-turn")).toMatchObject({ type: "server.error", code: "WRONG_TURN" });
        const move = { gameId: acceptResult.data.gameId, expectedRevision: revision, x: 7, y: 7 };
        recipient.send("game.move.propose", "approved-move", move);
        await recipient.command("approved-move"); // simulate an application losing the first approval
        recipient.send("game.move.propose", "approved-move", move);
        expect(await recipient.command("approved-move")).toMatchObject({ data: { replayed: true, approvedRevision: revision + 1 } });
        const matching = (m: Message) => m.type === "lobby.snapshot" && m.snapshot?.game?.revision === revision + 1;
        const [whiteBoard, blackBoard] = await Promise.all([applicant.waitFor(matching), recipient.waitFor(matching)]);
        expect(whiteBoard.snapshot.game.board).toEqual(blackBoard.snapshot.game.board);
        expect(whiteBoard.snapshot.game.board[7][7]).toBe("BLACK");
        db.exec("CREATE TRIGGER fail_online_result BEFORE INSERT ON successful_requests BEGIN SELECT RAISE(ABORT, 'injected online storage failure'); END;");
        applicant.send("game.resign", "resign-online", { gameId: acceptResult.data.gameId, expectedRevision: revision + 1 });
        expect(await applicant.command("resign-online")).toMatchObject({ type: "server.error" });
        expect(db.prepare("SELECT status,revision FROM games WHERE game_id=?").get(acceptResult.data.gameId)).toEqual({ status: "ACTIVE", revision: revision + 1 });
        db.exec("DROP TRIGGER fail_online_result");
        applicant.send("game.resign", "resign-online", { gameId: acceptResult.data.gameId, expectedRevision: revision + 1 });
        expect(await applicant.command("resign-online")).toMatchObject({ type: "server.error", code: "GAME_NOT_ACTIVE" });
        const finished = (m: Message) => m.type === "lobby.snapshot" && m.snapshot?.game?.status === "ABORTED";
        const [whiteResult, blackResult] = await Promise.all([applicant.waitFor(finished), recipient.waitFor(finished)]);
        expect(whiteResult.snapshot.game.revision).toBe(blackResult.snapshot.game.revision);
        expect(whiteResult.snapshot.game.result).toEqual(blackResult.snapshot.game.result);
      } else {
        expect(gameCount).toBe(0);
        applicant.send("challenge.create", "cooldown-retry", { targetPlayerId: recipientId });
        expect(await applicant.command("cooldown-retry")).toMatchObject({ type: "server.error", code: "CHALLENGE_COOLDOWN" });
      }
    } finally {
      app.lobby.close();
      for (const client of clients) client.close();
      app.webSocketServer.close();
      app.httpServer.close();
      await once(app.httpServer, "close");
      db.close();
    }
  });

  it("allocates unique server-owned guest nicknames for blank requests", async () => {
    const db = new BetterSqlite3(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    const app = createApplicationServer(db);
    app.httpServer.listen(0, "127.0.0.1");
    await once(app.httpServer, "listening");
    const address = app.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const clients: TestClient[] = [];
    try {
      const names: string[] = [];
      for (const suffix of ["one", "two"]) {
        const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
        const client = new TestClient(socket);
        await once(socket, "open");
        clients.push(client);
        await client.waitFor((message) => message.type === "server.hello");
        client.send("session.start", `guest-${suffix}`, { nickname: "" });
        const response = await client.command(`guest-${suffix}`);
        names.push(response.data.session.nickname);
      }
      expect(names).toEqual(["guest1", "guest2"]);
    } finally {
      app.lobby.close();
      for (const client of clients) client.close();
      app.webSocketServer.close();
      app.httpServer.close();
      await once(app.httpServer, "close");
      db.close();
    }
  });

  it("persists a pre-start cancellation without a winner and replays its successful request", async () => {
    const db = new BetterSqlite3(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    const app = createApplicationServer(db, { ...DEFAULT_LOBBY_TIMING, preparationLifetimeMs: 10_000 });
    app.httpServer.listen(0, "127.0.0.1");
    await once(app.httpServer, "listening");
    const address = app.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const clients: TestClient[] = [];
    const connect = async () => {
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
      const client = new TestClient(socket);
      await once(socket, "open");
      clients.push(client);
      await client.waitFor((message) => message.type === "server.hello");
      return client;
    };
    const login = async (client: TestClient, requestId: string, nickname: string) => {
      client.send("session.start", requestId, { nickname });
      return (await client.command(requestId)).data.session as { playerId: string };
    };
    try {
      const white = await connect();
      const black = await connect();
      const whiteSession = await login(white, "login-white", "White");
      const blackSession = await login(black, "login-black", "Black");
      white.send("challenge.create", "challenge", { targetPlayerId: blackSession.playerId });
      const challenge = await white.command("challenge");
      black.send("challenge.respond", "accept", { challengeId: challenge.data.challengeId, accept: true });
      const accepted = await black.command("accept");
      const gameId = accepted.data.gameId as string;

      black.send("game.cancel", "cancel-preparing", { gameId });
      const cancelled = await black.command("cancel-preparing");
      expect(cancelled).toMatchObject({ type: "command.result", data: { gameId, status: "CANCELLED", endReason: null } });
      expect(db.prepare("SELECT status,end_reason FROM games WHERE game_id=?").get(gameId)).toEqual({ status: "CANCELLED", end_reason: null });
      expect(db.prepare("SELECT entity_type,entity_id FROM successful_requests WHERE actor_player_id=? AND request_id=?")
        .get(blackSession.playerId, "cancel-preparing")).toEqual({ entity_type: "GAME", entity_id: gameId });
      black.send("game.cancel", "cancel-preparing", { gameId });
      expect(await black.command("cancel-preparing")).toMatchObject({ type: "command.result", data: { status: "CANCELLED" } });
      expect(db.prepare("SELECT COUNT(*) AS count FROM games WHERE game_id=?").get(gameId)).toMatchObject({ count: 1 });
      void whiteSession;
    } finally {
      app.lobby.close();
      for (const client of clients) client.close();
      app.webSocketServer.close();
      app.httpServer.close();
      await once(app.httpServer, "close");
      db.close();
    }
  });

  it("allows only the invited opponent to decline without creating a game", async () => {
    const db = new BetterSqlite3(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    const app = createApplicationServer(db);
    app.httpServer.listen(0, "127.0.0.1");
    await once(app.httpServer, "listening");
    const address = app.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const clients: TestClient[] = [];
    const connect = async () => {
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
      const client = new TestClient(socket);
      await once(socket, "open");
      clients.push(client);
      await client.waitFor((message) => message.type === "server.hello");
      return client;
    };
    try {
      const applicant = await connect();
      const recipient = await connect();
      const outsider = await connect();
      applicant.send("session.start", "decline-applicant-login", { nickname: "Inviter" });
      const applicantSession = (await applicant.command("decline-applicant-login")).data.session as { playerId: string };
      recipient.send("session.start", "decline-recipient-login", { nickname: "Invitee" });
      const recipientSession = (await recipient.command("decline-recipient-login")).data.session as { playerId: string };
      outsider.send("session.start", "decline-outsider-login", { nickname: "Observer" });
      await outsider.command("decline-outsider-login");

      applicant.send("challenge.create", "decline-challenge-create", { targetPlayerId: recipientSession.playerId });
      const challenge = await applicant.command("decline-challenge-create");
      outsider.send("challenge.respond", "outsider-response", { challengeId: challenge.data.challengeId, accept: false });
      expect(await outsider.command("outsider-response")).toMatchObject({ type: "server.error", code: "NOT_CHALLENGE_RECIPIENT" });

      recipient.send("challenge.respond", "recipient-decline", { challengeId: challenge.data.challengeId, accept: false });
      expect(await recipient.command("recipient-decline")).toMatchObject({ type: "command.result", data: { status: "DECLINED" } });
      expect(db.prepare("SELECT status FROM challenges WHERE challenge_id=?").get(challenge.data.challengeId)).toEqual({ status: "DECLINED" });
      expect(db.prepare("SELECT COUNT(*) AS count FROM games WHERE challenge_id=?").get(challenge.data.challengeId)).toEqual({ count: 0 });
      expect(applicantSession.playerId).toBeTruthy();
    } finally {
      app.lobby.close();
      for (const client of clients) client.close();
      app.webSocketServer.close();
      app.httpServer.close();
      await once(app.httpServer, "close");
      db.close();
    }
  });

  it("auto-cancels an unprepared server game without assigning a result", async () => {
    const db = new BetterSqlite3(":memory:");
    db.pragma("foreign_keys = ON");
    runMigrations(db);
    const app = createApplicationServer(db, { ...DEFAULT_LOBBY_TIMING, preparationLifetimeMs: 120 });
    app.httpServer.listen(0, "127.0.0.1");
    await once(app.httpServer, "listening");
    const address = app.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP address");
    const clients: TestClient[] = [];
    const connect = async () => {
      const socket = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);
      const client = new TestClient(socket);
      await once(socket, "open");
      clients.push(client);
      await client.waitFor((message) => message.type === "server.hello");
      return client;
    };
    try {
      const applicant = await connect();
      const acceptor = await connect();
      applicant.send("session.start", "applicant-login", { nickname: "Applicant" });
      const applicantSession = (await applicant.command("applicant-login")).data.session as { playerId: string };
      acceptor.send("session.start", "acceptor-login", { nickname: "Acceptor" });
      const acceptorSession = (await acceptor.command("acceptor-login")).data.session as { playerId: string };
      applicant.send("challenge.create", "challenge-create", { targetPlayerId: acceptorSession.playerId });
      const challenge = await applicant.command("challenge-create");
      acceptor.send("challenge.respond", "challenge-accept", { challengeId: challenge.data.challengeId, accept: true });
      const accepted = await acceptor.command("challenge-accept");
      await new Promise((resolve) => setTimeout(resolve, 450));
      expect(db.prepare("SELECT status,end_reason FROM games WHERE game_id=?").get(accepted.data.gameId))
        .toEqual({ status: "CANCELLED", end_reason: null });
      expect(applicantSession.playerId).toBeTruthy();
    } finally {
      app.lobby.close();
      for (const client of clients) client.close();
      app.webSocketServer.close();
      app.httpServer.close();
      await once(app.httpServer, "close");
      db.close();
    }
  });
});
