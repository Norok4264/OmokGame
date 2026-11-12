import {execFileSync} from "node:child_process";
import {readFile,lstat} from "node:fs/promises";
import {resolve,sep} from "node:path";
import {createHash} from "node:crypto";
export const rootFiles=new Set(["README.md","package.json","package-lock.json","tsconfig.base.json","vitest.config.ts",".env.example",".gitignore",".dockerignore",".node-version",".nvmrc"]);
export function excluded(path){
  return /(^|\/)(node_modules|dist|build|\.cache|\.git|data|coverage|secrets|private-captures|private-reports|submission-private|personal-report|operational-logs|releases|\.gradle)(\/|$)/.test(path)
    || /(^|\/)\.env(?:\..*)?$/.test(path)&&!/(^|\/)\.env(?:\..*)?\.example$/.test(path)&&!path.endsWith("/.env.example")&&path!==".env.example"
    || /\.(?:sqlite(?:3)?(?:-(?:wal|shm|journal))?|db(?:-(?:wal|shm|journal))?|pcap|pcapng|har|log|pem|key|jks|keystore|p12|pfx)$/i.test(path)
    || /(^|\/)(local\.properties|signing\.properties|key\.properties|\.npmrc)$/.test(path)
    || /^reports\/private\//.test(path)
    || /^docs\/.*\.(pdf|docx|pptx|hwp|hwpx)$/i.test(path);
}
export async function collectSource(root=process.cwd()){
  const git=(...args)=>execFileSync("git",args,{cwd:root,encoding:"utf8"});
  const tracked=git("ls-files","-z").split("\0").filter(Boolean);
  const ignoredTracked=git("ls-files","-ci","--exclude-standard","-z").split("\0").filter(Boolean);
  const unsafeTracked=tracked.filter(excluded);
  if(ignoredTracked.length||unsafeTracked.length)throw new Error("Remove private/runtime files from tracking before release: "+JSON.stringify({ignoredTracked,unsafeTracked}));
  const candidates=git("ls-files","--cached","--others","--exclude-standard","-z").split("\0").filter(Boolean);
  const files=[...new Set(candidates)].filter(p=>(rootFiles.has(p)||/^(apps|packages|scripts|deploy|docs|\.github|android)\//.test(p))&&!excluded(p)).sort();
  for(const path of files){const absolute=resolve(root,path);if(!absolute.startsWith(resolve(root)+sep)||!(await lstat(absolute)).isFile())throw new Error("Source must be a regular workspace file: "+path);}
  return {files,ignoredTracked,unsafeTracked,trackedCount:tracked.length,head:git("rev-parse","HEAD").trim(),origin:git("remote","get-url","origin").trim()};
}
export async function fileManifest(root,files){
  const entries=[];for(const path of files){const bytes=await readFile(resolve(root,path));entries.push({path,size:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex")});}
  const treeSha256=createHash("sha256").update(JSON.stringify(entries)).digest("hex");
  const codeSha256=createHash("sha256").update(JSON.stringify(entries.filter(e=>!e.path.startsWith("docs/")&&e.path!=="README.md"))).digest("hex");
  return {entries,treeSha256,codeSha256};
}
