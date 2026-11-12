import {it,expect,vi,afterEach} from "vitest";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createRuleGame} from "@danpan/shared";
import {OnlineGame} from "./OnlineGame.js";
import type {LobbyState,LobbyClient} from "./lobby-client.js";
afterEach(()=>vi.unstubAllGlobals());
function result(color:"WHITE"|"BLACK",reason:string,status="FINISHED"){
  vi.stubGlobal("sessionStorage",{getItem:()=>null});
  const info={...createRuleGame(),gameId:"g",status,color,endReason:reason,whiteName:"백 이름",blackName:"흑 이름",revision:2,opponentName:"상대",messages:[],result:reason==="DRAW"||status==="ABORTED"?null:{kind:"WIN",winner:"BLACK"},resultRoom:{expiresAtUtc:new Date(Date.now()+300000).toISOString(),canRequest:color==="WHITE",canRespond:false,disabledReason:null,retry:null}} as NonNullable<LobbyState["game"]>;
  return renderToStaticMarkup(createElement(OnlineGame,{info,client:{} as LobbyClient,connected:true,ownName:"내 이름",playerId:"me",leave:()=>{}}));
}
it("A06/A07/A10 shows distinct reasons, winner-only PNG, loser-only rematch, and an exit on both results",()=>{
  const winner=result("BLACK","WIN"),loser=result("WHITE","RESIGNATION");
  expect(winner).toContain("5목 승리");expect(winner).toContain("PNG 다운로드");expect(winner).not.toContain("재도전 요청 · 나는 백");
  expect(loser).toContain("기권");expect(loser).toContain("재도전 요청 · 나는 백");expect(loser).not.toContain("PNG 다운로드");
  for(const html of [winner,loser])expect(html).toContain("대기열로 나가기");
  expect(result("WHITE","TIMEOUT")).toContain("시간패");expect(result("WHITE","DISCONNECT")).toContain("단절패");
  expect(result("WHITE","DRAW")).toContain("무승부");expect(result("WHITE","SYSTEM_ABORT","ABORTED")).toContain("시스템 중단 무효");
});
