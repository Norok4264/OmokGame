import {createRequire} from "node:module";
import {resolve} from "node:path";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import assert from "node:assert/strict";
import {createApplicationServer} from "../apps/server/dist/http.js";
const local=createRequire(import.meta.url),Database=local("better-sqlite3");
const require=createRequire(resolve(process.env.TEST_NODE_MODULES,"package.json")),{chromium}=require("playwright"),sharp=require("sharp");
const tag=process.env.TEST_EVIDENCE_TAG??"stage11";if(!/^[a-z0-9-]+$/.test(tag))throw new Error("Invalid evidence tag");
const out=resolve("docs/evidence"),origin="http://127.0.0.1:4173",db=new Database(":memory:"),app=createApplicationServer(db),browsers=[];
await mkdir(out,{recursive:true});await new Promise((r,j)=>{app.httpServer.once("error",j);app.httpServer.listen(3001,"127.0.0.1",r);});
const report={appVersion:"0.1.0",startedAt:new Date().toISOString(),node:process.version,kind:"isolated desktop Chrome/Edge on ONE host, not PC-PC or Android",completed:false};
try{
  const chrome=await chromium.launch({headless:true,executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});browsers.push(chrome);
  const edge=await chromium.launch({headless:true,executablePath:"C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"});browsers.push(edge);
  report.chrome=chrome.version();report.edge=edge.version();
  const ca=await chrome.newContext({viewport:{width:1280,height:1000},acceptDownloads:true}),cb=await edge.newContext({viewport:{width:1280,height:1000}});
  for(const c of [ca,cb])await c.addInitScript(()=>{
    window.__timing={ack:[],receiptToDom:[]};const Native=window.WebSocket;const sent=new Map();let latest,lastRevision=-1;
    window.WebSocket=class extends Native{
      constructor(...args){super(...args);this.addEventListener("message",event=>{const m=JSON.parse(event.data),t=performance.now();if(m.type==="command.result"&&sent.has(m.requestId)){window.__timing.ack.push(t-sent.get(m.requestId));sent.delete(m.requestId);}if(m.type==="lobby.snapshot"&&m.snapshot.game?.lastMove&&m.snapshot.game.revision>lastRevision){lastRevision=m.snapshot.game.revision;latest={at:t,point:{...m.snapshot.game.lastMove,color:m.snapshot.game.board[m.snapshot.game.lastMove.y][m.snapshot.game.lastMove.x]},revision:m.snapshot.game.revision};}});}
      send(raw){const m=JSON.parse(raw);if(m.type==="game.move.propose")sent.set(m.requestId,performance.now());super.send(raw);}
    };
    new MutationObserver(()=>{if(!latest)return;const p=latest.point,label=String.fromCharCode(65+p.x)+(p.y+1)+" "+p.color;
      if(document.querySelector(`[aria-label="${label}"]`)){window.__timing.receiptToDom.push({revision:latest.revision,elapsedMs:performance.now()-latest.at});latest=null;}
    }).observe(document,{subtree:true,childList:true,attributes:true});
  });
  const a=await ca.newPage(),b=await cb.newPage();report.browserSends=[];for(const [page,label] of [[a,"A"],[b,"B"]])page.on("websocket",ws=>ws.on("framesent",frame=>{const m=JSON.parse(String(frame.payload));if(["game.move.propose","chat.send"].includes(m.type))report.browserSends.push({browser:label,type:m.type,requestIdShort:m.requestId.slice(0,8),gameIdShort:m.gameId.slice(0,8),x:m.x,y:m.y,expectedRevision:m.expectedRevision,chatLength:typeof m.body==="string"?[...m.body].length:undefined});}));for(const [page,name]of [[a,"CheckA"],[b,"CheckB"]]){await page.goto(origin);await page.getByLabel("닉네임",{exact:true}).fill(name);await page.getByRole("button",{name:/대기열 입장/}).click();await page.getByText("실제 WebSocket 세션 연결됨",{exact:true}).waitFor();}
  report.build=(await a.evaluate(async()=>await(await fetch("/offline-manifest.json")).json())).version;
  await b.getByRole("button",{name:/CheckA/}).click();await b.getByRole("button",{name:"신청 보내기",exact:true}).click();await a.getByRole("button",{name:"승낙",exact:true}).click();
  for(const p of [a,b])await p.getByRole("button",{name:"대국 준비 완료",exact:true}).click();for(const p of [a,b])await p.getByRole("grid").waitFor();
  const gameId=db.prepare("SELECT game_id FROM games").pluck().get();
  // Candidate must remain a preview until explicit confirmation.
  await a.getByRole("button",{name:"A1 빈 교차점",exact:true}).click();assert.equal(await a.getByRole("button",{name:"A1 BLACK",exact:true}).count(),0);assert.equal(db.prepare("SELECT count(*) FROM game_moves").pluck().get(),0);report.previewNotCommitted=true;
  await a.getByRole("grid").focus();await a.getByRole("grid").press("ArrowRight");await a.getByText("후보: B1",{exact:true}).waitFor();await a.getByRole("grid").press("Escape");await a.getByText("후보: 교차점을 선택하세요",{exact:true}).waitFor();report.arrowAndEscape=true;
  // Composition Enter and pasted HTML must remain safe text. This injects DOM composition events, not a real Korean IME.
  const input=a.getByRole("textbox",{name:/^메시지/});const text='<img src=x onerror="window.__xss=true"> 한글';await input.fill(text);
  await input.dispatchEvent("compositionstart");await input.press("Enter");assert.equal(db.prepare("SELECT revision FROM games").pluck().get(),1);assert.equal(await b.getByRole("log").getByText(text,{exact:true}).count(),0);await input.dispatchEvent("compositionend");await a.getByRole("button",{name:"전송",exact:true}).click();await b.getByRole("log").getByText(text,{exact:true}).waitFor();assert.equal(await b.evaluate(()=>Boolean(window.__xss)),false);assert.equal(await b.getByRole("log").locator("img").count(),0);report.safeTextAndSyntheticComposition=true;
  const mine=await (await a.waitForFunction(()=>{const el=document.querySelector(".chat-mine");return el&&getComputedStyle(el).color;})).jsonValue(),theirs=await (await b.waitForFunction(()=>{const el=document.querySelector(".chat-theirs");return el&&getComputedStyle(el).color;})).jsonValue();report.chatColors={mine,theirs};assert.equal(mine,"rgb(29, 78, 216)");assert.equal(theirs,"rgb(185, 28, 28)");
  const controls=await a.locator("button.button:visible").evaluateAll(nodes=>nodes.map(el=>({width:el.getBoundingClientRect().width,height:el.getBoundingClientRect().height})));report.generalButtons={count:controls.length,minWidth:Math.min(...controls.map(b=>b.width)),minHeight:Math.min(...controls.map(b=>b.height))};assert(report.generalButtons.minWidth>=44&&report.generalButtons.minHeight>=44);
  const rgb=s=>s.startsWith("#")?s.slice(1).match(/../g).map(x=>parseInt(x,16)):s.match(/[\d.]+/g).slice(0,3).map(Number),lum=s=>rgb(s).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0),contrast=(x,y)=>(Math.max(lum(x),lum(y))+.05)/(Math.min(lum(x),lum(y))+.05);
  const background=await a.locator(".online-chat").evaluate(el=>getComputedStyle(el).backgroundColor);report.solidColorContrast={mine:contrast(mine,background),theirs:contrast(theirs,background),bodyBase:contrast("#2e2724","#fff1e6"),scope:"solid base color pairs only; not every gradient or masked edge pixel, not WCAG certification"};for(const key of ["mine","theirs","bodyBase"])assert(report.solidColorContrast[key]>=4.5);
  await b.evaluate(()=>{const el=document.querySelector(".online-chat-messages");el.style.height="40px";el.style.maxHeight="40px";el.querySelector("p").style.minHeight="140px";el.scrollTop=0;el.dispatchEvent(new Event("scroll"));});
  await input.fill("스크롤 검증");await a.getByRole("button",{name:"전송",exact:true}).click();await b.getByRole("button",{name:/새 메시지 1건/}).waitFor();assert.equal(await b.locator(".online-chat-messages").evaluate(el=>el.scrollTop),0);
  await b.getByRole("button",{name:/새 메시지 1건/}).click();assert(await b.locator(".online-chat-messages").evaluate(el=>el.scrollTop>0));
  await b.evaluate(()=>{const el=document.querySelector(".online-chat-messages");el.style.height="";el.style.maxHeight="";el.querySelector("p").style.minHeight="";});
  await b.getByRole("button",{name:"상대 메시지 숨기기",exact:true}).click();assert.equal(await b.getByRole("log").getByText(text,{exact:true}).count(),0);await b.getByRole("button",{name:"상대 메시지 다시 보기",exact:true}).click();await b.getByRole("log").getByText(text,{exact:true}).waitFor();report.pastMessageScrollAndHide=true;
  await b.setViewportSize({width:360,height:800});const layout=await b.evaluate(()=>{
    const grid=document.querySelector('[role="grid"]').getBoundingClientRect(),chat=document.querySelector('.online-chat').getBoundingClientRect(),input=document.querySelector('.online-chat-input').getBoundingClientRect(),messages=document.querySelector('.online-chat-messages').getBoundingClientRect();
    return {overflow:document.documentElement.scrollWidth>innerWidth,chatBelowBoard:chat.top>=grid.bottom,inputBelowMessages:input.top>=messages.bottom};
  });assert.equal(layout.overflow,false);assert(layout.chatBelowBoard&&layout.inputBelowMessages);report.mobileOnlineEmulation={...layout,isAndroid:false,keyboard:"physical Android keyboard not tested"};await b.screenshot({path:resolve(out,`${tag}-online-mobile-emulation.png`),fullPage:true});await b.setViewportSize({width:1280,height:1000});
  for(let move=0;move<9;move++){
    const p=move%2?b:a,x=Math.floor(move/2),y=move%2?2:0,label=String.fromCharCode(65+x)+(y+1);
    await p.getByRole("button",{name:`${label} 빈 교차점`,exact:true}).click();if(move===0){await p.getByRole("grid").focus();await p.getByRole("grid").press("Enter");report.keyboardEnterMove=true;}else await p.getByRole("button",{name:"돌 놓기",exact:true}).click();
    for(const page of [a,b])await page.getByRole("button",{name:`${label} ${move%2?"WHITE":"BLACK"}`,exact:true}).waitFor();
    if(move===0){const deadline=JSON.parse(db.prepare("SELECT state_json FROM games").pluck().get()).turnDeadlineUtc;await b.reload();await b.getByRole("grid").waitFor();assert.equal(JSON.parse(db.prepare("SELECT state_json FROM games").pluck().get()).turnDeadlineUtc,deadline);report.refreshPreservedDeadline=true;}
  }
  for(const p of [a,b])await p.getByRole("dialog").waitFor();assert(await a.getByRole("dialog").getByRole("heading",{name:"승리",exact:true}).count());assert(await b.getByRole("dialog").getByRole("heading",{name:"패배",exact:true}).count());
  assert(await a.evaluate(()=>document.querySelector("dialog").contains(document.activeElement)));await a.getByRole("button",{name:"판 확인 · 팝업 닫기",exact:true}).click();await a.getByRole("button",{name:"결과 보기",exact:true}).click();report.popupClosedAndReopened=true;
  assert.equal(await b.getByRole("button",{name:"최종 보드 PNG 다운로드",exact:true}).count(),0);
  await a.evaluate(()=>{window.__originalToBlob=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(callback){callback(null);};});await a.getByRole("button",{name:"최종 보드 PNG 다운로드",exact:true}).click();await a.getByRole("alert").getByText(/PNG 변환에 실패/).waitFor();assert(await a.getByRole("dialog").getByRole("heading",{name:"승리",exact:true}).count());await a.screenshot({path:resolve(out,`${tag}-png-failure.png`),fullPage:true});await a.evaluate(()=>{HTMLCanvasElement.prototype.toBlob=window.__originalToBlob;});report.injectedPngFailureRetainedResult=true;
  const downloadEvent=a.waitForEvent("download");await a.getByRole("button",{name:"PNG 저장 재시도",exact:true}).click();const download=await downloadEvent,path=resolve(out,`${tag}-downloaded-result.png`);await download.saveAs(path);
  const metadata=await sharp(path).metadata();assert.equal(metadata.format,"png");assert.equal(metadata.width,1100);assert.equal(metadata.height,1500);
  const image=await ca.newPage();await image.goto("file:///"+path.replaceAll("\\","/"));assert.equal(await image.locator("img").evaluate(el=>el.complete&&el.naturalWidth===1100),true);await image.screenshot({path:resolve(out,`${tag}-png-open.png`),fullPage:true});await image.close();report.actualPngDownloadedAndOpened={file:`${tag}-downloaded-result.png`,width:metadata.width,height:metadata.height};
  report.timingA=await a.evaluate(()=>window.__timing);report.timingB=await b.evaluate(()=>window.__timing);assert(report.timingA.receiptToDom.length>0&&report.timingB.receiptToDom.length>0);report.timingScope="ACK: each sender's performance.now send→command.result. Receipt→DOM: same recipient clock from snapshot event to matching stone DOM mutation; not paint completion, not A-clock minus B-clock. B arrays restart on reload. Small local functional samples, not external target certification.";
  await a.screenshot({path:resolve(out,`${tag}-chrome-result.png`),fullPage:true});await b.screenshot({path:resolve(out,`${tag}-edge-result.png`),fullPage:true});
  const before=db.prepare("SELECT count(*) FROM games").pluck().get();await b.getByRole("button",{name:"재도전 요청 · 나는 백",exact:true}).click();await a.getByRole("button",{name:"재도전 승낙",exact:true}).click();for(const p of [a,b])await p.getByRole("button",{name:"대국 준비 완료",exact:true}).waitFor();
  assert.equal(db.prepare("SELECT count(*) FROM games").pluck().get(),before+1);const old=db.prepare("SELECT status,state_json FROM games WHERE game_id=?").get(gameId);assert.equal(old.status,"FINISHED");const next=db.prepare("SELECT * FROM games WHERE status='PREPARING'").get();assert.notEqual(next.game_id,gameId);assert.equal(JSON.parse(next.state_json).board.flat().filter(Boolean).length,0);report.winRematchAndFinalImmutable=true;
  const storage=await a.evaluate(()=>sessionStorage.getItem("danpan-omok-session-v1")),takeover=await chrome.newContext({viewport:{width:1280,height:1000}});
  await takeover.addInitScript(value=>sessionStorage.setItem("danpan-omok-session-v1",value),storage);const replacement=await takeover.newPage();await replacement.goto(origin);await replacement.getByRole("button",{name:"대국 준비 완료",exact:true}).waitFor();await a.getByRole("alert").getByText(/다른 창에서 연결/).waitFor();
  report.replacedTabStopped=true;
  // Separate mobile viewport checks are desktop emulation only.
  const mobile=await ca.newPage({viewport:{width:360,height:800}});await mobile.setViewportSize({width:360,height:800});await mobile.goto(origin);report.mobileEmulation={width:360,overflow:await mobile.evaluate(()=>document.documentElement.scrollWidth>innerWidth),isAndroid:false};assert.equal(report.mobileEmulation.overflow,false);await mobile.screenshot({path:resolve(out,`${tag}-mobile-emulation.png`),fullPage:true});
  report.completed=true;report.finishedAt=new Date().toISOString();console.log(JSON.stringify({completed:true,chrome:report.chrome,edge:report.edge,build:report.build,pngOpened:true}));
}catch(error){report.error=String(error.stack??error);throw error;}
finally{for(const browser of browsers)await browser.close();app.lobby.close();app.webSocketServer.close();await new Promise(r=>app.httpServer.close(r));db.close();await writeFile(resolve(out,`${tag}-browser.json`),JSON.stringify(report,null,2));}
