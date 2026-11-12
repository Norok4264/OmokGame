import { EventEmitter } from "node:events";
import Database from "better-sqlite3";
import type { WebSocketServer } from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LobbyCoordinator } from "./lobby.js";
import { runMigrations } from "./storage/migrations.js";
class Socket extends EventEmitter {
  readyState = 1;
  messages: any[] = [];
  send(raw: string) { this.messages.push(JSON.parse(raw)); }
  close() { this.readyState = 3; } // emit close separately to inject delayed old socket events
  command(type: string, requestId: string, body = {}) { this.emit("message", Buffer.from(JSON.stringify({ protocolVersion: 1, type, requestId, ...body }))); }
  result(id: string) { return this.messages.find(m => m.requestId === id && m.type === "command.result")?.data; }
}
function setup() {
  const db = new Database(":memory:"); runMigrations(db);
  const wss = new EventEmitter(); const lobby = new LobbyCoordinator(db, wss as WebSocketServer);
  const connect = () => { const socket = new Socket(); wss.emit("connection",socket,{}); return socket; };
  const alice = connect(), bob = connect();
  alice.command("session.start","a",{nickname:"Alice"}); bob.command("session.start","b",{nickname:"Bobby"});
  return { db, lobby, connect, alice, bob, close: () => { lobby.close(); db.close(); } };
}
describe("B03/B05 heartbeat and socket ownership with injected disconnection", () => {
  it("B12 does not let the idle-session expiry revoke an ongoing game's recovery token",()=>{
    const s=setup();try{
      const token=s.alice.result("a").session.token;s.alice.command("challenge.create","i",{targetPlayerId:s.bob.result("b").session.playerId});s.bob.command("challenge.respond","a2",{challengeId:s.alice.result("i").challengeId,accept:true});const id=s.bob.result("a2").gameId;
      for(const p of [s.alice,s.bob])p.command("game.ready","r",{gameId:id,revision:0});vi.advanceTimersByTime(3250);
      s.alice.command("session.end","bypass");expect(s.alice.messages.at(-1).code).toBe("ACTIVE_GAME_REQUIRES_RESIGN");
      expect(s.db.prepare("SELECT status FROM games WHERE game_id=?").pluck().get(id)).toBe("ACTIVE");
      s.db.prepare("UPDATE player_sessions SET expires_at_utc=?").run(new Date(Date.now()-1).toISOString());
      const next=s.connect();next.command("session.resume","refresh",{token});expect(next.result("refresh").resumed).toBe(true);expect(next.result("refresh").resultQueryOnly).not.toBe(true);
      expect(next.messages.filter(m=>m.type==="lobby.snapshot").at(-1).snapshot.game.status).toBe("ACTIVE");
    }finally{s.close();}
  });
  it("B12 separates expired game-rejoin permission from retained result query, revokes on reset and denies 24h-old results",()=>{
    const s=setup();try{
      const token=s.alice.result("a").session.token;s.alice.command("challenge.create","invite",{targetPlayerId:s.bob.result("b").session.playerId});
      s.bob.command("challenge.respond","accept",{challengeId:s.alice.result("invite").challengeId,accept:true});const id=s.bob.result("accept").gameId;
      for(const p of [s.alice,s.bob])p.command("game.ready","ready",{gameId:id,revision:0});vi.advanceTimersByTime(3250);
      s.bob.command("game.resign","resign",{gameId:id,expectedRevision:1});s.alice.close();s.alice.emit("close");vi.advanceTimersByTime(60001);
      const query=s.connect();query.command("session.resume","query",{token});expect(query.result("query").resultQueryOnly).toBe(true);
      expect(query.messages.filter(m=>m.type==="lobby.snapshot").at(-1).snapshot.game).toMatchObject({gameId:id,status:"FINISHED",readOnlyResult:true});
      query.command("challenge.create","forbidden",{targetPlayerId:"other"});expect(query.messages.at(-1).code).toBe("RESULT_QUERY_ONLY");
      const next=s.connect();next.command("session.start","new",{nickname:"Alice"});expect(next.result("new").session.playerId).not.toBe(s.alice.result("a").session.playerId);
      query.command("session.end","reset");const revoked=s.connect();revoked.command("session.resume","revoked",{token});expect(revoked.messages.at(-1).code).toBe("SESSION_INVALID");
      // A separate existing session's result permission also cannot pass the exact result expiry.
      vi.setSystemTime(new Date(Date.now()+86400000));const late=s.connect();late.command("session.resume","late",{token:s.bob.result("b").session.token});expect(late.messages.at(-1).code).toBe("SESSION_INVALID");
    }finally{s.close();}
  });
  it("B02 expired challenge rejects late acceptance and cooldown begins at termination",()=>{
    const s=setup();try{
      const target=s.bob.result("b").session.playerId;s.alice.command("challenge.create","first",{targetPlayerId:target});const id=s.alice.result("first").challengeId;
      vi.advanceTimersByTime(29000);s.alice.command("challenge.cancel","cancel",{challengeId:id});
      s.alice.command("challenge.create","early",{targetPlayerId:target});expect(s.alice.messages.at(-1).code).toBe("CHALLENGE_COOLDOWN");
      s.bob.command("heartbeat","keep",{sentAtUtc:new Date().toISOString()});vi.advanceTimersByTime(10000);
      s.alice.command("challenge.create","second",{targetPlayerId:target});const next=s.alice.result("second").challengeId;
      // Keep both alive while the actual 30-second policy elapses on the fake clock.
      const keep=setInterval(()=>{for(const p of [s.alice,s.bob])p.command("heartbeat","h",{sentAtUtc:new Date().toISOString()});},10000);
      vi.advanceTimersByTime(30000);clearInterval(keep);s.bob.command("challenge.respond","late",{challengeId:next,accept:true});
      expect(s.bob.result("late")).toBeUndefined();expect(s.db.prepare("SELECT count(*) FROM games").pluck().get()).toBe(0);
    }finally{s.close();}
  });
  beforeEach(() => vi.useFakeTimers({ toFake: ["Date","performance","setTimeout","clearTimeout","setInterval","clearInterval"] }));
  afterEach(() => vi.useRealTimers());
  it("sends heartbeat at 15s and confirms silence at 30s, while valid responses keep the other socket alive", () => {
    const s = setup();
    try {
      vi.advanceTimersByTime(14999); expect(s.alice.messages.some(m=>m.type === "heartbeat.request")).toBe(false);
      vi.advanceTimersByTime(1); expect(s.alice.messages.some(m=>m.type === "heartbeat.request")).toBe(true);
      s.bob.command("heartbeat","alive",{sentAtUtc:new Date().toISOString()});
      vi.advanceTimersByTime(14999); expect(s.alice.readyState).toBe(1);
      vi.advanceTimersByTime(1); expect(s.alice.readyState).toBe(3); expect(s.bob.readyState).toBe(1);
      const snapshot = s.bob.messages.filter(m=>m.type === "lobby.snapshot").at(-1).snapshot;
      expect(snapshot.players.find((p:any)=>p.nickname === "Alice").state).toBe("RECONNECTING");
    } finally { s.close(); }
  });
  it("old messages, delayed close and old grace timer cannot end the replacement session", () => {
    const s = setup();
    try {
      const token = s.alice.result("a").session.token;
      s.alice.close(); s.alice.emit("close");
      vi.advanceTimersByTime(10000);
      const replacement = s.connect(); replacement.command("session.resume","resume",{token});
      expect(replacement.result("resume").resumed).toBe(true);
      const oldCount = s.alice.messages.length;
      s.alice.command("session.end","stale-end"); s.alice.emit("close");
      expect(s.alice.messages).toHaveLength(oldCount);
      const keep = setInterval(()=>{ replacement.command("heartbeat","keep",{sentAtUtc:new Date().toISOString()}); s.bob.command("heartbeat","keep-b",{sentAtUtc:new Date().toISOString()}); },15000);
      vi.advanceTimersByTime(65000); clearInterval(keep);
      replacement.command("lobby.snapshot.request","still-current");
      expect(replacement.result("still-current")).toMatchObject({accepted:true});
      expect(s.db.prepare("SELECT ended_at_utc FROM player_sessions WHERE player_id=?").get(s.alice.result("a").session.playerId)).toEqual({ended_at_utc:null});
    } finally { s.close(); }
  });
  it("refresh restores the authoritative snapshot and keeps the original game deadline", () => {
    const s=setup();
    try {
      s.alice.command("challenge.create","invite",{targetPlayerId:s.bob.result("b").session.playerId});
      s.bob.command("challenge.respond","accept",{challengeId:s.alice.result("invite").challengeId,accept:true});
      const gameId=s.bob.result("accept").gameId;
      s.alice.command("game.ready","ready-a",{gameId,revision:0}); s.bob.command("game.ready","ready-b",{gameId,revision:0});
      vi.advanceTimersByTime(3250);
      const original=s.db.prepare("SELECT state_json FROM games WHERE game_id=?").get(gameId);
      s.alice.close(); s.alice.emit("close"); vi.advanceTimersByTime(10000);
      const restored=s.connect(); restored.command("session.resume","refresh",{token:s.alice.result("a").session.token});
      expect(s.db.prepare("SELECT state_json FROM games WHERE game_id=?").get(gameId)).toEqual(original);
      expect(restored.messages.find(m=>m.type === "lobby.snapshot").snapshot.game).toMatchObject({gameId,status:"ACTIVE",revision:1});
    } finally { s.close(); }
  });
  it("B05 live takeover is safe even when the old close callback fires synchronously",()=>{
    const s=setup();
    try {
      s.alice.close=()=>{s.alice.readyState=3;s.alice.emit("close");s.alice.command("session.end","old-message");};
      const next=s.connect();next.command("session.resume","takeover",{token:s.alice.result("a").session.token});
      expect(next.result("takeover").resumed).toBe(true);
      next.command("lobby.snapshot.request","working");expect(next.result("working")).toMatchObject({accepted:true});
      expect(s.alice.result("old-message")).toBeUndefined();
    } finally{s.close();}
  });
  it("B06 socket close and grace callbacks survive a database read outage",()=>{
    const s=setup();
    try {
      const spy=vi.spyOn(s.db,"prepare").mockImplementation(()=>{throw new Error("read outage");});
      s.alice.close(); expect(()=>s.alice.emit("close")).not.toThrow();
      expect(()=>vi.advanceTimersByTime(70000)).not.toThrow();
      spy.mockRestore(); expect(s.lobby.isReady()).toBe(true);
    } finally{s.close();}
  });
  it("A07 result expiry cancels a last-millisecond rematch and returns both clients to the lobby",()=>{
    const s=setup();try{
      s.alice.command("challenge.create","invite",{targetPlayerId:s.bob.result("b").session.playerId});
      s.bob.command("challenge.respond","accept",{challengeId:s.alice.result("invite").challengeId,accept:true});
      const gameId=s.bob.result("accept").gameId;
      s.alice.command("game.ready","r-a",{gameId,revision:0});s.bob.command("game.ready","r-b",{gameId,revision:0});vi.advanceTimersByTime(3250);
      s.bob.command("game.resign","resign",{gameId,expectedRevision:1});
      const keep=setInterval(()=>{s.alice.command("heartbeat","keep-a",{sentAtUtc:new Date().toISOString()});s.bob.command("heartbeat","keep-b",{sentAtUtc:new Date().toISOString()});},15000);
      vi.advanceTimersByTime(299999);s.bob.command("game.retry.request","last-request",{gameId});
      expect(s.bob.result("last-request").status).toBe("PENDING");
      vi.advanceTimersByTime(1);s.alice.command("game.retry.respond","late-accept",{gameId,accept:true});clearInterval(keep);
      expect(s.alice.result("late-accept")).toBeUndefined();
      expect(s.db.prepare("SELECT status FROM rematches WHERE game_id=?").get(gameId)).toEqual({status:"CANCELLED"});
      for(const socket of [s.alice,s.bob])expect(socket.messages.filter(m=>m.type==="lobby.snapshot").at(-1).snapshot.game).toBeNull();
    }finally{s.close();}
  });
});
