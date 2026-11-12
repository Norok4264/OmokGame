import {createRequire} from "node:module";
import {mkdir,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
const require=createRequire(process.env.TEST_NODE_MODULES?resolve(process.env.TEST_NODE_MODULES,"package.json"):resolve("package.json"));
const {chromium}=require("playwright");
const origin=process.env.TEST_ORIGIN??"http://127.0.0.1:4173";
const tag=process.env.TEST_EVIDENCE_TAG??"stage8";if(!/^[a-z0-9-]+$/.test(tag))throw new Error("Invalid evidence tag");
const profile=resolve(".cache",`offline-evidence-${Date.now()}`),evidence=resolve("docs/evidence");await mkdir(evidence,{recursive:true});
let context;
const result={appVersion:"0.1.0",origin,profile,startedAt:new Date().toISOString(),kind:"isolated headless desktop browser; not Android",onlineRequests:[],completed:false};
const launch=()=>chromium.launchPersistentContext(profile,{headless:true,executablePath:process.env.TEST_BROWSER_EXE,viewport:{width:1280,height:1000},acceptDownloads:true});
function observe(ctx){ctx.on("request",r=>{if(/\/(api|ws)(\/|$)/.test(new URL(r.url()).pathname))result.onlineRequests.push(r.url());});}
async function instrument(ctx){await ctx.addInitScript(()=>{
  window.__botEvidence=[];const send=Worker.prototype.postMessage;
  Worker.prototype.postMessage=function(data,...rest){const start=performance.now();this.addEventListener("message",event=>{window.__botEvidence.push({kind:data.kind,revision:data.revision,elapsedMs:event.data.elapsedMs,roundTripMs:performance.now()-start});},{once:true});return send.call(this,data,...rest);};
});}
try{
  context=await launch();observe(context);await instrument(context);let page=context.pages()[0]??await context.newPage();
  await page.goto(origin);await page.getByText("혼자 놀기 오프라인 준비 완료",{exact:true}).waitFor({timeout:60000});
  result.browser=context.browser()?.version();result.build=await page.evaluate(async()=>await(await fetch("/offline-manifest.json")).json());
  result.cacheKeys=await page.evaluate(async()=>{const found=[];for(const key of await caches.keys())for(const req of await(await caches.open(key)).keys())found.push(new URL(req.url).pathname);return found;});
  assert(!result.cacheKeys.some(p=>/^\/(api|ws|healthz|readyz)/.test(p)));
  await page.screenshot({path:resolve(evidence,`${tag}-ready.png`),fullPage:true});
  await page.getByRole("button",{name:"혼자 놀기",exact:true}).click();
  await page.getByRole("button",{name:"H8 BLACK",exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector(".solo-game")?.getAttribute("data-revision")==="1");
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("danpan-omok-solo-v1")));
  assert.deepEqual(saved.moves,[{x:7,y:7}]);assert.equal(await page.getByRole("log").count(),0);assert.equal(await page.getByText("남은 시간",{exact:true}).count(),0);
  result.gameId=saved.gameId;
  result.workerSamples=await page.evaluate(()=>window.__botEvidence);
  await context.setOffline(true);await context.close();context=await launch();observe(context);await instrument(context);await context.setOffline(true);
  page=context.pages()[0]??await context.newPage();await page.goto(origin);
  await page.getByRole("button",{name:"H8 BLACK",exact:true}).waitFor();
  const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem("danpan-omok-solo-v1")));
  assert.equal(restored.gameId,saved.gameId);assert.deepEqual(restored.moves,saved.moves);result.restored=true;
  await page.getByText("혼자 놀기 오프라인 준비 완료",{exact:true}).waitFor({timeout:15000});
  result.whiteTurnRestoreDidNotRecalculate=!(await page.evaluate(()=>window.__botEvidence)).some(s=>s.kind==="move");assert(result.whiteTurnRestoreDidNotRecalculate);
  for(let turn=0;turn<113;turn++){
    if(await page.locator('.solo-game[data-status="FINISHED"]').count())break;
    const state=await page.evaluate(()=>JSON.parse(localStorage.getItem("danpan-omok-solo-v1")));
    const occupied=new Set(state.moves.map(p=>p.x+","+p.y));let point;
    for(let y=0;y<15&&!point;y++)for(let x=0;x<15;x++)if(!occupied.has(x+","+y)){point={x,y};break;}
    assert(point);const label=String.fromCharCode(65+point.x)+(point.y+1)+" 빈 교차점";
    await page.getByRole("button",{name:label,exact:true}).click();await page.getByRole("button",{name:"돌 놓기",exact:true}).click();
    await page.waitForFunction(revision=>document.querySelector('.solo-game[data-status="FINISHED"]')||Number(document.querySelector(".solo-game")?.getAttribute("data-revision"))>=revision+2,state.revision,{timeout:5000});
  }
  await page.locator('.solo-game[data-status="FINISHED"]').waitFor();result.finalMoves=(await page.evaluate(()=>JSON.parse(localStorage.getItem("danpan-omok-solo-v1")))).moves;
  result.finalResult=await page.getByRole("dialog").innerText();await page.screenshot({path:resolve(evidence,`${tag}-offline-final.png`),fullPage:true});
  result.workerSamples.push(...await page.evaluate(()=>window.__botEvidence));
  const timings=result.workerSamples.filter(s=>s.kind==="move").map(s=>s.roundTripMs);result.observedBotMaxRoundTripMs=Math.max(...timings);result.botGoalObserved=timings.every(t=>t<=1000);
  await page.reload();await page.getByRole("dialog").waitFor();await page.getByText("혼자 놀기 오프라인 준비 완료",{exact:true}).waitFor({timeout:15000});
  result.finishedRestoreDidNotRecalculate=!(await page.evaluate(()=>window.__botEvidence)).some(s=>s.kind==="move");assert(result.finishedRestoreDidNotRecalculate);
  assert.equal(result.onlineRequests.length,0);result.completed=true;
  await page.getByRole("dialog").getByRole("button",{name:"초기 화면으로 · 저장판 삭제",exact:true}).click();
  assert.equal(await page.evaluate(()=>localStorage.getItem("danpan-omok-solo-v1")),null);result.exitDeleted=true;
  // Inject a stalled move task, close the browser on BLACK's saved turn, then
  // reopen without injection: only that active bot turn must be recomputed.
  await page.evaluate(()=>{const send=Worker.prototype.postMessage;Worker.prototype.postMessage=function(data,...rest){if(data.kind==="move"&&data.revision===2)return;return send.call(this,data,...rest);};});
  await page.getByRole("button",{name:"혼자 놀기",exact:true}).click();await page.getByRole("button",{name:"H8 BLACK",exact:true}).waitFor();
  await page.getByRole("button",{name:"A1 빈 교차점",exact:true}).click();await page.getByRole("button",{name:"돌 놓기",exact:true}).click();
  const interrupted=await page.evaluate(()=>JSON.parse(localStorage.getItem("danpan-omok-solo-v1")));assert.equal(interrupted.revision,2);
  assert.notEqual(interrupted.gameId,saved.gameId);result.replayNewId=true;
  await context.close();context=await launch();observe(context);await context.setOffline(true);page=context.pages()[0]??await context.newPage();await page.goto(origin);
  await page.waitForFunction(()=>document.querySelector(".solo-game")?.getAttribute("data-revision")==="3");
  const botRestored=await page.evaluate(()=>JSON.parse(localStorage.getItem("danpan-omok-solo-v1")));assert.equal(botRestored.gameId,interrupted.gameId);assert.equal(botRestored.moves.length,3);result.botTurnRestoredExactlyOnce=true;
  await page.getByRole("button",{name:"초기 화면으로 · 저장판 삭제",exact:true}).click();
  result.finishedAt=new Date().toISOString();console.log(JSON.stringify({completed:result.completed,build:result.build.version,restored:result.restored,moves:result.finalMoves.length,browser:result.browser,exitDeleted:result.exitDeleted}));
}catch(error){result.error=String(error.stack??error);throw error;}
finally{await context?.close();await writeFile(resolve(evidence,`${tag}-offline.json`),JSON.stringify(result,null,2));}
