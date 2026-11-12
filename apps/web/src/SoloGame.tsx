import {useCallback,useEffect,useRef,useState} from "react";
import {toScreenCoordinate,type Coordinate} from "@danpan/shared";
import {BotRunner} from "./bot-runner.js";
import {loadSolo,newSolo,moveSolo,saveSolo,removeSolo,type SoloState} from "./solo-state.js";
import {updateLocked} from "./pwa.js";
import {renderResultImage,downloadResultImage} from "./result-image.js";
export function SoloGame({onLeave,onActivity}:{onLeave:()=>void;onActivity:(active:boolean)=>void}){
  const [game,setGame]=useState<SoloState>(()=>loadSolo()??newSolo());
  const current=useRef(game),runner=useRef<BotRunner|null>(null),job=useRef<string|null>(null);
  const [candidate,setCandidate]=useState<Coordinate|null>(null),[notice,setNotice]=useState("");
  const [thinking,setThinking]=useState(false),[saving,setSaving]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const commit=useCallback((next:SoloState)=>{
    current.current=next;setGame(next);
    try{saveSolo(next);}catch{setNotice("이 기기에 판을 저장하지 못했습니다. 현재 대국은 계속할 수 있지만 새로고침 복구는 보장되지 않습니다.");}
  },[]);
  useEffect(()=>{runner.current=new BotRunner();return()=>{runner.current?.cancel();runner.current=null;job.current=null;};},[]);
  useEffect(()=>{
    onActivity(game.state.status==="ACTIVE");
    try{saveSolo(game);}catch{setNotice("판 저장 실패. 브라우저 저장 공간을 확인하세요.");}
    if(game.state.status!=="ACTIVE"||game.state.nextColor!=="BLACK"){setThinking(false);return;}
    const taskId=crypto.randomUUID();job.current=taskId;setThinking(true);
    runner.current?.run({gameId:game.gameId,revision:game.revision,taskId,state:game.state},answer=>{
      const active=current.current;
      if(active.gameId!==answer.gameId||active.revision!==answer.revision||job.current!==answer.taskId||active.state.status!=="ACTIVE"||active.state.nextColor!=="BLACK")return;
      job.current=null;setThinking(false);setCandidate(null);
      if(answer.fallback)setNotice("봇 계산이 지연되거나 중단되어 합법적인 대체 수를 두었습니다.");
      commit(moveSolo(active,answer.move));
    });
    return()=>{runner.current?.cancel();job.current=null;};
  },[game.gameId,game.revision,game.state,commit,onActivity]);
  useEffect(()=>{if(game.state.status==="FINISHED"&&!dialog.current?.open)dialog.current?.showModal();},[game.state.status]);
  const canPlace=game.state.status==="ACTIVE"&&game.state.nextColor==="WHITE"&&!thinking;
  function place(){
    if(!canPlace||!candidate||updateLocked())return;
    try{runner.current?.cancel();job.current=null;commit(moveSolo(current.current,candidate));setCandidate(null);setNotice("");}catch(error){setNotice(String(error));}
  }
  function restart(){if(updateLocked())return;runner.current?.cancel();job.current=null;setCandidate(null);setThinking(false);setNotice("");dialog.current?.close();commit(newSolo());}
  function leave(){runner.current?.cancel();job.current=null;try{removeSolo();}catch{setNotice("저장판을 삭제하지 못했습니다. 저장 공간 설정을 확인한 뒤 다시 나가세요.");return;}onActivity(false);onLeave();}
  async function save(){
    if(game.state.result?.kind!=="WIN")return;setSaving(true);
    try{const canvas=await renderResultImage({board:game.state.board,whiteName:"나",blackName:"오목 봇",winner:game.state.result.winner,status:"FINISHED",endReason:"WIN",savedAt:new Date()});await downloadResultImage(canvas);}
    catch{setNotice("PNG 저장 실패. 결과를 유지한 채 다시 저장할 수 있습니다.");}finally{setSaving(false);}
  }
  return <section className="page-screen game-screen solo-game" data-game-id={game.gameId} data-revision={game.revision} data-status={game.state.status}>
    <header className="app-header"><h1>혼자 놀기</h1><button className="button button-quiet" onClick={leave}>초기 화면으로 · 저장판 삭제</button></header>
    <p>나 · 백 / 오목 봇 · 흑</p>
    <p role="status">{game.state.status==="FINISHED"?"대국 종료":thinking?"봇 생각 중 · 목표 1초, 2초 초과 시 대체 수":"현재 차례 · 백"}</p>
    <div className="solo-board" role="grid" aria-label="15×15 혼자 놀기 오목판" tabIndex={0} onKeyDown={event=>{
      if(!canPlace)return;
      if(event.key==="Enter"){event.preventDefault();place();return;}if(event.key==="Escape"){setCandidate(null);return;}
      if(event.key.startsWith("Arrow")){event.preventDefault();const p=candidate??{x:7,y:7};setCandidate({x:Math.max(0,Math.min(14,p.x+(event.key==="ArrowRight"?1:event.key==="ArrowLeft"?-1:0))),y:Math.max(0,Math.min(14,p.y+(event.key==="ArrowDown"?1:event.key==="ArrowUp"?-1:0)))});}
    }}>
      {game.state.board.map((row,y)=>row.map((stone,x)=><button key={`${x}:${y}`} className="solo-point" aria-label={`${toScreenCoordinate({x,y})} ${stone??"빈 교차점"}`} onClick={()=>{if(canPlace&&!stone)setCandidate({x,y});}}>
        {(stone||candidate?.x===x&&candidate.y===y)&&<span className={stone&&game.state.lastMove?.x===x&&game.state.lastMove.y===y?"online-approved":""} style={{display:"block",borderRadius:"50%",width:"85%",height:"85%",opacity:stone?1:.4,background:(stone??"WHITE")==="BLACK"?"radial-gradient(at 30% 25%, #666, #111)":"radial-gradient(at 30% 25%, white, #ccc)",boxShadow:"1px 2px 3px #684b34"}}/>}
      </button>))}
    </div>
    <p>후보: {candidate?toScreenCoordinate(candidate):"교차점을 선택하세요"}</p>
    <button className="button button-primary" disabled={!canPlace||!candidate} onClick={place}>돌 놓기</button>
    <button className="button button-secondary" onClick={restart}>새 판으로 재경기</button>
    {notice&&<p role="status">{notice}</p>}
    <dialog ref={dialog} className="result-dialog queue-card" onCancel={event=>event.preventDefault()}>
      <h2>{game.state.result?.kind==="DRAW"?"무승부":game.state.result?.kind==="WIN"&&game.state.result.winner==="WHITE"?"승리했어요!":"오목 봇 승리"}</h2>
      <p>기기 내부의 동일 자유룰로 판정했습니다.</p>
      {notice&&<p role="status">{notice}</p>}
      {game.state.result?.kind==="WIN"&&game.state.result.winner==="WHITE"&&<button className="button button-primary" disabled={saving} onClick={()=>void save()}>최종 보드 PNG 저장</button>}
      <button className="button button-secondary" onClick={restart}>재경기</button><button className="button button-quiet" onClick={leave}>초기 화면으로 · 저장판 삭제</button>
    </dialog>
  </section>;
}
