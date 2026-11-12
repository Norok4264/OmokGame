import { chooseBotMove } from "./bot.js";
import { createRuleGame, type RuleGameState } from "@danpan/shared";
export interface BotRequest { kind:"move"|"warmup";gameId:string;revision:number;taskId:string;state:RuleGameState }
const scope=globalThis as unknown as {onmessage:(event:MessageEvent<BotRequest>)=>void;postMessage:(message:unknown)=>void};
scope.onmessage=event=>{
  const {kind,gameId,revision,taskId,state}=event.data;
  const started=performance.now();
  const move=chooseBotMove(kind==="warmup"?createRuleGame():state,"BLACK");
  scope.postMessage({kind,gameId,revision,taskId,move,elapsedMs:performance.now()-started});
};
