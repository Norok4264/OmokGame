# 개발 인수인계

기록 시점: 2026-11-12 (Asia/Seoul)  
현재 단계: 8단계 혼자 놀기·PWA 오프라인 완료(데스크톱); Android HTTPS gate는 11단계 필수
앱 버전: `0.1.0` (개발 뼈대; 완성 앱 버전 아님)

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
