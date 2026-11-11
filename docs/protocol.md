# 통신 계약과 영속성 경계

계약 버전: 1  
상태: 기본 스키마와 런타임 검증 구현; 대국 기능 연결은 이후 단계

## 상태 모델은 서로 분리

- 접속/사용자 presence: `ONLINE`, `AWAY`, `DISCONNECTED`, `RECONNECTING`.
- 신청 상태: `PENDING`, `ACCEPTED`, `DECLINED`, `CANCELLED`, `EXPIRED`. UI의 발신/수신/응답 중 표시는 이 상태에서 파생한다.
- 게임 상태: `PREPARING`, `ACTIVE`, `FINISHED`, `ABORTED`, `CANCELLED`.
- 종료 이유는 상태가 아닌 `endReason`: `WIN`, `TIMEOUT`, `RESIGNATION`, `DISCONNECT`, `DRAW`, `INVALID`, `SYSTEM_ABORT`.
- 결과 화면 상태는 클라이언트 UI 전용 `CLOSED`, `OPEN`, `SAVING`, `SAVED`, `SAVE_FAILED`; 게임의 권위 상태를 바꾸지 않는다.

`packages/shared/src/types.ts`는 각 모델을 분리한다. `SYSTEM_ABORT`는 `GameEndReason` 값으로만 쓴다.

## 식별자와 순번

| 값 | 범위와 목적 |
|---|---|
| `protocolVersion` | wire 계약의 정수 버전. 현재 1 |
| `playerId` | 서버가 발급하는 사용자 식별자. 표시 이름과 권한을 대체하지 않음 |
| `challengeId` | 대국 신청 한 건의 식별자 |
| `gameId` | 한 판의 식별자. 재도전은 새 ID |
| `requestId` | 참가자 세션 범위의 명령 멱등성 키. 재전송 시 같은 payload/hash를 사용 |
| `revision` | 대국 권위 상태 변경마다 증가. 착수·게임 이벤트 순서 |
| `messageId` | 채팅 메시지 중복 제거 식별자 |
| `sequence` | 게임 채팅방 안 메시지 순서. 게임 revision과 별도 카운터 |

클라이언트가 보내는 `playerId`는 권한 근거가 아니다. 서버는 인증된 연결의 세션에서 발신자를 결정하고, challenge/game 참가자 명단과 대조한다.

## 방향 및 메시지

실시간 전송은 WebSocket이며 JSON UTF-8을 사용한다. 서버는 `maxPayload=8 KiB`, 압축 끔으로 시작한다. 현재는 `/ws`의 버전 인사·heartbeat·스키마 검증까지만 실제 연결했다.

| 방향 | `type` | 필수 필드 | 권한/처리 |
|---|---|---|---|
| Client → Server | `client.hello` | `protocolVersion`, `requestId`, `clientBuild` | 버전 확인; 현재 인증은 아직 구현 전 |
| Client → Server | `lobby.snapshot.request` | 공통 envelope | 인증된 사용자만 로비 스냅샷 요청 (후속 구현) |
| Client → Server | `challenge.create` | `targetPlayerId` | 본인 제외, 대상 상태, 중복·신청 제한 서버 검증 |
| Client → Server | `challenge.respond` | `challengeId`, `accept` | 해당 신청의 수신자만 응답 가능 |
| Client → Server | `challenge.cancel` | `challengeId` | 발신자 및 미종료 신청 확인 |
| Client → Server | `game.ready` | `gameId`, `revision` | 해당 게임 참가자만 준비 가능 |
| Client → Server | `game.move.propose` | `gameId`, `revision`, `x`, `y` | 참가자·ACTIVE·차례·빈 좌표·마감·revision 서버 검증 |
| Client → Server | `game.retry.request` | `gameId`, `revision` | 패자만 요청. 상대 승낙 후 새 판 생성 |
| Client → Server | `game.retry.respond` | `gameId`, `revision`, `accept` | 상대 참가자만 응답 |
| Client → Server | `chat.send` | `gameId`, `messageId`, `body` | 해당 게임 참가자만. 본문은 유효성·빈도·길이 확인 후 같은 방에 전달 |
| Client → Server | `heartbeat` | `sentAtUtc` | 세션 연결 상태 갱신, 게임 revision은 증가시키지 않음 |
| Server → Client | `server.hello` | `protocolVersion`, `serverBuild`, `serverTimeUtc` | 연결 직후 계약 버전 안내 |
| Server → Client | `command.result` | `requestId`, `ok=true`, `data` | 승인 응답. 영속 변경은 commit 후에만 전송 |
| Server → Client | `server.error` | `requestId|null`, `ok=false`, `code`, `message`, `snapshot|null` | 거부 이유와 필요한 권위 스냅샷 |
| Server → Client | `snapshot` | `requestId|null`, `snapshot` | 인증된 참가자에게 권위 상태 복구 |
| Server → Client | `game.event` | `gameId`, `revision`, `event` | 게임 revision 단위 순서 |
| Server → Client | `challenge.event` | `challengeId`, `revision`, `event` | 신청 상태 변경 알림 |
| Server → Client | `chat.message` | `gameId`, `messageId`, `sequence`, `senderPlayerId`, `body`, `createdAtUtc` | 방 참가자만; sequence와 게임 revision 별도 |
| Server → Client | `heartbeat.ack` | `requestId`, `serverTimeUtc` | 연결 확인 |

`parseClientJson`과 `parseServerJson`이 JSON 파싱, protocol version, message type, 필수 필드·타입, 좌표 0–14, 채팅 길이·순번을 런타임에 검사한다. 서버는 JSON 형태가 유효해도 인증·권한·상태·revision·마감 검증을 별도로 수행해야 한다. 현재 단계의 실제 WebSocket 처리는 `client.hello`와 `heartbeat` 외에 기능 명령을 `NOT_IMPLEMENTED`로 거절한다.

## 응답·멱등성·revision

성공 응답은 `command.result`; 거부는 `server.error`다. 오류는 상태 변경으로 기록하지 않는다. 성공 requestId와 요청 hash, 원래 응답을 `(actor_player_id, request_id)` 키로 저장한다. 같은 ID/같은 hash는 원래 응답을 재전달하고, 같은 ID/다른 hash는 충돌로 거절한다. 새 명령의 expected revision이 현재값과 다르면 거절하고 현재 스냅샷을 제공한다.

채팅 sequence는 대국 revision과 독립적으로 올라간다. heartbeat·presence·채팅은 게임 revision을 변경하지 않는다. 실제 판정은 서버가 한다.

## 스냅샷

`ApplicationSnapshot`은 `connection`, `challenge`, `game`, `serverTimeUtc`를 별도 필드로 제공한다. 게임에는 `gameId`, `status`, `revision`, 양쪽 player ID/색, 15×15 board, 차례, `endReason`, 표시용 `turnDeadlineUtc`가 포함된다. 결과 팝업 표시/PNG 저장 중 같은 UI 상태는 클라이언트 전용이다.

## 시계

서버 프로세스 안의 실행 마감은 단조 증가 시계 기반 `MonotonicDeadline`로 관리한다. 프로세스 종료 후 복구할 수 없는 `performance.now()` 값을 DB에 저장하거나 재시작 후 비교하지 않는다. DB 보관 시각은 UTC ISO 문자열(`created_at_utc`, `updated_at_utc`, `ended_at_utc`)로 저장한다. wire의 UTC deadline은 화면 안내이며, 판정 권위는 서버의 단조 시계다.

## SQLite 스키마와 계층

- 마이그레이션 v1: `players`, `player_sessions`(토큰 해시), `challenges`, `games`, `game_moves`, `successful_requests`, `schema_migrations`.
- 게임 status와 종료 reason에 CHECK constraint를 둔다. `SYSTEM_ABORT`는 `end_reason`에만 허용한다.
- 채팅 본문/heartbeat/순간 presence는 SQLite에 보관하지 않는다.
- `openDatabase`에서 foreign key, busy timeout, 파일 DB의 WAL을 설정하고 버전 순서대로 migration을 트랜잭션 적용한다.
- `persistGameTransition`은 기대 revision 검증 겸 업데이트와 성공 request 기록을 `BEGIN IMMEDIATE` 트랜잭션 안에서 처리한다. 이 함수가 반환되기 전에 호출자가 상태를 메모리나 네트워크로 노출하지 않는다.

실제 인증, 도메인별 메시지 권한 처리, challenge/game 생성·착수·종료의 전체 서비스 흐름은 다음 단계에서 구현한다.
