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
