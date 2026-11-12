import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, PointerEvent, RefObject } from "react";
import {
  BOARD_SIZE,
  createRuleGame,
  playMove,
  toScreenCoordinate,
  type Coordinate,
  type RuleBoard,
  type RuleGameState,
  type StoneColor,
} from "@danpan/shared";
import { chooseBotMove } from "./bot.js";

type Screen = "home" | "queue" | "online" | "solo";
type GameMode = "online-demo" | "solo";
type ProbeState = "checking" | "ready" | "unavailable";
type DemoConnection = "connected" | "reconnecting" | "failed";
type ChatMessage = { id: number; sender: "me" | "opponent"; body: string };
type ResultDialog = { winner: StoneColor; reason: string; board: RuleBoard };

const STONE_LABEL: Record<StoneColor, string> = { BLACK: "흑", WHITE: "백" };
const FILES = Array.from({ length: BOARD_SIZE }, (_, x) => String.fromCharCode(65 + x));

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [nickname, setNickname] = useState("");
  const [effectiveName, setEffectiveName] = useState("");
  const [probeState, setProbeState] = useState<ProbeState>("checking");
  const [probeMessage, setProbeMessage] = useState("");
  const [connection, setConnection] = useState<DemoConnection>("connected");
  const [game, setGame] = useState<RuleGameState | null>(null);
  const [candidate, setCandidate] = useState<Coordinate | null>(null);
  const [mode, setMode] = useState<GameMode>("solo");
  const [busy, setBusy] = useState<"idle" | "confirm" | "opponent" | "bot">("idle");
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [resultDialog, setResultDialog] = useState<ResultDialog | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [notice, setNotice] = useState("");
  const [animatedMove, setAnimatedMove] = useState<Coordinate | null>(null);
  const [lastApprovedMove, setLastApprovedMove] = useState<Coordinate | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | null>(null);

  const myColor: StoneColor = "WHITE";
  const isGameScreen = screen === "online" || screen === "solo";
  const currentPlayerTurn = game?.status === "ACTIVE" && game.nextColor === myColor && busy === "idle";
  const canChooseCandidate = Boolean(currentPlayerTurn && !resultDialog);
  const moveCount = useMemo(
    () => game?.board.reduce((total, row) => total + row.filter((cell) => cell !== null).length, 0) ?? 0,
    [game],
  );
  const candidateLabel = candidate ? toScreenCoordinate(candidate) : null;

  const checkServer = useCallback(async () => {
    setProbeState("checking");
    setProbeMessage("대기열 API와 서버 준비 상태를 확인합니다.");
    try {
      const response = await fetch("/api/readyz", { cache: "no-store" });
      if (!response.ok) throw new Error("서버가 HTTP " + response.status + "를 반환했습니다.");
      const body = await response.json() as { status?: string };
      if (body.status !== "ready") throw new Error("서버가 아직 준비되지 않았습니다.");
      setProbeState("ready");
      setProbeMessage("HTTP readiness 확인 성공. 대기열 기능은 아직 서버에 연결되지 않았습니다.");
    } catch (error) {
      setProbeState("unavailable");
      setProbeMessage(error instanceof Error
        ? error.message + " 개발 서버가 켜져 있는지 확인하고 다시 시도하세요."
        : "서버 연결을 확인할 수 없습니다. 개발 서버를 확인하고 다시 시도하세요.");
    }
  }, []);

  useEffect(() => {
    if (screen === "queue") void checkServer();
  }, [screen, checkServer]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (!resultDialog) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const focusFrame = window.requestAnimationFrame(() => {
      dialog.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus({ preventScroll: true });
    });
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (event.key !== "Tab") return;
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", keepFocusInside);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      dialog.removeEventListener("keydown", keepFocusInside);
      if (dialog.open) dialog.close();
    };
  }, [resultDialog]);

  useEffect(() => {
    if (screen !== "online" || game?.status !== "ACTIVE" || busy !== "idle" || resultDialog) return;
    const timer = window.setInterval(() => {
      setSecondsLeft((remaining) => {
        if (remaining <= 1) {
          window.clearInterval(timer);
          setResultDialog({
            winner: "BLACK",
            reason: "개발용 제한시간 예시입니다. 실제 서버의 시간 판정은 연결되지 않았습니다.",
            board: game.board,
          });
          return 0;
        }
        return remaining - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screen, game, busy, resultDialog]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const animateAcceptedMove = useCallback((move: Coordinate) => {
    setAnimatedMove(move);
    window.setTimeout(() => setAnimatedMove((current) =>
      current?.x === move.x && current?.y === move.y ? null : current,
    ), 190);
  }, []);

  const showFinishedGame = useCallback((state: RuleGameState, fallbackWinner?: StoneColor, reason?: string) => {
    if (state.result?.kind === "WIN") {
      setResultDialog({
        winner: state.result.winner,
        reason: reason ?? STONE_LABEL[state.result.winner] + " 승리 — 같은 색 돌이 5개 이상 이어졌습니다.",
        board: state.board,
      });
    } else if (state.result?.kind === "DRAW") {
      setResultDialog({ winner: fallbackWinner ?? "WHITE", reason: reason ?? "보드가 가득 차 무승부입니다.", board: state.board });
    }
  }, []);

  const openQueue = () => {
    setEffectiveName(nickname.trim() || "guest1");
    setProbeState("checking");
    setProbeMessage("");
    setScreen("queue");
  };

  const openOnlinePreview = () => {
    const opening = playMove(createRuleGame(), { x: 7, y: 7 }, "BLACK");
    setGame(opening.ok ? opening.state : createRuleGame());
    setMode("online-demo");
    setScreen("online");
    setCandidate(null);
    setBusy("idle");
    setSecondsLeft(60);
    setConnection("connected");
    setResultDialog(null);
    setSaveState("idle");
    setNotice("예시 대국입니다. 돌은 로컬 규칙 엔진과 가상 승인 흐름으로만 바뀝니다.");
    setChatMessages([{ id: Date.now(), sender: "opponent", body: "안녕하세요. (개발용 예시 메시지)" }]);
  };

  const runBotMove = useCallback((state: RuleGameState, botColor: StoneColor, botMode: GameMode) => {
    setBusy(botMode === "solo" ? "bot" : "opponent");
    timerRef.current = window.setTimeout(() => {
      const move = chooseBotMove(state, botColor);
      if (!move) {
        setBusy("idle");
        return;
      }
      const result = playMove(state, move, botColor);
      if (!result.ok) {
        setBusy("idle");
        setNotice("예시 상대의 착수를 계산하지 못했습니다. 새 대국을 시작해 주세요.");
        return;
      }
      setGame(result.state);
      setBusy("idle");
      setCandidate(null);
      setSecondsLeft(60);
      animateAcceptedMove(move);
      setLastApprovedMove(move);
      if (result.state.status === "FINISHED") {
        showFinishedGame(
          result.state,
          botColor,
          botMode === "online-demo" ? "가상 상대의 예시 착수로 끝난 개발용 대국입니다." : undefined,
        );
      }
    }, botMode === "solo" ? 620 : 520);
  }, [animateAcceptedMove, showFinishedGame]);

  const startSolo = () => {
    const fresh = createRuleGame();
    setMode("solo");
    setGame(fresh);
    setScreen("solo");
    setCandidate(null);
    setResultDialog(null);
    setSaveState("idle");
    setNotice("혼자 놀기는 이 기기에서만 진행됩니다. 시간제한과 채팅은 없습니다.");
    runBotMove(fresh, "BLACK", "solo");
  };

  const choosePoint = (point: Coordinate) => {
    if (!canChooseCandidate) return;
    if (game?.board[point.y]?.[point.x] !== null) {
      setNotice(toScreenCoordinate(point) + "에는 이미 돌이 있습니다. 다른 교차점을 선택하세요.");
      return;
    }
    setCandidate(point);
    setNotice("");
  };

  const confirmCandidate = useCallback(() => {
    if (!game || !candidate || !canChooseCandidate) return;
    const proposed = candidate;
    if (mode === "online-demo") {
      setBusy("confirm");
      setNotice("가상 서버 승인 확인 중입니다. 잠시 기다리면 성공한 착수만 보드에 적용됩니다.");
      timerRef.current = window.setTimeout(() => {
        const result = playMove(game, proposed, myColor);
        if (!result.ok) {
          setBusy("idle");
          setNotice("착수를 확정할 수 없습니다: " + result.error);
          return;
        }
        setGame(result.state);
        setCandidate(null);
        setBusy("idle");
        setSecondsLeft(60);
        animateAcceptedMove(proposed);
        setLastApprovedMove(proposed);
        setNotice("가상 승인 완료. 이 화면은 실제 온라인 대국 기록이 아닙니다.");
        if (result.state.status === "FINISHED") {
          showFinishedGame(result.state, undefined, "개발용 예시 대국의 결과입니다. 실제 서버 결과가 아닙니다.");
        } else {
          runBotMove(result.state, "BLACK", "online-demo");
        }
      }, 260);
      return;
    }

    const result = playMove(game, proposed, myColor);
    if (!result.ok) {
      setNotice("착수를 확정할 수 없습니다: " + result.error);
      return;
    }
    setGame(result.state);
    setCandidate(null);
    setNotice("");
    animateAcceptedMove(proposed);
    setLastApprovedMove(proposed);
    if (result.state.status === "FINISHED") showFinishedGame(result.state);
    else runBotMove(result.state, "BLACK", "solo");
  }, [game, candidate, canChooseCandidate, mode, myColor, animateAcceptedMove, showFinishedGame, runBotMove]);

  const clearCandidate = useCallback(() => {
    setCandidate(null);
    setNotice("");
  }, []);

  useEffect(() => {
    if (!isGameScreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target) || resultDialog) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest("[data-game-controls='true']")) return;
      if (event.key === "Escape") {
        event.preventDefault();
        clearCandidate();
        return;
      }
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter"].includes(event.key)) return;
      if (event.key === "Enter") {
        if (target.closest("[data-board='true']")) {
          event.preventDefault();
          confirmCandidate();
        }
        return;
      }
      event.preventDefault();
      setCandidate((current) => {
        const point = current ?? { x: 7, y: 7 };
        if (event.key === "ArrowUp") return { x: point.x, y: Math.max(0, point.y - 1) };
        if (event.key === "ArrowDown") return { x: point.x, y: Math.min(14, point.y + 1) };
        if (event.key === "ArrowLeft") return { x: Math.max(0, point.x - 1), y: point.y };
        return { x: Math.min(14, point.x + 1), y: point.y };
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isGameScreen, resultDialog, clearCandidate, confirmCandidate]);

  const onBoardPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!canChooseCandidate || !boardRef.current) return;
    const bounds = boardRef.current.getBoundingClientRect();
    const x = Math.round(((event.clientX - bounds.left) / bounds.width) * (BOARD_SIZE - 1));
    const y = Math.round(((event.clientY - bounds.top) / bounds.height) * (BOARD_SIZE - 1));
    choosePoint({ x: Math.max(0, Math.min(14, x)), y: Math.max(0, Math.min(14, y)) });
  };

  const sendChat = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const body = chatDraft.trim();
    if (!body) return;
    setChatMessages((messages) => [...messages, { id: Date.now(), sender: "me", body }]);
    setChatDraft("");
  };

  const retryGame = () => {
    if (mode === "solo") startSolo();
    else openOnlinePreview();
  };

  const leaveResult = () => {
    setResultDialog(null);
    setCandidate(null);
    setSaveState("idle");
    if (mode === "solo") {
      setScreen("home");
      setNickname("");
      setEffectiveName("");
    } else {
      setScreen("queue");
      setProbeState("ready");
      setProbeMessage("대기열은 실제 서버 기능에 연결되지 않았습니다. 아래 선택은 화면 확인용입니다.");
    }
  };

  const previewResult = () => {
    if (!game) return;
    setResultDialog({
      winner: "WHITE",
      reason: "개발용 승리 팝업 미리보기입니다. 실제 게임 결과가 아닙니다.",
      board: game.board,
    });
  };

  const saveBoardPng = async () => {
    if (!resultDialog) return;
    setSaveState("saving");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 900;
      canvas.height = 900;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("브라우저가 Canvas 저장을 지원하지 않습니다.");
      context.fillStyle = "#d6a76b";
      context.fillRect(0, 0, 900, 900);
      const padding = 46;
      const step = (900 - padding * 2) / (BOARD_SIZE - 1);
      context.strokeStyle = "#704620";
      context.lineWidth = 2;
      for (let index = 0; index < BOARD_SIZE; index += 1) {
        const offset = padding + index * step;
        context.beginPath();
        context.moveTo(offset, padding);
        context.lineTo(offset, 900 - padding);
        context.stroke();
        context.beginPath();
        context.moveTo(padding, offset);
        context.lineTo(900 - padding, offset);
        context.stroke();
      }
      for (let y = 0; y < BOARD_SIZE; y += 1) {
        for (let x = 0; x < BOARD_SIZE; x += 1) {
          const color = resultDialog.board[y]?.[x];
          if (!color) continue;
          const centerX = padding + x * step;
          const centerY = padding + y * step;
          const gradient = context.createRadialGradient(centerX - 6, centerY - 7, 2, centerX, centerY, step * 0.38);
          if (color === "BLACK") {
            gradient.addColorStop(0, "#5e5852");
            gradient.addColorStop(1, "#171513");
          } else {
            gradient.addColorStop(0, "#fffdfa");
            gradient.addColorStop(1, "#d8d0c6");
          }
          context.fillStyle = gradient;
          context.beginPath();
          context.arc(centerX, centerY, step * 0.37, 0, Math.PI * 2);
          context.fill();
        }
      }
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG 데이터를 만들지 못했습니다.")), "image/png"),
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "danpan-omok-final.png";
      anchor.click();
      URL.revokeObjectURL(url);
      setSaveState("saved");
    } catch (error) {
      setSaveState("failed");
      setNotice(error instanceof Error ? error.message : "이미지를 저장하지 못했습니다.");
    }
  };

  const simulateReconnect = () => {
    setConnection("reconnecting");
    setNotice("복구 사유 예시: 연결 heartbeat가 끊겼습니다. 브라우저 네트워크를 확인한 뒤 다시 연결하세요.");
    timerRef.current = window.setTimeout(() => {
      setConnection("connected");
      setNotice("개발용 재연결 예시 완료. 실제 네트워크 세션이 복구된 것은 아닙니다.");
    }, 1300);
  };

  const selectedGame = game;

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />

      {screen === "home" && (
        <section className="home-screen" aria-labelledby="app-title">
          <header className="home-brand">
            <img src="/omok-hero.svg" alt="" className="hero-asset" />
            <p className="eyebrow">천천히, 한 수씩</p>
            <h1 id="app-title">단판 오목</h1>
            <p className="home-copy">마주 앉아 두는 한 판처럼,<br />가볍게 시작해 보세요.</p>
          </header>
          <div className="home-actions">
            <label htmlFor="nickname">닉네임</label>
            <input
              id="nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={16}
              autoComplete="nickname"
              placeholder="비워 두면 guest1로 표시"
            />
            <button className="button button-primary button-large" type="button" onClick={openQueue}>
              대기열 입장 <span aria-hidden="true">→</span>
            </button>
            <div className="action-divider"><span>또는</span></div>
            <button className="button button-secondary button-large" type="button" onClick={startSolo}>
              혼자 놀기
            </button>
            <p className="demo-disclaimer"><span className="demo-dot" /> 온라인 기능 개발 중 · 화면 예시 포함</p>
          </div>
          <footer className="home-footer">15×15 교차점 · 자유룰 오목</footer>
        </section>
      )}

      {screen === "queue" && (
        <section className="page-screen queue-screen" aria-labelledby="queue-title">
          <AppHeader onHome={() => setScreen("home")} />
          <div className="queue-card">
            <div className="section-kicker">ONLINE LOBBY · DEVELOPMENT PREVIEW</div>
            <h1 id="queue-title">대기열</h1>
            <p className="queue-greeting"><strong>{effectiveName || "guest1"}</strong> 님, 함께 둘 상대를 기다립니다.</p>
            <div className={"connection-panel connection-" + probeState} role="status" aria-live="polite">
              <span className="status-symbol" aria-hidden="true">{probeState === "ready" ? "✓" : probeState === "checking" ? "…" : "!"}</span>
              <div>
                <strong>{probeState === "ready" ? "서버 readiness 확인 완료" : probeState === "checking" ? "서버 상태 확인 중" : "서버에 연결할 수 없습니다"}</strong>
                <p>{probeMessage || "확인 결과에 따라 다시 시도할 방법을 안내합니다."}</p>
              </div>
            </div>
            <div className="empty-queue">
              <div className="empty-stones" aria-hidden="true"><i /><i /></div>
              <strong>대기 중인 상대가 없습니다</strong>
              <p>현재 서버에는 온라인 대기열 기능이 없습니다.<br />아래 숫자와 상대는 실제 접속자가 아닌 화면용 예시입니다.</p>
              <div className="queue-count"><span className="status-dot" /> 예시 대기 인원 <b>0명</b></div>
            </div>
            <div className="queue-actions">
              <button className="button button-primary button-large" type="button" onClick={() => void checkServer()}>
                서버 상태 다시 확인
              </button>
              <button className="button button-secondary button-large" type="button" onClick={openOnlinePreview}>
                개발용 대국 화면 보기
              </button>
              <button className="button button-quiet" type="button" onClick={() => setScreen("home")}>초기 화면으로</button>
            </div>
          </div>
          <div className="demo-banner"><span>DEVELOPMENT PREVIEW</span> 대기열 화면의 상태·인원은 임시 데이터입니다. 매칭 서버에 연결하지 않습니다.</div>
        </section>
      )}

      {isGameScreen && selectedGame && (
        <section className="page-screen game-screen" data-game-controls="true" aria-labelledby="game-title">
          <AppHeader
            onHome={() => screen === "online" ? setScreen("queue") : setScreen("home")}
            eyebrow={screen === "online" ? "온라인 대국 · 개발용 시뮬레이션" : "혼자 놀기 · 이 기기에서 진행"}
          />
          <div className="game-heading">
            <div>
              <p className="section-kicker">{screen === "online" ? "ONLINE MATCH · SAMPLE DATA" : "SOLO GAME"}</p>
              <h1 id="game-title">{screen === "online" ? "한 판의 대국" : "혼자 놀기"}</h1>
            </div>
            {screen === "online" ? (
              <div className={"connection-chip connection-chip-" + connection}>
                <span className="status-dot" />
                {connection === "connected" ? "가상 연결" : connection === "reconnecting" ? "연결 복구 중" : "연결 끊김"}
              </div>
            ) : (
              <div className="connection-chip connection-chip-local"><span className="status-dot" /> 로컬 대국</div>
            )}
          </div>

          {screen === "online" && (
            <div className="demo-banner game-demo-banner"><span>DEVELOPMENT PREVIEW</span> 실제 온라인 접속이 아닙니다. 착수 승인·상대 응답·채팅은 로컬 시뮬레이션입니다.</div>
          )}
          {screen === "solo" && <div className="solo-banner"><span className="offline-icon">⌁</span> 네트워크·시간제한·채팅 없이 이 기기에서 계산합니다.</div>}

          <div className="game-layout">
            <section className="board-card" aria-label="대국 보드와 착수">
              <div className="players-row">
                <PlayerCard
                  name={screen === "solo" ? "오목 봇" : "상대 예시"}
                  color="BLACK"
                  active={selectedGame.status === "ACTIVE" && selectedGame.nextColor === "BLACK"}
                  badge={screen === "solo" ? "기기 내부" : "임시 데이터"}
                />
                <span className="versus">VS</span>
                <PlayerCard
                  name={effectiveName || nickname.trim() || "나"}
                  color="WHITE"
                  active={selectedGame.status === "ACTIVE" && selectedGame.nextColor === "WHITE"}
                  badge={screen === "solo" ? "나" : "신청자 예시"}
                />
              </div>
              <div className="game-meta">
                <div className="turn-indicator" aria-live="polite">
                  <span className={"turn-stone " + (selectedGame.nextColor === "BLACK" ? "black" : "white")} />
                  <span>{selectedGame.status === "FINISHED" ? "대국 종료" : busy === "confirm" ? "착수 확인 중" : busy === "bot" ? "봇 생각 중" : busy === "opponent" ? "예시 상대 응답 중" : "현재 차례 · " + (selectedGame.nextColor ? STONE_LABEL[selectedGame.nextColor] : "—")}</span>
                </div>
                {screen === "online" ? (
                  <div className="time-remaining"><span>남은 시간</span><strong>{Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</strong></div>
                ) : (
                  <div className="time-remaining time-unlimited"><span>시간제한 없음</span><strong>∞</strong></div>
                )}
              </div>
              {notice && <div className="inline-notice" role="status" aria-live="polite">{notice}</div>}
              <div className="board-frame">
                <div className="axis-top" aria-hidden="true">{FILES.map((file) => <span key={file}>{file}</span>)}</div>
                <div className="board-with-axis">
                  <div className="axis-left" aria-hidden="true">{Array.from({ length: BOARD_SIZE }, (_, index) => <span key={index}>{index + 1}</span>)}</div>
                  <div
                    ref={boardRef}
                    className={"board-surface " + (canChooseCandidate ? "board-interactive" : "")}
                    data-board="true"
                    role="grid"
                    aria-label="15 곱하기 15 오목판. 방향키로 후보를 이동하고 Enter로 돌 놓기를 확정합니다."
                    aria-describedby="board-help"
                    tabIndex={0}
                    onPointerDown={onBoardPointerDown}
                  >
                    <div className="board-grid-lines" aria-hidden="true">
                      {Array.from({ length: BOARD_SIZE }, (_, index) => (
                        <span key={"v-" + index} className="board-grid-vertical" style={{ left: (index / 14) * 100 + "%" }} />
                      ))}
                      {Array.from({ length: BOARD_SIZE }, (_, index) => (
                        <span key={"h-" + index} className="board-grid-horizontal" style={{ top: (index / 14) * 100 + "%" }} />
                      ))}
                    </div>
                    {selectedGame.board.map((row, y) => row.map((stone, x) => {
                      const isCandidate = candidate?.x === x && candidate.y === y;
                      const isLast = lastApprovedMove?.x === x && lastApprovedMove.y === y;
                      const isAnimated = animatedMove?.x === x && animatedMove.y === y;
                      const classes = [
                        "board-point",
                        stone ? "board-stone board-stone-" + stone.toLowerCase() : "",
                        isCandidate ? "board-candidate" : "",
                        isLast && !isCandidate ? "board-last-move" : "",
                        isAnimated ? "stone-approved" : "",
                      ].filter(Boolean).join(" ");
                      return (
                        <span
                          key={x + "-" + y}
                          className={classes}
                          style={{ left: (x / 14) * 100 + "%", top: (y / 14) * 100 + "%" }}
                          aria-hidden="true"
                        >
                          {isCandidate && stone === null && <i />}
                        </span>
                      );
                    }))}
                  </div>
                </div>
              </div>
              <p id="board-help" className="board-help">교차점을 눌러 후보를 고른 뒤 ‘돌 놓기’로 확정하세요. 후보는 반투명 표시입니다.</p>
              <div className="move-controls">
                <div className="candidate-coordinate"><span>선택한 좌표</span><strong>{candidateLabel ?? "—"}</strong></div>
                <button className="button button-quiet button-clear" type="button" onClick={clearCandidate} disabled={!candidate}>
                  후보 해제 <kbd>Esc</kbd>
                </button>
                <button className="button button-primary button-confirm" type="button" onClick={confirmCandidate} disabled={!candidate || !canChooseCandidate}>
                  {busy === "confirm" ? "확인 중…" : "돌 놓기"} <kbd>Enter</kbd>
                </button>
              </div>
              {screen === "online" ? (
                <div className="game-secondary-actions">
                  <button className="button button-danger-quiet" type="button" onClick={() => setResultDialog({
                    winner: "BLACK",
                    reason: "기권 처리 예시입니다. 실제 서버에 기권 요청을 보내지 않았습니다.",
                    board: selectedGame.board,
                  })}>기권</button>
                  <div className="online-dev-actions">
                    <button className="text-button" type="button" onClick={simulateReconnect}>복구 상태 예시</button>
                    <button className="text-button" type="button" onClick={previewResult}>결과 팝업 예시</button>
                  </div>
                </div>
              ) : (
                <div className="game-secondary-actions solo-controls">
                  <span>{busy === "bot" ? "봇 생각 중 · 잠시 기다리면 다음 수를 둡니다." : "봇은 가까운 돌과 즉시 승리·방어 수를 살핍니다."}</span>
                  <button className="button button-quiet" type="button" onClick={() => setScreen("home")}>혼자 놀기 나가기</button>
                </div>
              )}
            </section>

            <aside className="game-side">
              <div className="side-summary">
                <span className="summary-icon" aria-hidden="true">◉</span>
                <div><strong>{screen === "online" ? "대국 예시" : "한 수씩 두어 보세요"}</strong><p>{moveCount}수 진행 · {screen === "online" ? "가상 상대" : "사용자 백 / 봇 흑"}</p></div>
              </div>
              {screen === "online" && (
                <div className={"recovery-card recovery-" + connection}>
                  {connection === "connected" && <><strong>가상 상대와 연결된 예시</strong><p>실제 소켓 연결은 없습니다.</p></>}
                  {connection === "reconnecting" && <><strong>연결 복구 중</strong><p>화면 시뮬레이션입니다. 실제 서비스는 연결 상태를 확인한 뒤 대기열에서 재입장해야 합니다.</p></>}
                  {connection === "failed" && <><strong>예시 연결 실패</strong><p>실제 대기열 서버가 구현되지 않았습니다. 서버 readiness를 확인한 뒤 개발용 화면으로 다시 들어가세요.</p><button className="text-button" type="button" onClick={() => void checkServer()}>서버 상태 확인</button></>}
                </div>
              )}
              {screen === "solo" && (
                <div className="bot-status" role="status" aria-live="polite">
                  <span className={busy === "bot" ? "thinking-orbit" : "bot-face"} aria-hidden="true">●</span>
                  <div><strong>{busy === "bot" ? "봇 생각 중" : "봇 준비 완료"}</strong><p>{busy === "bot" ? "가까운 교차점과 방어 수를 계산하고 있습니다." : "착수하면 기기 안에서 다음 수를 계산합니다."}</p></div>
                </div>
              )}
              {screen === "online" ? (
                <ChatPanel messages={chatMessages} draft={chatDraft} onDraftChange={setChatDraft} onSend={sendChat} endRef={chatEndRef} />
              ) : (
                <div className="solo-note">
                  <span className="note-stone" aria-hidden="true" />
                  <strong>혼자 놀기 안내</strong>
                  <p>당신은 백, 봇은 흑입니다. 봇의 계산과 대국 상태는 현재 기기 안에만 있습니다.</p>
                  <p className="no-network">네트워크 연결·채팅·시간 제한을 사용하지 않습니다.</p>
                </div>
              )}
            </aside>
          </div>
          <footer className="game-footer">
            <button className="text-button" type="button" onClick={() => screen === "online" ? setScreen("queue") : setScreen("home")}>
              {screen === "online" ? "대기열로 나가기" : "초기 화면으로"}
            </button>
            <span>{screen === "online" ? "상태·상대·메시지는 개발용 임시 데이터" : "혼자 놀기 · 네트워크 없이 진행"}</span>
          </footer>
        </section>
      )}

      <dialog ref={dialogRef} className="result-dialog" aria-labelledby="result-title">
        {resultDialog && (
          <div className="result-content">
            <div className="result-badge" aria-hidden="true">{resultDialog.winner === myColor ? "♛" : "✓"}</div>
            <p className="section-kicker">{mode === "online-demo" ? "MATCH RESULT · PREVIEW" : "SOLO RESULT"}</p>
            <h2 id="result-title">{resultDialog.winner === myColor ? "승리했어요!" : "대국이 끝났어요"}</h2>
            <p className="result-description">{resultDialog.reason}</p>
            <p className="result-color">승자 · {STONE_LABEL[resultDialog.winner]} {resultDialog.winner === myColor ? "(" + (effectiveName || "나") + ")" : mode === "solo" ? "(오목 봇)" : "(상대 예시)"}</p>
            <div className="result-actions">
              {resultDialog.winner === myColor ? (
                <button className="button button-primary button-large" type="button" onClick={() => void saveBoardPng()} disabled={saveState === "saving"}>
                  {saveState === "saving" ? "PNG 만드는 중…" : saveState === "saved" ? "PNG 다시 저장" : saveState === "failed" ? "다시 저장" : "최종 보드 PNG 저장"}
                </button>
              ) : (
                <button className="button button-primary button-large" type="button" onClick={retryGame}>
                  {mode === "online-demo" ? "재도전 요청 예시" : "다시 혼자 놀기"}
                </button>
              )}
              {saveState === "saved" && <p className="save-status" role="status">PNG 파일을 다운로드했습니다.</p>}
              {saveState === "failed" && <div className="save-error" role="alert"><strong>보드를 저장하지 못했습니다.</strong><span>{notice || "브라우저 다운로드 설정을 확인한 뒤 다시 저장하세요."}</span></div>}
              <div className="result-footer">
                <span>{mode === "online-demo" ? "개발용 결과 예시 · 실제 서버 판정 아님" : "기기 내부에서 계산한 결과"}</span>
                <button className="button button-quiet" type="button" onClick={leaveResult}>나가기</button>
              </div>
            </div>
          </div>
        )}
      </dialog>
    </main>
  );
}

function AppHeader({ onHome, eyebrow }: { onHome: () => void; eyebrow?: string }) {
  return (
    <header className="app-header">
      <button className="brand-button" type="button" onClick={onHome} aria-label="앞 화면으로">
        <span className="mini-board" aria-hidden="true"><i /><b /></span>
        <span><strong>단판 오목</strong><small>{eyebrow ?? "한 판으로 만나는 오목"}</small></span>
      </button>
      <span className="header-preview">개발용 화면</span>
    </header>
  );
}

function PlayerCard({ name, color, active, badge }: { name: string; color: StoneColor; active: boolean; badge: string }) {
  return (
    <div className={"player-card " + (active ? "player-active" : "")}>
      <span className={"player-stone player-stone-" + color.toLowerCase()} aria-hidden="true" />
      <span className="player-name"><strong>{name}</strong><small>{badge}</small></span>
      <span className="player-color">{STONE_LABEL[color]}</span>
    </div>
  );
}

function ChatPanel({
  messages,
  draft,
  onDraftChange,
  onSend,
  endRef,
}: {
  messages: ChatMessage[];
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (event: FormEvent<HTMLFormElement>) => void;
  endRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section className="chat-panel" aria-label="개발용 대국 채팅">
      <header className="chat-header">
        <div><strong>대국 채팅</strong><span>예시 메시지 · 저장하지 않음</span></div>
        <span className="chat-count">{messages.length}</span>
      </header>
      <div className="chat-messages" aria-live="polite" aria-relevant="additions text">
        {messages.map((message) => (
          <div key={message.id} className={"chat-message chat-" + message.sender}>
            {message.sender === "opponent" && <span className="chat-speaker">상대 예시</span>}
            <p>{message.body}</p>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form className="chat-composer" onSubmit={onSend}>
        <label className="visually-hidden" htmlFor="chat-message">메시지 입력</label>
        <input
          id="chat-message"
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          maxLength={200}
          placeholder="메시지를 입력하세요"
          autoComplete="off"
        />
        <button className="chat-send" type="submit" disabled={!draft.trim()} aria-label="메시지 보내기">↑</button>
      </form>
      <p className="chat-demo-note">메시지는 이 화면에서만 보이는 임시 데이터입니다.</p>
    </section>
  );
}
