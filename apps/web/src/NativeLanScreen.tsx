import { useEffect, useState } from "react";
import { toScreenCoordinate } from "@danpan/shared";
import { readNativeLanSnapshot, type NativeLanCommunicationEvent, type NativeLanGame, type NativeLanSnapshot } from "./android-bridge.js";

export function NativeLanScreen({ nickname, onHome }: { nickname: string; onHome: () => void }) {
  const [lan, setLan] = useState<NativeLanSnapshot>(readNativeLanSnapshot);
  const [selected, setSelected] = useState<string | null>(null);
  const ownName = lan.deviceNickname || nickname.trim() || "게스트";
  const stopAndHome = () => { window.AndroidOmok?.stop(); onHome(); };

  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!detail || typeof detail !== "object") return;
      const value = detail as Partial<NativeLanSnapshot>;
      if (typeof value.status !== "string" || !Array.isArray(value.peers)) return;
      setLan((current) => {
        const next = { ...readNativeLanSnapshot(), ...value, peers: value.peers as NativeLanSnapshot["peers"], communicationEvents: Array.isArray(value.communicationEvents) ? value.communicationEvents as NativeLanSnapshot["communicationEvents"] : current.communicationEvents } as NativeLanSnapshot;
        if (current.game && next.game?.gameId === current.game.gameId && next.game.revision < current.game.revision) next.game = current.game;
        if (current.challenge && next.challenge?.challengeId === current.challenge.challengeId && next.challenge.revision < current.challenge.revision) next.challenge = current.challenge;
        return next;
      });
    };
    window.addEventListener("omok-native-lan", receive);
    window.AndroidOmok?.startHosting(nickname);
    window.AndroidOmok?.startDiscovery();
    const timer = window.setInterval(() => window.AndroidOmok?.refresh(), 700);
    setLan(readNativeLanSnapshot());
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("omok-native-lan", receive);
    };
  }, [nickname]);

  if (lan.game) return <LanGameView game={lan.game} lan={lan} onHome={() => { if (lan.game?.status === "FINISHED") window.AndroidOmok?.dismissResult(lan.game.gameId); stopAndHome(); }} />;
  const pending = lan.challenge?.status === "PENDING" ? lan.challenge : null;
  const outgoing = Boolean(pending && pending.applicantId === lan.devicePlayerId);

  return <section className="page-screen queue-screen lan-screen" aria-labelledby="lan-title">
    <header className="app-header">
      <button className="brand-button" type="button" onClick={stopAndHome} aria-label="초기 화면으로">
        <span className="mini-board" aria-hidden="true"><i /><b /></span>
        <span><strong>단판 오목</strong><small>같은 Wi-Fi · LAN 대국</small></span>
      </button>
      <span className="header-preview">Android</span>
    </header>
    <div className="queue-card">
      <div className="section-kicker">ANDROID LOCAL NETWORK</div>
      <h1 id="lan-title">대기 중인 상대</h1>
      <p className="queue-greeting"><strong>{ownName}</strong> 님 · 같은 Wi-Fi 안에서 자동 검색합니다.</p>
      <div className="connection-panel connection-ready" role="status" aria-live="polite">
        <span className="status-symbol" aria-hidden="true">◉</span>
        <div><strong>신청받은 기기가 대국 호스트를 맡습니다</strong><p>{lan.status}</p></div>
      </div>

      {pending && <div className="challenge-confirm" role="group" aria-live="polite">
        {outgoing ? <>
          <strong>{pending.acceptorName} 님의 승낙을 기다리는 중</strong>
          <p>신청자 <b>백</b> · 승낙자 <b>흑</b> · 응답 제한 30초</p>
          <button className="button button-quiet" type="button" onClick={() => window.AndroidOmok?.cancelChallenge()}>신청 취소</button>
        </> : <>
          <strong>{pending.applicantName} 님이 대국을 신청했습니다</strong>
          <p>승낙하면 신청자가 백, 승낙자가 흑입니다. 남은 시간 {Math.max(0, Math.ceil((pending.deadlineUtcMs - Date.now()) / 1000))}초</p>
          <button className="button button-primary" type="button" onClick={() => window.AndroidOmok?.respondChallenge(pending.challengeId, true, pending.revision)}>승낙</button>
          <button className="button button-quiet" type="button" onClick={() => window.AndroidOmok?.respondChallenge(pending.challengeId, false, pending.revision)}>거부</button>
        </>}
      </div>}

      {!pending && <div className="lobby-roster" aria-label="발견한 상대 목록">
        <div className="roster-heading"><strong>발견한 상대</strong><span>{lan.peers.length}명</span></div>
        {lan.peers.length === 0
          ? <p className="empty-roster">상대를 찾는 중입니다. 두 기기를 같은 일반 Wi-Fi에 연결하세요. 게스트 Wi-Fi의 기기 격리는 연결을 막을 수 있습니다.</p>
          : lan.peers.map((peer) => <button key={peer.id} type="button" className={"roster-player " + (selected === peer.id ? "roster-selected" : "")} onClick={() => setSelected(peer.id)}>
            <span className="roster-presence" /><strong>{peer.name}</strong><span>{peer.authority ? "권한 호스트" : "상대 선택"}</span>
          </button>)}
        {selected && <div className="challenge-confirm" role="group" aria-label="대국 신청 확인">
          <strong>선택한 상대에게 신청할까요?</strong>
          <p>{lan.peers.find((peer) => peer.id === selected)?.authority
            ? "신청자는 백(후공), 승낙자는 흑(선공)입니다. 응답 제한은 30초입니다."
            : "이 기기에서 신청하면 이 기기가 백, 상대가 승낙 시 흑입니다. 응답 제한은 30초입니다."}</p>
          <button className="button button-primary" type="button" onClick={() => {
            const peer = lan.peers.find((item) => item.id === selected);
            if (!peer) return;
            window.AndroidOmok?.createChallenge(selected, nickname);
          }}>대국 신청</button>
          <button className="button button-quiet" type="button" onClick={() => setSelected(null)}>취소</button>
        </div>}
      </div>}
      <button className="button button-quiet" type="button" onClick={() => window.AndroidOmok?.startDiscovery()}>상대 다시 검색</button>
      <button className="button button-quiet" type="button" onClick={stopAndHome}>초기 화면으로</button>
    </div>
  </section>;
}

function LanGameView({ game, lan, onHome }: { game: NativeLanGame; lan: NativeLanSnapshot; onHome: () => void }) {
  const [candidate, setCandidate] = useState<{ x: number; y: number } | null>(null);
  const [pendingRevision, setPendingRevision] = useState<number | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [remaining, setRemaining] = useState(60);
  const [chatDraft, setChatDraft] = useState(() => { try { return localStorage.getItem(`lan-chat-draft:${game.gameId}`) ?? ""; } catch { return ""; } });
  const [sendingChat, setSendingChat] = useState<{ id: string; body: string; state: "sending" | "uncertain" } | null>(null);
  const [chatMessage, setChatMessage] = useState("");
  const [composing, setComposing] = useState(false);
  const [showCommunication, setShowCommunication] = useState(false);
  const [pngMessage, setPngMessage] = useState("");
  const [pngSaved, setPngSaved] = useState(false);
  const myColor = lan.devicePlayerId === game.whitePlayerId ? "WHITE" : lan.devicePlayerId === game.blackPlayerId ? "BLACK" : null;
  const isMyTurn = game.status === "ACTIVE" && lan.sessionReady && myColor === game.nextColor && pendingRevision === null;
  const terminal = game.status === "FINISHED" || game.status === "ABORTED";
  const winnerName = game.winnerPlayerId === game.whitePlayerId ? game.whiteName : game.winnerPlayerId === game.blackPlayerId ? game.blackName : null;
  const rematch = game.rematch ?? null;
  const roomRemaining = game.resultRoomExpiresAtUtcMs ? Math.max(0, Math.ceil((game.resultRoomExpiresAtUtcMs - Date.now()) / 1000)) : 0;
  const isLoser = terminal && game.winnerPlayerId != null && game.winnerPlayerId !== lan.devicePlayerId;
  const isWinner = terminal && game.winnerPlayerId === lan.devicePlayerId;
  const canRematch = terminal && lan.sessionReady && game.status === "FINISHED" && Boolean(game.winnerPlayerId) && game.opponentConnected !== false && roomRemaining > 0;
  const rematchRequestCooldown = rematch?.requestAllowedAtUtcMs ? Math.max(0, rematch.requestAllowedAtUtcMs - Date.now()) : 0;
  const canRequestRematch = !rematch || (rematch.status !== "PENDING" && rematch.status !== "ACCEPTED" && rematchRequestCooldown === 0);

  useEffect(() => { setCandidate(null); setPendingRevision(null); }, [game.revision]);
  useEffect(() => { try { setChatDraft(localStorage.getItem(`lan-chat-draft:${game.gameId}`) ?? ""); } catch { setChatDraft(""); } setSendingChat(null); setChatMessage(""); setPngSaved(false); setPngMessage(""); }, [game.gameId]);
  useEffect(() => {
    if (sendingChat && (game.chatMessages ?? []).some((message) => message.messageId === sendingChat.id)) {
      setSendingChat(null); setChatMessage("전송 완료");
      if (chatDraft.trim() === sendingChat.body) {
        setChatDraft("");
        try { localStorage.removeItem(`lan-chat-draft:${game.gameId}`); } catch { /* storage may be unavailable */ }
      }
    }
  }, [game.chatMessages, sendingChat, game.gameId, chatDraft]);
  useEffect(() => {
    const receive = (event: Event) => { const detail = (event as CustomEvent<{ message?: string; saved?: boolean }>).detail; setPngMessage(detail?.message ?? "PNG 저장 상태를 확인하세요."); setPngSaved(detail?.saved === true); };
    window.addEventListener("omok-native-png", receive);
    return () => window.removeEventListener("omok-native-png", receive);
  }, []);
  useEffect(() => {
    if (game.status !== "ACTIVE" || game.turnDeadlineUtcMs == null) return;
    const tick = () => setRemaining(Math.max(0, Math.ceil((game.turnDeadlineUtcMs! - Date.now()) / 1000)));
    tick(); const timer = window.setInterval(tick, 250); return () => window.clearInterval(timer);
  }, [game.status, game.turnDeadlineUtcMs]);
  useEffect(() => {
    if (pendingRevision === null || game.revision !== pendingRevision) return;
    const timer = window.setTimeout(() => {
      setPendingRevision(null);
      window.AndroidOmok?.refresh();
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [pendingRevision, game.revision]);

  const place = () => {
    if (!candidate || !isMyTurn) return;
    setPendingRevision(game.revision);
    window.AndroidOmok?.submitMove(game.gameId, game.revision, candidate.x, candidate.y);
  };
  const resign = () => {
    setConfirmResign(false); setPendingRevision(game.revision);
    window.AndroidOmok?.resign(game.gameId, game.revision);
  };
  const reason = game.endReason === "WIN" ? "5목 이상 연결" : game.endReason === "TIMEOUT" ? "시간패" : game.endReason === "RESIGNATION" ? "기권" : game.endReason === "DRAW" ? "무승부" : game.endReason === "DISCONNECT" ? "단절패" : game.endReason === "SYSTEM_ABORT" ? "시스템 중단 · 승패 없는 무효" : game.endReason || "대국 종료";
  const sendChat = (retry = false) => {
    const text = retry && sendingChat ? sendingChat.body : chatDraft.trim();
    if (Array.from(text).length < 1 || Array.from(text).length > 200 || !lan.sessionReady || terminal) return;
    const id = retry && sendingChat ? sendingChat.id : newMessageId();
    setSendingChat({ id, body: text, state: "sending" }); setChatMessage("전송 중 · 응답을 확인합니다.");
    try { localStorage.setItem(`lan-chat-draft:${game.gameId}`, text); } catch { /* in-memory draft remains */ }
    window.AndroidOmok?.submitChat(game.gameId, id, text);
    window.setTimeout(() => setSendingChat((current) => current?.id === id ? { ...current, state: "uncertain" } : current), 3000);
  };
  const exportPng = (openAfterSave: boolean) => {
    const safePayload = { board: game.board, whiteName: game.whiteName, blackName: game.blackName,
      resultTitle: winnerName ? `${winnerName} 승리` : game.status === "ABORTED" ? "대국 무효" : "무승부",
      reason, winningMove: game.endReason === "WIN" && game.lastMove ? game.lastMove : null };
    window.AndroidOmok?.saveResultPng(JSON.stringify(safePayload), openAfterSave);
  };

  return <section className="page-screen game-screen solo-game" data-game-id={game.gameId} data-revision={game.revision}>
    <header className="app-header"><h1>LAN 대국</h1><span>{lan.status}</span></header>
    <div className="game-heading">
      <div><strong>{game.whiteName} · 백</strong><span>후공</span></div>
      <div><strong>{game.blackName} · 흑</strong><span>선공</span></div>
    </div>
    <p>권위 호스트: {game.authorityPlayerId === game.whitePlayerId ? game.whiteName : game.authorityPlayerId === game.blackPlayerId ? game.blackName : "확인 중"} 휴대전화</p>
    <p role="status">{terminal ? "대국 종료 · " + reason : !lan.sessionReady ? "재접속 인증과 호스트 스냅샷 확인 중 · 입력이 잠겨 있습니다." : pendingRevision !== null ? "호스트 승인 확인 중 · 실제 보드는 승인 후 갱신됩니다." : !game.opponentConnected ? "상대 연결이 끊겼습니다. 60초 복귀 유예 중이며 게임 시계는 계속 진행합니다." : isMyTurn ? `내 차례 · ${remaining}초` : `${game.nextColor === "BLACK" ? "흑" : "백"} 차례 · ${remaining}초`}</p>
    <div className="solo-board" role="grid" aria-label="15×15 LAN 오목판">
      {game.board.map((row, y) => row.map((stone, x) => {
        const preview = candidate?.x === x && candidate.y === y;
        return <button key={`${x}:${y}`} className="solo-point" type="button" aria-label={`${toScreenCoordinate({ x, y })} ${stone ?? "빈 교차점"}`} disabled={!isMyTurn || stone !== null} onClick={() => setCandidate({ x, y })}>
          {(stone || preview) && <span className={stone && game.lastMove?.x === x && game.lastMove.y === y ? "online-approved" : ""} style={{ display: "block", borderRadius: "50%", width: "85%", height: "85%", opacity: stone ? 1 : .42, background: (stone ?? myColor ?? "WHITE") === "BLACK" ? "radial-gradient(at 30% 25%, #666, #111)" : "radial-gradient(at 30% 25%, white, #ccc)", boxShadow: "1px 2px 3px #684b34" }} />}
        </button>;
      }))}
    </div>
    <p>{candidate ? `후보 ${toScreenCoordinate(candidate)} · 확인 후 서버에 전송` : "빈 교차점을 선택해 후보를 지정하세요."}</p>
    <button className="button button-primary" type="button" disabled={!isMyTurn || !candidate} onClick={place}>돌 놓기</button>
    {!terminal && <button className="button button-quiet" type="button" disabled={!isMyTurn} onClick={() => setConfirmResign(true)}>기권</button>}
    <section className="online-chat" aria-label="대국 채팅">
      <header><h2>대국 채팅</h2><small>{terminal ? "읽기 전용 · 결과방에서 5분 보관" : "두 참가자만 사용 · 최근 100개"}</small></header>
      <div className="online-chat-messages" aria-live="polite">
        {(game.chatMessages ?? []).map((message) => <p key={`${message.sequence}:${message.messageId}`} className={message.senderId === lan.devicePlayerId ? "chat-mine" : "chat-theirs"}><strong>{message.senderId === lan.devicePlayerId ? "나 · " + message.senderName : "상대 · " + message.senderName}</strong> {message.body}</p>)}
        {(game.chatMessages ?? []).length === 0 && <p>아직 메시지가 없습니다.</p>}
      </div>
      <div className="online-chat-input">
        <input aria-label="채팅 입력" value={chatDraft} maxLength={400} disabled={terminal || !lan.sessionReady || Boolean(sendingChat)} onChange={(event) => { setChatDraft(event.target.value); try { localStorage.setItem(`lan-chat-draft:${game.gameId}`, event.target.value); } catch { /* memory draft remains */ } }} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229 && !composing) { event.preventDefault(); sendChat(); } }} placeholder={terminal ? "종료된 대국은 읽기만 가능합니다." : "메시지 1~200글자"} />
        <button className="button button-primary" type="button" disabled={terminal || !lan.sessionReady || Boolean(sendingChat) || !chatDraft.trim() || Array.from(chatDraft.trim()).length > 200 || composing} onClick={() => sendChat()}>전송</button>
      </div>
      <small>{Array.from(chatDraft).length}/200</small>
      <small role="status">{chatMessage}{sendingChat?.state === "uncertain" && <button type="button" onClick={() => sendChat(true)}>같은 메시지 ID로 다시 시도</button>}</small>
    </section>
    <section className="communication-view">
      <button className="button button-quiet" type="button" aria-expanded={showCommunication} onClick={() => setShowCommunication((value) => !value)}>통신 보기 {showCommunication ? "닫기" : "열기"}</button>
      {showCommunication && <>
        <p>실제 앱 송수신 기록 · 최근 {lan.communicationEvents.length}/200건 · JSON UTF-8 payload 크기(전송 줄바꿈 제외)</p>
        <p>권위 호스트: {game.authorityPlayerId === lan.devicePlayerId ? "이 휴대전화" : "상대 휴대전화"}. OSI는 통신 역할 설명이며 별도 7계층 구현을 뜻하지 않습니다.</p>
        <ol>{[...lan.communicationEvents].reverse().slice(0, 200).map((event, index) => <CommunicationRow key={`${event.atUtcMs}:${index}`} event={event} />)}</ol>
        <details><summary>계층 역할 설명</summary><p>7 응용 메시지 · 6 표현/인코딩/암호화 역할 · 5 대화 설정/유지/종료 역할 · 4 TCP/포트 · 3 IP/라우팅 · 2 링크 구간 프레임/MAC · 1 실제 연결 매체. 현재 LAN JSON은 TLS 암호화하지 않습니다. gameId와 Android 권위 호스트는 OSI 세션 프로토콜 또는 5계층과 동일하지 않습니다.</p></details>
      </>}
    </section>
    {terminal && <button className="button button-quiet" type="button" onClick={onHome}>결과 후 나가기 · 대기 화면</button>}
    {confirmResign && <div className="dialog-backdrop"><section className="result-dialog queue-card" role="dialog" aria-modal="true" aria-labelledby="resign-title"><h2 id="resign-title">기권할까요?</h2><p>호스트가 결과를 저장한 뒤 화면에 반영합니다.</p><button className="button button-primary" type="button" onClick={resign}>기권 확정</button><button className="button button-quiet" type="button" onClick={() => setConfirmResign(false)}>취소</button></section></div>}
    {terminal && <div className="dialog-backdrop"><section className="result-dialog queue-card" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <h2 id="result-title">{game.status === "ABORTED" ? "대국 무효" : winnerName ? `${winnerName} 승리` : "무승부"}</h2>
      <p>{reason} · 최종 revision {game.revision}</p>
      <p>결과방 {roomRemaining}초 남음{game.opponentConnected === false ? " · 상대 연결이 없어 재도전할 수 없습니다." : ""}</p>
      {isWinner && <><button className="button button-primary" type="button" onClick={() => exportPng(true)}>{pngMessage.includes("실패") ? "PNG 다시 저장" : "PNG 저장 후 열기"}</button><button className="button button-quiet" type="button" disabled={!pngSaved} onClick={() => window.AndroidOmok?.shareLastPng()}>저장한 PNG 공유</button></>}
      {isLoser && <button className="button button-primary" type="button" disabled={!canRematch || !canRequestRematch} onClick={() => window.AndroidOmok?.requestRematch(game.gameId)}>재도전 요청</button>}
      {rematch?.status === "PENDING" && rematch.responderId === lan.devicePlayerId && <><p>패자가 재도전을 요청했습니다. 요청자 백·승낙자 흑으로 새 판을 엽니다.</p><button className="button button-primary" type="button" disabled={!canRematch || Date.now() >= rematch.deadlineUtcMs} onClick={() => window.AndroidOmok?.respondRematch(game.gameId, rematch.rematchId, true)}>재도전 승낙</button><button className="button button-quiet" type="button" onClick={() => window.AndroidOmok?.respondRematch(game.gameId, rematch.rematchId, false)}>거부</button></>}
      {rematch?.status === "PENDING" && rematch.requesterId === lan.devicePlayerId && <><p>승자의 응답 대기 중 · {Math.max(0, Math.ceil((rematch.deadlineUtcMs - Date.now()) / 1000))}초</p><button className="button button-quiet" type="button" onClick={() => window.AndroidOmok?.cancelRematch(game.gameId, rematch.rematchId)}>재도전 취소</button></>}
      {rematch && rematch.status !== "PENDING" && <p>재도전 상태: {rematch.status}</p>}
      {isLoser && rematchRequestCooldown > 0 && <p>다시 요청할 수 있을 때까지 {Math.ceil(rematchRequestCooldown / 1000)}초 기다려 주세요.</p>}
      {pngMessage && <p role="status">{pngMessage}</p>}
      <button className="button button-quiet result-exit-button" type="button" onClick={onHome}>결과 후 나가기 · 대기 화면</button>
    </section></div>}
  </section>;
}

function CommunicationRow({ event }: { event: NativeLanCommunicationEvent }) {
  const stamp = new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3 }).format(event.atUtcMs);
  return <li><strong>{stamp} · {event.direction} · {event.type}</strong> · JSON UTF-8 {event.payloadBytes}B{event.coordinate ? ` · 좌표 ${event.coordinate}` : ""}{event.expectedRevision != null ? ` · 요청 revision ${event.expectedRevision}` : ""}{event.revision != null ? ` · revision ${event.revision}` : ""}{event.chatLength != null ? ` · 채팅 ${event.chatLength}글자` : ""}{event.applicationRttMs != null ? ` · 응용 왕복시간 ${event.applicationRttMs}ms` : ""}{event.requestId ? ` · req ${event.requestId}` : ""}{event.gameId ? ` · game ${event.gameId}` : ""}{event.messageId ? ` · msg ${event.messageId}` : ""}</li>;
}

function newMessageId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `chat-${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(4))).map((part) => part.toString(16)).join("")}`;
}
