# 6단계 온라인 복구 정책과 검증

기록일: 2026-11-12, 앱 0.1.0. Codex Windows/PowerShell 작업환경에서 확인.
이 문서는 4·5단계의 12초 복귀 유예 및 DB 실패 후 재진행 설명을 대체한다.

## 확정 동작

- 응용 heartbeat는 양쪽 15초. 서버는 heartbeat.request를 보내고 브라우저는 heartbeat로 응답하며 독립 heartbeat도 보낸다. 마지막 유효 수신 후 30초 이상 또는 socket close에서 단절 확인. 잘못된 JSON/미지원 서버 메시지는 브라우저의 유효 응답 시간을 갱신하지 않는다. 서버 감시 주기는 250ms, 브라우저 감시는 1초이므로 검사 시점에 따라 단절 확인이 늦어질 수 있다.
- 단절 확인부터 복귀 유예 60초. 단절 중에도 원래 턴 마감은 유지한다. 새 이벤트(재인증 포함) 전에 이미 지난 마감을 판정한다. 턴/복귀 마감 중 이른 이유로 종료하며 동률은 TIMEOUT이다. 두 번째 단절 확인 전에 확정할 결과가 없으면 ABORTED/DISCONNECT로 무효 종료한다. 이미 저장된 승리·시간패·기권 결과는 보존한다.
- 토큰 인증 → 최신 서버 스냅샷 적용 → connected/입력 활성화 순서다. query 성공 응답만 있고 스냅샷이 없으면 입력을 열지 않는다. 로컬 보드로 서버를 덮어쓰거나 새 턴 시간을 부여하지 않는다.
- 연결 소유권을 새 socket에 먼저 넘긴 뒤 이전 socket을 닫는다. 이전 socket의 메시지와 close는 무시한다. 서버 grace timer는 timer identity와 현재 연결을 검사한다. 브라우저는 socket generation과 reconnect epoch로 이전 이벤트·재시도 루프를 격리한다.
- 시작 시 migration과 미종결 정리를 동기식 transaction으로 완료한 뒤 서버 객체를 반환하며 이후 listen/upgrade/readiness가 열린다. PREPARING은 CANCELLED, ACTIVE는 ABORTED/SYSTEM_ABORT. 최종 결과와 기존 성공 요청 기록은 건드리지 않는다.
- SQLite 읽기/쓰기 장애 감지 후 신규 착수·시간패를 중지한다. 복구 때 DB의 committed 행을 다시 읽고, 여전히 미종결인 판을 transaction으로 정리한 후 스냅샷과 입력 복구 알림을 보낸다. 장애로 정상 진행하지 못한 ACTIVE는 시간패 대신 ABORTED/SYSTEM_ABORT다. 상태와 시스템 성공 기록도 같은 transaction에 저장한다. 복구 저장까지 실패하면 readiness와 신규 접속은 계속 닫힌다.

## 재접속 간격 결정

원문 기준의 간격 숫자는 현재 폴더에서 찾지 못했다. 사용자가 일반적인 범위로 결정하도록 명시적으로 위임했다.
최초 0~1초 균등 임의 대기, 이후 기본 1·2·4·8초에 각각 ±20% 임의 지연을 적용한다. 기본 간격 상한은 8초이고 실제 지연 상한은 9.6초다. 60초 재시도 예산이 끝나면 새 시도를 시작하지 않는다. 각 연결·인증 시도는 최대 8초이며 남은 예산으로 줄인다.
이는 최초 임의 대기와 이후 점증 재시도를 권하는 [RFC 6455 §7.2.3](https://www.rfc-editor.org/rfc/rfc6455.html#section-7.2.3)을 따른 프로젝트 선택이다. 위 숫자가 RFC나 원문 기획서의 지정 숫자라는 뜻은 아니다.

## 실제 명령과 결과

루트 C:\오목게임에서 실행:
- node_modules/.bin/tsc.cmd -p packages/shared/tsconfig.build.json: 성공
- node_modules/.bin/tsc.cmd -p apps/server/tsconfig.json --noEmit: 성공
- node_modules/.bin/tsc.cmd -p apps/web/tsconfig.json --noEmit: 성공
- node_modules/.bin/vitest.cmd run: 10 files / 61 tests 통과
- node_modules/.bin/tsc.cmd -p apps/server/tsconfig.build.json: 성공
- node_modules/.bin/vite.cmd build apps/web --config apps/web/vite.config.ts: Vite 8.3.7 성공
- node --input-type=module -e 로 컴파일 서버와 메모리 SQLite 실행 후 fetch 조회: /healthz 200 status=ok, /readyz 200 status=ready 및 checks.sqlite=true. HTTP 서버·WSS·DB는 확인 후 종료.
- 의존성/lockfile 변경 없음. 사용자 PC의 설치 버전이나 배포 결과는 추가 확인하지 않았다.

## B01~B06 실제 증거

| ID | 항목 | 실제 시험 | 범위 |
|---|---|---|---|
| E7-01 | B01 승인 유실·복구 순서 | 기존 실제 두 ws client의 승인 재확인 시험 유지. 브라우저 클라이언트 mock 시험에서 auth 후 snapshot 전 connected 없음, snapshot 없는 성공 응답으로도 입력 활성화 거부 | 실제 TCP 패킷 유실 주입 아님 |
| E7-02 | B02 마감 경계 | recovery.test.ts의 Date/performance 가짜 시계: 늦은 sweep에서 먼저 온 deadline 선택, 동률 시간패, 재접속 이벤트보다 이미 지난 마감 우선 | 프로세스가 실제 장시간 멈추는 시험은 아님 |
| E7-03 | B03 복구·heartbeat | lobby-recovery.test.ts의 EventEmitter socket 단절 주입과 가짜 타이머: 15초 송신, 29,999ms 유지/30초 단절, 유효 heartbeat 수신 유지, 토큰 새 연결의 snapshot 및 원래 턴 마감 유지. web/lobby-client.test.ts의 15/30초 감시와 jitter 범위 | 실제 브라우저·망 전환 아님 |
| E7-04 | B04 양측 단절 | 첫 단절 후 두 번째 단절이면 무효. 턴 마감 뒤 두 번째 단절은 시간패 유지. 기권으로 저장된 승리 유지 | 로컬 SQLite+가짜 시계 |
| E7-05 | B05 이전 연결 | 오래된 메시지/지연 close/grace timer 무효화. live takeover 중 동기 close 주입. 브라우저 오래된 socket 이벤트·대기 중 재접속 루프가 새 연결을 건드리지 않음 | socket/브라우저 API 모형과 기존 실제 ws resume 시험을 함께 사용 |
| E7-06 | B06 재시작·DB 장애 | startup cleanup 실패 시 서버 생성 자체 실패. 재실행 cleanup의 PREPARING 취소/ACTIVE 시스템 무효/최종 행 보존. SQLite trigger 쓰기 실패 및 read exception 주입. 장애 중 지난 120초가 시간패로 반영되지 않음. 복구 후 과거 승인 재확인과 최신 ABORTED snapshot | 실제 디스크 손상·프로세스 강제 종료·commit 결과 불확실 장애의 물리 주입은 미실행 |

기존 5단계의 DB 오류 후 동일 신규 요청이 그대로 대국을 이어가는 기대는 이번 사용자 지시에 따라 변경했다. 오류 후 ACTIVE는 시스템 무효로 정리하며, 이전에 이미 commit된 요청은 계속 재확인 가능하다.

## 실기기와 후속 인수

실제 Android Chrome, Wi-Fi↔이동통신 전환, 비행기 모드, 앱 백그라운드/절전, PC Chrome/Edge 버전 조합 시험은 수행하지 않았다. 이번 단계 새 화면 캡처·패킷 캡처·성능 수치는 없다.
최소 실행: 프로젝트 폴더에서 npm run dev (현재 Codex 셸에서 npm PATH가 없으면 기존 pnpm dlx npm@12.2.2 run dev 방식). 독립 브라우저 둘로 대국 시작 후 한쪽 새로고침/닫기와 복귀, 양쪽 닫기를 확인한다. 실제 모바일 시험은 별도로 기기·OS·브라우저·네트워크·앱 0.1.0 빌드와 시각을 기록한다.
다음 구현 단계는 서버 채팅·재도전, 오프라인 PWA 및 실제 기기 복구 증거 수집이다. 현재 변경은 미커밋 상태다.
