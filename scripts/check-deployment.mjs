import {createRequire} from "node:module";
import {once} from "node:events";
import {spawn} from "node:child_process";
import {createServer} from "node:net";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {createApplicationServer} from "../apps/server/dist/http.js";
import {stopApplication} from "../apps/server/dist/shutdown.js";
const require=createRequire(import.meta.url),Database=require("better-sqlite3"),{WebSocket}=require("ws");
const probe=createServer();await new Promise(r=>probe.listen(0,"127.0.0.1",r));const port=probe.address().port;await new Promise(r=>probe.close(r));const origin=`http://127.0.0.1:${port}`;
const db=new Database(":memory:"),app=createApplicationServer(db,undefined,[origin]);app.httpServer.listen(0,"127.0.0.1");await once(app.httpServer,"listening");const backendPort=app.httpServer.address().port;
const work=resolve(".cache",`deploy-smoke-${Date.now()}`);await mkdir(work,{recursive:true});
const config=(await readFile("deploy/Caddyfile","utf8")).replace("{\n","{\n\tadmin off\n").replace("{$APP_DOMAIN}",origin).replaceAll("server:3001",`127.0.0.1:${backendPort}`).replace("root * /srv",`root * ${JSON.stringify(resolve("apps/web/dist").replaceAll("\\","/"))}`);await writeFile(resolve(work,"Caddyfile"),config);
const report={appVersion:"0.1.0",webBuild:JSON.parse(await readFile("apps/web/dist/offline-manifest.json","utf8")).version,startedAt:new Date().toISOString(),scope:"Windows Caddy 2.11.7 local HTTP proxy test; not Docker or trusted HTTPS/WSS deployment",completed:false};let child,socket,timer;
try{
  child=spawn(resolve(process.env.TEST_CADDY_EXE??".cache/tools/caddy-2.11.7/caddy.exe"),["run","--config",resolve(work,"Caddyfile"),"--adapter","caddyfile"],{windowsHide:true,stdio:["ignore","ignore","pipe"]});let diagnostic="";child.stderr.on("data",b=>diagnostic=(diagnostic+b).slice(-8000));
  for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw new Error("Proxy exited: "+diagnostic);try{if((await fetch(origin+"/api/readyz")).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
  const health=await fetch(origin+"/api/healthz"),ready=await fetch(origin+"/api/readyz"),direct=await fetch(origin+"/readyz"),page=await fetch(origin+"/"),sw=await fetch(origin+"/sw.js"),manifest=await fetch(origin+"/offline-manifest.json");
  assert.equal(health.status,200);assert.equal((await ready.json()).status,"ready");assert.equal(direct.status,200);assert((await page.text()).includes("단판 오목"));assert.equal(sw.headers.get("cache-control"),"no-cache");assert.equal(manifest.headers.get("cache-control"),"no-cache");report.routes={web:page.status,apiHealth:health.status,directReadiness:direct.status,serviceWorker:sw.status,offlineManifest:manifest.status};
  socket=new WebSocket(origin.replace("http:","ws:")+"/ws",{origin});let heartbeatAcks=0;const authenticated=new Promise(resolveAuth=>socket.on("message",raw=>{const m=JSON.parse(raw);if(m.type==="heartbeat.ack")heartbeatAcks++;if(m.type==="command.result"&&m.data?.session)resolveAuth(true);}));await once(socket,"open");socket.send(JSON.stringify({protocolVersion:1,type:"session.start",requestId:crypto.randomUUID(),nickname:""}));await Promise.race([authenticated,new Promise((_,reject)=>setTimeout(()=>reject(new Error("Proxy authentication timeout")),5000).unref())]);
  const started=performance.now();timer=setInterval(()=>socket.send(JSON.stringify({protocolVersion:1,type:"heartbeat",requestId:crypto.randomUUID(),sentAtUtc:new Date().toISOString()})),5000);await new Promise(r=>setTimeout(r,16000));assert.equal(socket.readyState,1);assert(heartbeatAcks>=3);report.webSocket={authenticated:true,heartbeatAcks,observedOpenMs:performance.now()-started,originPreserved:true};report.completed=true;report.finishedAt=new Date().toISOString();console.log(JSON.stringify(report));
}catch(error){report.error=String(error.stack??error);throw error;}
finally{clearInterval(timer);if(socket?.readyState===1){const closed=once(socket,"close");socket.close();await closed;}else socket?.terminate();if(child&&child.exitCode===null){const exited=once(child,"exit");child.kill();await exited;}await stopApplication(app,db);await writeFile("docs/evidence/stage11-deployment-smoke.json",JSON.stringify(report,null,2));}
