import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LobbyClient, reconnectDelay } from "./lobby-client.js";
class FakeSocket {
  static OPEN=1;
  static all: FakeSocket[]=[];
  readyState=0; sent: any[]=[];
  handlers=new Map<string, Array<(e:any)=>void>>();
  constructor(readonly url:string) { FakeSocket.all.push(this); }
  addEventListener(name:string, handler:(e:any)=>void) { this.handlers.set(name,[...(this.handlers.get(name)??[]),handler]); }
  emit(name:string,event:any={}) { for(const handler of this.handlers.get(name)??[]) handler(event); }
  message(body:object) { this.emit("message",{data:JSON.stringify({protocolVersion:1, ok:true, serverBuild:"test", serverTimeUtc:new Date().toISOString(), ...body})}); }
  open() { this.readyState=1; this.emit("open"); this.message({type:"server.hello"}); }
  send(raw:string) { this.sent.push(JSON.parse(raw)); }
  close() { this.readyState=3; this.emit("close",{code:1006}); }
}
const flush=async()=>{ await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
async function authenticate(socket:FakeSocket, start:Promise<unknown>) {
  socket.open(); await flush();
  const auth=socket.sent.at(-1);
  socket.message({type:"command.result",requestId:auth.requestId,data:{session:{playerId:"p",nickname:"Alice",token:"safe-token"},resumed:auth.type==="session.resume"}});
  await flush();
  return { finish: async()=> {
    const query=socket.sent.find(m=>m.type==="lobby.snapshot.request");
    socket.message({type:"lobby.snapshot",snapshot:{me:{playerId:"p",nickname:"Alice"},players:[],challenges:[],game:null}});
    socket.message({type:"command.result",requestId:query.requestId,data:{accepted:true}});
    await start;
  }};
}
describe("browser recovery ordering and stale socket isolation",()=>{
  beforeEach(()=>{
    vi.useFakeTimers(); FakeSocket.all=[];
    vi.stubGlobal("WebSocket",FakeSocket);
    vi.stubGlobal("window",{location:{protocol:"http:",host:"localhost"},setTimeout,clearTimeout,setInterval,clearInterval});
    const storage=new Map(); vi.stubGlobal("sessionStorage",{getItem:(k:string)=>storage.get(k),setItem:(k:string,v:string)=>storage.set(k,v),removeItem:(k:string)=>storage.delete(k)});
  });
  afterEach(()=>{ vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
  it("B01/B03 authenticates, applies snapshot, then enables input; replacement ignores old messages and close",async()=>{
    const client=new LobbyClient(); const events:string[]=[];
    client.onStatus=s=>events.push(s); client.onSnapshot=()=>events.push("snapshot");
    const started=client.start("Alice"); const old=FakeSocket.all[0]!;
    const login=await authenticate(old,started);
    expect(events).not.toContain("connected"); await login.finish();
    expect(events.indexOf("snapshot")).toBeLessThan(events.indexOf("connected"));
    vi.spyOn(Math,"random").mockReturnValue(0);
    old.close(); await vi.advanceTimersByTimeAsync(1);
    const next=FakeSocket.all[1]!;
    next.open(); await flush();
    const auth=next.sent.at(-1); expect(auth.type).toBe("session.resume"); expect(next.url).not.toContain("safe-token");
    next.message({type:"command.result",requestId:auth.requestId,data:{session:{playerId:"p",nickname:"Alice",token:"safe-token"},resumed:true}}); await flush();
    expect(events.at(-1)).toBe("reconnecting");
    const query=next.sent.find(m=>m.type==="lobby.snapshot.request");
    next.message({type:"lobby.snapshot",snapshot:{me:{playerId:"p",nickname:"Alice"},players:[],challenges:[],game:null}});
    next.message({type:"command.result",requestId:query.requestId,data:{accepted:true}}); await flush();
    const count=events.length; old.message({type:"server.storage",available:false}); old.close();
    expect(events).toHaveLength(count); expect(events.at(-1)).toBe("connected");
    client.stop(); await vi.advanceTimersByTimeAsync(90000); expect(FakeSocket.all).toHaveLength(2);
  });
  it("B03 heartbeat sends at 15s and detects 30s of silence",async()=>{
    const client=new LobbyClient(); const start=client.start("Alice"); const socket=FakeSocket.all[0]!;
    await (await authenticate(socket,start)).finish();
    await vi.advanceTimersByTimeAsync(15000); expect(socket.sent.some(m=>m.type==="heartbeat")).toBe(true);
    await vi.advanceTimersByTimeAsync(15000); expect(socket.readyState).toBe(3); client.stop();
  });
  it("retry delays stay within the chosen initial jitter and capped backoff ranges",()=>{
    expect(reconnectDelay(0,()=>0)).toBe(0); expect(reconnectDelay(0,()=>1)).toBe(1000);
    expect(reconnectDelay(1,()=>0)).toBe(800); expect(reconnectDelay(1,()=>1)).toBe(1200);
    expect(reconnectDelay(100,()=>0)).toBe(6400); expect(reconnectDelay(100,()=>1)).toBe(9600);
  });
  it("B05 a sleeping reconnect attempt cannot replace a separately started new connection",async()=>{
    const client=new LobbyClient(); const first=client.start("Alice"); const old=FakeSocket.all[0]!;
    await (await authenticate(old,first)).finish();
    vi.spyOn(Math,"random").mockReturnValue(1); old.close();
    const second=client.start("Alice",{playerId:"p",nickname:"Alice",token:"safe-token"});
    await (await authenticate(FakeSocket.all[1]!,second)).finish();
    await vi.advanceTimersByTimeAsync(2000);
    expect(FakeSocket.all).toHaveLength(2); expect(FakeSocket.all[1]!.readyState).toBe(1); client.stop();
  });
  it("B01 a successful query response without its snapshot cannot enable input",async()=>{
    const client=new LobbyClient();const statuses:string[]=[];client.onStatus=s=>statuses.push(s);
    const start=client.start("Alice"); const rejected=expect(start).rejects.toThrow("스냅샷");
    const socket=FakeSocket.all[0]!;await authenticate(socket,start);
    const query=socket.sent.find(m=>m.type==="lobby.snapshot.request");
    socket.message({type:"command.result",requestId:query.requestId,data:{accepted:true}});
    await rejected;expect(statuses).not.toContain("connected");client.stop();
  });
  it("A08 a failed chat can be manually retried with identical requestId and messageId",async()=>{
    const client=new LobbyClient();const start=client.start("Alice");const socket=FakeSocket.all[0]!;await(await authenticate(socket,start)).finish();
    const body={gameId:"g",messageId:"stable-message",body:"한글 메시지"};
    const first=client.request("chat.send",body,"stable-request");
    const failed=expect(first).rejects.toThrow("전송 실패");
    socket.message({type:"server.error",ok:false,requestId:"stable-request",code:"CHAT_RATE_LIMIT",message:"전송 실패",snapshot:null});await failed;
    const second=client.request("chat.send",body,"stable-request");socket.message({type:"command.result",requestId:"stable-request",data:{messageId:"stable-message",sequence:1}});await second;
    const sent=socket.sent.filter(m=>m.type==="chat.send");expect(sent).toHaveLength(2);expect(sent[0]).toEqual(sent[1]);client.stop();
  });
});
