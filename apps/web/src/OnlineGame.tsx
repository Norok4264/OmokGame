import { useEffect, useRef, useState } from "react";
import { toScreenCoordinate, type RuleGameState } from "@danpan/shared";
import type { LobbyClient, LobbyState } from "./lobby-client.js";
export function OnlineGame({ info, client, connected, leave, ownName }: { info: NonNullable<LobbyState["game"]>; client: LobbyClient; connected: boolean; leave: () => void; ownName: string }) {
  const [candidate, setCandidate] = useState<{ x: number; y: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
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
  return <section className="page-screen game-screen" data-game-controls="true">
    <h1>온라인 대국</h1>
    <p>{ownName} ({info.color === "BLACK" ? "흑" : "백"}) · 상대 {info.opponentName} · revision {info.revision}</p>
    <p role="status">{connected ? "서버 연결됨" : "연결 복구 중"} · 현재 차례: {info.nextColor ?? "종료"} · 남은 시간 {Math.max(0, Math.ceil((Date.parse(info.turnDeadlineUtc ?? "") - now) / 1000)) || 0}초</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(15, 1fr)", background: "#dba968", padding: "8px", width: "min(100%, 650px)", aspectRatio: "1", margin: "auto" }} role="grid" aria-label="15×15 오목판" tabIndex={0}
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
    {info.status !== "ACTIVE" && <dialog ref={resultRef} onCancel={e => e.preventDefault()} aria-label="대국 결과" className="queue-card result-dialog"><h2>{info.result?.kind === "WIN" ? `${info.result.winner === info.color ? "승리" : "패배"}` : info.status === "ABORTED" ? "무효 종료" : "무승부"}</h2><p>{info.endReason}</p>
      {info.result?.kind === "WIN" && info.result.winner === info.color && <button className="button button-secondary" onClick={() => {
        try {
          const canvas = document.createElement("canvas"); canvas.width = canvas.height = 750;
          const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Canvas unavailable");
          ctx.fillStyle = "#dba968"; ctx.fillRect(0,0,750,750); ctx.strokeStyle = "#805b32";
          for (let i=0;i<15;i++) { const p=25+i*50; ctx.beginPath(); ctx.moveTo(25,p); ctx.lineTo(725,p); ctx.moveTo(p,25); ctx.lineTo(p,725); ctx.stroke(); }
          info.board.forEach((row,y) => row.forEach((stone,x) => { if (stone) { ctx.fillStyle=stone === "BLACK" ? "#111" : "#fff"; ctx.beginPath(); ctx.arc(25+x*50,25+y*50,21,0,Math.PI*2); ctx.fill(); } }));
          const link=document.createElement("a"); link.download=`omok-${info.gameId}.png`; link.href=canvas.toDataURL("image/png"); link.click();
        } catch { setNotice("PNG 저장 실패. 브라우저 다운로드 설정을 확인하고 다시 저장하세요."); }
      }}>최종 보드 PNG 저장</button>}
      <button className="button button-primary" style={{ float: "right" }} onClick={leave}>대기열로 나가기</button></dialog>}
  </section>;
}
