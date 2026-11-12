import {spawn,execFileSync} from "node:child_process";
import {createServer} from "node:net";
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {resolve} from "node:path";
import assert from "node:assert/strict";
// Use only the exclusive local test server's port. Never broaden this filter to a real user's traffic.
const probe=createServer();await new Promise((r,j)=>{probe.once("error",j);probe.listen(3001,"127.0.0.1",r);});await new Promise(r=>probe.close(r));
const dumpcap=process.env.TEST_DUMPCAP??"C:/Program Files/Wireshark/dumpcap.exe",tshark=process.env.TEST_TSHARK??"C:/Program Files/Wireshark/tshark.exe",iface="\\Device\\NPF_Loopback",filter="tcp port 3001";
await mkdir("private-captures",{recursive:true});const file=resolve("private-captures",`stage11-loopback-${Date.now()}.pcapng`);
const report={appVersion:"0.1.0",startedAt:new Date().toISOString(),scope:"actual Npcap loopback plaintext WS between Vite and Node; no physical NIC, public TLS or Android",interface:iface,captureFilter:filter,rawFilePublic:false,rawFileDirectory:"private-captures (Git/source archive excluded)",completed:false};let capture;
function wait(child){return new Promise((r,j)=>{child.once("error",j);child.once("exit",code=>code===0?r():j(new Error("Subprocess exit "+code)));});}
try{
  capture=spawn(dumpcap,["-i",iface,"-f",filter,"-a","duration:25","-w",file],{windowsHide:true});let diagnostic="";capture.stderr.on("data",b=>diagnostic=(diagnostic+b).slice(-4000));const captured=wait(capture);
  await new Promise(r=>setTimeout(r,1000));if(capture.exitCode!==null)throw new Error("Capture did not start: "+diagnostic);
  const e2e=spawn(process.execPath,["scripts/check-integrated-browser.mjs"],{windowsHide:true,env:{...process.env,TEST_EVIDENCE_TAG:"stage11"},stdio:["ignore","pipe","pipe"]});let outcome="";e2e.stdout.on("data",b=>outcome+=b);e2e.stderr.on("data",()=>{});await wait(e2e);await captured;
  const fields=["frame.number","frame.time_epoch","frame.len","frame.cap_len","frame.encap_type","frame.protocols","ip.src","ip.dst","tcp.srcport","tcp.dstport","tcp.stream","tcp.len","http.response.code","websocket.opcode","websocket.payload","websocket.payload_length","websocket.payload_length_ext_16","websocket.payload_length_ext_64"];
  const args=["-r",file,"-T","json",...fields.flatMap(f=>["-e",f])];
  // Unmasked payloads exist in memory only. Never write TShark's raw JSON or this buffer to public evidence.
  const packets=JSON.parse(execFileSync(tshark,args,{encoding:"utf8",maxBuffer:64*1024*1024}));
  const safe=[],events=[],encaps=new Set(),protocols=new Set(),streams=new Set();let upgrades=0;
  const kinds=new Set(["game.move.propose","chat.send","command.result","server.error","lobby.snapshot","game.event","challenge.event","server.hello","session.start","session.resume","challenge.create","challenge.respond","game.ready","lobby.snapshot.request","game.retry.request","game.retry.respond","game.result.leave","heartbeat","heartbeat.ack"]);
  for(const packet of packets){const layer=packet._source.layers,first=k=>layer[k]?.[0];encaps.add(first("frame.encap_type"));protocols.add(first("frame.protocols"));streams.add(first("tcp.stream"));if(first("http.response.code")==="101")upgrades++;
    const meta={frame:Number(first("frame.number")),atUtc:new Date(Number(first("frame.time_epoch"))*1000).toISOString(),frameBytes:Number(first("frame.len")),capturedBytes:Number(first("frame.cap_len")),tcpPayloadBytes:Number(first("tcp.len")),stream:Number(first("tcp.stream")),sourceIp:first("ip.src"),destinationIp:first("ip.dst"),sourcePort:Number(first("tcp.srcport")),destinationPort:Number(first("tcp.dstport"))};safe.push(meta);
    for(const hex of layer["websocket.payload"]??[]){let m;try{m=JSON.parse(Buffer.from(hex.replaceAll(":",""),"hex").toString("utf8"));}catch{continue;}if(!kinds.has(m.type))continue;
      const snapshot=m.snapshot?.game??m.snapshot??m.data?.snapshot;const event={frame:meta.frame,atUtc:meta.atUtc,direction:meta.sourcePort===3001?"Node → Vite":"Vite → Node",type:m.type,requestIdShort:typeof m.requestId==="string"?m.requestId.slice(0,8):undefined,gameIdShort:typeof m.gameId==="string"?m.gameId.slice(0,8):typeof snapshot?.gameId==="string"?snapshot.gameId.slice(0,8):undefined,jsonUtf8Bytes:Buffer.from(hex.replaceAll(":",""),"hex").length};
      if(m.type==="game.move.propose")Object.assign(event,{x:m.x,y:m.y,expectedRevision:m.expectedRevision});if(m.type==="chat.send")event.chatLength=[...m.body].length;if(Number.isInteger(snapshot?.revision))event.revision=snapshot.revision;if(Number.isInteger(m.data?.approvedRevision))event.approvedRevision=m.data.approvedRevision;events.push(event);
    }
  }
  const browser=JSON.parse(await readFile("docs/evidence/stage11-browser.json","utf8"));assert(browser.completed);let matched=0;for(const sent of browser.browserSends){const found=events.find(e=>e.type===sent.type&&e.requestIdShort===sent.requestIdShort&&e.gameIdShort===sent.gameIdShort&&e.x===sent.x&&e.y===sent.y&&e.chatLength===sent.chatLength);assert(found,"Missing matching application event in capture");matched++;}
  assert.equal(browser.browserSends.filter(e=>e.type==="game.move.propose").length,9);assert(upgrades>=2);
  Object.assign(report,{webBuild:browser.build,tool:execFileSync(tshark,["--version"],{encoding:"utf8"}).split(/\r?\n/)[0],packetCount:safe.length,encapsulationCodes:[...encaps],protocolChains:[...protocols],tcpStreamCount:streams.size,http101Count:upgrades,matchedBrowserMessages:matched,packets:safe,applicationEvents:events,completed:true,finishedAt:new Date().toISOString()});
  console.log(JSON.stringify({completed:true,packets:safe.length,matchedBrowserMessages:matched,encapsulationCodes:report.encapsulationCodes,publicRawCapture:false}));
}catch(error){report.error=String(error.stack??error);throw error;}
finally{if(capture&&capture.exitCode===null)capture.kill();await writeFile("docs/evidence/stage11-packet-summary.json",JSON.stringify(report,null,2));}
