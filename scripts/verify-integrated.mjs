import {spawnSync} from "node:child_process";
import {mkdir,writeFile,readFile} from "node:fs/promises";
const tag=process.env.TEST_EVIDENCE_TAG??"stage11";
if(!/^[a-z0-9-]+$/.test(tag))throw new Error("Invalid evidence tag");
const commands=[
  ["node_modules/typescript/bin/tsc","-p","packages/shared/tsconfig.build.json"],
  ["node_modules/typescript/bin/tsc","-p","apps/server/tsconfig.json","--noEmit"],
  ["node_modules/typescript/bin/tsc","-p","apps/web/tsconfig.json","--noEmit"],
  ["node_modules/vitest/vitest.mjs","run","--reporter=json",`--outputFile=docs/evidence/${tag}-tests.json`],
  ["node_modules/typescript/bin/tsc","-p","apps/server/tsconfig.build.json"],
  ["node_modules/vite/bin/vite.js","build","apps/web","--config","apps/web/vite.config.ts"],
];
const report={startedAt:new Date().toISOString(),scope:"Codex Node execution, no dependency reinstall",commands:[],completed:false};
await mkdir("docs/evidence",{recursive:true});
try{
  for(const args of commands){const result=spawnSync(process.execPath,args,{encoding:"utf8",windowsHide:true});report.commands.push({command:["node",...args],exitCode:result.status,stdout:result.stdout,stderr:result.stderr,error:result.error?String(result.error):undefined});if(result.status!==0)throw new Error("Verification failed: "+args.join(" "));}
  const tests=JSON.parse(await readFile(`docs/evidence/${tag}-tests.json`,"utf8"));report.tests={files:tests.testResults.length,passed:tests.numPassedTests,failed:tests.numFailedTests};report.webBuild=JSON.parse(await readFile("apps/web/dist/offline-manifest.json","utf8")).version;report.completed=true;report.finishedAt=new Date().toISOString();console.log(JSON.stringify({completed:true,tests:report.tests,build:report.webBuild}));
}finally{await writeFile(`docs/evidence/${tag}-checks.json`,JSON.stringify(report,null,2));}
