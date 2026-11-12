/* Generated with a build-specific static allowlist. No runtime session caching. */
const VERSION=__PWA_VERSION__;
const FILES=__PWA_FILES__;
const PREFIX="danpan-static-",CACHE=PREFIX+VERSION+"-"+__PWA_CACHE_ID__;
const allowed=new Set(FILES.map(f=>new URL(f.url,self.location.origin).href));
async function precache(missingOnly=false){
  const cache=await caches.open(CACHE);
    for(const file of FILES){
      if(missingOnly&&(await cache.match(file.url))?.ok)continue;
      const response=await fetch(new Request(file.url,{cache:"no-store",credentials:"omit",redirect:"error"}));
      if(!response.ok||response.type==="opaque")throw new Error("Missing public resource: "+file.url);
      const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",await response.clone().arrayBuffer()))).map(b=>b.toString(16).padStart(2,"0")).join("");
      if(hash!==file.sha256)throw new Error("Mixed application build: "+file.url);
      await cache.put(file.url,response);
    }
}
self.addEventListener("install",event=>event.waitUntil((async()=>{
  try{await precache();}catch(error){await caches.delete(CACHE);throw error;}
  // No skipWaiting here: a running game keeps its current worker/build.
})()));
self.addEventListener("activate",event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith(PREFIX)&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener("fetch",event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=="GET"||url.origin!==self.location.origin||url.search||request.headers.has("authorization"))return;
  const key=url.pathname==="/"?new URL("/index.html",self.location.origin).href:url.href;
  if(!allowed.has(key))return;
  event.respondWith((async()=>{
    const cached=await(await caches.open(CACHE)).match(key);
    return cached??new Response("Offline resource unavailable. Reconnect to prepare the app.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8"}});
  })());
});
const updates=new Map();
self.addEventListener("message",event=>{
  const m=event.data;
  if(m?.type==="OFFLINE_REPAIR")event.waitUntil((async()=>{
    try{await precache(true);event.ports[0]?.postMessage({ready:true});}catch{event.ports[0]?.postMessage({ready:false});}
  })());
  if(m?.type==="OFFLINE_STATUS")event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);let ready=true;
    for(const file of FILES)if(!(await cache.match(file.url))?.ok){ready=false;break;}
    event.ports[0]?.postMessage({version:VERSION,ready,count:FILES.length});
  })());
  if(m?.type==="PWA_ACTIVITY_REPLY"){
    const query=updates.get(m.requestId);
    if(query&&query.expected.has(event.source?.id)){query.answers.set(event.source.id,m.busy!==false);query.check();}
  }
  if(m?.type==="REQUEST_UPDATE")event.waitUntil((async()=>{
    const clients=await self.clients.matchAll({type:"window",includeUncontrolled:true});
    if(!clients.length){event.ports[0]?.postMessage({accepted:false});return;}
    await new Promise(resolve=>{
      const query={expected:new Set(clients.map(c=>c.id)),answers:new Map(),check:()=>{}};
      const finish=accepted=>{
        if(!updates.has(m.requestId))return;
        updates.delete(m.requestId);clearTimeout(timer);
        for(const client of clients)client.postMessage({type:accepted?"PWA_UPDATE_APPLY":"PWA_UPDATE_CANCEL",requestId:m.requestId});
        event.ports[0]?.postMessage({accepted});
        if(accepted)self.skipWaiting().then(resolve);else resolve();
      };
      const timer=setTimeout(()=>finish(false),1500);
      query.check=()=>{if([...query.answers.values()].some(Boolean))finish(false);else if(query.answers.size===query.expected.size)finish(true);};
      updates.set(m.requestId,query);
      for(const client of clients)client.postMessage({type:"PWA_ACTIVITY_QUERY",requestId:m.requestId});
    });
  })());
});
