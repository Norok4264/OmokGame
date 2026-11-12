import {once} from "node:events";
import {it,expect} from "vitest";
import Database from "better-sqlite3";
import {WebSocket} from "ws";
import {createApplicationServer} from "./http.js";
import {stopApplication} from "./shutdown.js";

it("drains a real WebSocket with 1012 before closing SQLite",async()=>{
  const db=new Database(":memory:"),app=createApplicationServer(db);app.httpServer.listen(0,"127.0.0.1");await once(app.httpServer,"listening");
  const port=(app.httpServer.address() as {port:number}).port,socket=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:"http://127.0.0.1:4173"});
  await once(socket,"open");app.lobby.close();expect(app.lobby.isReady()).toBe(false);expect(db.open).toBe(true);
  const closed=once(socket,"close");await stopApplication(app,db);expect((await closed)[0]).toBe(1012);expect(db.open).toBe(false);
});
it("bounds shutdown even if a peer does not acknowledge the WebSocket close",async()=>{
  const db=new Database(":memory:"),app=createApplicationServer(db);app.httpServer.listen(0,"127.0.0.1");await once(app.httpServer,"listening");
  const port=(app.httpServer.address() as {port:number}).port,socket=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:"http://127.0.0.1:4173"});await once(socket,"open");
  socket.close=()=>{};const closed=once(socket,"close");await stopApplication(app,db,30);await closed;expect(db.open).toBe(false);
});
