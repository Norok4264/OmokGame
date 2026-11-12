# 환경 확인 — 0단계

확인일: 2026-11-11 (Asia/Seoul)

## 접근 범위

터미널은 `CodexSandboxOffline` 사용자와 Codex 제공 Node 런타임을 사용하는 Windows 작업환경에 연결되어 있다. 이를 개발자 개인 PC라고 확인할 수 없으므로 **AI 작업 셸**로 분류한다. 별도로 Windows 앱 인벤토리에서 Chrome과 Edge가 실행 중임은 보였지만, 브라우저 창 접근은 URL 안전성 검사에서 중단되어 버전과 사용자 PC 셸을 확인하지 못했다. 따라서 셸의 도구값으로 사용자 PC 설치 호환성을 판정하지 않는다.

## 관찰값

아래 표는 0단계에서 앱 구조를 만들기 전의 초기 관찰값이다. 뒤의 “1단계 실행 확인”에 생성된 프로젝트와 lockfile 현황을 따로 기록했다.

| 항목 | Codex 작업환경 값 | 상태 |
|---|---|---|
| OS | Microsoft Windows 10.0.22631 | 확인 |
| 호스트/사용자 | `pc-21` / `CodexSandboxOffline` | 확인 |
| 작업 경로 | `C:\오목게임` | 확인 |
| 셸 | PowerShell 7.6.9 | 확인 |
| Node.js | v24.22.1 (`node --version`) | 확인 |
| npm | `npm --version`에서 “not recognized” 오류 | PATH에서 사용 불가; 전체 PC 미설치라고 단정하지 않음 |
| pnpm | v11.25.0 | 확인 |
| Git | 2.54.0.windows.1 | 확인 |
| 브라우저 | `chrome`, `msedge` 명령을 PATH에서 찾지 못함 | 버전 미확인 |
| SQLite CLI | `sqlite3` 명령을 PATH에서 찾지 못함 | CLI 미확인; 이후 앱 SQLite 드라이버와 별개 |
| 프로젝트 도구 파일 | `package.json`, npm/pnpm/yarn/bun lockfile 없음 | 앱 의존성/lockfile 없음 |
| Git | `git status`에서 “not a git repository” | 현재 폴더는 Git 저장소 아님 |

`rg --files`, `Get-ChildItem -Force`, 도구 버전 및 경로 조회로 확인했다. 설치 여부를 PATH 조회만으로 추론하지 않는다.

Computer Use의 Windows 앱 인벤토리에는 실행 중인 Google Chrome과 Microsoft Edge가 표시되었다. 버전 조회를 위해 Chrome 창을 열려 했으나 URL을 안전하게 판별하지 못해 도구가 앱 접근을 중단했다. 앱 이름이 보인 사실은 브라우저 버전이나 실제 PC의 개발 도구 설치를 증명하지 않는다.

## 경로와 호환성

선택 경로는 React·TypeScript·Vite 기반 PWA + Node.js·TypeScript·`ws` 서버 + SQLite다. APK는 기본 경로가 아니다. Codex 작업환경의 Node v24.22.1과 pnpm v11.25.0으로 프로젝트를 구성했고, npm CLI 12.2.2는 `pnpm dlx npm@12.2.2`로 실행했다. 이는 **Codex 작업환경에서 확인된 조합**이지 사용자 PC 확인값이 아니다. 직접 의존성은 package.json에 정확한 버전으로 고정하고 `package-lock.json` v3을 생성했다. [Vite](https://vite.dev/guide/), [pnpm](https://pnpm.io/installation)

구성한 직접 버전: React/react-dom 19.3.1, Vite 8.3.7, TypeScript 7.0.2, Vitest 5.0.0, `ws` 8.22.2, `better-sqlite3` 13.0.3, `@types/react`/`@types/react-dom` 19.3.0, `@types/node` 24.19.2, `@types/ws` 8.18.2, `@types/better-sqlite3` 9.6.0, `tsx` 4.23.15, `concurrently` 10.0.7. 루트 Node 엔진은 `>=24.22.1 <25`로 제한했다. 이 값은 원격 셸의 개발 기준이다. 사용자 PC Node/npm 버전은 여전히 미확인이다.

최초 설치 때 npm 12가 기본 보안 정책으로 `better-sqlite3`와 `esbuild` lifecycle script를 건너뛰었다. npm 공식 안내에 따라 해당 패키지의 현재 고정 버전만 root `package.json` `allowScripts`에 기록했고, 두 패키지 rebuild가 성공했다. 그 뒤 SQLite 포함 테스트 8개도 통과했다. 임의의 전체 install script를 허용하지 않았다. npm 설치 audit은 “2 moderate severity vulnerabilities”로 남아 있으며 상세 항목을 조사하거나 자동 수정하지 않았다. [npm install 문서](https://docs.npmjs.com/cli/v12/commands/npm-install/)

Node.js는 2026-11-11 보안 릴리스 공지를 게시했다. 따라서 24.22.1을 최종 개발/배포 런타임으로 고정하지 말고, 프로젝트 착수 직전에 같은 유지보수 선의 보안 패치 적용 가능성을 확인한다. [Node.js 공지](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases)

사용자 PC의 Node/npm/Git·브라우저 버전과 프로젝트 파일은 아직 확인되지 않았다. 사용자의 PowerShell에서 프로젝트 경로를 연 다음 아래 출력을 전달해야 해당 PC에 대한 호환 판단을 완료할 수 있다.

```powershell
Get-Location
$PSVersionTable.PSVersion
[System.Runtime.InteropServices.RuntimeInformation]::OSDescription
node --version
npm --version
git --version
Get-Command node,npm,pnpm,git,chrome,msedge -ErrorAction SilentlyContinue | Select-Object Name,Source
Get-ChildItem -Force package.json,pnpm-lock.yaml,package-lock.json,yarn.lock,bun.lock,bun.lockb -ErrorAction SilentlyContinue
git status --short --branch
```

명령이 없거나 실패하면 오류를 그대로 전달한다. 설치·업데이트를 먼저 하지 않는다.

## 1단계 실행 확인

2026-11-11, Codex 작업 셸에서 `pnpm dlx npm@12.2.2 run typecheck`, `pnpm dlx npm@12.2.2 test`, `pnpm dlx npm@12.2.2 run build`를 실행했다. 타입 검사는 오류 없이 종료, 테스트는 3개 파일/8개 테스트 통과, 빌드는 Vite 8.3.7 산출물 생성으로 완료했다. `pnpm dlx npm@12.2.2 run dev` 실행 중 웹 `/`은 200, 서버 `/healthz`는 `ok`, `/readyz`와 웹 프록시 `/api/readyz`는 SQLite `true`로 응답했다. 실행 프로세스는 검증 후 종료했다. 실제 브라우저 시각 확인·사용자 PC·Android 기기·외부 배포는 미검증이다.

최종 Git 확인 시점에는 `C:/오목게임`이 Git 작업 트리였고 브랜치는 `main`, 아직 커밋은 없었다. `git ls-files`는 비어 있고 `git ls-files -ci --exclude-standard`도 비어 있었다. 0단계의 저장소 없음 기록은 초기 확인 시점의 결과다.

2026-11-12, 공유 규칙 모듈을 추가한 뒤 전체 테스트 4개 파일/25개 테스트가 통과했고 루트 타입 검사, 공유 패키지 테스트 파일까지 포함한 TypeScript 검사, 빌드도 성공했다. 상세 규칙 사례와 A04/A05 적용 범위는 `docs/acceptance.md`에 기록했다. 이는 Codex 셸의 로컬 테스트이며 온라인/실기기 확인은 아니다.

## Android 도구

PWA 경로에는 Android Studio·Gradle·JDK·SDK·adb가 빌드 필수 항목이 아니다. APK 경로가 선택되지 않았으므로 설치 버전, Daemon JVM, Wrapper/AGP 호환성 및 Android 기기는 현재 조사 대상이 아니다. 나중에 APK를 요청하면 별도 진단을 먼저 한다.

6단계(2026-11-12): 기존 Codex Windows/PowerShell·의존성·lockfile 유지. 타입 검사/61개 테스트/서버·Vite 빌드 성공, 메모리 SQLite 기반 실제 localhost health/readiness 200 확인. 사용자 PC 버전·실제 모바일/망 전환은 추가 검증하지 않음. docs/recovery-policy.md 참조.
