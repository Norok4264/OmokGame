import { updateLocked } from "./pwa.js";
import { Chat, useRoomChatState } from "./Chat.js";
import { renderResultImage, downloadResultImage } from "./result-image.js";
import { useEffect, useRef, useState } from "react";
import { resultReason, toScreenCoordinate, type RuleGameState } from "@danpan/shared";
import type { LobbyClient, LobbyState } from "./lobby-client.js";
export function OnlineGame({ info, client, connected, leave, ownName, playerId }: { info: NonNullable<LobbyState["game"]>; client: LobbyClient; connected: boolean; leave: () => void; ownName: string; playerId: string }) {
  const [preview,setPreview] = useState<string | null>(null);
  const [saving,setSaving] = useState(false);
  const [saveError,setSaveError] = useState("");
  const [candidate, setCandidate] = useState<{ x: number; y: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const chatState=useRoomChatState(info.gameId);
  const [now, setNow] = useState(Date.now());
  const resultRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (info.status !== "ACTIVE" && !resultRef.current?.open) resultRef.current?.showModal(); }, [info.status]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 200); return () => clearInterval(timer); }, []);
  const ownTurn = info.status === "ACTIVE" && info.nextColor === info.color && connected && !pending;
  async function command(type: string) {
    setPending(true); setNotice("서버 승인 확인 중…");
    const query = window.setTimeout(() => { setNotice("응답이 지연되어 최신 상태를 조회합니다. 미확정 돌은 다시 보내지 않습니다."); void client.request("game.snapshot.request", { gameId: info.gameId }).catch(() => {}); }, 3000);
    try { await client.request(type, { gameId: info.gameId, expectedRevision: info.revision, ...(type === "game.move.propose" ? candidate : {}) }); setCandidate(null); setNotice(""); }
    catch (error) { setNotice(error instanceof Error ? error.message : "저장 실패. 상태를 조회하세요."); }
    finally { clearTimeout(query); setPending(false); }
  }
  async function roomCommand(type:string, body:Record<string,unknown>={}, exiting=false) {
    if(type.startsWith("game.retry")&&updateLocked())return;
    if(exiting && !connected){leave();return;}
    setPending(true); setNotice("");
    try { await client.request(type,{gameId:info.gameId,...body}); if(exiting)leave(); }
    catch(error){setNotice(error instanceof Error?error.message:"처리 실패. 다시 시도하세요.");}
    finally{setPending(false);}
  }
  async function savePng(download:boolean) {
    if(info.result?.kind!=="WIN")return;
    setSaving(true);setSaveError("");
    try {
      const canvas=await renderResultImage({board:info.board,whiteName:info.whiteName,blackName:info.blackName,winner:info.result.winner,status:info.status,endReason:info.endReason??null,savedAt:new Date()});
      setPreview(canvas.toDataURL("image/png"));
      if(download) await downloadResultImage(canvas);
    } catch(error){setSaveError(error instanceof Error?error.message:"PNG 저장 실패");}
    finally{setSaving(false);}
  }
  const chat=<Chat state={chatState} key={info.gameId} gameId={info.gameId} messages={info.messages??[]} me={playerId} ownName={ownName} client={client} connected={connected} readOnly={info.status!=="ACTIVE"}/>;
  return <section className="page-screen game-screen" data-game-controls="true">
    <h1>온라인 대국</h1>{info.readOnlyResult&&<p role="status">보관 결과 조회 전용입니다. 경기 복귀와 재도전은 종료됐으며 나가면 새 이용을 시작합니다.</p>}
    <p>{ownName} ({info.color === "BLACK" ? "흑" : "백"}) · 상대 {info.opponentName} · revision {info.revision}</p>
    <p role="status">{connected ? "서버 연결됨" : "연결 복구 중"} · 현재 차례: {info.nextColor ?? "종료"} · 남은 시간 {Math.max(0, Math.ceil((Date.parse(info.turnDeadlineUtc ?? "") - now) / 1000)) || 0}초</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(15, 1fr)", background: "#e8bf8f", padding: "8px", width: "min(100%, 650px)", aspectRatio: "1", margin: "auto" }} role="grid" aria-label="15×15 오목판" tabIndex={0}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement || !ownTurn) return;
        if (event.key === "Escape") setCandidate(null);
        else if (event.key === "Enter" && candidate) { event.preventDefault(); void command("game.move.propose"); }
        else if (event.key.startsWith("Arrow")) { event.preventDefault(); const p = candidate ?? { x: 7, y: 7 }; setCandidate({ x: Math.max(0, Math.min(14, p.x + (event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0))), y: Math.max(0, Math.min(14, p.y + (event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0))) }); }
      }}>
      {info.board.map((row, y) => row.map((stone, x) => <button key={`${x}:${y}`} aria-label={`${toScreenCoordinate({ x, y })} ${stone ?? "빈 교차점"}`} onClick={() => ownTurn && !stone && setCandidate({ x, y })}
        style={{ border: 0, padding: 0, background: "linear-gradient(90deg, transparent calc(50% - .5px), #8b613e calc(50% - .5px), #8b613e calc(50% + .5px), transparent calc(50% + .5px)), linear-gradient(transparent calc(50% - .5px), #8b613e calc(50% - .5px), #8b613e calc(50% + .5px), transparent calc(50% + .5px))", minWidth: 0, aspectRatio: "1", display: "grid", placeItems: "center" }}>
        {(stone || candidate?.x === x && candidate.y === y) && <span className={stone && info.lastMove?.x === x && info.lastMove.y === y ? "online-approved" : undefined} style={{ display: "block", borderRadius: "50%", width: "85%", height: "85%", opacity: stone ? 1 : .4, background: (stone ?? info.color) === "BLACK" ? "radial-gradient(at 30% 25%, #666, #111)" : "radial-gradient(at 30% 25%, white, #ccc)", boxShadow: "1px 2px 3px #684b34" }} />}
      </button>))}
    </div>
    <p>후보: {candidate ? toScreenCoordinate(candidate) : "교차점을 선택하세요"}</p>
    <button className="button button-primary" disabled={!ownTurn || !candidate} onClick={() => void command("game.move.propose")}>돌 놓기</button>
    <button className="button button-secondary" disabled={info.status !== "ACTIVE" || pending || !connected} onClick={() => { if (window.confirm("기권하시겠습니까? 상대의 승리로 종료됩니다.")) void command("game.resign"); }}>기권</button>
    <p role="status">{notice}</p>
    {info.status!=="ACTIVE"&&<button className="button button-secondary" onClick={()=>resultRef.current?.showModal()}>결과 보기</button>}
    {info.status === "ACTIVE" && chat}
    {info.status !== "ACTIVE" && <dialog ref={resultRef} aria-label="대국 결과" className="queue-card result-dialog"><h2>{info.result?.kind === "WIN" ? `${info.result.winner === info.color ? "승리" : "패배"}` : info.status === "ABORTED" ? "무효 종료" : "무승부"}</h2>
      <button className="button button-quiet" onClick={()=>resultRef.current?.close()}>판 확인 · 팝업 닫기</button>
      <p>{resultReason(info.status,info.endReason)}</p>
      <p>결과방 남은 시간: {Math.max(0,Math.ceil((Date.parse(info.resultRoom?.expiresAtUtc??"")-now)/1000))||0}초</p>
      {info.result?.kind === "WIN" && info.result.winner === info.color && <div>
        <button className="button button-primary" disabled={saving} onClick={()=>void savePng(true)}>{saving?"PNG 준비 중…":saveError?"PNG 저장 재시도":"최종 보드 PNG 다운로드"}</button>
        <button className="button button-secondary" disabled={saving} onClick={()=>void savePng(false)}>미리보기</button>
      </div>}
      {saveError && <p role="alert">{saveError} · 결과는 유지됩니다. 재시도하거나 미리보기를 확인하세요.</p>}
      {preview && <details open={Boolean(saveError)}><summary>PNG 미리보기</summary><img src={preview} alt="최종 보드·이름·돌 색·승리 팝업·종료 사유·저장 시각 미리보기" style={{maxWidth:"100%"}} /></details>}
      <div className="rematch-actions">
        {info.result?.kind === "WIN" && info.result.winner !== info.color && !info.readOnlyResult && <button className="button button-primary" disabled={!connected||pending||!info.resultRoom?.canRequest} onClick={()=>void roomCommand("game.retry.request")}>재도전 요청 · 나는 백</button>}
        {info.resultRoom?.canRespond && <><p>상대가 재도전을 신청했습니다. 승낙하면 나는 흑입니다.</p><button className="button button-primary" disabled={!connected||pending} onClick={()=>void roomCommand("game.retry.respond",{accept:true})}>재도전 승낙</button><button className="button button-secondary" disabled={!connected||pending} onClick={()=>void roomCommand("game.retry.respond",{accept:false})}>거부</button></>}
        {info.resultRoom?.retry?.status==="PENDING" && <p role="status">재도전 응답 대기 · {Math.max(0,Math.ceil((Date.parse(info.resultRoom.retry.deadlineUtc)-now)/1000))}초</p>}
        {info.resultRoom?.retry?.status==="PENDING"&&info.resultRoom.retry.requesterPlayerId===playerId&&<button className="button button-secondary" disabled={!connected||pending} onClick={()=>void roomCommand("game.retry.cancel")}>재도전 신청 취소</button>}
        {info.resultRoom?.retry?.status==="DECLINED" && <p role="status">재도전 요청이 거절되었습니다.</p>}
        {info.resultRoom?.retry?.status==="EXPIRED" && <p role="status">재도전 응답 시간이 만료되었습니다.</p>}
        {info.resultRoom?.retry?.status==="CANCELLED" && <p role="status">재도전 요청이 취소되었습니다.</p>}
        {info.resultRoom?.disabledReason && <p role="status">{info.resultRoom.disabledReason}</p>}
      </div>
      <p role="status">{notice}</p>
      {chat}
      <button className="button button-primary" style={{ float: "right" }} disabled={pending} onClick={()=>void roomCommand("game.result.leave",{},true)}>{info.readOnlyResult?"초기 화면으로 · 새 이용":"대기열로 나가기"}</button></dialog>}
  </section>;
}
