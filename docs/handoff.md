# 개발 인수인계

기록 시점: 2026-11-12 (Asia/Seoul)  
현재 단계: 3단계 화면 뼈대 및 상호작용 구현 완료
앱 버전: `0.1.0` (개발 뼈대; 완성 앱 버전 아님)

## 완료 범위

신규 PWA 프로젝트를 기존 위치에 구성했다. npm workspaces는 `apps/web`, `apps/server`, `packages/shared`를 포함하며 문서는 `docs/`에 있다. React·TypeScript·Vite 웹, Node.js HTTP/`ws` 서버, 공통 계약 패키지와 SQLite migration/repository가 있다. 정확한 직접 의존성 버전과 npm lockfile v3을 기록했다. 현재 경로는 Git 작업 트리지만 아직 커밋은 없고 생성 파일은 모두 untracked 상태다.

화면 단계에서 초기/대기열/온라인 대국/결과 팝업/혼자 놀기 UI를 추가했다. 혼자 놀기는 백 사용자의 착수와 흑 로컬 봇 응답을 공유 규칙 엔진으로 계산한다. 온라인 모드는 명확한 DEVELOPMENT PREVIEW 라벨을 가진 로컬 시뮬레이션으로, 실제 로비·소켓 대국·서버 승인·채팅·재도전 기능은 연결되지 않았다. 결과 팝업은 PNG 다운로드 흐름 UI를 제공하나 실제 파일 다운로드 검증은 하지 않았다. 브라우저 내 결과 팝업 Tab 초점 순환 및 360×800·1280×900 localhost 화면을 관찰했다. Android 기기/키보드, 오프라인 재실행, 접근성 대비 측정은 미검증이다.

## 생성·수정 파일

- 루트: `.gitignore`, `.env.example`, `package.json`, `package-lock.json`, `tsconfig.base.json`, `vitest.config.ts`, `README.md`, `scripts/dev.mjs` (Windows에서 웹·서버 개발 프로세스를 직접 실행)
- `apps/web`: Vite 설정, manifest/icon, HTML, React 화면, package/TypeScript 설정
- `apps/web/src/App.tsx`, `styles.css`, `bot.ts`, `public/omok-hero.svg`: 화면·반응형 스타일·개발용 로컬 봇 및 목재 오목판 에셋
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
| `pnpm dlx npm@12.2.2 run dev` (화면 단계 최종) | `scripts/dev.mjs` 교정 후 Vite 5173 및 서버 3001 동시 시작 |
| GET `/`, `/api/readyz`, `/healthz` (화면 단계 최종) | 웹 200 / title `단판 오목`, readiness `ready`와 `sqlite=true`, health `ok` |
| `pnpm dlx npm@12.2.2 run check` | 실패: `check` 스크립트 없음. 서버용 스크립트 이름은 `check:server`; HTTP 응답은 개발 서버에 직접 요청해 확인 |
| `pnpm dlx npm@12.2.2 run dev` | 웹 `127.0.0.1:5173`, 서버 `127.0.0.1:3001` 시작 |
| GET `/` | HTTP 200, title `단판 오목` |
| GET `/healthz` | HTTP 200, `status=ok` |
| GET `/readyz`, 웹 프록시 `/api/readyz` | HTTP 200, `status=ready`, `sqlite=true` |
| `git rev-parse --show-toplevel`, `git status --short --branch`, `git ls-files`, `git ls-files -ci --exclude-standard` | `C:/오목게임`, no commits yet on main, 생성 파일 untracked, 추적 파일 및 ignored-but-tracked 항목 없음 |

화면 구현 후 Codex 브라우저에서 localhost 앱 렌더를 확인했다. 360×800 모바일 뷰포트와 1280×900 데스크톱 뷰포트에서 홈·대기열·대국·혼자 놀기·결과 팝업을 확인했다. 결과 팝업 초점과 보드 키보드 입력도 브라우저에서 확인했다. 화면 캡처 파일은 저장하지 않았다. 모바일 키보드 실기기 동작, OSI/패킷 캡처, 실서비스 대국, 배포 및 성능은 미검증이다. root dev는 웹과 서버를 함께 시작하며 개발 프로세스는 확인 뒤 종료했다.

## `.gitignore`와 Git 상태

`.gitignore`는 node_modules, 산출물/캐시/로그/coverage, 실제 `.env`와 비밀·인증 파일, SQLite 및 WAL/SHM, 개인 IDE/OS 설정, 향후 Android local.properties/.gradle/build/서명 파일을 제외하고 Gradle Wrapper 자체는 제외하지 않도록 작성했다. `.env.example`, 소스, 정적 에셋, 테스트, lockfile, 문서는 제외하지 않는다.

최종 확인에서 추적 중인 파일과 ignored-but-tracked 항목은 없다. `.gitignore`는 이미 추적된 파일에 자동 적용되는 규칙이 아니며, 향후 파일을 추가할 때 추적 여부를 별도로 확인한다.

## 다음 단계

1. 구현 화면의 후보/확정 상호작용을 실제 서버 메시지와 권위 판정에 연결한다.
2. 접속자 목록에서 상대 선택, challenge lifecycle, 인증/참가 권한을 순차 연결한다.
3. 대국 생성·착수·종료의 검증 → SQLite 원자 저장 → commit → 메모리 공개 순서로 상태를 연결한다.
4. 복구·시간 제한·재도전·채팅·PNG 저장·오프라인 PWA·봇·통신 보기를 실제 기능으로 완성하고 A01–A12/B01–B12 증거를 수집한다.

다음 Codex 세션은 우선 `README.md`와 `docs/environment.md`, `docs/requirements.md`, `docs/protocol.md`, `docs/acceptance.md`, `docs/handoff.md`, `docs/evidence-index.md` 및 실제 소스를 읽는다. 전체 구조를 다시 만들지 않는다.
