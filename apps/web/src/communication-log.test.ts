import {it,expect} from "vitest";
import {CommunicationLog} from "./communication-log.js";
it("retains exact original UTF-8 byte counts while excluding tokens, names, chat bodies and long IDs",()=>{
  const log=new CommunicationLog(()=>1,()=>new Date("2026-11-12T00:00:00Z"));
  const secret="SECRET-token-never-retain",body="비밀 채팅 😀";
  const raw=JSON.stringify({protocolVersion:1,type:"command.result",requestId:"request-123456789",ok:true,data:{session:{token:secret,nickname:"개인 이름",playerId:"player-123456789"},snapshot:{gameId:"game-123456789",revision:4,lastMove:{x:14,y:14},messages:[{messageId:"message-123456789",sequence:3,body}],token:secret}}});
  log.record("RECEIVE",raw);const event=log.snapshot()[0]!;
  expect(event.payloadBytes).toBe(new TextEncoder().encode(raw).byteLength);expect(event.payloadBytes).toBeGreaterThan(raw.length);
  expect(event.coordinate).toMatchObject({label:"O15",source:"snapshot.lastMove"});expect(event.revision).toBe(4);
  expect(event.summary.latestChat).toMatchObject({length:[...body].length,sequence:3});
  const saved=JSON.stringify(log.snapshot());for(const forbidden of [secret,body,"개인 이름","request-123456789","player-123456789","game-123456789"])expect(saved).not.toContain(forbidden);
  expect(saved).not.toContain('"token"');
});
it("measures application RTT with only the local monotonic clock, including error and heartbeat responses",()=>{
  let mono=100,wall=0;const log=new CommunicationLog(()=>mono,()=>new Date(wall));
  log.record("SEND",JSON.stringify({type:"game.move.propose",requestId:"r",expectedRevision:4,x:0,y:14}),"connection");
  mono=112.5;wall=86400000;log.record("RECEIVE",JSON.stringify({type:"command.result",requestId:"r",serverTimeUtc:"1900-01-01T00:00:00Z",data:{approvedRevision:5,snapshot:{revision:6}}}),"connection");
  expect(log.snapshot()[1]).toMatchObject({applicationRttMs:12.5,approvedRevision:5,revision:6});
  for(const [type,response]of [["heartbeat","heartbeat.ack"],["game.resign","server.error"]]){
    log.record("SEND",JSON.stringify({type,requestId:type}));mono+=3;log.record("RECEIVE",JSON.stringify({type:response,requestId:type}));expect(log.snapshot().at(-1)?.applicationRttMs).toBe(3);
  }
});
it("does not invent RTT for broadcasts, stale connections, or ambiguous duplicate IDs",()=>{
  let mono=0;const log=new CommunicationLog(()=>mono);
  const send=JSON.stringify({type:"chat.send",requestId:"r",messageId:"m",body:"보내기"}),reply=JSON.stringify({type:"command.result",requestId:"r"});
  log.record("SEND",send,"old");mono=10;log.record("RECEIVE",reply,"new");expect(log.snapshot().at(-1)?.applicationRttMs).toBeUndefined();
  log.record("SEND",send,"old");mono=20;log.record("RECEIVE",reply,"old");expect(log.snapshot().at(-1)?.applicationRttMs).toBeUndefined();expect(log.snapshot().at(-1)?.rttNote).toContain("동일 ID");
  log.record("SEND",send,"old");log.endChannel("old");mono=30;log.record("RECEIVE",reply,"old");expect(log.snapshot().at(-1)?.applicationRttMs).toBeUndefined();
  log.record("RECEIVE",JSON.stringify({type:"lobby.snapshot",snapshot:{game:null}}));expect(log.snapshot().at(-1)?.applicationRttMs).toBeUndefined();
});
it("keeps only 200 in-memory records and clears both records and timing correlations",()=>{
  const log=new CommunicationLog();for(let i=0;i<230;i++)log.record("SEND",JSON.stringify({type:"heartbeat",requestId:`r${i}`}));
  expect(log.snapshot()).toHaveLength(200);expect(log.snapshot()[0]!.serial).toBe(31);log.clear();expect(log.snapshot()).toHaveLength(0);
  log.record("RECEIVE",JSON.stringify({type:"heartbeat.ack",requestId:"r229"}));expect(log.snapshot()[0]!.applicationRttMs).toBeUndefined();
});
it("does not retain malformed messages, unknown strings or error descriptions as raw payload",()=>{
  const log=new CommunicationLog();log.record("RECEIVE","not-json-secret-value");log.record("RECEIVE",JSON.stringify({type:"unknown-secret-type",message:"secret error detail",body:"private chat"}));
  expect(JSON.stringify(log.snapshot())).not.toMatch(/not-json-secret-value|unknown-secret-type|secret error detail|private chat/);
  expect(log.snapshot()[0]!.kind).toBe("invalid JSON");
});
