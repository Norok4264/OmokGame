import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {once} from "node:events";
import {createRequire} from "node:module";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
const require=createRequire(import.meta.url),Database=require("better-sqlite3"),{WebSocket}=require("ws");
const dir=resolve(".cache",`stage10-restart-${Date.now()}`);await mkdir(dir,{recursive:true});const file=resolve(dir,"restart.sqlite");
const probe=createServer();await new Promise(r=>probe.listen(0,"127.0.0.1",r));const port=probe.address().port;await new Promise(r=>probe.close(r));
const report={appVersion:"0.1.0",build:JSON.parse(await readFile("apps/web/dist/offline-manifest.json","utf8")).version,startedAt:new Date().toISOString(),kind:"actual isolated Node process kill/restart with file-backed WAL SQLite; not production hardware failure",completed:false};let child;const clients=[];
async function boot(){child=spawn(process.execPath,["apps/server/dist/index.js"],{cwd:process.cwd(),windowsHide:true,env:{...process.env,PORT:String(port),HOST:"127.0.0.1",DATABASE_PATH:file,ALLOWED_ORIGINS:"http://127.0.0.1:4173"},stdio:["ignore","pipe","pipe"]});let error="";child.stderr.on("data",d=>error+=d);for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error("Child startup failed: "+error);try{const response=await fetch(`http://127.0.0.1:${port}/readyz`);if(response.status===200)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error("Startup timeout");}
class Client{
  rows=[];waiters=[];
  constructor(ws){this.ws=ws;ws.on("message",raw=>{const m=JSON.parse(raw);const i=this.waiters.findIndex(w=>w.match(m));if(i>=0)this.waiters.splice(i,1)[0].resolve(m);else this.rows.push(m);});}
  wait(match){const i=this.rows.findIndex(match);if(i>=0)return Promise.resolve(this.rows.splice(i,1)[0]);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Response timeout")),7000);timer.unref();this.waiters.push({match,resolve:m=>{clearTimeout(timer);resolve(m);}});});}
  async command(type,body={}){const id=crypto.randomUUID(),result=this.wait(m=>m.requestId===id&&["server.error","command.result"].includes(m.type));this.ws.send(JSON.stringify({protocolVersion:1,type,requestId:id,...body}));const r=await result;assert(r.ok,JSON.stringify({code:r.code}));return r.data;}
}
async function login(name,token){const ws=new WebSocket(`ws://127.0.0.1:${port}/ws`,{origin:"http://127.0.0.1:4173"}),c=new Client(ws);clients.push(c);await once(ws,"open");c.session=(await c.command(token?"session.resume":"session.start",token?{token}:{nickname:name})).session;return c;}
try{
  await boot();const pair=[];for(let i=0;i<6;i++)pair.push(await login(`Restart${i}`));const games=[];
  for(let i=0;i<3;i++){const w=pair[i*2],b=pair[i*2+1],challenge=await w.command("challenge.create",{targetPlayerId:b.session.playerId}),accepted=await b.command("challenge.respond",{challengeId:challenge.challengeId,accept:true});games.push({id:accepted.gameId,w,b});if(i<2){await w.command("game.ready",{gameId:accepted.gameId,revision:0});await b.command("game.ready",{gameId:accepted.gameId,revision:0});}}
  for(const g of games.slice(0,2))await g.w.wait(m=>m.type==="lobby.snapshot"&&m.snapshot.game?.gameId===g.id&&m.snapshot.game.status==="ACTIVE");
  await games[0].w.command("game.resign",{gameId:games[0].id,expectedRevision:1});await games[1].b.command("game.move.propose",{gameId:games[1].id,expectedRevision:1,x:7,y:7});
  const dbBefore=new Database(file,{readonly:true});const before=games.map(g=>dbBefore.prepare("SELECT status,revision,end_reason,state_json FROM games WHERE game_id=?").get(g.id));dbBefore.close();
  const exited=once(child,"exit");child.kill("SIGKILL");await exited;for(const c of clients)c.ws.terminate();await boot();
  const dbAfter=new Database(file,{readonly:true}),after=games.map(g=>dbAfter.prepare("SELECT status,revision,end_reason,state_json FROM games WHERE game_id=?").get(g.id));dbAfter.close();
  assert.equal(after[0].state_json,before[0].state_json);assert.equal(after[0].revision,before[0].revision);assert.equal(after[0].status,"FINISHED");
  assert.equal(after[1].status,"ABORTED");assert.equal(after[1].end_reason,"SYSTEM_ABORT");assert.equal(after[1].revision,before[1].revision+1);assert.equal(after[2].status,"CANCELLED");
  const restored=await login("",games[0].b.session.token);const state=await restored.wait(m=>m.type==="lobby.snapshot"&&m.snapshot.game?.gameId===games[0].id);assert.equal(state.snapshot.game.status,"FINISHED");assert.equal(state.snapshot.game.result.winner,"BLACK");
  report.transitions=before.map((row,i)=>({before:{status:row.status,revision:row.revision},after:{status:after[i].status,revision:after[i].revision,endReason:after[i].end_reason}}));report.savedResultReauthenticated=true;report.readyAfterReconciliation=true;report.completed=true;report.finishedAt=new Date().toISOString();console.log(JSON.stringify(report));
}catch(error){report.error=String(error.stack??error);throw error;}
finally{for(const c of clients)c.ws.terminate();if(child&&child.exitCode===null){const exited=once(child,"exit");child.kill("SIGKILL");await exited;}await mkdir("docs/evidence",{recursive:true});await writeFile("docs/evidence/stage10-restart.json",JSON.stringify(report,null,2));}
