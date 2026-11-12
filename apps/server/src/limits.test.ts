import { once } from "node:events";
import { EventEmitter } from "node:events";
import Database from "better-sqlite3";
import { WebSocket, type WebSocketServer } from "ws";
import { describe,it,expect } from "vitest";
import { createApplicationServer } from "./http.js";
import { LobbyCoordinator } from "./lobby.js";
import { LIMITS,admitRequest,assertGameCapacity,sendBounded } from "./limits.js";
import { runMigrations } from "./storage/migrations.js";
class Socket extends EventEmitter {
  readyState=1;bufferedAmount=0;messages:any[]=[];code=0;
  send(raw:string){this.messages.push(JSON.parse(raw));}
  close(code:number){this.code=code;this.readyState=3;}
  command(type:string,id:string,body={}){this.emit("message",Buffer.from(JSON.stringify({protocolVersion:1,type,requestId:id,...body})));}
}
describe("B08 production admission and limits",()=>{
  it("rejects absent, null, foreign and suffix origins before upgrade; accepts the exact configured origin",async()=>{
    const db=new Database(":memory:"),app=createApplicationServer(db);app.httpServer.listen(0,"127.0.0.1");await once(app.httpServer,"listening");
    const port=(app.httpServer.address() as {port:number}).port;
    try{
      for(const origin of [undefined,"null","http://evil.test","http://127.0.0.1:5173.evil.test"]){
        const status=await new Promise<number>((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,origin?{origin}:{});ws.on("unexpected-response",(_,res)=>{resolve(res.statusCode!);res.resume();ws.terminate();});ws.on("error",()=>{});ws.on("open",()=>{ws.close();reject(new Error("Forbidden origin opened"));});});expect(status).toBe(403);
      }
      const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:"http://127.0.0.1:5173"});await once(ws,"open");ws.close();await once(ws,"close");
    }finally{app.lobby.close();app.webSocketServer.close();await new Promise<void>(r=>app.httpServer.close(()=>r()));db.close();}
  });
  it("closes an actual oversized WebSocket message with 1009 without recording a session",async()=>{
    const db=new Database(":memory:"),app=createApplicationServer(db);app.httpServer.listen(0,"127.0.0.1");await once(app.httpServer,"listening");
    try{const port=(app.httpServer.address() as {port:number}).port;const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:"http://127.0.0.1:5173"});await once(ws,"open");ws.send("x".repeat(8193));const [code]=await once(ws,"close");expect(code).toBe(1009);expect(db.prepare("SELECT count(*) FROM players").pluck().get()).toBe(0);}
    finally{app.lobby.close();app.webSocketServer.close();await new Promise<void>(r=>app.httpServer.close(()=>r()));db.close();}
  });
  it("enforces the exact sliding window and resumes at 10 seconds",()=>{
    const history:number[]=[];for(let i=0;i<100;i++)expect(admitRequest(history,0)).toBe(true);
    expect(admitRequest(history,9999)).toBe(false);expect(history).toHaveLength(100);expect(admitRequest(history,10000)).toBe(true);
  });
  it("disconnects a slow receiver above 1 MiB and never enqueues that message",()=>{
    const socket=new Socket();socket.bufferedAmount=LIMITS.bufferedBytes;sendBounded(socket as unknown as WebSocket,{type:"test"});expect(socket.messages).toHaveLength(1);
    socket.bufferedAmount++;sendBounded(socket as unknown as WebSocket,{type:"test"});expect(socket.code).toBe(4008);expect(socket.messages).toHaveLength(1);
  });
  it("rejects unauthenticated data requests and retains the rate budget across session takeover",()=>{
    const db=new Database(":memory:");runMigrations(db);const wss=new EventEmitter(),lobby=new LobbyCoordinator(db,wss as WebSocketServer);
    const connect=()=>{const s=new Socket();wss.emit("connection",s,{});return s;};
    try{const s=connect();s.command("game.snapshot.request","private",{gameId:"other"});expect(s.messages.at(-1).code).toBe("AUTH_REQUIRED");
      s.command("session.start","login",{nickname:"Tester"});const session=s.messages.find(m=>m.data?.session)?.data.session;
      for(let i=0;i<100;i++)s.command("heartbeat",`h${i}`,{sentAtUtc:new Date().toISOString()});
      const replacement=connect();replacement.command("session.resume","restore",{token:session.token});replacement.command("heartbeat","overflow",{sentAtUtc:new Date().toISOString()});expect(replacement.messages.at(-1).code).toBe("RATE_LIMITED");
    }finally{lobby.close();db.close();}
  });
  it("counts pending games toward the independent 20 game guard",()=>{
    const db=new Database(":memory:");runMigrations(db);const now=new Date().toISOString();for(const p of ["w","b"])db.prepare("INSERT INTO players VALUES(?,?,?,?)").run(p,p,p,now);
    try{for(let i=0;i<20;i++)db.prepare("INSERT INTO games(game_id,white_player_id,black_player_id,status,state_json,created_at_utc,updated_at_utc) VALUES(?,?,?,'PREPARING','{}',?,?)").run(`g${i}`,"w","b",now,now);
      expect(()=>assertGameCapacity(db)).toThrow("GAME_CAPACITY");db.prepare("UPDATE games SET status='CANCELLED' WHERE game_id='g0'").run();expect(()=>assertGameCapacity(db)).not.toThrow();
    }finally{db.close();}
  });
});
