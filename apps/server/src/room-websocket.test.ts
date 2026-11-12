import {once} from "node:events";
import Database from "better-sqlite3";
import {WebSocket} from "ws";
import {it,expect} from "vitest";
import {createApplicationServer} from "./http.js";
class Client {
  messages:any[]=[];waiters:Array<{predicate:(m:any)=>boolean;resolve:(m:any)=>void}>=[];
  constructor(readonly socket:WebSocket){socket.on("message",raw=>{const m=JSON.parse(String(raw));const index=this.waiters.findIndex(w=>w.predicate(m));if(index>=0)this.waiters.splice(index,1)[0]!.resolve(m);else this.messages.push(m);});}
  wait(predicate:(m:any)=>boolean,ms=6000):Promise<any>{
    const index=this.messages.findIndex(predicate);if(index>=0)return Promise.resolve(this.messages.splice(index,1)[0]);
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("WebSocket evidence timeout")),ms);this.waiters.push({predicate,resolve:m=>{clearTimeout(timer);resolve(m);}});});
  }
  send(type:string,requestId:string,body:Record<string,unknown>={}){this.socket.send(JSON.stringify({protocolVersion:1,type,requestId,...body}));return this.wait(m=>m.requestId===requestId && ["command.result","server.error"].includes(m.type));}
  snapshot(predicate:(g:any)=>boolean){return this.wait(m=>m.type==="lobby.snapshot" && predicate(m.snapshot.game));}
}
it("A07/A08 actual WebSocket rematch, isolated Korean chat, duplicates, new preparation and explicit result departure",async()=>{
  const db=new Database(":memory:");const app=createApplicationServer(db);app.httpServer.listen(0,"127.0.0.1");await once(app.httpServer,"listening");
  const address=app.httpServer.address();if(!address||typeof address==="string")throw new Error("TCP address missing");
  const clients:Client[]=[];
  async function login(name:string){const socket=new WebSocket(`ws://127.0.0.1:${(address as any).port}/ws`, {origin:"http://127.0.0.1:5173"});const client=new Client(socket);clients.push(client);await once(socket,"open");await client.wait(m=>m.type==="server.hello");const result=await client.send("session.start",`login-${name}`,{nickname:name});return {client,id:result.data.session.playerId};}
  try{
    const {client:w,id:wid}=await login("White"),{client:b,id:bid}=await login("Black"),{client:outsider}=await login("Observer");
    const challenge=await w.send("challenge.create","invite",{targetPlayerId:bid});const accepted=await b.send("challenge.respond","accept",{challengeId:challenge.data.challengeId,accept:true});
    const gameId=accepted.data.gameId;
    await w.send("game.ready","wr",{gameId,revision:0});await b.send("game.ready","br",{gameId,revision:0});
    const active=(await w.snapshot(g=>g?.status==="ACTIVE")).snapshot.game;
    const body={gameId,messageId:"same-message",body:"한글 채팅 · 안녕하세요"};
    const chat=await w.send("chat.send","chat",body);expect(chat.data.sequence).toBe(1);
    expect(await w.send("chat.send","chat-retry",body)).toMatchObject({data:{sequence:1,replayed:true}});
    const received=(await b.snapshot(g=>g?.messages?.length===1)).snapshot.game;
    expect(received.messages[0]).toMatchObject({senderPlayerId:wid,displayName:"White",body:body.body});expect(received.revision).toBe(active.revision);
    expect(await outsider.send("chat.send","intrude",body)).toMatchObject({type:"server.error",code:"NOT_GAME_PARTICIPANT"});
    expect(outsider.messages.filter(m=>m.type==="lobby.snapshot").every(m=>m.snapshot.game===null)).toBe(true);
    await b.send("game.resign","resign",{gameId,expectedRevision:active.revision});
    expect(await w.send("chat.send","post-end",{...body,messageId:"new"})).toMatchObject({type:"server.error",code:"CHAT_READ_ONLY"});
    expect(await w.send("game.retry.request","winner-request",{gameId})).toMatchObject({type:"server.error",code:"REMATCH_LOSER_ONLY"});
    expect(await b.send("game.retry.request","loser-request",{gameId})).toMatchObject({data:{status:"PENDING"}});
    const next=await w.send("game.retry.respond","rematch-accept",{gameId,accept:true});const nextId=next.data.newGameId;expect(nextId).not.toBe(gameId);
    expect(await w.send("game.retry.respond","rematch-accept",{gameId,accept:true})).toMatchObject({data:{newGameId:nextId,replayed:true}});
    const [winnerView,loserView]=await Promise.all([w.snapshot(g=>g?.gameId===nextId),b.snapshot(g=>g?.gameId===nextId)]);
    expect(winnerView.snapshot.game).toMatchObject({status:"PREPARING",color:"BLACK",revision:0,messages:[]});expect(loserView.snapshot.game.color).toBe("WHITE");
    expect(winnerView.snapshot.game.board.flat().every((c:unknown)=>c===null)).toBe(true);
    await w.send("game.ready","new-w",{gameId:nextId,revision:0});await b.send("game.ready","new-b",{gameId:nextId,revision:0});
    const nextActive=(await w.snapshot(g=>g?.gameId===nextId && g.status==="ACTIVE")).snapshot.game;
    expect(nextActive.nextColor).toBe("BLACK");expect(Date.parse(nextActive.turnDeadlineUtc)-Date.now()).toBeGreaterThan(59000);
    await w.send("game.resign","new-resign",{gameId:nextId,expectedRevision:nextActive.revision});
    await b.send("game.result.leave","winner-leave",{gameId:nextId});
    const disabled=(await w.snapshot(g=>g?.gameId===nextId && g?.resultRoom?.disabledReason?.includes("나갔습니다"))).snapshot.game;
    expect(disabled.resultRoom.canRequest).toBe(false);
    await w.send("game.result.leave","loser-leave",{gameId:nextId});
    await Promise.all([w.snapshot(g=>g===null),b.snapshot(g=>g===null)]);
  }finally{
    app.lobby.close();for(const client of clients)client.socket.close();app.webSocketServer.close();app.httpServer.close();await once(app.httpServer,"close");db.close();
  }
},15000);
