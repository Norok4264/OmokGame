import {createHash} from "node:crypto";
import {readdir,readFile,writeFile} from "node:fs/promises";
import {resolve,relative} from "node:path";
import type {Plugin} from "vite";
export async function filesIn(root:string):Promise<string[]>{
  const entries=await readdir(root,{withFileTypes:true});const paths=await Promise.all(entries.map(e=>e.isDirectory()?filesIn(resolve(root,e.name)):Promise.resolve([resolve(root,e.name)])));return paths.flat().sort();
}
export function pwaBuild(root:string,version:string):Plugin{
  let outDir="";
  return {name:"danpan-static-offline",apply:"build",configResolved:config=>{outDir=resolve(config.root,config.build.outDir);},async closeBundle(){
    const files=[];
    for(const path of await filesIn(outDir)){
      const url="/"+relative(outDir,path).replaceAll("\\","/");if(["/sw.js","/offline-manifest.json"].includes(url))continue;
      files.push({url,sha256:createHash("sha256").update(await readFile(path)).digest("hex")});
    }
    const manifest=JSON.stringify({version,files});await writeFile(resolve(outDir,"offline-manifest.json"),manifest);
    files.push({url:"/offline-manifest.json",sha256:createHash("sha256").update(manifest).digest("hex")});
    const source=await readFile(resolve(root,"src/service-worker.js"),"utf8");
    await writeFile(resolve(outDir,"sw.js"),source.replace("__PWA_VERSION__",JSON.stringify(version)).replace("__PWA_FILES__",JSON.stringify(files)).replace("__PWA_CACHE_ID__",JSON.stringify(createHash("sha256").update(JSON.stringify(files)).digest("hex"))));
  }};
}
