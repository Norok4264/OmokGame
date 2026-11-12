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
import { clearSavedSession, loadSavedSession, LobbyClient } from "./lobby-client.js";
import type { LobbyClient as LobbyClientType, LobbyState, LobbyStatus, SavedSession } from "./lobby-client.js";

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
  const [lobbyState, setLobbyState] = useState<LobbyState | null>(null);
  const [lobbyStatus, setLobbyStatus] = useState<LobbyStatus>("ended");
  const [lobbyError, setLobbyError] = useState("");
  const [selectedTarget, setSelectedTarget] = useState<{ playerId: string; nickname: string } | null>(null);
  const [lobbyBusy, setLobbyBusy] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const [clockNow, setClockNow] = useState(() => Date.now());
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
  const lobbyClientRef = useRef<LobbyClientType | null>(null);

  const myColor: StoneColor = "WHITE";
  const isGameScreen = screen === "online" || screen === "solo";
  const currentPlayerTurn = game?.status === "ACTIVE" && game.nextColor === myColor && busy === "idle";
  const canChooseCandidate = Boolean(currentPlayerTurn && !resultDialog);
  const moveCount = useMemo(
    () => game?.board.reduce((total, row) => total + row.filter((cell) => cell !== null).length, 0) ?? 0,
    [game],
  );
  const candidateLabel = candidate ? toScreenCoordinate(candidate) : null;

  const connectLobby = useCallback(async (name: string, saved: SavedSession | null = null) => {
    setProbeState("checking");
    setProbeMessage("8초 안에 WebSocket 서버 연결과 세션 인증을 확인합니다.");
    setLobbyError("");
    setGame(null);
    setLobbyState(null);
    const old = lobbyClientRef.current;
    old?.stop();
    const client = new LobbyClient();
    lobbyClientRef.current = client;
    client.onStatus = (status, detail) => {
      setLobbyStatus(status);
      if (detail) setLobbyError(detail);
      if (status === "connected") {
        setLobbyError("");
        setProbeState("ready");
        setProbeMessage("WebSocket 세션 인증 완료. 대기열과 신청은 서버 상태입니다.");
      } else if (status === "reconnecting") {
        setProbeMessage("연결이 끊겼습니다. 12초 복귀 유예 안에 세션을 복구합니다.");
      } else if (status === "failed") {
        setProbeState("unavailable");
      }
    };
    client.onSnapshot = (snapshot) => {
      setLobbyState(snapshot);
      setEffectiveName(snapshot.me.nickname);
      if (snapshot.game) setScreen("online");
      else setScreen("queue");
      if (snapshot.game?.status === "PREPARING") setConnection("connected");
    };
    client.onSession = (session, resumed) => {
      setEffectiveName(session.nickname);
      setNickname("");
      setProbeMessage(resumed ? "기존 sessionStorage 토큰으로 세션을 복구했습니다." : "새 서버 세션을 만들었습니다.");
    };
    try {
      setScreen("queue");
      await client.start(name, saved);
    } catch (error) {
      client.stop();
      setProbeState("unavailable");
      setLobbyStatus("failed");
      setLobbyError(error instanceof Error ? error.message : "서버 연결 또는 세션 인증에 실패했습니다.");
      setProbeMessage("연결에 실패했습니다. 재시도하거나 혼자 놀기를 선택하세요.");
    }
  }, []);

  useEffect(() => {
    const saved = loadSavedSession();
    if (saved) void connectLobby("", saved);
    return () => lobbyClientRef.current?.stop();
  }, [connectLobby]);

  useEffect(() => {
    const gameInfo = lobbyState?.game;
    if (!gameInfo?.countdownStartedAtUtc) { setCountdownSeconds(3); return; }
    const update = () => setCountdownSeconds(Math.max(0, 3 - Math.floor((Date.now() - Date.parse(gameInfo.countdownStartedAtUtc!)) / 1000)));
    update();
    const interval = window.setInterval(update, 200);
    return () => window.clearInterval(interval);
  }, [lobbyState?.game?.countdownStartedAtUtc]);

  useEffect(() => {
    if (screen !== "queue" || !lobbyState?.challenges.length) return;
    const interval = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [screen, lobbyState?.challenges.length]);

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

  const openQueue = () => { void connectLobby(nickname); };

  const returnHome = async () => {
    const client = lobbyClientRef.current;
    if (client && lobbyStatus === "connected") {
      try { await client.request("session.end"); } catch { /* local reset still ends this client's credentials */ }
    }
    client?.stop();
    lobbyClientRef.current = null;
    clearSavedSession();
    setLobbyState(null);
    setSelectedTarget(null);
    setEffectiveName("");
    setNickname("");
    setLobbyError("");
    setScreen("home");
  };

  const runLobbyCommand = async (type: string, body: Record<string, unknown> = {}) => {
    if (!lobbyClientRef.current || lobbyBusy) return;
    setLobbyBusy(true);
    setLobbyError("");
    try { await lobbyClientRef.current.request(type, body); setSelectedTarget(null); }
    catch (error) { setLobbyError(error instanceof Error ? error.message : "서버가 요청을 처리하지 못했습니다."); }
    finally { setLobbyBusy(false); }
  };

  const cancelPreparation = async () => {
    const gameId = lobbyState?.game?.gameId;
    if (!gameId) { setScreen("queue"); return; }
    await runLobbyCommand("game.cancel", { gameId });
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

  const startSolo = async () => {
    const client = lobbyClientRef.current;
    if (client) {
      try { await client.request("session.end"); } catch { /* local credentials are still cleared below */ }
      client.stop();
      lobbyClientRef.current = null;
      clearSavedSession();
      setLobbyState(null);
      setEffectiveName("");
    }
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
      void returnHome();
    } else {
      setScreen("queue");
      void lobbyClientRef.current?.request("lobby.snapshot.request");
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
              maxLength={12}
              autoComplete="nickname"
              placeholder="2~12글자 · 비우면 guestN 발급"
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
          <AppHeader onHome={() => void returnHome()} />
          <div className="queue-card">
            <div className="section-kicker">ONLINE LOBBY · SERVER SESSION</div>
            <h1 id="queue-title">대기열</h1>
            <p className="queue-greeting"><strong>{effectiveName || "닉네임 확인 중"}</strong> 님, 접속자 목록에서 함께 둘 상대를 선택하세요.</p>
            <div className={"connection-panel connection-" + probeState} role="status" aria-live="polite">
              <span className="status-symbol" aria-hidden="true">{lobbyStatus === "connected" ? "✓" : lobbyStatus === "reconnecting" || lobbyStatus === "connecting" ? "…" : "!"}</span>
              <div>
                <strong>{lobbyStatus === "connected" ? "실제 WebSocket 세션 연결됨" : lobbyStatus === "reconnecting" ? "세션 복구 중" : lobbyStatus === "connecting" ? "서버 연결·인증 확인 중" : "서버 세션 연결 실패"}</strong>
                <p>{lobbyError || probeMessage || "연결 상태를 확인합니다."}</p>
              </div>
            </div>
            {lobbyState && (
              <div className="lobby-roster" aria-label="실제 서버 접속자 목록">
                <div className="roster-heading"><strong>접속자</strong><span>{lobbyState.players.length}명 · 서버 목록</span></div>
                {lobbyState.players.map((player) => {
                  const isMe = player.playerId === lobbyState.me.playerId;
                  const label = player.state === "WAITING" ? "대기" : player.state === "RESPONDING" ? "응답 중" : player.state === "IN_GAME" ? "대국 중" : "재접속 중";
                  const canChallenge = !isMe && player.state === "WAITING" && lobbyState.me.state === "WAITING" && lobbyStatus === "connected";
                  return <button key={player.playerId} type="button" className={"roster-player " + (selectedTarget?.playerId === player.playerId ? "roster-selected" : "")}
                    onClick={() => canChallenge && setSelectedTarget({ playerId: player.playerId, nickname: player.nickname })} disabled={!canChallenge}>
                    <span className="roster-presence" /><strong>{player.nickname}{isMe ? " (나)" : ""}</strong><span>{label}</span>
                  </button>;
                })}
                {lobbyState.players.length === 1 && <p className="empty-roster">아직 다른 접속자가 없습니다. 상대가 접속하면 여기에 표시됩니다.</p>}
              </div>
            )}
            {selectedTarget && <div className="challenge-confirm" role="group" aria-label="대국 신청 확인">
              <strong>{selectedTarget.nickname} 님에게 대국을 신청할까요?</strong>
              <p>신청자는 백·후공, 승낙자는 흑·선공으로 배정됩니다. 신청은 30초 동안 유효하며 같은 상대 재신청은 10초 뒤 가능합니다.</p>
              <div><button className="button button-primary" disabled={lobbyBusy} onClick={() => void runLobbyCommand("challenge.create", { targetPlayerId: selectedTarget.playerId })}>신청 보내기</button>
                <button className="button button-quiet" disabled={lobbyBusy} onClick={() => setSelectedTarget(null)}>취소</button></div>
            </div>}
            {lobbyState?.challenges.map((challenge) => {
              const outgoing = challenge.applicantPlayerId === lobbyState.me.playerId;
              const otherId = outgoing ? challenge.acceptorPlayerId : challenge.applicantPlayerId;
              const other = lobbyState.players.find((player) => player.playerId === otherId)?.nickname ?? "상대";
              const seconds = Math.max(0, Math.ceil((Date.parse(challenge.responseDeadlineUtc) - clockNow) / 1000));
              return <div className="challenge-confirm" key={challenge.challengeId}>
                {outgoing ? <><strong>{other} 님의 응답을 기다립니다 · {seconds}초</strong><p>신청자 백·후공 배정입니다. 상대가 승낙하기 전까지 신청을 취소할 수 있습니다.</p>
                  <button className="button button-quiet" disabled={lobbyBusy} onClick={() => void runLobbyCommand("challenge.cancel", { challengeId: challenge.challengeId })}>신청 취소</button></>
                  : <><strong>{other} 님이 대국을 신청했습니다</strong><p>신청자는 백·후공, 승낙하는 당신은 흑·선공입니다 · {seconds}초</p>
                    <div><button className="button button-primary" disabled={lobbyBusy} onClick={() => void runLobbyCommand("challenge.respond", { challengeId: challenge.challengeId, accept: true })}>승낙</button>
                      <button className="button button-quiet" disabled={lobbyBusy} onClick={() => void runLobbyCommand("challenge.respond", { challengeId: challenge.challengeId, accept: false })}>거부</button></div></>}
              </div>;
            })}
            {lobbyError && <p className="lobby-error" role="alert">{lobbyError}</p>}
            <div className="queue-actions">
              {lobbyStatus !== "connected" && <button className="button button-primary button-large" type="button" onClick={() => void connectLobby(nickname, loadSavedSession())}>
                WebSocket 재시도
              </button>}
              <button className="button button-secondary button-large" type="button" onClick={startSolo}>혼자 놀기</button>
              <button className="button button-quiet" type="button" onClick={() => void returnHome()}>초기 화면으로 · 세션 초기화</button>
            </div>
          </div>
        </section>
      )}

      {screen === "online" && lobbyState?.game && (
        <section className="page-screen queue-screen preparation-screen" aria-labelledby="preparation-title">
          <AppHeader onHome={() => void cancelPreparation()} eyebrow="실제 WebSocket 대국 신청" />
          <div className="queue-card preparation-card">
            <div className="section-kicker">SERVER CREATED GAME · {lobbyState.game.status}</div>
            <h1 id="preparation-title">대국 준비</h1>
            <p className="queue-greeting"><strong>{effectiveName}</strong> 님 · 상대 <strong>{lobbyState.game.opponentName}</strong></p>
            <div className="preparation-pair">
              <div><span className="player-stone player-stone-white" /><strong>{lobbyState.game.color === "WHITE" ? effectiveName : lobbyState.game.opponentName}</strong><small>백 · 후공</small></div>
              <span>VS</span>
              <div><span className="player-stone player-stone-black" /><strong>{lobbyState.game.color === "BLACK" ? effectiveName : lobbyState.game.opponentName}</strong><small>흑 · 선공</small></div>
            </div>
            <div className="connection-panel connection-ready" role="status" aria-live="polite">
              <span className="status-symbol">{lobbyState.game.status === "ACTIVE" ? "✓" : "…"}</span>
              <div><strong>{lobbyState.game.status === "PREPARING" ? "양쪽 준비를 기다립니다" : "대국 시작 안내 완료"}</strong>
                <p>{lobbyState.game.status === "PREPARING"
                  ? lobbyState.game.countdownStartedAtUtc ? `양쪽 준비 완료 · ${countdownSeconds}초 뒤 시작합니다.` : "대국은 최대 10초 동안 준비합니다. 한 명이라도 준비하지 않으면 승패 없이 취소됩니다."
                  : "준비와 3초 시작 안내가 서버에서 완료됐습니다. 실제 착수 동기화는 다음 구현 단계입니다."}</p></div>
            </div>
            {lobbyState.game.status === "PREPARING" && <button className="button button-primary button-large preparation-ready" type="button"
              disabled={lobbyBusy || (lobbyState.game.color === "WHITE" ? lobbyState.game.ready?.white : lobbyState.game.ready?.black)}
              onClick={() => void runLobbyCommand("game.ready", { gameId: lobbyState.game!.gameId, revision: 0 })}>
              {(lobbyState.game.color === "WHITE" ? lobbyState.game.ready?.white : lobbyState.game.ready?.black) ? "준비 완료 · 상대 대기 중" : "대국 준비 완료"}
            </button>}
            {lobbyError && <p className="lobby-error" role="alert">{lobbyError}</p>}
            {lobbyState.game.status === "PREPARING" && <button className="button button-quiet" type="button" disabled={lobbyBusy} onClick={() => void cancelPreparation()}>시작 전 대국 취소하고 대기열로</button>}
          </div>
        </section>
      )}

      {isGameScreen && selectedGame && !(screen === "online" && lobbyState?.game) && (
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
                  {connection === "failed" && <><strong>예시 연결 실패</strong><p>실제 대기열 서버가 구현되지 않았습니다. 초기 화면에서 서버 세션을 다시 시작하세요.</p></>}
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
