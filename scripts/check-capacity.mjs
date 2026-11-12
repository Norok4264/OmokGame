import {createRequire} from "node:module";
import {once} from "node:events";
import {writeFile,mkdir} from "node:fs/promises";
import assert from "node:assert/strict";
import {createApplicationServer} from "../apps/server/dist/http.js";
const require=createRequire(import.meta.url),Database=require("better-sqlite3"),{WebSocket}=require("ws");
const db=new Database(":memory:"),app=createApplicationServer(db);app.httpServer.listen(0,"127.0.0.1");await once(app.httpServer,"listening");
const url=`ws://127.0.0.1:${app.httpServer.address().port}/ws`,clients=[],report={appVersion:"0.1.0",startedAt:new Date().toISOString(),kind:"40 synthetic clients on one Codex Windows host; no real-device network",completed:false};
class Client{
  rows=[];waiters=[];
  constructor(ws){this.ws=ws;ws.on("message",raw=>{const m=JSON.parse(raw);if(m.type==="heartbeat.request"){void this.command("heartbeat",{sentAtUtc:new Date().toISOString()}).catch(()=>{});return;}const i=this.waiters.findIndex(w=>w.match(m));if(i>=0)this.waiters.splice(i,1)[0].resolve(m);else {this.rows.push(m);if(this.rows.length>500)this.rows.shift();}});}
  wait(match){const i=this.rows.findIndex(match);if(i>=0)return Promise.resolve(this.rows.splice(i,1)[0]);return new Promise((resolve,reject)=>{const w={match,resolve:m=>{clearTimeout(t);resolve(m);}};const t=setTimeout(()=>{this.waiters=this.waiters.filter(x=>x!==w);reject(new Error("Response timeout"));},15000);this.waiters.push(w);});}
  async command(type,body={},id=crypto.randomUUID()){const response=this.wait(m=>m.requestId===id&&["command.result","server.error"].includes(m.type));const start=performance.now();this.ws.send(JSON.stringify({protocolVersion:1,type,requestId:id,...body}));const result=await response;return {result,elapsedMs:performance.now()-start};}
}
async function connect(){const ws=new WebSocket(url,{origin:"http://127.0.0.1:4173"}),client=new Client(ws);clients.push(client);await once(ws,"open");return client;}
try{
  for(let i=0;i<40;i++){const c=await connect(),{result}=await c.command("session.start",{nickname:`Load${i}`});assert(result.ok);c.playerId=result.data.session.playerId;}
  report.authenticatedSessions=40;
  const overflow=await connect();const rejected=await overflow.command("session.start",{nickname:"Overflow"});assert.equal(rejected.result.code,"SESSION_CAPACITY");report.session41Rejected=true;
  const games=[];
  for(let i=0;i<20;i++){
    const white=clients[i*2],black=clients[i*2+1];const request=await white.command("challenge.create",{targetPlayerId:black.playerId});assert(request.result.ok);
    const accepted=await black.command("challenge.respond",{challengeId:request.result.data.challengeId,accept:true});assert(accepted.result.ok);const id=accepted.result.data.gameId;
    await white.command("game.ready",{gameId:id,revision:0});await black.command("game.ready",{gameId:id,revision:0});games.push({id,white,black});
  }
  await Promise.all(games.map(g=>g.black.wait(m=>m.type==="lobby.snapshot"&&m.snapshot.game?.gameId===g.id&&m.snapshot.game.status==="ACTIVE")));
  assert.equal(db.prepare("SELECT count(*) FROM games WHERE status='ACTIVE'").pluck().get(),20);report.activeGames=20;
  const samples=[];
  for(let round=0;round<5;round++)await Promise.all(games.map(async g=>{
    const actor=round%2?g.white:g.black;const {result,elapsedMs}=await actor.command("game.move.propose",{gameId:g.id,expectedRevision:round+1,x:Math.floor(round/2),y:round%2?2:0});assert(result.ok);assert.equal(result.data.approvedRevision,round+2);samples.push(elapsedMs);
  }));
  const sorted=[...samples].sort((a,b)=>a-b);report.syntheticClientAck={count:samples.length,samplesMs:samples,p95Ms:sorted[Math.ceil(sorted.length*.95)-1],measurement:"same Node process performance.now from ws.send to command.result; includes local transport, broadcast, server validation/SQLite; not isolated server processing, browser receipt or paint"};
  report.browserReceipt="not measured here";report.renderUpdate="not measured here";report.networkRttCondition="external <=100ms condition not established; loopback only, no intentional loss";
  report.completed=true;report.finishedAt=new Date().toISOString();console.log(JSON.stringify({completed:true,sessions:40,games:20,ackP95Ms:report.syntheticClientAck.p95Ms}));
}catch(error){report.error=String(error.stack??error);throw error;}
finally{app.lobby.close();for(const c of clients)c.ws.terminate();app.webSocketServer.close();await new Promise(r=>app.httpServer.close(r));db.close();await mkdir("docs/evidence",{recursive:true});await writeFile("docs/evidence/stage10-capacity.json",JSON.stringify(report,null,2));}
