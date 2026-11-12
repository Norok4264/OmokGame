import {spawn} from "node:child_process";
import {mkdir,copyFile,writeFile,readFile} from "node:fs/promises";
import {resolve,dirname,delimiter} from "node:path";
import {collectSource,fileManifest} from "./source-files.mjs";
const root=process.cwd(),npmCli=resolve(process.argv[2]??".cache/tools/npm-12.2.2/package/bin/npm-cli.js"),work=resolve(".cache",`stage11-clean-install-${Date.now()}`),source=await collectSource(root),input=await fileManifest(root,source.files);
await mkdir(work,{recursive:true});for(const path of source.files){await mkdir(dirname(resolve(work,path)),{recursive:true});await copyFile(resolve(root,path),resolve(work,path));}
const emptyConfig=resolve(work,".npmrc-empty");await writeFile(emptyConfig,"");
const report={appVersion:"0.1.0",startedAt:new Date().toISOString(),scope:"isolated source copy; original node_modules and runtime DB untouched",node:process.version,codeSha256:input.codeSha256,commands:[],completed:false};
async function command(args){return new Promise((resolveCommand,reject)=>{
  const child=spawn(process.execPath,[npmCli,...args],{cwd:work,windowsHide:true,env:{...process.env,NPM_CONFIG_USERCONFIG:emptyConfig,NPM_CONFIG_CACHE:resolve(root,".cache/npm-ci-cache"),PATH:dirname(process.execPath)+delimiter+(process.env.PATH??"")}});
  let stdout="",stderr="";child.stdout.on("data",b=>stdout+=b);child.stderr.on("data",b=>stderr+=b);child.on("error",reject);child.on("close",code=>{report.commands.push({command:["npm",...args],exitCode:code,stdout:stdout.slice(-24000),stderr:stderr.slice(-24000)});if(code!==0)reject(new Error("Failed: npm "+args.join(" ")));else resolveCommand(stdout);});
});}
try{
  const version=(await command(["--version"])).trim();if(version!=="12.2.2")throw new Error("npm version mismatch");report.npm=version;
  await command(["ci","--no-audit","--no-fund"]);await command(["run","typecheck"]);await command(["test","--","--reporter=json","--outputFile=docs/evidence/clean-tests.json"]);await command(["run","build"]);
  const tests=JSON.parse(await readFile(resolve(work,"docs/evidence/clean-tests.json"),"utf8"));report.tests={files:tests.testResults.length,passed:tests.numPassedTests,failed:tests.numFailedTests};report.webBuild=JSON.parse(await readFile(resolve(work,"apps/web/dist/offline-manifest.json"),"utf8")).version;report.completed=true;report.finishedAt=new Date().toISOString();console.log(JSON.stringify({completed:true,node:report.node,npm:report.npm,tests:report.tests,build:report.webBuild}));
}catch(error){report.error=String(error.stack??error);process.exitCode=1;}
finally{await writeFile(resolve(root,"docs/evidence/stage11-clean-install.json"),JSON.stringify(report,null,2));}
