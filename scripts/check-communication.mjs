import {createRequire} from "node:module";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
import {createApplicationServer} from "../apps/server/dist/http.js";
const local=createRequire(import.meta.url),Database=local("better-sqlite3");
const tools=createRequire(process.env.TEST_NODE_MODULES?resolve(process.env.TEST_NODE_MODULES,"package.json"):resolve("package.json"));const {chromium}=tools("playwright");
const db=new Database(":memory:"),app=createApplicationServer(db);
await new Promise((resolve,reject)=>{app.httpServer.once("error",reject);app.httpServer.listen(3001,"127.0.0.1",resolve);});
const tag=process.env.TEST_EVIDENCE_TAG??"stage9";if(!/^[a-z0-9-]+$/.test(tag))throw new Error("Invalid tag");
const origin=process.env.TEST_ORIGIN??"http://127.0.0.1:4173",output=resolve("docs/evidence");await mkdir(output,{recursive:true});
const report={appVersion:"0.1.0",origin,kind:"sanitized application events; not packet capture",completed:false};let browser;
async function collect(page){return page.locator(".communication-events tbody tr").evaluateAll(rows=>rows.map(row=>{const c=[...row.querySelectorAll("td")].map(td=>td.textContent);return {atUtc:c[0],kindAndDirection:c[1],coordinate:c[2],revision:c[3],payloadBytes:Number(c[4].match(/\d+/)?.[0]),applicationRtt:c[5],summary:JSON.parse(c[6])};}));}
try{
  browser=await chromium.launch({headless:true,executablePath:process.env.TEST_BROWSER_EXE});report.browser=browser.version();
  const contextA=await browser.newContext({viewport:{width:1280,height:1000}}),contextB=await browser.newContext({viewport:{width:1280,height:1000}});
  const a=await contextA.newPage(),b=await contextB.newPage(),framesA=[],framesB=[];
  for(const [page,frames]of [[a,framesA],[b,framesB]])page.on("websocket",ws=>{ws.on("framesent",f=>frames.push({direction:"SEND",raw:String(f.payload)}));ws.on("framereceived",f=>frames.push({direction:"RECEIVE",raw:String(f.payload)}));});
  for(const [page,name]of [[a,"TraceA"],[b,"TraceB"]]){await page.goto(origin);await page.getByLabel("닉네임",{exact:true}).fill(name);await page.getByRole("button",{name:/대기열 입장/}).click();await page.getByText("실제 WebSocket 세션 연결됨",{exact:true}).waitFor();}
  report.build=await a.evaluate(async()=>await(await fetch("/offline-manifest.json")).json().then(m=>m.version));
  // B requests, A accepts: A is BLACK and performs the demonstrated A→server→B move.
  await b.getByRole("button",{name:/TraceA/}).click();await b.getByRole("button",{name:"신청 보내기",exact:true}).click();await a.getByRole("button",{name:"승낙",exact:true}).click();
  await a.getByRole("button",{name:"대국 준비 완료",exact:true}).click();await b.getByRole("button",{name:"대국 준비 완료",exact:true}).click();
  await a.getByRole("grid").waitFor();await b.getByRole("grid").waitFor();
  await a.getByRole("button",{name:"H8 빈 교차점",exact:true}).click();await a.getByRole("button",{name:"돌 놓기",exact:true}).click();
  await a.getByRole("button",{name:"H8 BLACK",exact:true}).waitFor();await b.getByRole("button",{name:"H8 BLACK",exact:true}).waitFor();
  const chatBody="검증용 비공개 한글 본문";
  await a.getByRole("textbox",{name:/^메시지/}).fill(chatBody);await a.getByRole("button",{name:"전송",exact:true}).click();await b.getByRole("log").getByText(chatBody,{exact:true}).waitFor();
  for(const page of [a,b])await page.locator(".communication-view > summary").click();
  report.eventsA=await collect(a);report.eventsB=await collect(b);
  const rawMove=framesA.find(f=>f.direction==="SEND"&&JSON.parse(f.raw).type==="game.move.propose"),move=JSON.parse(rawMove.raw);
  const event=report.eventsA.find(e=>e.kindAndDirection.includes("game.move.propose")&&e.kindAndDirection.includes("브라우저 → 서버"));
  assert.equal(event.payloadBytes,Buffer.byteLength(rawMove.raw,"utf8"));assert(event.coordinate.includes("H8 (7,7)"));assert(event.revision.includes("예상 1"));
  report.originalMovePayloadBytes=event.payloadBytes;
  const committed=db.prepare("SELECT revision,state_json FROM games WHERE game_id=?").get(move.gameId);assert.equal(committed.revision,2);assert.equal(JSON.parse(committed.state_json).board[7][7],"BLACK");
  assert(report.eventsB.some(e=>e.coordinate.includes("H8 (7,7)")&&e.revision.includes("현재 2")));
  const chatEvent=report.eventsA.find(e=>e.kindAndDirection.includes("chat.send"));assert.equal(chatEvent.summary.chatLength,[...chatBody].length);
  const protectedValues=[chatBody,move.gameId,move.requestId];
  for(const frame of [...framesA,...framesB]){const message=JSON.parse(frame.raw);const token=message.data?.session?.token;if(token)protectedValues.push(token);}
  const sanitized=JSON.stringify([report.eventsA,report.eventsB]);for(const value of protectedValues)assert(!sanitized.includes(value),"redaction check failed");
  assert(report.eventsA.some(e=>/\d/.test(e.applicationRtt)&&e.applicationRtt.includes("ms")));
  report.redactionPassed=true;report.samePayloadByteCountPassed=true;report.bothBoardsMatch=true;report.chatLength=[...chatBody].length;
  await a.locator(".communication-view").screenshot({path:resolve(output,`${tag}-communication-a.png`)});await b.locator(".communication-view").screenshot({path:resolve(output,`${tag}-communication-b.png`)});
  await a.getByRole("button",{name:"표시 기록 지우기",exact:true}).click();assert.equal(await a.locator(".communication-events tbody tr").count(),0);report.clearPassed=true;
  report.completed=true;report.finishedAt=new Date().toISOString();console.log(JSON.stringify({completed:true,build:report.build,eventsA:report.eventsA.length,eventsB:report.eventsB.length,movePayloadBytes:report.originalMovePayloadBytes,redactionPassed:true}));
}catch(error){report.error=String(error.stack??error);throw error;}
finally{await browser?.close();app.lobby.close();app.webSocketServer.close();await new Promise(r=>app.httpServer.close(r));db.close();await writeFile(resolve(output,`${tag}-application-events.json`),JSON.stringify(report,null,2));}
