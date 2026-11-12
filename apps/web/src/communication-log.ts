export type Direction="SEND"|"RECEIVE";
export interface AppEvent {
  serial:number;direction:Direction;kind:string;atUtc:string;payloadBytes:number;
  coordinate?:{x:number;y:number;label:string;source:"request"|"snapshot.lastMove"};
  expectedRevision?:number;approvedRevision?:number;revision?:number;
  applicationRttMs?:number;rttNote?:string;summary:Record<string,unknown>;
}
const kinds=new Set(["client.hello","session.start","session.resume","session.end","lobby.snapshot.request","lobby.snapshot","challenge.create","challenge.cancel","challenge.respond","challenge.event","game.ready","game.cancel","game.move.propose","game.snapshot.request","game.resign","game.retry.request","game.retry.cancel","game.retry.respond","game.result.leave","game.event","chat.send","chat.message","heartbeat","heartbeat.request","heartbeat.ack","server.hello","server.error","server.storage","command.result","snapshot"]);
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==="object"&&!Array.isArray(v)?v as Record<string,unknown>:null;
const number=(v:unknown):v is number=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0;
export function shortId(value:unknown):string|undefined{return typeof value==="string"?value.slice(0,8)+(value.length>8?"…":""):undefined;}
function project(value:Record<string,unknown>):Omit<AppEvent,"serial"|"direction"|"atUtc"|"payloadBytes">{
  const kind=typeof value.type==="string"&&kinds.has(value.type)?value.type:"unknown JSON message";
  const data=object(value.data),snapshot=object(value.snapshot)??object(data?.snapshot),game=object(snapshot?.game)??snapshot;
  const summary:Record<string,unknown>={};
  const ids=[value,data,object(data?.session),game,object(value.event)];
  for(const source of ids)if(source)for(const key of ["requestId","gameId","challengeId","playerId","messageId","newGameId"]){const id=shortId(source[key]);if(id)summary[key]=id;}
  if(number(value.protocolVersion))summary.protocolVersion=value.protocolVersion;
  if(typeof value.ok==="boolean")summary.ok=value.ok;
  const statuses=new Set(["PREPARING","ACTIVE","FINISHED","ABORTED","CANCELLED","PENDING","ACCEPTED","DECLINED","EXPIRED"]);
  for(const source of [value,data,game,object(value.event)])if(source&&typeof source.status==="string"&&statuses.has(source.status))summary.status=source.status;
  if(kind==="chat.send"||kind==="chat.message"){
    if(typeof value.body==="string")summary.chatLength=[...value.body].length;
    if(number(value.sequence))summary.sequence=value.sequence;
  }
  if(data&&number(data.sequence)){summary.sequence=data.sequence;}
  const messages=Array.isArray(game?.messages)?game.messages:[];
  if(Array.isArray(game?.messages)){
    summary.chatMessagesCount=messages.length;
    const latest=object(messages.at(-1));
    if(latest)summary.latestChat={messageId:shortId(latest.messageId),sequence:number(latest.sequence)?latest.sequence:undefined,length:typeof latest.body==="string"?[...latest.body].length:0};
  }
  const result:Omit<AppEvent,"serial"|"direction"|"atUtc"|"payloadBytes">={kind,summary};
  if(number(value.expectedRevision))result.expectedRevision=value.expectedRevision;
  if(number(data?.approvedRevision))result.approvedRevision=data.approvedRevision;
  if(number(game?.revision))result.revision=game.revision;else if(number(value.revision))result.revision=value.revision;
  const direct=number(value.x)&&number(value.y)?value:null,last=object(game?.lastMove),point=direct??last;
  if(point&&number(point.x)&&number(point.y)&&point.x<15&&point.y<15)result.coordinate={x:point.x,y:point.y,label:String.fromCharCode(65+point.x)+(point.y+1),source:direct?"request":"snapshot.lastMove"};
  return result;
}
export class CommunicationLog {
  private rows:readonly AppEvent[]=[];private serial=0;
  private listeners=new Set<()=>void>();
  private pending=new Map<string,{started:number;ambiguous:boolean;outstanding:number}>();
  constructor(private mono:()=>number=()=>performance.now(),private utc:()=>Date=()=>new Date()){}
  snapshot=()=>this.rows;
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  clear=()=>{this.rows=[];this.pending.clear();this.publish();};
  endChannel(channel:string){for(const key of this.pending.keys())if(key.startsWith(channel+":"))this.pending.delete(key);}
  record(direction:Direction,raw:string,channel="default",started?:number){
    const now=this.mono();
    for(const [key,entry]of this.pending)if(now-entry.started>120000)this.pending.delete(key);
    let input:Record<string,unknown>|null=null;
    try{input=object(JSON.parse(raw));}catch{/* retain metadata only for invalid JSON */}
    const fields=input?project(input):{kind:"invalid JSON",summary:{}};
    const row:AppEvent={serial:++this.serial,direction,atUtc:this.utc().toISOString(),payloadBytes:new TextEncoder().encode(raw).byteLength,...fields};
    const requestId=typeof input?.requestId==="string"?input.requestId:null;
    if(requestId){
      const key=channel+":"+requestId;
      if(direction==="SEND"){
        const prior=this.pending.get(key);
        this.pending.set(key,{started:started??now,ambiguous:Boolean(prior),outstanding:(prior?.outstanding??0)+1});
        while(this.pending.size>200)this.pending.delete(this.pending.keys().next().value!);
      }else if(["command.result","server.error","heartbeat.ack"].includes(row.kind)){
        const sent=this.pending.get(key);
        if(sent){
          if(sent.ambiguous)row.rttNote="동일 ID 재전송으로 응답 대상 전송을 구분할 수 없습니다.";
          else row.applicationRttMs=Math.max(0,now-sent.started);
          if(sent.outstanding>1)sent.outstanding--;else this.pending.delete(key);
        }
      }
    }
    this.rows=[...this.rows,row].slice(-200);this.publish();
  }
  private publish(){for(const listener of this.listeners){try{listener();}catch{/* diagnostics must not interrupt gameplay */}}}
}
export const communicationLog=new CommunicationLog();
