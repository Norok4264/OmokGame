import { playMove,type RuleGameState,type Coordinate } from "@danpan/shared";
import { legalFallback } from "./bot.js";
export interface BotJob {gameId:string;revision:number;taskId:string;state:RuleGameState}
export type BotAnswer=Pick<BotJob,"gameId"|"revision"|"taskId">&{move:Coordinate;fallback:boolean};
export interface WorkerPort {onmessage:((event:MessageEvent)=>void)|null;onerror:((event:ErrorEvent)=>void)|null;postMessage:(data:unknown)=>void;terminate:()=>void}
export function createBotWorker():WorkerPort{return new Worker(new URL("./bot.worker.ts",import.meta.url),{type:"module"});}
export class BotRunner {
  private current:{job:BotJob;worker:WorkerPort|null;timer:ReturnType<typeof setTimeout>;deadline:number}|null=null;
  constructor(private factory:()=>WorkerPort=createBotWorker){}
  cancel(){if(this.current){clearTimeout(this.current.timer);this.current.worker?.terminate();this.current=null;}}
  run(job:BotJob,accept:(answer:BotAnswer)=>void){
    this.cancel();
    const finish=(move:unknown,fallback:boolean)=>{
      const pending=this.current;if(!pending||pending.job!==job)return;
      const point=move as Coordinate|null;
      const valid=point && playMove(job.state,point,"BLACK").ok;
      const selected=!fallback&&valid?point:legalFallback(job.state);
      this.cancel();if(selected)accept({gameId:job.gameId,revision:job.revision,taskId:job.taskId,move:selected,fallback:fallback||!valid});
    };
    this.current={job,worker:null,timer:setTimeout(()=>finish(null,true),2000),deadline:performance.now()+2000};
    try{
      const worker=this.factory();this.current.worker=worker;
      worker.onmessage=event=>{
        if(!this.current||this.current.job!==job)return;
        const m=event.data;if(m?.gameId!==job.gameId||m?.revision!==job.revision||m?.taskId!==job.taskId)return;
        finish(m.move,performance.now()>=this.current!.deadline);
      };
      worker.onerror=()=>finish(null,true);
      worker.postMessage({kind:"move",...job});
    }catch{finish(null,true);}
  }
}
export function warmBotWorker():Promise<void>{
  return new Promise((resolve,reject)=>{
    const worker=createBotWorker(),taskId=crypto.randomUUID();
    const timer=setTimeout(()=>{worker.terminate();reject(new Error("Worker 준비 시간이 초과되었습니다."));},2000);
    worker.onmessage=event=>{if(event.data?.taskId!==taskId)return;clearTimeout(timer);worker.terminate();event.data.move?.x===7&&event.data.move?.y===7?resolve():reject(new Error("Worker 자유룰 확인 실패"));};
    worker.onerror=()=>{clearTimeout(timer);worker.terminate();reject(new Error("Worker를 준비하지 못했습니다."));};
    worker.postMessage({kind:"warmup",gameId:"offline-check",revision:0,taskId});
  });
}
