import {readFile} from "node:fs/promises";
import {createHash,webcrypto} from "node:crypto";
import vm from "node:vm";
import {afterEach,it,expect,vi} from "vitest";
const origin="https://offline.test";
async function fixture(busy:Array<boolean|null>=[]){
  const bodies:Record<string,string>={"/index.html":"screen","/bot.js":"rules and worker","/font.ttf":"font","/image.svg":"image"};
  const files=Object.entries(bodies).map(([url,body])=>({url,sha256:createHash("sha256").update(body).digest("hex")}));
  const stores=new Map<string,Map<string,Response>>();
  const key=(value:string|Request)=>new URL(typeof value==="string"?value:value.url,origin).href;
  const caches={open:async(name:string)=>{if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name)!;return {match:async(value:string|Request)=>store.get(key(value))?.clone(),put:async(value:string|Request,response:Response)=>{store.set(key(value),response.clone());}};},keys:async()=>[...stores.keys()],delete:async(name:string)=>stores.delete(name)};
  const handlers:Record<string,(e:any)=>void>={},skip=vi.fn(async()=>{});
  const self:any={location:{origin},skipWaiting:skip,addEventListener:(name:string,fn:(e:any)=>void)=>{handlers[name]=fn;},clients:{claim:vi.fn(),matchAll:async()=>busy.map((value,index)=>({id:String(index),postMessage:(m:any)=>{if(m.type==="PWA_ACTIVITY_QUERY"&&value!==null)handlers.message!({data:{type:"PWA_ACTIVITY_REPLY",requestId:m.requestId,busy:value},source:{id:String(index)}});}}))}};
  const fetch=vi.fn(async(request:Request)=>new Response(bodies[new URL(request.url).pathname]??"missing",{status:new URL(request.url).pathname in bodies?200:404}));
  class BrowserRequest extends Request{constructor(input:string|Request,init?:RequestInit){super(typeof input==="string"?new URL(input,origin):input,init);}}
  const source=(await readFile(new URL("./service-worker.js",import.meta.url),"utf8")).replace("__PWA_VERSION__",'"test-build"').replace("__PWA_FILES__",JSON.stringify(files)).replace("__PWA_CACHE_ID__",'"fingerprint"');
  vm.runInNewContext(source,{self,caches,fetch,Request:BrowserRequest,Response,URL,crypto:webcrypto,Uint8Array,setTimeout,clearTimeout});
  async function message(data:unknown){const replies:any[]=[],pending:Promise<any>[]=[];handlers.message!({data,ports:[{postMessage:(m:any)=>replies.push(m)}],waitUntil:(p:Promise<any>)=>pending.push(p)});await Promise.all(pending);return replies[0];}
  async function install(){let pending:Promise<void>|undefined;handlers.install!({waitUntil:(p:Promise<void>)=>{pending=p;}});await pending;}
  return {bodies,stores,handlers,skip,fetch,install,message};
}
afterEach(()=>vi.useRealTimers());
it("B09 installs all resources atomically, verifies hashes, and reports incomplete caches as not ready",async()=>{
  const s=await fixture();await s.install();expect(s.skip).not.toHaveBeenCalled();expect(await s.message({type:"OFFLINE_STATUS"})).toMatchObject({ready:true,count:4});
  s.stores.get("danpan-static-test-build-fingerprint")!.delete(origin+"/font.ttf");expect(await s.message({type:"OFFLINE_STATUS"})).toMatchObject({ready:false});
  expect(await s.message({type:"OFFLINE_REPAIR"})).toMatchObject({ready:true});expect(await s.message({type:"OFFLINE_STATUS"})).toMatchObject({ready:true});
  const failure=await fixture();failure.bodies["/font.ttf"]="wrong deployed font";await expect(failure.install()).rejects.toThrow("Mixed application build");expect(failure.stores.has("danpan-static-test-build-fingerprint")).toBe(false);
});
it("B09 never publicly caches sessions, authentication responses, live state, URL queries or POSTs",async()=>{
  const s=await fixture();await s.install();
  for(const [path,init]of [["/api/session",{}],["/ws",{}],["/readyz",{}],["/index.html?token=secret",{}],["/index.html",{headers:{authorization:"Bearer test"}}],["/index.html",{method:"POST"}]] as const){
    const respond=vi.fn();s.handlers.fetch!({request:new Request(origin+path,init),respondWith:respond});expect(respond).not.toHaveBeenCalled();
  }
  let promise:Promise<Response>|undefined;s.handlers.fetch!({request:new Request(origin+"/"),respondWith:(p:Promise<Response>)=>{promise=p;}});expect(await(await promise!).text()).toBe("screen");
});
it("B11 refuses forced updates while any window has a game and activates only after every window is idle",async()=>{
  const active=await fixture([false,true]);expect(await active.message({type:"REQUEST_UPDATE",requestId:"busy"})).toEqual({accepted:false});expect(active.skip).not.toHaveBeenCalled();
  const idle=await fixture([false,false]);expect(await idle.message({type:"REQUEST_UPDATE",requestId:"idle"})).toEqual({accepted:true});expect(idle.skip).toHaveBeenCalledOnce();
});
it("B11 a nonresponding or background client cannot authorize an update",async()=>{
  vi.useFakeTimers();const s=await fixture([false,null]);const pending=s.message({type:"REQUEST_UPDATE",requestId:"missing"});await vi.advanceTimersByTimeAsync(1501);expect(await pending).toEqual({accepted:false});expect(s.skip).not.toHaveBeenCalled();
});
