export interface NativeLanPeer {
  id: string;
  name: string;
  authority: boolean;
}

export interface NativeLanChallenge {
  challengeId: string;
  applicantId: string;
  acceptorId: string;
  applicantName: string;
  acceptorName: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
  revision: number;
  deadlineUtcMs: number;
  requestAllowedAtUtcMs?: number | null;
  invitationToken?: string | null;
}

export interface NativeLanGame {
  gameId: string;
  challengeId: string;
  whitePlayerId: string;
  blackPlayerId: string;
  whiteName: string;
  blackName: string;
  authorityPlayerId: string;
  revision: number;
  status: "ACTIVE" | "FINISHED" | "ABORTED";
  board: ("BLACK" | "WHITE" | null)[][];
  nextColor: "BLACK" | "WHITE" | null;
  result: { kind: "WIN"; winner: "BLACK" | "WHITE" } | { kind: "DRAW" } | null;
  endReason: string | null;
  winnerPlayerId: string | null;
  turnDeadlineUtcMs: number | null;
  lastMove: { x: number; y: number } | null;
  opponentConnected?: boolean;
  reconnectDeadlineUtcMs?: number | null;
  inputBlockedReason?: string;
  endedAtUtcMs?: number | null;
  resultRoomExpiresAtUtcMs?: number | null;
  chatSequence?: number;
  chatMessages?: NativeLanChatMessage[];
  rematch?: NativeLanRematch | null;
}

export interface NativeLanChatMessage {
  sequence: number;
  messageId: string;
  senderId: string;
  senderName: string;
  body: string;
  sentAtUtcMs: number;
}

export interface NativeLanRematch {
  rematchId: string;
  requesterId: string;
  responderId: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED" | "EXPIRED" | "CANCELLED";
  requestedAtUtcMs: number;
  deadlineUtcMs: number;
  requestAllowedAtUtcMs?: number | null;
  newGameId?: string | null;
}

export interface NativeLanCommunicationEvent {
  type: string;
  direction: string;
  atUtcMs: number;
  payloadBytes: number;
  coordinate?: string;
  revision?: number;
  expectedRevision?: number;
  requestId?: string;
  gameId?: string;
  challengeId?: string;
  rematchId?: string;
  messageId?: string;
  chatLength?: number;
  applicationRttMs?: number;
}

export interface NativeLanSnapshot {
  status: string;
  devicePlayerId: string;
  deviceNickname: string;
  isAuthority: boolean;
  sessionReady: boolean;
  peers: NativeLanPeer[];
  challenge: NativeLanChallenge | null;
  game: NativeLanGame | null;
  communicationEvents: NativeLanCommunicationEvent[];
}

export interface AndroidOmokBridge {
  startHosting(nickname: string): void;
  startDiscovery(): void;
  createChallenge(peerId: string, nickname: string): void;
  offerChallenge(peerId: string): void;
  respondChallenge(challengeId: string, accept: boolean, revision: number): void;
  cancelChallenge(): void;
  submitMove(gameId: string, revision: number, x: number, y: number): void;
  resign(gameId: string, revision: number): void;
  dismissResult(gameId: string): void;
  submitChat(gameId: string, messageId: string, body: string): void;
  requestRematch(gameId: string): void;
  respondRematch(gameId: string, rematchId: string, accept: boolean): void;
  cancelRematch(gameId: string, rematchId: string): void;
  saveResultPng(payload: string, openAfterSave: boolean): void;
  openLastPng(): void;
  shareLastPng(): void;
  refresh(): void;
  stop(): void;
  snapshot(): string;
}

declare global {
  interface Window {
    AndroidOmok?: AndroidOmokBridge;
  }
}

export function isAndroidApp(): boolean {
  return typeof window.AndroidOmok !== "undefined";
}

export function readNativeLanSnapshot(): NativeLanSnapshot {
  try {
    const raw = window.AndroidOmok?.snapshot();
    if (!raw) return emptySnapshot();
    const value = JSON.parse(raw) as Partial<NativeLanSnapshot>;
    return {
      status: typeof value.status === "string" ? value.status : "연결 상태를 확인합니다.",
      devicePlayerId: typeof value.devicePlayerId === "string" ? value.devicePlayerId : "",
      deviceNickname: typeof value.deviceNickname === "string" ? value.deviceNickname : "게스트",
      isAuthority: value.isAuthority === true,
      sessionReady: value.sessionReady === true,
      peers: Array.isArray(value.peers) ? value.peers.filter(isPeer) : [],
      challenge: value.challenge && typeof value.challenge === "object" ? value.challenge as NativeLanChallenge : null,
      game: value.game && typeof value.game === "object" ? value.game as NativeLanGame : null,
      communicationEvents: Array.isArray(value.communicationEvents) ? value.communicationEvents.filter(isCommunicationEvent) : [],
    };
  } catch {
    return emptySnapshot("LAN 상태를 읽지 못했습니다. 앱을 다시 열어 주세요.");
  }
}

function emptySnapshot(status = "같은 Wi-Fi에서 대기 중인 상대를 검색합니다."): NativeLanSnapshot {
  return { status, devicePlayerId: "", deviceNickname: "게스트", isAuthority: false, sessionReady: false, peers: [], challenge: null, game: null, communicationEvents: [] };
}

function isPeer(value: unknown): value is NativeLanPeer {
  if (!value || typeof value !== "object") return false;
  const peer = value as Record<string, unknown>;
  return typeof peer.id === "string" && typeof peer.name === "string" && typeof peer.authority === "boolean";
}

function isCommunicationEvent(value: unknown): value is NativeLanCommunicationEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.type === "string" && typeof event.direction === "string" && typeof event.atUtcMs === "number" && typeof event.payloadBytes === "number";
}
