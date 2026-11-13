# 개발 인수인계

## 최신 상태 — Android LAN 생명주기·복구 (2026-11-13)

Android source version `0.5.0-android-recovery` / versionCode 3, LAN protocol v3. LAN transport/SQLite는 Activity에서 분리한 `LanSessionService`의 connectedDevice FGS로 운용하고 사용자 알림 및 stop 동작을 추가했다. logical heartbeat 15초, 단절 30초, 복귀 유예 60초, deadline arbitration(같은 시각은 시간패), 재접속 인증→snapshot→입력 잠금 해제, Wi-Fi IP 변화 시 NSD/TCP 재설정을 구현했다. 클라이언트는 호스트 부재 중 승자를 생성하지 않는다. Android repository 재시작 시 pending 요청은 CANCELLED, ACTIVE 판은 원자적으로 ABORTED/SYSTEM_ABORT하며 저장된 FINISHED 결과는 유지한다. 자동 호스트 이전과 OS 생존 보장은 없다. 자세한 정책/공식 근거는 [android-lan-recovery.md](android-lan-recovery.md).

순수 Kotlin fake-clock recovery vectors 통과, 전체 Kotlin main source는 JDK17 + API36 android.jar 직접 컴파일 통과, Node24.22.3/npm12.2.2 typecheck 및 23 files/117 tests와 Vite8.3.7 asset build 통과. Gradle Wrapper8.13 빌드는 기본·승인 외부·ASCII Gradle cache·daemon 옵션 시도 모두 project configuration 전 `Unable to establish loopback connection`으로 실패해 APK 없음. adb1.0.41/platform-tools37.0.1-15733141 조회에서 기기 0대. Android SQLite/migration/FGS 알림/화면 꺼짐/실기 Wi-Fi 복구·강제 종료는 미검증이다. 한 차례 non-ASCII `GRADLE_USER_HOME` 호출은 child JVM classpath 경로 손상으로 별도 실패했으며, ASCII 경로 재시도에서도 loopback 문제가 재현됐다. evidence E15에 실제 시도들을 적는다.

## 최신 상태 — Android LAN 대국 구현 코드 (2026-11-13)

현재 앱 `0.4.0-android-lan`은 React/WebView의 자동 상대 목록·신청·승낙/거부/취소·후보/확정 보드와 Kotlin NSD/TCP v2·SQLite 권위 repository를 연결했다. UUID 사전순 host 선출, host-originated challenge offer와 peer-originated challenge, 30초 만료/취소/경합, applicant=white/acceptor=black(권위 역할은 별도), 15×15 흑 선공·60초 server deadline, resign, requestId content hash/replay, expectedRevision/snapshot이 구현되어 있다. Host own move도 remote move와 똑같이 `LanGameRepository.handle`을 거쳐 SQLite commit 이후 snapshot을 publish한다. 구체 설계·DB 표·닉네임 중복 범위는 [android-lan-game.md](android-lan-game.md).

검증: 고정 Node/npm `typecheck`, 기존 117개 전체 Vitest 통과, Vite 앱 asset build 통과. 설치 Kotlin compiler + SDK36 `android.jar`로 모든 main Kotlin 파일 compile, 별도 pure Kotlin 5목/장목/4방향/모서리/마지막 칸/무효착수 vectors 통과. Gradle `assembleDebug`는 daemon loopback 오류로 프로젝트 컴파일 전에 실패. APK 없음. adb 기기0, AVD `Medium_Phone_API_37.0` 목록만 있고 미실행. 따라서 DB Android runtime, Wi-Fi peer, 두 기기 동시 신청·양측 보드/revision/results는 아직 검증하지 않았다. 증거 [E14](evidence/android-lan-game-stage.json); 실제 Android acceptance AND-01~08은 미검증이다.

주의(당시 E14 기록): LAN TCP JSON은 평문이며 앱 종료/OS process kill 이후 자동 호스트 재개·이전은 미구현이다. E14 작성 시점에는 결과방 재도전/채팅/PNG 저장도 구현 전이었다. 이후 변경은 아래 E16 인수인계와 `android-lan-results-chat-png.md`를 기준으로 한다. E16에서 해당 기능의 소스와 정책 벡터는 추가됐지만 APK 빌드, Android DB/네트워크 런타임, 저장 PNG 실제 열기는 미검증이다. Gradle 실패는 소스 컴파일 실패로 판정할 수 없고 직접 Kotlin compile을 Android APK build로 간주하지 않는다.

## 최신 상태 — Android 화면·규칙·봇 재사용 단계 (2026-11-13)

현재 변경은 기존 PWA를 보존하면서 `android/`의 WebView에서 React 앱 자산을 실행하고, Kotlin `LanTransport` 브리지로 LAN 호스트/NSD 검색/선택/TCP ping-pong을 제공합니다. 홈/닉네임/LAN 진입/혼자 놀기, 보드 후보·확정·턴·승패 팝업은 기존 React 화면을 사용합니다. 혼자 놀기 규칙·봇 Worker·2초 제한과 합법 대체 수·오래된 응답 폐기·게임 복구/삭제를 그대로 재사용하며 기존 테스트 벡터 117건 전체가 고정 Node/npm에서 통과했습니다. 앱 자산 URL 경로 검토에서 발견한 `AssetManager` 경로 불일치를 고쳤습니다.

고정 Node.js 24.22.3/npm 12.2.2의 `typecheck`, `test`(23 files/117 tests), `build:web`는 통과했습니다. `:app:assembleDebug`는 Gradle 8.13/JDK17 프로세스의 loopback pipe 오류로 실패했고 APK는 없습니다. adb 1.0.41/platform-tools 37.0.1-15733141이며 연결 기기는 0, 등록 AVD는 `Medium_Phone_API_37.0`(미실행)입니다. 앱 설치/실행과 Android Worker·복구·화면·키보드 및 두 기기 LAN은 검증하지 않았습니다. 현재 LAN은 연결 진단용이며 신청/실시간 대국 sync는 후속 단계입니다. `AND-01~08` 전부 미검증. 정확한 명령/결과: [Android 하이브리드 증거](evidence/android-hybrid-stage.json), [인수 기준](acceptance.md).

## 최신 상태 — Android LAN 연결 시제품 1단계 (2026-11-13)

[구조 선택·버전·연결 경로와 검증 한계](android-lan-prototype.md)를 우선 확인한다. 기존 PWA 및 앞서 작업 중이던 변경은 보존했다. 제품 구조는 React/TypeScript 화면·공유 규칙/봇 + Kotlin 네이티브 NSD/TCP·수명/저장소/PNG adapter로 결정했다. 현재 `android/`에는 SDK36 target, host/search/select/JSON ping-pong/close 정리의 시제품이 있다. Gradle 8.13 Wrapper 실행은 JDK17.0.21.0.2에서 통과했지만 `assembleDebug`는 실행환경의 Gradle loopback pipe 오류로 프로젝트 빌드 이전 실패했다. APK, 앱 실행, NSD 발견/왕복은 확인되지 않았고 adb 실제 기기도 없다. AND-01~AND-08은 미검증. 다음은 Android Studio/대체 작업환경에서 Gradle build를 실행하고 AVD 또는 단일 기기에서 LAN 서비스 lifecycle smoke를 먼저 얻는 것이다. 연결 성공 전에는 게임 전체를 이식하지 않는다. 기존 보고서와 실제 결과는 [Android 증거 JSON](evidence/android-lan-prototype.json)에 기록했다.

## Android 전환 0단계 완료 — 2026-11-13

다음 작업은 [android-stage0.md](android-stage0.md)를 먼저 읽는다. 설치 도구 변경 없이 Studio/JBR/별도JDK17·SDK36/37·기본Node26/npm11·전용Node24/npm12를 확인했다. 현재 Android 프로젝트는 없고 Gradle 설정은 미설정이다. 기존 Windows 실행기 변경과 전환 문서를 보존했다. SDK/설정 접근은 기본 샌드박스에서 거부되어 승인된 읽기 조사로 확인했다. adb 조회 과정에서 daemon이 자동 시작됐으며 기기는 연결되지 않았다.

다음 단계에서 기술 방식 비교와 작은 LAN 연결 시제품을 진행한다. 먼저 실제 프로젝트 Gradle JDK/Daemon JVM을 선택·확인하고 Wrapper 버전을 실행해야 한다. 사용자에게 지금 추가 명령은 필요 없고 실제 두 기기 검증에는 Android 두 대가 필요하다. 이번에는 앱 코드 수정·테스트 재실행·APK 생성·도구 업그레이드를 하지 않았다.

## Android 전환 준비 — 먼저 읽기

2026-11-13 재개. [Android 전환 기준](android-transition.md)이 현재 제품 방향이다. 기존 PWA/증거/lockfile을 보존하며 최종 사용자는 두 Android 기기만 사용한다. 현재 APK는 없고 기술 구성·버전은 아직 미확정이다. 다음은 Android Studio 빌드 번호·IDE JBR·터미널 Java·Gradle JDK·SDK·Wrapper/AGP 호환성 조사다.

중단된 Windows 실행기 변경 4개는 보존했다. 현재 HEAD는 4585cd0이며 원격 서버를 이번에 조회하지 않았다. 앱 포트 3001/5173/4173의 LISTENING 없음만 확인했고 전체 프로세스 상태는 미확인이다. 이번 문서 변경은 앱 구현이나 테스트 통과 증거가 아니다. 사용자에게 현재 추가 조작은 필요 없다.

기록 시점: 2026-11-12 (Asia/Seoul)  
현재 단계: 11단계 배포 구성·CI·소스 전달 준비; 실제 서버/Android HTTPS 인수는 미해결
앱 버전: `0.1.0` (구현 검증 중; 실기 전체 인수 미완료)

## 완료 범위

신규 PWA 프로젝트를 기존 위치에 구성했다. npm workspaces는 `apps/web`, `apps/server`, `packages/shared`를 포함하며 문서는 `docs/`에 있다. React·TypeScript·Vite 웹, Node.js HTTP/`ws` 서버, 공통 계약 패키지와 SQLite migration/repository가 있다. 정확한 직접 의존성 버전과 npm lockfile v3을 기록했다. 2026-11-12 확인 당시 `main`의 `29686d0` (`화면과 반응형 조작 구현`)은 `origin/main`과 동기화되어 있었고 작업 트리는 깨끗했다. 현재 계정 전환 인수 문서와 문서 교정은 그 기준 뒤의 로컬 변경이다. 계정 전환/작업 안내는 [`account-switch-handoff.md`](account-switch-handoff.md)를 우선 참고한다.

초기/대기열/혼자 놀기와 실제 WebSocket 온라인 착수·60초·승패·기권·복구를 구현했다. 최신 7단계에서 결과방 5분, 패자 재도전/승자 승낙, 서버 채팅과 결과 PNG를 연결했다. 15개 파일/80개 테스트 및 타입·빌드 통과. 실제 IME·다운로드 PNG 파일 열기는 Computer Use URL 정책 차단으로 미검증이다. 최신 정책은 stage7-results-chat-png.md와 recovery-policy.md를 따른다. 원문 닉네임 허용 문자/예약어 목록 재대조는 여전히 남아 있다.

## 생성·수정 파일

- 루트: `.gitignore`, `.env.example`, `package.json`, `package-lock.json`, `tsconfig.base.json`, `vitest.config.ts`, `README.md`, `scripts/dev.mjs` (Windows에서 웹·서버 개발 프로세스를 직접 실행)
- `apps/web`: Vite 설정, manifest/icon, HTML, React 화면, package/TypeScript 설정
- `apps/web/src/App.tsx`, `styles.css`, `bot.ts`, `public/omok-hero.svg`: 화면·반응형 스타일·개발용 로컬 봇 및 목재 오목판 에셋
- `apps/web/src/lobby-client.ts`: browser WebSocket, sessionStorage restore, 8초 auth deadline, reconnect retry, heartbeat, snapshot/command 처리
- `apps/server/src/lobby.ts`: 세션 인증, 닉네임 예약, 대기실 스냅샷, 신청 transaction/권한, 준비 상한·카운트다운/취소
- `packages/shared/src/nickname.ts`, `nickname.test.ts`: 닉네임 정규화/검증 (예약어 원문 목록 재확인 필요)
- `apps/server/src/lobby.test.ts`: 독립 WebSocket 클라이언트 A02/A03 경합·권한·복구·게스트·준비·취소 검증
- `apps/server`: HTTP·WebSocket 진입점, 설정, health/readiness, SQLite DB/migration/repository, 테스트, package/TypeScript 설정
- `packages/shared`: 상태·ID·프로토콜 버전 타입, 양방향 메시지 계약과 런타임 parser, 테스트
- `packages/shared/src/rules.ts`, `rules.test.ts`: 순수 15×15 규칙 엔진과 의미 있는 규칙 테스트
- `scripts/check-server.mjs`
- `docs/environment.md`, `requirements.md`, `protocol.md`, `acceptance.md`, `handoff.md`, `evidence-index.md`

SQLite는 루트 `data/omok.sqlite`를 생성한다. DB/WAL/SHM은 `.gitignore` 대상이며 이번 검증 실행이 만든 데이터 파일은 로컬에 남아 있을 수 있다.

## 버전·환경 기록

Codex 원격 작업 셸에서 확인한 값: Windows 10.0.22631, PowerShell 7.6.9, Node v24.22.1, pnpm 11.25.0, Git 2.54.0.windows.1. npm은 PATH에 없어서 npm CLI 12.2.2를 `pnpm dlx npm@12.2.2`로 불러 실행했다. 이를 사용자의 PC 환경으로 간주하지 않는다. 사용자 PC Node/npm/Git/Chrome·Edge 버전은 미확인이다. PWA 경로라 Android Studio/Gradle/JDK는 비적용이다.

직접 dependency 버전은 package.json에 정확히 고정했다. `package-lock.json`은 npm lockfileVersion 3이며 워크스페이스 연결도 포함한다. npm 12는 install scripts를 기본 차단했으므로 npm 공식 프로젝트 allowlist 정책으로 `better-sqlite3@13.0.3`, `esbuild@0.28.2`만 `allowScripts`에 고정 허용했다. 두 패키지 `npm rebuild`가 성공했고 뒤이어 SQLite 테스트 8개가 통과했다. install audit은 “2 moderate severity vulnerabilities”를 보고했으며 상세 항목 조사나 자동 수정은 하지 않았다. [npm install docs](https://docs.npmjs.com/cli/v12/commands/npm-install/)

## 실제 실행 명령과 결과

모두 `C:\오목게임` Codex 셸에서 실행했다.

| 명령/확인 | 결과 |
|---|---|
| `pnpm dlx npm@12.2.2 run typecheck` | 종료 코드 0 |
| `pnpm dlx npm@12.2.2 test` | 3 test files, 8 tests passed |
| `pnpm dlx npm@12.2.2 run build` | 종료 코드 0, Vite 8.3.7 웹 산출물 생성 |
| `pnpm dlx npm@12.2.2 install-scripts approve better-sqlite3 esbuild` | 현재 버전 `better-sqlite3@13.0.3`, `esbuild@0.28.2`만 `allowScripts`에 등록 |
| `pnpm dlx npm@12.2.2 rebuild better-sqlite3 esbuild` | `rebuilt dependencies successfully` |
| `pnpm dlx npm@12.2.2 test` (rebuild 후) | 3 test files, 8 tests passed |
| `pnpm dlx npm@12.2.2 test` (규칙 모듈 추가 후) | 4 test files, 25 tests passed |
| `pnpm dlx npm@12.2.2 run typecheck` (규칙 모듈 추가 후) | 종료 코드 0 |
| `pnpm dlx npm@12.2.2 exec -- tsc -p packages/shared/tsconfig.json` | 규칙 테스트 포함 shared 전체 TypeScript 검사, 종료 코드 0 |
| `pnpm dlx npm@12.2.2 run build` (규칙 모듈 추가 후) | 종료 코드 0; shared/server TypeScript 및 Vite 웹 빌드 성공 |
| `pnpm dlx npm@12.2.2 run typecheck` (화면 단계 최종) | 종료 코드 0 |
| `pnpm dlx npm@12.2.2 test` (화면 단계 최종) | 4 test files, 25 tests passed |
| `pnpm dlx npm@12.2.2 run build` (화면 단계 최종) | 종료 코드 0; Vite 8.3.7 |
| 마지막 `pnpm dlx npm@12.2.2 run typecheck/build` 재시도 | 실행기 오류 `EPERM: realpath 'C:\Users\Administrator'`; 해당 두 시도는 검사/빌드로 계산하지 않음 |
| `node_modules/.bin/tsc.cmd -p packages/shared/tsconfig.build.json` | 종료 코드 0 |
| `node_modules/.bin/tsc.cmd -p apps/server/tsconfig.json --noEmit` | 종료 코드 0 |
| `node_modules/.bin/tsc.cmd -p apps/web/tsconfig.json --noEmit` | 종료 코드 0 |
| `node_modules/.bin/vitest.cmd run` (최종) | 6 test files, 39 tests passed; 실제 독립 `ws` client 포함 |
| `node_modules/.bin/tsc.cmd -p apps/server/tsconfig.build.json` | 종료 코드 0 |
| `node_modules/.bin/vite.cmd build apps/web --config apps/web/vite.config.ts` | 종료 코드 0; Vite 8.3.7 |
| `pnpm dlx npm@12.2.2 run dev` (화면 단계 최종) | `scripts/dev.mjs` 교정 후 Vite 5173 및 서버 3001 동시 시작 |
| GET `/`, `/api/readyz`, `/healthz` (화면 단계 최종) | 웹 200 / title `단판 오목`, readiness `ready`와 `sqlite=true`, health `ok` |
| `pnpm dlx npm@12.2.2 run check` | 실패: `check` 스크립트 없음. 서버용 스크립트 이름은 `check:server`; HTTP 응답은 개발 서버에 직접 요청해 확인 |
| `node scripts/dev.mjs` (이번 최종 재시도) | 시작 실패: tsx 내부 `uv_os_get_passwd returned ENOMEM`. 원격 셸 사용자 프로필 접근 문제로 기록 |
| `node apps/server/dist/index.js` 및 별도 `vite.cmd ... --host 127.0.0.1` | 컴파일 서버 `127.0.0.1:3001`, Vite `127.0.0.1:5173` 실행 성공; HTTP 확인 후 두 프로세스 종료 |
| GET `http://127.0.0.1:5173/` | HTTP 200, title `단판 오목` 포함 확인 |
| GET `http://127.0.0.1:3001/healthz` | `status=ok` |
| GET `http://127.0.0.1:3001/readyz` | `status=ready`, `checks.sqlite=true` |
| 계정 전환 기준 Git 확인 (2026-11-12) | `C:/오목게임`, `main`, `29686d0`=`origin/main` 확인 당시 clean. 이번 4단계 작업은 그 기준 뒤의 로컬 변경 |

Codex 브라우저 localhost의 이전 360×800·1280×900 렌더 확인은 E3 증거다. 이번 단계 직접 통신 증거는 Vitest에서 만든 독립 `ws` client 두 개와 실제 localhost 서버 연결이다. 사용자 PC/Android/외부망 브라우저의 신청 동작은 미검증이다. 캡처 파일은 보관하지 않았다. 실제 착수·채팅·실기기·OSI/패킷·배포·성능은 미검증이다. root dev 프로세스는 HTTP 확인 뒤 종료했다.

## `.gitignore`와 Git 상태

`.gitignore`는 node_modules, 산출물/캐시/로그/coverage, 실제 `.env`와 비밀·인증 파일, SQLite 및 WAL/SHM, 개인 IDE/OS 설정, 향후 Android local.properties/.gradle/build/서명 파일을 제외하고 Gradle Wrapper 자체는 제외하지 않도록 작성했다. `.env.example`, 소스, 정적 에셋, 테스트, lockfile, 문서는 제외하지 않는다.

커밋 `29686d0` 기준으로 기존 소스는 원격과 동기화되어 있었다. 새 인수 문서와 관련 문서 변경은 아직 로컬 미커밋 변경이다. 새 세션에서 `git status --short --branch`와 `git ls-files -ci --exclude-standard`를 다시 확인한다. `.gitignore`는 이미 추적된 파일에 자동 적용되는 규칙이 아니다.

## 다음 단계

1. PREPARING/ACTIVE 화면에 서버 스냅샷을 결합하고 후보/확정 동작을 실제 `game.move.propose` 권위 판정에 연결한다.
2. 착수의 requestId/revision/시간 판정 및 검증 → SQLite 원자 저장 → commit → 양측 이벤트 전달 순서를 구현한다. 서버 승인 전 UI 보드에는 돌을 두지 않는다.
3. 게임 중 reconnect/snapshot 복구, 결과/기권/시간 제한을 추가한 뒤 재도전·채팅·PNG·오프라인 PWA·통신 보기와 기기 검증을 진행한다.

다음 Codex 세션은 우선 `README.md`와 `docs/environment.md`, `docs/requirements.md`, `docs/protocol.md`, `docs/acceptance.md`, `docs/handoff.md`, `docs/evidence-index.md` 및 실제 소스를 읽는다. 전체 구조를 다시 만들지 않는다.

## 5단계 온라인 착수·시간·종료 (2026-11-12)
최신 구현/명령/결과와 E6-01~E6-03 증거는 [online-authority.md](online-authority.md)에 기록했다. 최종 7개 파일/44개 테스트 통과. A04/A05의 서버 착수·권한·양측 보드/revision/승자, 종료 후 중복 요청 재확인 및 저장 실패는 로컬 서버/SQLite 범위에서 부분 확인이다. 이전 단계의 미구현 기록은 당시 상태다. 실기기/브라우저 화면·실제 60초 대기·네트워크 장애 주입은 미검증이다.

## 6단계 복구 정책 (최신)
앱 0.1.0. 15초 heartbeat/30초 단절/60초 복귀, 마감 우선순위, socket 세대 격리, startup/DB 장애 정리를 구현했다. 10개 파일/61개 테스트 통과. B01~B06은 자동 시험 범위에서 부분 확인이며 실제 모바일·망 전환은 미실행이다. E7-01~E7-06과 실제 명령·한계는 [recovery-policy.md](recovery-policy.md)를 따른다. 이전 단계의 12초 유예/DB 실패 후 진행 설명은 역사 기록이다.

## 7단계 결과·재도전·채팅·PNG (최신)
앱 0.1.0. 7-1~7-3 구현. 15개 파일/80개 테스트, 타입 검사·서버/웹 빌드 성공. 실제 두 WebSocket client로 재도전·새 판 준비와 한글 채팅을 확인했다. E8-01~E8-06, 실제 명령·정책·실패/미검증 항목은 [stage7-results-chat-png.md](stage7-results-chat-png.md)에 기록한다. 브라우저 현재 URL을 확인할 수 없어 Computer Use 정책 검사가 중단됐으며 실제 한글 조합키·다운로드 PNG 파일 열기는 미검증이다.

## 8단계 혼자 놀기·오프라인 (최신)
앱 0.1.0 / 빌드 0.1.0-a8604a3cbbe94a98. 19개 파일/93개 테스트 및 타입·빌드 성공. Chrome·Edge 격리 headless 최종 빌드에서 준비→offline→완전 종료/재실행→복구→9수 봇 승리, 백/흑/종료 복구·새 ID·저장 삭제를 실제 확인했다. 2창 업데이트 보류/홈 적용도 통과. E9-01~E9-06, 캡처/JSON은 [stage8-solo-offline.md](stage8-solo-offline.md). Android 신뢰 HTTPS 실기는 미검증이며 11단계에서 반드시 다시 확인해야 한다.

## 9단계 최신 인수인계

실제 LobbyClient 송수신에 통신 보기를 연결했다. 최근 200건 메모리, 허용 필드 요약, 토큰/본문 제외, 원본 JSON UTF-8 크기, 로컬 응용 왕복시간을 표시한다. 새로운 의존성/lockfile 변경 없음. 앱 0.1.0 / 빌드 0.1.0-9aa3175978d99527, 20개 파일/99개 테스트 및 최종 빌드 Chrome 두 세션 확인. 구체적 변경 파일·명령·실패 교정·실제 증거·최소 조작은 [stage9-communication.md](stage9-communication.md).

[보고서 Ⅱ·Ⅲ 자료 수집](report-network-collection.md)에 현재 구조도와 A→서버→B 흐름도를 작성했다. E10은 실제 앱 관측, C10은 개념 설명, P10은 패킷 수집 안내다. 실제 Wireshark 캡처·WSS 배포/복호화·Android 실기는 없다. 다음은 실제 캡처와 11단계 실기 종합 검증이며 Android 신뢰 HTTPS 오프라인 gate를 유지한다. 이전 단계의 WSS 단어만으로 TLS 검증 완료를 주장하지 않는다.

## 10단계 최신 인수인계 — 먼저 읽기

[통합 검증표·수정·명령·성능 범위·11단계 게이트](integration-validation.md)를 최신 기준으로 삼는다. 앱 0.1.0 / 웹 0.1.0-8f52d08ed448ebe3, migration 5, 타입/빌드와 22개 파일/115개 테스트 성공. 고정 의존성/lockfile 유지. Origin 정확 허용, 8KiB/100건10초/1MiB, 40세션/20대국, 종료24h 원자 정리·결과 조회 전용/취소, 재도전 취소·10초, 여러 창 중지/업데이트 안내, 채팅 스크롤/숨김/실패 보존 및 승인 전송 범위를 보완했다.

최종 Chrome 157.0.8103.51 / Edge 157.0.4341.46 실제 격리 브라우저 대국·PNG 파일 열기·오프라인 재실행·업데이트, 별도 Node 프로세스/파일 WAL DB 재시작을 확인했다. 같은 호스트이므로 PC-PC 실기로 세지 않는다. adb 실제 목록은 비어 있고 Android Chrome 버전/실제 두 PC/신뢰 HTTPS·WSS/패킷은 없다. G11-01~09를 다음 단계에서 실제 수집한다. 사용 한도 때문에 미완료로 남긴 구현은 없으며 없는 장비를 시험한 것으로 바꾸지 않는다.

실제 기록은 E11, 개념은 C10, 미수집 안내는 P10/G11로 구분. 기존 8/9단계 파일은 역사 증거로 보존. 다음 계정은 `node scripts/verify-integrated.mjs`로 현재 타입/테스트/빌드를 재현하고, 필요하면 시험 전용 preview/3001 환경에서 브라우저 스크립트를 실행한다. 실행 조건·번들 경로는 통합 문서 참조. 실제 런타임 data/omok.sqlite를 시험으로 초기화하지 않는다.

## 11단계 최신 인수인계 — 우선 적용

[release-handoff.md](release-handoff.md)와 개정 README가 최신 실행 기준이다. 앱0.1.0 / Windows 웹0.1.0-8f52d08ed448ebe3, Node24.22.3/npm12.2.2의 독립 npm ci→타입→117개 시험→빌드 성공. 전역 Node24.22.1/기존 의존성/lockfile 유지. OCI digest·checkout SHA를 고정한 최소 CI, 단일 Node + Caddy 동일 HTTPS 출처/영속 SQLite 볼륨 Compose 구성을 추가했다. Docker/공개 서버/CI run은 실제 실행하지 않았다.

이번에는 Npcap loopback 실제 332프레임·4 TCP stream/HTTP101 4건과 브라우저 착수9/채팅2를 대조했다. 원본 pcap은 private-captures에만 있고 공개 전달본에서 제외. E12는 실제 관측, C10은 개념, 실제 WSS·물리 NIC/Android는 미검증이다. Caddy 구문/로컬 HTTP proxy·WS 16초 유지 확인 및 bounded shutdown을 추가했다.

실제 remote main=로컬 기준 HEAD31d2096727f18b52eae1c487877065b757e0732d를 확인했으나 새 변경 push/배포는 하지 않았다. 최신 미커밋 소스 전달본은 releases/danpan-omok-source-0.1.0.tar.gz + SHA256SUMS + SOURCE_MANIFEST. `check-release.mjs`→`package-source.mjs`, 압축 해제 `verify-source.mjs`로 재현한다. 개인 학번/성명 보고서는 공개 코드와 별도이다.

실제 adb 연결0·신뢰 도메인/서버 없음. Android HTTPS/WSS·설치/오프라인/PNG/재접속, 실제 두 기기 조합과 Linux volume/signal/CI는 11단계 게이트가 미해결이다. 환경 확보 후 같은 게이트를 다시 시험한다. 과거 stage10/evidence는 보존했으며 최신 실제 자료는 E12 색인 참조.

## Android LAN 결과·재도전·채팅·PNG·통신 보기 — 최신 인수인계 E16

현재 앱 소스는 `0.6.0-android-results-chat-comm`, versionCode4, Android LAN protocol v4, SQLite schema3다. 기존 PWA·에셋·npm lockfile·앱 구조는 유지했다. 최신 기능과 정책은 [android-lan-results-chat-png.md](android-lan-results-chat-png.md), 실제 명령과 검증 한계는 [E16 JSON](evidence/android-lan-results-chat-png-stage.json)에서 확인한다.

결과방 5분/재도전 응답 30초 제한/요청자 백·응답자 흑, chat 최근100/messageId 수동 재시도/IME·초안 처리, Android MediaStore·SAF 저장/열기·공유, 실제 TCP RPC 이벤트 안전 로그 코드를 반영했다. TS 타입 검사, 23개 파일/117개 테스트, Vite WebView assets, Android-free fake-time 정책 vectors, 전체 main Kotlin source direct compile은 통과했다. Android Studio Kotlin compiler2.4.0 direct compile은 프로젝트 Gradle Kotlin plugin2.3.10 task와 APK를 검증한 것이 아니다.

JDK17 지정 및 IPv4 preference가 포함된 Gradle Wrapper8.13 `:app:assembleDebug`가 `Unable to establish loopback connection`으로 시작 중 실패했다. USB debugging 승인 후 SM-N981N(Android 13/API 33, Chrome157.0.8103.50)과 SM-X510(Android 16/API 36, Chrome157.0.8103.78) 두 기기가 실제 ADB `device` 상태로 확인됐다. 연결된 기기로 다시 시도한 APK 빌드도 같은 오류로 실패해 설치하지 못했다. 따라서 실제 DB migration/transaction·두 기기 LAN·결과 재도전·한글 IME·PNG 저장 후 Android 앱에서 파일 열기/공유·통신 보기 화면은 모두 미검증이며 PNG/screenshot/패킷 캡처도 아직 없다. 기존 PWA Android HTTPS/오프라인 검증도 신뢰 HTTPS 서버/도메인이 없어 별도 미검증이다.

다음 단계는 Windows loopback/Gradle 초기화 문제를 해결하거나 제한된 환경을 벗어나 APK를 빌드하는 것이다. 이미 확인된 두 Android 기기에 설치한 뒤 승패 결과→승자 저장/열기→패자 재도전→새 gameId/배정→채팅 중복 수동 재시도/한글 조합→통신 보기 양측 대조를 실행한다. 이후 5분 결과방 만료와 30초 경계도 가짜 시계/실기 결과를 분리해 확인한다. 현재 Android 설치파일이나 저장 PNG 결과를 사용자에게 전달할 수 없다.

### Android 두 기기 연결 후속 업데이트 — 2026-11-13

위 E16 최초 단계 기록 이후 USB debugging 승인을 받아 Android 기기 두 대가 ADB `device`로 나타났다. JDK17 Gradle의 Windows loopback/Unix-domain temporary path 문제를 process-only `java.io.tmpdir`/`jdk.net.unixdomain.tmpdir` 설정과 ASCII `subst X:` 경로로 우회하고 SDK env를 임시 지정했다. KGP 2.3.10이 거부한 구 `kotlinOptions.jvmTarget`을 `kotlin.compilerOptions.jvmTarget`으로 바꾼 뒤 `:app:assembleDebug` 성공, APK 실제 설치·실행까지 확인했다. 전역 Java/Node/Android 도구 설정은 건드리지 않았다.

두 기기에서 NSD는 첫 시도에 version mismatch를 보여 주었다. source에서 advertise v4/discovery expected v3 불일치를 찾아 양쪽을 같은 v4 상수로 맞추고 다시 빌드·설치한 뒤 상대 자동 검색에 성공했다. 신청/승낙·초기 snapshot, 양쪽 시간패 결과 revision1, 승자 PNG 저장 후 Samsung Gallery 열기, 패자 재도전 요청/승낙 후 새 빈 판 revision0 및 요청자 백·응답자 흑의 새 색 배정을 확인했다. 이 실기에서는 유효 착수/5목은 만들지 않았고 착수 동기화 통과로 분류하지 않는다.

채팅 시도는 초안이 남았고 전송 완료/수신 증거가 없어 미통과다. 통신 보기, IME 조합, 중복 재시도, SQLite 오류/경합, 마감 경계, 호스트 강제 종료/일반 단절/망 전환, Android 공유는 아직 미검증이다. 단계별 기록과 실제 화면은 [인수 기준](acceptance.md) 및 [E16 후속 증거 인덱스](evidence-index.md#android-lan-e16-후속-기기-검증)를 참조한다. 이전 “APK 없음/기기 시험 불가” 문장은 E16 최초 시점의 이력이며 현재 상태가 아니다.

### Android 통합 재검증 E17 — 2026-11-13

이번 요청에 따라 기기·공유망·앱·권한을 다시 읽고 설치 앱으로 절차를 재현했다. 두 기기는 SM-N981N Android13/API33과 SM-X510 Android16/API36, app v0.6.0/versionCode4. 둘 다 같은 WPA2-Enterprise SSID 및 IPv4 `/21`/gateway에 있었고 NSD 상대 검색/신청/승낙이 작동했다. Android는 Wi-Fi를 `VALIDATED/INTERNET`으로 보고했고 휴대전화 cellular IMS도 연결 중이라 인터넷 없는 Wi-Fi 조건은 만들지 못했다. 알림 권한은 phone 거부/tablet 허용. 정확한 개인 SSID/BSSID/IP/serial은 저장하지 않았다.

새 game revision0 및 후보 미리보기는 확인했으나, 실제 도구/화면 조작 사이 제한시간이 만료되어 이 차수에 확정된 착수는 없다. 채팅 패널도 열었지만 본문 전송·상대 도착은 성공하지 못했다. 이 차수는 코드 오류를 새로 수정하지 않았으며 재현한 failure가 앱 버그라고 확정된 경우만 수정한다. 실제 결과·A/B 및 Android 요구 대응표는 [E17 JSON](evidence/android-lan-integration-stage.json), [acceptance.md](acceptance.md), [evidence-index.md](evidence-index.md) 참조.

다음 실제 인수에는 동일 Wi-Fi 두 기기로 시간 여유를 두고 유효 착수/상대 revision을 먼저 확인한 뒤 채팅·결과·PNG·재도전을 수행한다. 인터넷 차단 공유기/guest isolation은 네트워크 관리자 제공 테스트 SSID가 있어야 한다. 호스트 UUID를 교체하려면 앱 데이터 초기화가 필요해 이번에는 기존 로컬 데이터를 지우지 않고 호스트 교환을 미검증으로 남겼다. 3대 이상 기기 없이는 다중 상대와 3-way 경합을 실기로 검증할 수 없다. screen-off/force-stop/Wi-Fi reconnect는 실제 기기에서 안전하게 재현할 때까지 검증하지 않는다.

### Android 실기 다음 단계 E18 — 2026-11-13

이번 차수는 실제 두 대(SM-N981N Android13/API33, SM-X510 Android16/API36)에서 수행했다. 앱 v0.6.0/versionCode4 및 ADB 1.0.41/platform-tools37.0.1-15733141 확인. 상대 검색→guest2 신청→guest1 승낙→태블릿 H8 후보·확정→SQLite에 BLACK H8 revision1 저장→양쪽 결과 TIMEOUT/revision2 일치를 확인했다. 이어 패자 요청·승자 승낙으로 새 빈 판/revision0와 빈 채팅을 보고, 태블릿에서 보낸 메시지가 “전송 완료”가 되며 권위 DB에 sequence1/body length10으로 저장된 것을 봤다. 수신 전화기 화면 확인 중 제한시간이 만료되어 수신 표시 자체는 미검증이다. PNG 파일은 이번 회차에 생성/열지 않았으며 E16 Gallery 증거가 별도로 유지된다. 상세 결과/실제 캡처: [E18 JSON](evidence/android-lan-integration-followup-2.json), [증거 인덱스](evidence-index.md#android-두-기기-실기-후속-e18).

이번에는 앱 소스 변경이나 자동 테스트 재실행을 하지 않았다. Android network가 E17과 동일 조건이며 Wi-Fi `VALIDATED/INTERNET`·전화기 cellular active라 무인터넷 WLAN은 미확인. 다음 실기 우선순위는 제한시간을 쓰지 않는 채팅 양측 수신 확인(메시지 전송 직후 수신기 하단 채팅 캡처), 한글 IME/중복 ID, 5목 승리와 PNG 열기, 그 다음 단절/재접속·호스트 재시작·Wi-Fi 전환이다. 가능하면 화면 캡처 및 결과 확인 사이에 자동 대기하지 말고 shell 명령으로 해당 UI를 즉시 캡처한다. 별도 격리 SSID와 세 번째 피어는 자원이 확보되기 전까지 미검증으로 유지한다.

### E19 사용자 저장 채팅 증거 확인 — 2026-11-13

사용자가 각 기기 `DCIM/Screenshots`에 남긴 두 장을 직접 확인했다. SM-X510 태블릿은 `나 · guest1 ㅎㅎ` 파란 메시지를, SM-N981N 휴대전화는 동일 본문을 `상대 · guest1` 빨간 메시지로 보여 준다. 따라서 Android 실기 기본 채팅 송신·상대 수신·표시 색은 확인 완료다. [E19 증거 JSON](evidence/android-lan-chat-followup.json), [태블릿 송신](evidence/android-e19-chat-sent-tablet.jpg), [휴대전화 수신](evidence/android-e19-chat-received-phone.jpg). 한글 IME 조합, 중복 ID/재시도, rate/길이 경계는 여전히 미검증이다.

### Android APK 전달 E20 — 2026-11-13

이번 단계에서 Node 24.22.3/npm 12.2.2로 Android WebView 자원을 빌드하고, Gradle Wrapper 8.13/AGP 8.13.2/Kotlin 2.3.10을 Microsoft JDK17.0.21.0.2로 실행해 debug APK를 실제 생성했다. Android Studio build `AI-262.10968.63.2622.16730706`; IDE JBR는 25.0.4이며 Gradle build JVM으로 사용하지 않았다. `:app:assembleDebug --rerun-tasks` 결과 36 tasks/23초 `BUILD SUCCESSFUL`. AGP 경로 제한 때문에 현재 한글 폴더는 임시 ASCII drive alias로 접근했으며, 재빌드 안내는 ASCII checkout을 사용한다.

`releases/android/danpan-omok-0.6.0-debug-v4.apk`: package `kr.danpan.omok`, version 0.6.0/versionCode4, protocol v4, minSdk23/targetSdk36/compileSdk36, 6,811,218 bytes, SHA-256 `58327D65591BA53404B42B0DBE5EC3564529CFBAB6D511FD782073E97F307576`. `aapt` metadata and `apksigner verify` succeeded. `adb install -r` succeeded on SM-N981N Android13/API33 and SM-X510 Android16/API36; package metadata on both reports versionCode4. No user data clear was performed. This confirms APK packaging/install only and does not replace user's remaining gameplay/network checks.

Only the Android debug certificate is used. No release signing key was created, replaced, or copied. The APK is Git-ignored under `releases/`; source, Wrapper, lockfile, assets/licenses, tests, and docs are the source submission. `.gitignore` candidate scan found no tracked key/local database/build/log/capture/release artifacts. Personal report, student number, and name were not added. See [reproduction/install guide](android-delivery.md), [E20 JSON](evidence/android-apk-delivery.json), and [acceptance](acceptance.md).

## E21 Android 0.7.0 세션·신청 수정

[변경 파일·명령·실제 결과·실패 수정·미검증](android-lan-session-fix.md). 앱 versionCode5 / protocol v5. 두 기기 설치 및 각 3건 Android SQLite/정책 시험 통과. 태블릿 신청→휴대전화 호스트 대국 실기 확인. 반대 방향 UI·실제 동시 신청·공란 재입장·종료 재실행은 사용자 확인 대기. 결과 후 나가기의 홈 이동은 기존 대기열 복귀 요구와 불일치하여 후속 수정 대상으로 기록한다. 기존 A/B 번호와 과거 PWA 증거를 보존한다.

## E22 AndroidX AAR 호환성 — 2026-11-13

첨부 오류는 compileSdk/minSdk 설정 자체보다 AndroidX 의존성 버전 충돌이었다. android/gradle/libs.versions.toml에서 core-ktx 1.19.1→1.17.0, lifecycle 2.11.0→2.9.4로 내리고 Compose plugin Kotlin 2.2.10을 앱의 Kotlin 2.3.10으로 맞췄다. compileSdk36/minSdk23/targetSdk36, AGP8.13.2, Wrapper8.13은 유지했다. AGP 8.13 공식 최대 지원 API 36.1; AndroidX Core 1.17.0은 API36으로 명시되어 있다.

실행: Gradle Wrapper 8.13/JDK17에서 :app:assembleDebug 성공, APK 갱신됨(2026-11-13 06:30:31 UTC, 17,836,252 bytes). android.overridePathCheck=true는 비ASCII 경로 검사를 통과시키는 설정이고 실빌드는 임시 ASCII 경로 별칭으로 수행했다. SDK XML v4 parser warning과 Kotlin/Android deprecated API warning은 남아 있다. 두 기기 재설치·런타임 대국은 이번 변경에서 하지 않았다.

변경: android/gradle/libs.versions.toml, android/gradle.properties(한글 경로 검사 옵션). AAR 충돌 해결의 근거는 Android 공식 [AGP 8.13 release notes](https://developer.android.com/build/releases/gradle-plugin#8-13-0)와 [AndroidX Core release notes](https://developer.android.com/jetpack/androidx/releases/core)다.

## E23 저장소 정리 — 2026-11-13

`.cache`의 재생성 가능한 과거 브라우저 프로필, 시험용 설치 복사본, 임시 소스 압축/검증 디렉터리 42개(약 1,448.6 MiB)를 삭제했다. 고정 Node24.22.3/npm12.2.2 도구(`.cache/tools`), npm 다운로드 cache, 작업 기록 JSON은 보존했다. APK, 서명 keystore, `releases`, SQLite `data`, `private-captures`, docs/evidence는 건드리지 않았다.

Android APK는 `apps/web`에서 생성한 UI 자원을 WebView assets로 포함하고 `packages/shared` 규칙/봇을 사용한다. `npm run build:web`도 루트 package.json, package-lock, apps/web, packages/shared를 요구한다. 따라서 이들 웹/공유 소스를 PWA 전용으로 보고 삭제하면 Android 빌드가 깨진다. `apps/server`, deploy 설정은 Android 앱 실행 경로에서 사용하지 않지만 root npm workspaces/scripts와 과거 통합시험·증거가 참조해 이번에는 남겼다.

Android Studio가 만든 최상위 app/ 및 Gradle scaffold와 android/app 안에 추가된 com.example Compose scaffold가 현재 git index에 staged 상태였다. 사용자 staged 변경으로 보존하고 삭제하지 않았다. 차후 PWA server 제거를 원하면 먼저 npm workspace/lockfile/CI/test scripts의 서버 의존성을 분리하고 과거 PWA 증거를 보관 구조로 옮긴 뒤 별도 단계에서 검토한다.
