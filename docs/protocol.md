# 통신 계약과 영속성 경계

계약 버전: 1  
상태: 기본 스키마, 런타임 메시지 검사, 순수 규칙 엔진, WebSocket 세션·대기열·신청·대국 준비 흐름 구현. 실시간 착수/채팅/진행 중 복구는 이후 단계

`packages/shared/src/rules.ts`는 15×15 보드, 흑 선공/교대, 유효 좌표, 점유·차례·종료 검증, 네 방향의 5개 이상 연결 판정, 마지막 수 승리 우선 및 무승부 판정을 제공한다. 이 순수 모듈은 React, SQLite, WebSocket을 import하지 않으며 입력 상태를 변경하지 않는다. 온라인 서버가 착수를 승인하고 보드를 전달하는 실제 통합은 아직 구현되지 않았다.

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

실시간 전송은 WebSocket이며 JSON UTF-8을 사용한다. 서버는 `maxPayload=8 KiB`, 압축 끔으로 동작한다. `/ws`의 버전 인사·초기 인증·세션 복구·대기실·신청/응답·준비 명령을 실제 연결했다. 보드 착수·게임 중 복구·채팅 계약은 아직 서버 흐름에 연결되지 않았다.

| 방향 | `type` | 필수 필드 | 권한/처리 |
|---|---|---|---|
| Client → Server | `client.hello` | `protocolVersion`, `requestId`, `clientBuild` | 호환성 인사; 세션 인증은 별도 메시지 |
| Client → Server | `session.start` | `nickname` (빈 문자열 허용) | 5초 서버 인증 한도에서 이름 정규화/예약, 공란 게스트 발급, 무작위 세션 발급 |
| Client → Server | `session.resume` | `token` | 재접속 세션 복구. 토큰을 URL에 넣지 않고 WebSocket 메시지 본문으로 전달 |
| Client → Server | `session.end` | 공통 envelope | 홈 복귀 세션 초기화, 보류 신청/PREPARING 게임 종료 후 이름 해제 여부 평가 |
| Client → Server | `lobby.snapshot.request` | 공통 envelope | 인증된 사용자에게 서버 대기/응답/대국/복귀 상태 스냅샷 |
| Client → Server | `challenge.create` | `targetPlayerId` | 접속·사용자당 pending 1건·10초 재요청 제한을 transaction에서 확인 |
| Client → Server | `challenge.respond` | `challengeId`, `accept` | 해당 수신자만 응답. 승낙과 대국 생성/참가자 배정/성공 요청 기록을 한 transaction으로 처리 |
| Client → Server | `challenge.cancel` | `challengeId` | 신청자만 취소; 승낙과 경합 시 PENDING 조건부 갱신으로 하나만 반영 |
| Client → Server | `game.ready` | `gameId`, `revision` | PREPARING 참가자 준비; 양쪽 준비 후 3초 카운트다운 |
| Client → Server | `game.cancel` | `gameId` | 참가자만 시작 전 취소, 승패 없이 CANCELLED 기록 |
| Client → Server | `game.move.propose` | `gameId`, `revision`, `x`, `y` | 참가자·ACTIVE·차례·빈 좌표·마감·revision 서버 검증 |
| Client → Server | `game.retry.request` | `gameId`, `revision` | 패자만 요청. 상대 승낙 후 새 판 생성 |
| Client → Server | `game.retry.respond` | `gameId`, `revision`, `accept` | 상대 참가자만 응답 |
| Client → Server | `chat.send` | `gameId`, `messageId`, `body` | 해당 게임 참가자만. 본문은 유효성·빈도·길이 확인 후 같은 방에 전달 |
| Client → Server | `heartbeat` | `sentAtUtc` | 세션 연결 상태 갱신, 게임 revision은 증가시키지 않음 |
| Server → Client | `server.hello` | `protocolVersion`, `serverBuild`, `serverTimeUtc` | 연결 직후 계약 버전 안내 |
| Server → Client | `command.result` | `requestId`, `ok=true`, `data` | 승인 응답. 영속 변경은 commit 후에만 전송 |
| Server → Client | `server.error` | `requestId|null`, `ok=false`, `code`, `message`, `snapshot|null` | 거부 이유와 필요한 권위 스냅샷 |
| Server → Client | `snapshot` | `requestId|null`, `snapshot` | 인증된 참가자에게 권위 상태 복구 |
| Server → Client | `lobby.snapshot` | `me`, `players[]`, `challenges[]`, `game|null`, `serverTimeUtc` | 서버 접속자·신청·준비 상태 전달 |
| Server → Client | `game.event` | `gameId`, `revision`, `event` | 게임 revision 단위 순서 |
| Server → Client | `challenge.event` | `challengeId`, `revision`, `event` | 신청 상태 변경 알림 |
| Server → Client | `chat.message` | `gameId`, `messageId`, `sequence`, `senderPlayerId`, `body`, `createdAtUtc` | 방 참가자만; sequence와 게임 revision 별도 |
| Server → Client | `heartbeat.ack` | `requestId`, `serverTimeUtc` | 연결 확인 |

`parseClientJson`과 `parseServerJson`이 JSON 파싱, protocol version, message type, 필수 필드·타입, 좌표 0–14, 채팅 길이·순번을 런타임 검사한다. 세션 시작/복구도 별도 서버 검사 후 인증하고, challenge/game 참여 권한은 인증된 socket의 playerId로 확인한다. 실제 게임 착수와 채팅 명령은 아직 미연결이다.

## 응답·멱등성·revision

성공 응답은 `command.result`; 거부는 `server.error`다. 오류는 상태 변경으로 기록하지 않는다. 성공 requestId와 요청 hash, 원래 응답을 `(actor_player_id, request_id)` 키로 저장한다. 같은 ID/같은 hash는 원래 응답을 재전달하고, 같은 ID/다른 hash는 충돌로 거절한다. 새 명령의 expected revision이 현재값과 다르면 거절하고 현재 스냅샷을 제공한다.

채팅 sequence는 대국 revision과 독립적으로 올라간다. heartbeat·presence·채팅은 게임 revision을 변경하지 않는다. 실제 판정은 서버가 한다.

## 스냅샷

`ApplicationSnapshot`은 `connection`, `challenge`, `game`, `serverTimeUtc`를 별도 필드로 제공한다. 게임에는 `gameId`, `status`, `revision`, 양쪽 player ID/색, 15×15 board, 차례, `endReason`, 표시용 `turnDeadlineUtc`가 포함된다. 결과 팝업 표시/PNG 저장 중 같은 UI 상태는 클라이언트 전용이다.

## 시계

서버 프로세스 안의 실행 마감은 단조 증가 시계 기반 `MonotonicDeadline`로 관리한다. 프로세스 종료 후 복구할 수 없는 `performance.now()` 값을 DB에 저장하거나 재시작 후 비교하지 않는다. DB 보관 시각은 UTC ISO 문자열(`created_at_utc`, `updated_at_utc`, `ended_at_utc`)로 저장한다. wire의 UTC deadline은 화면 안내이며, 판정 권위는 서버의 단조 시계다.

## SQLite 스키마와 계층

- 마이그레이션 v1: `players`, `player_sessions`(토큰 해시), `challenges`, `games`, `game_moves`, `successful_requests`, `schema_migrations`.
- 마이그레이션 v2: 재신청 제한용 `challenge_cooldowns`, 양측 준비/카운트다운용 `game_preparation`, 사용자별 pending challenge partial unique index.
- 게임 status와 종료 reason에 CHECK constraint를 둔다. `SYSTEM_ABORT`는 `end_reason`에만 허용한다.
- 채팅 본문/heartbeat/순간 presence는 SQLite에 보관하지 않는다.
- `openDatabase`에서 foreign key, busy timeout, 파일 DB의 WAL을 설정하고 버전 순서대로 migration을 트랜잭션 적용한다.
- `persistGameTransition`은 기대 revision 검증 겸 업데이트와 성공 request 기록을 `BEGIN IMMEDIATE` 트랜잭션 안에서 처리한다. 이 함수가 반환되기 전에 호출자가 상태를 메모리나 네트워크로 노출하지 않는다.
- 세션 토큰은 CSPRNG `randomBytes(32)`로 발급하고 DB에는 SHA-256 해시만 저장한다. 브라우저는 토큰을 sessionStorage에 두며 URL/query string에 넣지 않는다. 세션 만료는 24시간, reconnect grace는 12초다. grace 종료 시 준비 중 게임은 취소하고 대기 중 신청은 정리한다.
- 게스트 `guestN` 발급과 player/session 삽입은 하나의 immediate transaction으로 처리한다. 닉네임 예약은 연결 세션, pending 신청, PREPARING/ACTIVE 게임, reconnect grace까지 유지한다.
- challenge 응답 기한 30초, 같은 신청자→상대 재요청 최소 10초, 준비 기한 10초를 적용한다. 실행 중 마감은 `performance.now()` 단조 시계로 판정하고 SQLite에는 UTC 절대시각을 둔다. 양쪽 준비 후 3초가 지나면 ACTIVE로 전환한다.
- 시작 전 취소·준비 초과·준비 중 연결 단절은 `CANCELLED`/`end_reason=NULL`로 기록한다. 승자나 패자를 정하지 않는다.
- 닉네임 구현은 NFKC, 양끝 공백 제거, 대소문자 무시 비교, 2–12 Unicode code point, 한글/Unicode 문자·결합문자·숫자·`_`·`-`, `admin`/`system`/`guestN` 계열 등 예약 이름 거부를 적용했다. 개발 기준 원문 파일이 현재 작업 폴더에서 확인되지 않아 전체 허용 문자·예약어 목록과 일치하는지는 별도 미확인이다.

challenge/session 및 게임 준비는 구현했다. 실제 게임 착수·종료, 채팅, 온라인 복구 및 재도전의 서비스 흐름은 다음 단계에서 구현한다.
