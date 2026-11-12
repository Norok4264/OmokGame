import {mkdir,copyFile,writeFile,readFile} from "node:fs/promises";
import {resolve,dirname} from "node:path";
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import assert from "node:assert/strict";
import {collectSource,fileManifest} from "./source-files.mjs";
const root=process.cwd(),source=await collectSource(root),manifest=await fileManifest(root,source.files),staging=resolve(".cache",`source-delivery-${Date.now()}`);
await mkdir(staging,{recursive:true});
for(const path of source.files){await mkdir(dirname(resolve(staging,path)),{recursive:true});await copyFile(resolve(root,path),resolve(staging,path));}
const report={createdAtUtc:new Date().toISOString(),appVersion:"0.1.0",head:source.head,origin:source.origin,containsUncommittedWorkingFiles:true,personalAcademicReportIncluded:false,ignoredTracked:source.ignoredTracked,unsafeTracked:source.unsafeTracked,...manifest};
await writeFile(resolve(staging,"SOURCE_MANIFEST.json"),JSON.stringify(report,null,2));await mkdir("releases",{recursive:true});
const archive=resolve("releases/danpan-omok-source-0.1.0.tar.gz");execFileSync("tar",["-czf",archive,"-C",staging,"."],{stdio:"pipe"});
const listed=execFileSync("tar",["-tzf",archive],{encoding:"utf8"}).split(/\r?\n/).filter(p=>p&&!p.endsWith("/")).map(p=>p.replace(/^\.\//,""));
assert.deepEqual(listed.sort(),[...source.files,"SOURCE_MANIFEST.json"].sort());
const sha256=createHash("sha256").update(await readFile(archive)).digest("hex");
await writeFile("releases/SHA256SUMS.txt",`${sha256}  danpan-omok-source-0.1.0.tar.gz\n`);await writeFile("releases/source-manifest.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({archive,sha256,files:source.files.length,codeSha256:manifest.codeSha256,privateReportIncluded:false}));
