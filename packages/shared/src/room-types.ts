export interface RoomChatMessage {
  messageId: string;
  sequence: number;
  senderPlayerId: string;
  displayName: string;
  body: string;
  createdAtUtc: string;
}
export interface ResultRoomState {
  expiresAtUtc: string;
  canRequest: boolean;
  canRespond: boolean;
  disabledReason: string | null;
  retry: { requesterPlayerId: string; status: string; deadlineUtc: string; newGameId: string | null } | null;
}
export const RESULT_REASON_LABELS: Record<string, string> = {
  WIN: "5목 승리", TIMEOUT: "시간패", RESIGNATION: "기권", DISCONNECT: "단절패",
  DRAW: "무승부", SYSTEM_ABORT: "시스템 중단 무효", INVALID: "무효", CANCELLED: "시작 전 취소",
};
export function resultReason(status: string, reason: string | null | undefined): string {
  if (status === "ABORTED") return reason === "DISCONNECT" ? "양쪽 단절 무효" : "시스템 중단 무효";
  return RESULT_REASON_LABELS[reason ?? ""] ?? "무효";
}
export function roomErrorMessage(code:string):string {
  const labels:Record<string,string>={
    CHAT_RATE_LIMIT:"최근 5초 동안 5건을 보냈습니다. 잠시 뒤 같은 메시지를 재시도하세요.",
    CHAT_LENGTH:"메시지는 공백을 제외한 내용으로 1~200글자를 입력하세요.",
    CHAT_READ_ONLY:"대국이 종료되어 새 메시지를 보낼 수 없습니다. 기존 메시지는 읽을 수 있습니다.",
    MESSAGE_ID_CONFLICT:"같은 메시지 ID의 내용이 달라 전송하지 않았습니다. 내용을 확인하세요.",
    NOT_GAME_PARTICIPANT:"이 대국방 참가자만 사용할 수 있습니다.",
    REMATCH_OPPONENT_UNAVAILABLE:"상대가 나갔거나 연결이 끊겼습니다. 연결 상태를 확인하세요.",
    REMATCH_LOSER_ONLY:"재도전은 패자만 요청할 수 있습니다.",REMATCH_WINNER_ONLY:"재도전 승낙은 승자만 할 수 있습니다.",
    REMATCH_COOLDOWN:"재도전 종료 후 10초 동안 기다린 뒤 다시 신청하세요.",GAME_CAPACITY:"동시 대국 20판이 진행 중입니다. 잠시 후 재시도하세요.",
    REMATCH_ALREADY_PENDING:"이미 재도전 응답을 기다리고 있습니다.",REMATCH_CLOSED:"재도전 응답 시간이 끝났습니다. 결과방이 열려 있다면 다시 신청하세요.",
    REMATCH_NO_LOSER:"무승부·무효 대국은 대기열에서 새로 신청하세요.",REMATCH_PLAYER_BUSY:"참가자가 다른 신청이나 대국 중입니다. 대기열에서 다시 확인하세요.",
    RESULT_ROOM_EXPIRED:"결과방 5분이 만료되어 대기열로 이동합니다.",RESULT_ROOM_LEFT:"이미 결과방을 나갔습니다. 대기열에서 새로 신청하세요.",
  };
  return labels[code]??"요청을 처리하지 못했습니다. 연결과 서버 상태를 확인한 뒤 다시 시도하세요.";
}
