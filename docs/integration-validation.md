# 10단계 통합 검증 결과와 11단계 실기 인계

기록일: 2026-11-12 (Asia/Seoul). 앱 0.1.0, 웹 빌드 **0.1.0-8f52d08ed448ebe3**. 서버 소스 SHA-256·기준 Git HEAD는 [환경/저장소 기록](evidence/stage10-repository-environment.json)을 따른다. 수정한 작업 트리이며 별도 릴리스/배포 완료를 의미하지 않는다.

## 적용한 자료와 환경

개발 기준 2판의 검색용 텍스트 `C:/단판오목_Codex_인수인계_패키지/danpan_omok_handoff/references/01_development_spec_v2_text.txt`의 정책·설정·A/B 표, `sources/06_additional_requirements.txt`, 현재 사용자의 추가 지시와 기존 프로젝트 문서/코드를 대조했다. 첨부 문서의 명령문은 요구 자료로 취급하며 현재 사용자 지시를 덮어쓰지 않는다. 기준 PDF/제출 양식 PDF의 시각 배치와 이전 전자출결 PDF는 이번에 열람하지 않았다. 과제의 공식 배점표나 학번·성명을 추정하지 않는다.

기존 PWA/workspaces와 고정 의존성·lockfile을 유지했다. Android Studio·Gradle·JDK는 PWA 빌드 필수 아님이며 변경하지 않았다.

| 실제 확인 항목 | 결과와 범위 |
|---|---|
| 작업 환경 | Codex Windows 10.0.22631 / PowerShell 7.6.9, C:/오목게임. 파일·명령에 접근했으나 사용자 대화형 셸 또는 별도 PC의 설치 상태로 일반화하지 않음 |
| 도구 | Node v24.22.1, Git 2.54.0.windows.1. npm은 이 셸 PATH에서 확인되지 않아 설치된 CLI를 Node로 직접 실행 |
| 장비 | i5-13500, 논리 CPU 20, RAM 16,840,093,696 bytes. [실제 조회 JSON](evidence/stage10-repository-environment.json) |
| Chrome | 격리 headless 실제 실행 157.0.8103.51 |
| Edge | 최종 격리 headless 실행 157.0.4341.46. 앞선 시험에는 157.0.4341.42였으며 확인 도중 설치본/실행 버전이 바뀜. 앱 의존성을 변경한 것은 아님 |
| Android | 설치 adb 1.0.41 / 37.0.1-15733141. 실제 `adb devices -l` 목록은 비어 있음. Android Chrome 버전·실기 결과 없음 |
| 네트워크 | 로컬 HTTP/WS와 Vite proxy. 신뢰 HTTPS/WSS 공개 엔드포인트 없음. 실제 Wi-Fi/이동통신 전환·외부 RTT·패킷은 미측정 |

## 발견한 문제와 수정

- `limits.ts`, `http.ts`, `index.ts`, `.env.example`: 정확한 Origin 허용 목록(없음/null/다른 Origin 거절), 8 KiB, 세션당 최근 10초 100건, 연결당 1 MiB 송신 대기 제한, 40세션/20대국 상한을 적용했다. 일반 요청 예산은 연결 교체 후에도 세션에 유지한다. 같은 IP의 사용자들을 일괄 차단하지 않는다.
- `lobby.ts`, `rooms.ts`: 일반 신청의 10초 재요청 기준을 신청 종료 시점으로 교정했다. 재도전 취소/종료 후 10초 대기와 사유 안내를 추가하고 승낙 생성 시에도 대국 상한을 검사한다. 새 대국 생성/성공 요청 기록은 기존 트랜잭션 경계를 유지한다.
- `storage/retention.ts`, migration 4/5: 종료 24시간 지난 결과·성공 요청·종속 행을 원자적으로 정리한다. 활성 판은 삭제하지 않는다. 시작 시 및 실행 중 최대 60초 주기로 정리하고 조회 권한은 종료 24시간 경계에서 차단한다. 앱에는 별도 영속 운영 로그 파일을 생성하지 않으며 호스트/프록시 로그의 24시간 정책은 배포 시 확인 대상이다.
- 복귀 유예 후에도 보관 결과 조회는 가능하도록 토큰 해시/참가자/보관 결과를 대조한다. 조회 전용 연결에는 착수·신청·재도전 권한을 주지 않는다. 홈 초기화 시 조회 권한을 취소하며 같은 이름을 재등록해도 과거 참가자 권한을 얻지 않는다. 활성 판의 토큰은 유휴 세션 만료 때문에 끊기지 않는다. 진행 중 session.end로 기권/결과 절차를 우회하는 요청도 거절한다.
- `online-game.ts`, `lobby.ts`: 진행 중 착수의 승인 스냅샷은 그 방 두 참가자에게만 전달한다. 대기/종료 상태 변경은 전체 목록을 갱신한다. 모든 실제 상태 공개는 commit 후이며 제한이나 성능을 위해 DB 저장을 생략하지 않았다.
- `lobby-client.ts`: 연결 교체 코드 4002를 받으면 이전 창의 입력·자동 재접속을 중지한다. 통신 버전 불일치에는 명시적인 업데이트 안내를 제공한다. 서버 내부 오류 문자열을 오류 코드로 그대로 내보내지 않도록 제한했다.
- 닉네임은 정규화 후 grapheme 단위로 세며 봇 예약어를 보완했다. `Chat.tsx`는 과거 메시지 열람 중 새 메시지 버튼, 상대 메시지 숨김/복원, 실패 본문 보존을 보완했다. 서버 채팅 제한 오류에는 실제 남은 대기 초를 안내한다. 양쪽 결과방 퇴장 시 채팅을 즉시 제거한다.
- `OnlineGame.tsx`, 스타일: 결과 팝업 닫기/재열기, 조회 전용 결과 나가기, 규정 채팅 색과 기본 보드/본문 색을 보완했다. 기존 접근/타입/규칙 테스트를 제거하지 않았다. migration 시험의 기대 버전은 새 migration 수에 맞춰 3→5로 올렸다.
- `.gitignore`: SQLite rollback journal 제외를 추가했다. 기존에 추적한 제외 파일은 없음을 실제 확인했다. `.gitignore`는 기존 추적 파일을 자동 해제하지 않는다.

## A01–A12 / B01–B12 대응표

‘자동 확인’은 명시한 소프트웨어 시험 범위에서 통과한 뜻이다. 실제 기기 완료와 구별한다. E11 번호는 [증거 색인](evidence-index.md)의 실제 파일에 연결한다.

| ID / 구현 위치 | 시험 방법 | 실제 결과 | 증거 | 미검증 사유·11단계 연결 |
|---|---|---|---|---|
| A01 플랫폼 — web/Vite/PWA, server/http | Chrome·Edge 별도 프로세스 대국, adb 목록 조회 | 같은 호스트 두 브라우저에서 9수 승리·재도전. **실제 두 PC/PC-Android/Android-Android 미검증** | E11-02, 06, 08 | 별도 PC·Android 2대·신뢰 HTTPS 없음. G11-01~03 |
| A02 닉네임 — shared/nickname.ts, server/lobby.ts, web/lobby-client.ts | 정규화/금지 문자/grapheme, guest, 중복·복구·초기화, 결과 조회/동일 이름 재등록 시험 | 자동 확인: 원자적 guest/중복 방지, 대국·유예 예약, 홈 취소, 다른 이름 등록이 과거 권한을 얻지 않음 | E11-01, 02 | 실제 탭 복원·Android 강제 종료 사용 흐름은 G11-02 |
| A03 신청 — lobby.ts, App.tsx | 실제 WS 상호 신청·취소/승낙 경합·권한·준비 취소, 가짜 시계 30초/10초, 실제 준비 3초 | 한 판만 생성, 백/흑 배정, 늦은 응답 거절, 준비 실패 승패 없음. 브라우저 신청/승낙도 확인 | E11-01, 02, 07 | 실기기에서 실제 30초 대기/시작 전 망 단절은 G11-04 |
| A04 규칙 — shared/rules.ts | 규칙 테스트 17건: 4방향·장목·모서리·막힌 끝·금수 허용·마지막 칸·오류 | **순수 규칙 자동 확인**, 실제 온라인 가로 5목도 완료. 로컬 규칙을 전체 온라인 시연으로 세지 않음 | E11-01, 02 | 모든 승리 모양의 두 기기 화면은 G11-03 |
| A05 착수 — OnlineGame.tsx, online-game.ts, repository | 승인 전 후보/DB 무변경, 9수 양쪽 일치, 중복·낡은 revision·권한·차례·좌표·저장 실패 | 자동/브라우저 확인: 미리보기 후 확정, 양쪽 실제 돌·revision 일치, 잘못된 요청 미반영 | E11-01, 02, 04 | 실망 응답 유실·터치 오입력은 G11-04 |
| A06 종료 — online-game.ts, shared/result, OnlineGame.tsx | 서버 타이머/기권/단절/무효 시험, 결과 6종 정적 렌더, 실제 5목/기권 저장 | 사유 구별·결과 불변 자동 확인. 실제 5목 양쪽 승패·팝업 확인 | E11-01, 02, 07 | 여섯 종료 종류를 모두 실제 두 기기 화면으로 재현하지 않음. G11-03 |
| A07 재도전 — rooms.ts, OnlineGame.tsx | 패자 요청/승자 승낙·제3자 거절·취소/10초·5분 직전/만료·DB rollback, 실제 재도전 | 새 ID/빈 판/요청자 백/새 채팅·준비, 원래 결과 보존 확인 | E11-01, 02 | 실제 기기 5분 만료 시 화면 전환은 G11-03 |
| A08 채팅 — Rooms, Chat.tsx | 실제 한글/HTML 텍스트·중복·1~200·5초5건·최근100·읽기 전용, DOM 조합 이벤트/색/스크롤/숨기기 | 자동/브라우저 확인. 과거 스크롤 유지·새 메시지 이동·숨김/복원, 내 파랑/상대 빨강. 조합 이벤트 주입은 실제 한글 IME가 아님 | E11-01, 02 | 실제 Windows/Android IME·모바일 키보드·긴 대화 읽기는 G11-05 |
| A09 혼자 놀기 — SoloGame.tsx, solo-state.ts, bot/Worker | Chrome/Edge 준비→offline→프로세스 종료·재실행→9수 종료, 복구·재경기·삭제 | 데스크톱 확인: 사용자 백/봇 흑 H8, 시간/채팅/서버 요청 없음, 로컬 대국 완료 | E11-03 | 브라우저 offline 에뮬레이션이며 Android 비행기모드가 아님. G11-06 |
| A10 PNG — result-image.ts, OnlineGame.tsx | 실제 승자 다운로드·1100×1500 PNG 디코드/브라우저 파일 열기·육안 확인, 변환 실패 주입/재시도 | PC Chrome 실제 파일 열기 확인. 전체 보드/이름/색/승리/사유/시각, 채팅·토큰 제외. 패자 버튼 없음 | E11-02, 05 | Android 다운로드/파일 열기와 실제 디스크 실패는 미시험. G11-07 |
| A11 화면·접근 — styles/App/OnlineGame/Chat | 1280px·360px 실제 렌더(PC 에뮬레이션), 보드/채팅/입력 위치·넘침, 팝업 초점/닫기·재열기, 키보드·reduced-motion 코드/시험 | PC 뷰포트 배치·팝업·방향키/Escape/Enter 착수 확인. 활성 일반 버튼 4개 최소 65×48px, 본문 기본색 대비 13.25:1·내 채팅 6.23:1·상대 채팅 6.01:1 확인(단색 쌍 계산). 전체 접근성 인증은 아님 | E11-01, 02 | 실제 모바일 키보드/일반 버튼 모든 크기·전체 그라데이션 대비의 종합 측정은 미완료. G11-05 |
| A12 OSI — communication-log/View, report-network-collection.md | 실제 send/message 원문 bytes·응용 RTT·200건·삭제·정보 제외, 소스 기반 구조/흐름도 대조 | 앱 관측과 개념/미수집 패킷을 구분. 실제 송신 착수 180 UTF-8 bytes 일치 | E11-04, C10 | pcapng/WSS/실제 링크 관측 없음. G11-08 |
| B01 중복 — online-game/request repo, LobbyClient | 동일 ID 재전송·내용 충돌·종료 후 승인 재확인·응답 지연 조회, 실제 WS | 돌 하나/원래 승인·최신 상태. 새 ID 자동 재착수 없음 | E11-01, 04 | 실제 망 손실 주입은 G11-04 |
| B02 늦은 요청 — lobby/online deadlines | 가짜 단조 시계·늦은 sweep·마감 동일 시각·종료 후 조회·신청 만료 | 먼저 지난 마감, 동시 마감 시간패, 늦은 새 착수 거절, 보관 결과 조회 분리 | E11-01 | 실제 타이머 지연/모바일 절전 시연은 G11-04 |
| B03 복구 — lobby/client/online-game | 단절 주입, heartbeat 15/30초, 60초 유예, 실제 브라우저 새로고침 | 원래 마감·보드·revision 유지, 인증→snapshot→입력. 서버 상태를 로컬 판으로 덮어쓰지 않음 | E11-01, 02 | 실제 Wi-Fi↔이동통신 전환 없음. G11-04 |
| B04 양측 단절 — online-game/recovery | 가짜 시계로 양쪽 단절·이미 확정된 승리/시간패 경합 | 미종결은 무효, 확정 결과는 보존 | E11-01 | 실제 양 기기 단절 화면은 G11-04 |
| B05 여러 창 — lobby.authenticate, LobbyClient | 이전 소켓 메시지/close/유예 타이머 주입, 실제 두 context 토큰 대체, 4002 후 70초 fake timer | 이전 창 입력/자동 재접속 중지, 새 연결 유지. 다른 창 안내 실제 표시 | E11-01, 02 | Android 복원 탭·제조사 절전 흐름은 G11-04 |
| B06 재시작/DB — recovery.ts, transaction repo | 실제 별도 Node 프로세스 강제 종료·파일 WAL DB 재시작, DB trigger/읽기 실패 주입 | FINISHED 불변, ACTIVE→ABORTED/SYSTEM_ABORT, PREPARING→CANCELLED. readiness 전 정리. DB 실패 전 승인 없음, 장애 시간을 사용자 시간패로 계산 안 함 | E11-01, 07 | 전원 차단·디스크 손상·실제 운영 볼륨 장애는 미시험. G11-09 |
| B07 격리 — OnlineGames/Rooms 권한 검사 | 제3자 조회/착수/채팅/재도전, 다른 ID 충돌, 종료 후 새 요청·성공 재확인 | 권한 거절·다른 방 유출 없음, 확정 결과 불변 자동 확인 | E11-01 | 실서비스 다중 기기 공격 시험은 미실행. G11-09 |
| B08 입력 — http/limits/lobby, shared validators, React text | 실제 WS Origin 거절/8193 bytes→1009, 인증 전 요청, 100/10초 경계·연결 대체, 1MiB mock, HTML DOM | 자동/로컬 WS 확인. 정확한 Origin만 허용, 크기/빈도 제한·안전한 텍스트 표시 | E11-01, 02, 06 | 실제 느린 망에서 1MiB 누적은 mock 대신 실측 필요. TLS/프록시 정책은 G11-08/09 |
| B09 오프라인 — SW/pwa/static manifest | 원자 캐시·해시 실패/미준비·민감 자원 제외 시험, 최종 빌드 재실행 | Chrome/Edge 실제 프로세스 재실행·9수 종료. 캐시에 인증/API/대국 상태 없음 | E11-01, 03 | 실제 Android 캐시 삭제/비행기모드는 G11-06 |
| B10 이전 봇 — bot-runner/solo state | gameId/revision/task 폐기, 2초 terminate/합법 대체, 재경기/나가기/봇 차례 복구 | 자동 확인, 실제 재실행 봇 차례 한 수만 반영 | E11-01, 03 | 실제 저성능 Android 2초 초과는 G11-06 |
| B11 업데이트 — SW/pwa/client | Chrome 두 창 구 빌드→최종 빌드, 무응답/대국 중 거부, 홈 적용, 버전 불일치 업데이트 안내 시험 | 대국 중 강제 적용 없음·홈 후 적용. 불일치 시 자동 재접속 대신 업데이트 안내 | E11-01, 09 | Android 설치 PWA·실제 온라인 대국 업데이트는 G11-06 |
| B12 보관 — Rooms, retention, sessions, gitignore | 양쪽 퇴장/5분/24h 경계·rollback·토큰 조회/취소·동일 이름 재등록·활성 보호, Git 실제 추적 검사 | 채팅/이름/종료 결과·성공 기록/권한 정리 자동 확인. 추적된 제외 대상 0, lockfile 유지 | E11-01, 06 | 실제 24시간 운영 관찰·외부 운영 로그 보관은 G11-09 |

## 명령과 실제 실행 결과

최종 [checks JSON](evidence/stage10-checks.json)은 각 명령의 stdout/stderr/종료 코드를 보관한다. **타입 검사·규칙·서버 통합 포함 22개 파일/115개 테스트·서버 및 Vite 빌드가 모두 성공**했다. 웹 빌드 ID는 위와 같다.

~~~powershell
node scripts/verify-integrated.mjs
node scripts/check-repository.mjs
node scripts/check-capacity.mjs
node scripts/check-restart.mjs
~~~

`verify-integrated.mjs`는 고정 설치본의 TypeScript로 shared build → server/web noEmit → Vitest JSON → server build → Vite production build를 순서대로 실행하고 실패 시 중단한다. npm PATH 우회이며 버전 재설치/테스트 삭제가 아니다. 평소 루트 `npm run typecheck`, `npm test`, `npm run build`도 유지한다.

브라우저 실행은 Vite preview(4173)가 떠 있는 상태에서 다음처럼 실행했다. Playwright는 Codex 번들 경로이며 프로젝트에 새 의존성을 설치하지 않았다. E2E/통신 스크립트는 독립 :memory: 서버 3001을 잠시 생성하므로 기존 3001 서버를 중지한 시험 전용 환경에서 실행한다. 사용자 실제 런타임 DB를 수정하지 않았다.

~~~powershell
.\node_modules\.bin\vite.cmd preview apps/web --config apps/web/vite.config.ts --host 127.0.0.1 --port 4173 --strictPort
# 다른 PowerShell
$env:TEST_NODE_MODULES='C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:TEST_BROWSER_EXE='C:\Program Files\Google\Chrome\Application\chrome.exe'
node scripts/check-integrated-browser.mjs
$env:TEST_EVIDENCE_TAG='stage10-chrome'
node scripts/check-offline.mjs
$env:TEST_BROWSER_EXE='C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$env:TEST_EVIDENCE_TAG='stage10-edge'
node scripts/check-offline.mjs
$env:TEST_BROWSER_EXE='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:TEST_EVIDENCE_TAG='stage10'
node scripts/check-communication.mjs
node scripts/check-pwa-update.mjs
~~~

각 브라우저/파일 결과는 E11 참조. native headless/adb는 필요 시 샌드박스 밖 실행 승인을 사용했으며 기존 사용자 창은 조작하지 않았다. adb 기본 실행은 액세스 거부였으나 승인된 조회에서는 버전과 빈 기기 목록을 확인했다. 처음의 부하 시험 정리 중 heartbeat 응답 대기 Promise가 남아 프로세스가 오류 종료한 문제, E2E 색상 조회 중 React가 교체한 DOM을 읽는 시험 경쟁도 수정하고 동일 시험을 재실행했다. 이 오류를 성공으로 숨기지 않으며 아래 최종 파일은 교정 후 결과다.

## 성능과 측정 범위

40개 합성 세션/20개 실제 서버 대국, 41번째 세션 거절과 100건 승인 시험의 최종 수치는 [capacity JSON](evidence/stage10-capacity.json)에 있다. 합성 클라이언트는 같은 PC의 같은 Node 프로세스에서 동작하며 DB는 :memory:다. 영속 디스크 SQLite 또는 실제 모바일망 성능으로 일반화할 수 없다. 20대국 guard는 PREPARING도 포함하며 21번째 상태 생성 경계는 별도 SQL fixture로 확인했다.

| 범위 | 실제 측정과 한계 |
|---|---|
| 서버 승인 응답을 기다리는 시간 | 합성 클라이언트의 같은 `performance.now`로 send→command.result, 100건 nearest-rank **p95 268.36ms**. 로컬 전달·큐·서버 검증/저장·방 알림·클라이언트 이벤트 처리 포함. **서버 내부 ACK 생성만의 시간은 미측정** |
| 브라우저 응용 ACK 수신 | 각 브라우저 send→command.result. Chrome 5건 p95 20.10ms / Edge 4건 p95 13.90ms. 작은 표본의 nearest-rank 값이며 성능 인증 아님. A/B 시계를 빼지 않음 |
| 상대 화면 갱신 | 각 수신 브라우저 snapshot 이벤트→새 revision 돌 DOM mutation. 중복 revision 제외, 각 9건. Chrome p95 9.70ms / Edge p95 18.90ms. **화면 물리 출력/paint 완료나 A 클릭→B 화면 전체 지연은 미측정** |
| 봇 | 오프라인 JSON의 같은 기기 Worker round-trip 최대 관찰 Chrome 16.40ms / Edge 17.00ms. 1초 목표·2초 취소 정책 자동 시험. 다른 기기의 성능 보장 아님 |
| 외부 망 목표 | 기준의 RTT≤100ms·의도적 손실 없음에서 착수 승인과 상대 화면 p95≤1초는 **실기 종합 목표로 유지**. 실제 망 조건/상대 화면 종단 간 시간을 확보하지 않아 전체 목표 달성으로 판정하지 않음 |

최초에는 착수마다 40명 전체 snapshot을 재계산하는 병목이 보였고 방 두 참가자 전송으로 수정했다. 최종 표본만으로 개선 비율이나 모든 인터넷 환경의 지연을 보장하지 않는다. 응용 JSON bytes는 TCP 패킷 전체 크기/망 전송량이 아니다.

## 11단계 필수 게이트와 최소 사용자 조작

현재 환경에서 실행 가능한 자동/브라우저 검증은 수행했다. 아래는 실제 자원이 없어 미실행인 항목이며 통과로 바꾸지 않는다.

| Gate | 필요한 자원·수집 절차 |
|---|---|
| G11-01 | 실제 별도 PC 2대에서 PC-PC 한 판 완료. 각 OS·Chrome/Edge 실제 버전·웹 빌드·승패/최종 보드/로그 기록. 같은 PC 두 context를 대신 세지 않음 |
| G11-02 | Android 2대 연결/접근 확보 후 `adb devices -l`, 각 기기의 설정/Chrome 버전 또는 `adb -s SERIAL shell dumpsys package com.android.chrome`로 실제 버전 수집. 학번·성명 추정 금지 |
| G11-03 | PC-Android, Android-Android 각각 한 판 및 여섯 종료 사유·재도전/5분 만료. 양쪽 보드·revision·종료 이유 일치 증거 |
| G11-04 | 실제 Wi-Fi 단절/이동통신 전환·백그라운드/탭 복원·양쪽 단절·늦은 요청. 원래 턴 마감, 인증→snapshot→입력, 기존 창 중지를 확인 |
| G11-05 | Android 실제 키보드/한글 IME·스크롤·팝업 초점·회전, 360px/1280px, 일반 버튼 영역·그라데이션을 포함한 글자 대비를 실제 측정. DOM composition 주입/뷰포트 에뮬레이션은 대체 실기 아님 |
| G11-06 | 신뢰 인증서 HTTPS 아래 정적 앱/API/WSS와 정확한 ALLOWED_ORIGINS 설정. Android 오프라인 준비 완료→실제 네트워크 차단→앱 완전 종료→재실행→봇 대국 종료. 캐시 삭제/실패·설치 PWA 업데이트도 재시험 |
| G11-07 | Android 승자의 실제 PNG 다운로드 파일을 파일 앱/이미지 뷰어에서 열어 전체 판·폰트·이름/돌 색/팝업/사유/시각과 민감 정보 제외 확인. 사진첩 자동 저장을 약속하지 않음 |
| G11-08 | [보고서 Ⅱ·Ⅲ 수집 절차](report-network-collection.md)대로 실제 인터페이스/프록시 TLS 종단을 확인하고 허가된 패킷 수집. pcapng가 없으면 미수집 유지. TLS 키/토큰 원문 공개 금지 |
| G11-09 | 운영 영속 볼륨·서버 재시작·읽기/쓰기 장애·느린 수신자의 실제 buffer·24시간 결과 삭제·호스트/프록시 로그 보관 정책 확인. 40세션/20대국과 실제 기기 병행, 망 RTT/손실 조건을 실제 기록 |

실기 준비 전 최소 재검사는 프로젝트 루트의 `node scripts/verify-integrated.mjs`. 화면 확인은 의존성이 준비된 개발 셸에서 `npm run dev` 후 독립 프로필 두 개로 입장→신청/승낙→준비→착수/채팅→승리→PNG/재도전이다. 이번 작업에서 공개 서버를 배포하거나 신뢰 HTTPS를 구축했다고 주장하지 않는다.

## 증거와 인수인계

실제 화면/앱 이벤트/자동 시험은 E11, 코드 기반 구조·OSI 설명은 C10, 미수집 패킷/실기 계획은 P10 및 G11로 구분한다. 역사 E9/E10 파일은 이전 빌드 그대로 보존했다. 모든 최신 성공 JSON의 completed와 build를 함께 확인한다. 이번 검증만으로 전체 실기 인수 완료를 선언하지 않는다.
