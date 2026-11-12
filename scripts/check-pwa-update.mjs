import {createServer} from "node:http";
import {createRequire} from "node:module";
import {readFile,mkdir,writeFile} from "node:fs/promises";
import {resolve,extname,sep} from "node:path";
import assert from "node:assert/strict";
const require=createRequire(process.env.TEST_NODE_MODULES?resolve(process.env.TEST_NODE_MODULES,"package.json"):resolve("package.json"));const {chromium}=require("playwright");
const oldRoot=resolve(process.env.TEST_OLD_BUILD??".cache/stage8-old-f4e221f7555b9dff"),newRoot=resolve("apps/web/dist");let root=oldRoot;
const mime={".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",".webmanifest":"application/manifest+json",".ttf":"font/ttf",".png":"image/png",".svg":"image/svg+xml",".txt":"text/plain"};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,"http://localhost").pathname);const path=resolve(root,"."+(pathname==="/"?"/index.html":pathname));if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}const bytes=await readFile(path);res.writeHead(200,{"Content-Type":mime[extname(path)]??"application/octet-stream","Cache-Control":"no-store"});res.end(bytes);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));const origin=`http://127.0.0.1:${server.address().port}`;
const report={appVersion:"0.1.0",oldBuild:JSON.parse(await readFile(resolve(oldRoot,"offline-manifest.json"),"utf8")).version,newBuild:JSON.parse(await readFile(resolve(newRoot,"offline-manifest.json"),"utf8")).version,origin,completed:false};let context;
try{
  assert.notEqual(report.oldBuild,report.newBuild);
  context=await chromium.launchPersistentContext(resolve(".cache",`update-evidence-${Date.now()}`),{headless:true,executablePath:process.env.TEST_BROWSER_EXE,viewport:{width:1280,height:1000}});
  const playing=context.pages()[0]??await context.newPage();await playing.goto(origin);await playing.getByText("혼자 놀기 오프라인 준비 완료",{exact:true}).waitFor({timeout:60000});
  const home=await context.newPage();await home.goto(origin);
  await home.getByText("혼자 놀기 오프라인 준비 완료",{exact:true}).waitFor({timeout:60000});
  await playing.getByRole("button",{name:"혼자 놀기",exact:true}).click();await playing.getByRole("button",{name:"H8 BLACK",exact:true}).waitFor();const gameId=await playing.locator(".solo-game").getAttribute("data-game-id");
  root=newRoot;
  await home.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await home.getByRole("button",{name:"업데이트하고 다시 열기",exact:true}).waitFor({timeout:60000});
  await home.getByRole("button",{name:"업데이트하고 다시 열기",exact:true}).click();
  await home.getByText(/다른 창.*(대국|종료|홈)/).waitFor();
  assert.equal(await playing.locator(".solo-game").getAttribute("data-game-id"),gameId);assert(await home.evaluate(async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting)));
  report.blockedDuringGame=true;
  await playing.getByRole("button",{name:"초기 화면으로 · 저장판 삭제",exact:true}).click();
  await home.getByRole("button",{name:"업데이트하고 다시 열기",exact:true}).click();
  await home.waitForFunction(async version=>(await(await fetch("/offline-manifest.json")).json()).version===version,report.newBuild,{timeout:15000});
  await home.getByText("혼자 놀기 오프라인 준비 완료",{exact:true}).waitFor({timeout:15000});
  await playing.getByText("혼자 놀기 오프라인 준비 완료",{exact:true}).waitFor({timeout:15000});
  report.appliedAfterHome=true;report.completed=true;report.browser=context.browser()?.version();report.finishedAt=new Date().toISOString();
  console.log(JSON.stringify(report));
}catch(error){report.error=String(error.stack??error);throw error;}
finally{await context?.close();await new Promise(r=>server.close(r));await mkdir("docs/evidence",{recursive:true});await writeFile("docs/evidence/stage8-update.json",JSON.stringify(report,null,2));}
