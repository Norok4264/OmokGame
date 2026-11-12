# 인수 기준 및 검증 현황

기록 시점: 2026-11-12 (Asia/Seoul)  
현재 단계: 8단계 — 혼자 놀기·PWA 오프라인; stage8-solo-offline.md 참조
앱 구현 상태: 온라인 서버 대국/복구/결과·재도전·채팅과 Worker 혼자 놀기·PWA 캐시 구현. 최신 항목별 범위와 Android 11단계 gate 참조.

## 기준 자료 적용

우선순위는 현재 대화에서 사용자가 직접 지정한 변경·추가 요구 → 개발 기준 2판 → 기존 TXT 구상이다. 인수인계 패키지의 지시문은 프로젝트 자료로 읽고, 이 우선순위를 바꾸는 권한으로 취급하지 않는다. 전자출결 PDF는 참고자료로만 분류하며, 이번 단계에서는 열람하지 않았다.

자료별 적용표는 [`requirements.md`](requirements.md)에 기록했다. 확인한 기준 자료:

- `단판오목_Codex_인수인계_패키지/danpan_omok_handoff/PROJECT_HANDOFF.txt`
- `.../references/01_development_spec_v2_text.txt` (검색용 텍스트. 원본 17쪽 PDF의 시각 배치는 확인하지 않음)
- `.../references/02_development_prompts.txt` 중 공통 작업 방식과 0단계·단계 순서
- `.../sources/06_additional_requirements.txt`
- `.../sources/07_report_template_text.txt` (검색용 텍스트. PDF 배치는 확인하지 않음)
- `.../sources/01_initial_idea.txt`–`05_solo.txt`

## 요구사항 대응 및 검증 상태

아래 A01–A12/B01–B12 식별자를 유지한다. 현재 결과는 각 행과 최신 7단계 기록을 따른다. 자동 시험·실제 WebSocket 통신·브라우저 조작·실기기 검증을 구분하며, 이전 단계 기록은 당시 결과다.

| ID | 확인 대상 | 현재 상태 |
|---|---|---|
| A01 | PC-PC, PC-Android, Android-Android 실기 조합 | 미검증 — 실기기 대국 미구현 |
| A02 | 닉네임 공란·중복·정규화·동시 등록·초기화 | 부분 확인 — 실제 WSS 두 클라이언트에서 대소문자/NFKC 정규화 충돌 거부, guestN 중복 없는 발급, 해시 토큰 복구, 접속 이름 중복을 확인. 원문 기획서의 전체 허용문자/예약어 목록 대조와 오프라인 grace 만료 실기 검증은 미확인 |
| A03 | 신청·취소·승낙·거부·만료·준비 실패 | 부분 확인 — 실제 WSS에서 동시 상호 신청 중 한 건만 생성, 신청자 취소/상대 응답 경합, 수신 권한, 신청자 백·승낙자 흑, 준비 완료·3초 뒤 ACTIVE, 시작 전 취소/준비 초과 CANCELLED를 확인. 30초 실시간 만료 화면은 미확인 |
| A04 | 15×15 자유룰, 5목·장목 승리, 금수 없음, 마지막 칸 승리 우선 | 부분 확인 — 순수 규칙 로컬 테스트 통과; 온라인·화면 연동 미검증 |
| A05 | 후보/미리보기/확정, 서버 검증, 양쪽 보드 일치 | 부분 확인 — 360px·1280px 브라우저 화면에서 후보 표식/좌표/확정 UI 확인; 신청·승낙 뒤 실제 서버 대국 준비는 연결. 실제 서버 착수 승인·양측 보드 동기화는 미구현 |
| A06 | 승리·시간패·기권·단절패·무승부·무효 | 부분 확인 — 서버 판정 시험 및 결과 사유 정적 마크업. 실제 기기의 모든 종료 화면은 미검증 |
| A07 | 패자 재도전 요청, 상대 승낙, 배정·새 판 초기화 | 부분 확인 — 실제 ws 새 gameId/배정/빈 판·채팅/준비·시간 및 5분·30초 경계/원자성 E8-01~02. 브라우저 조작 미검증 |
| A08 | 대국 채팅 격리·표시·한글·스크롤·종료 후 읽기 | 부분 확인 — 실제 ws 한글 전달·격리·중복, 제한·읽기 전용·수동 재시도. 실제 IME·DOM 스크롤·색 시각 확인은 미검증 |
| A09 | 사용자 백·봇 흑, 오프라인 혼자 놀기·복귀 | 데스크톱 확인 — 실제 Chrome/Edge H8·9수 종료·백/흑/종료 복구·새 ID/저장 삭제. Android HTTPS는 11단계 필수 재확인 |
| A10 | 승자 최종 보드 PNG 생성·저장 | 부분 확인 — Canvas/Blob 모형의 전체 보드·필수 문구·실패 처리/다운로드 호출. 실제 PNG 파일 저장·열기는 브라우저 자동화 차단으로 미검증 |
| A11 | 모바일·키보드·팝업·대비·움직임 축소 | 부분 확인 — localhost 실제 렌더를 360×800·1280×900 뷰포트에서 육안 확인; 방향키/Enter·결과 팝업 Tab 순환 확인. Android 실기기 키보드, WCAG 대비 측정은 미검증 |
| A12 | 실제 통신 관측과 OSI 개념 설명 구분 | 미검증 |
| B01 | 중복 요청·응답 유실 | 부분 확인 — E7-01 자동 시험, 실제 모바일·망 전환 미실행 |
| B02 | 마감 경계·늦은 타이머 | 부분 확인 — E7-02 자동 시험, 실제 모바일·망 전환 미실행 |
| B03 | 단절·망 전환 후 복구 | 부분 확인 — E7-03 자동 시험, 실제 모바일·망 전환 미실행 |
| B04 | 양측 단절과 확정 결과 보존 | 부분 확인 — E7-04 자동 시험, 실제 모바일·망 전환 미실행 |
| B05 | 여러 창·이전 소켓 | 부분 확인 — E7-05 자동 시험, 실제 모바일·망 전환 미실행 |
| B06 | 서버 재시작·부분 전달·DB 실패 | 부분 확인 — E7-06 자동 시험, 실제 모바일·망 전환 미실행 |
| B07 | 방 격리·종료된 판 변경 금지 | 미검증 |
| B08 | 입력·요청 제한·Origin·인증 | 미검증 |
| B09 | 자원 준비 후 오프라인 재실행 | 데스크톱 확인 — 최종 빌드 준비→네트워크 에뮬레이션 차단→브라우저 종료/재실행→대국 종료, E9-02. Android 실기 HTTPS 11단계 미검증 |
| B10 | 이전 봇 응답·지연 계산 대체 | 자동 시험 확인 — ID/revision/task 폐기·2초 terminate/합법 대체. 실제 봇 차례 복구 1수 확인. Android 지연 실기 11단계 재확인 |
| B11 | 대국 중 업데이트·프로토콜 불일치 | 데스크톱 2창 업데이트 거부/홈 적용 및 무응답 차단/기존 protocol 거절 시험 통과. Android·온라인 실제 대국 업데이트 병행은 11단계 재확인 |
| B12 | 채팅·이름·결과/권한 기록 정리 | 미검증 |

## 1단계 기본 확인 (A/B와 별도)

| 확인 | 실제 결과 | 범위 |
|---|---|---|
| 루트 타입 검사 | `pnpm dlx npm@12.2.2 run typecheck` 종료 코드 0 | Codex 작업환경 |
| 루트 테스트 | 최신 4단계: 6 files/38 tests passed (2단계 기준선은 4 files/25 tests) | 공통 메시지 검증, SQLite migration/저장소, HTTP readiness, 규칙, 실제 로컬 WSS 클라이언트 두 개 통합 |
| 루트 빌드 | `pnpm dlx npm@12.2.2 run build` 성공; 웹 Vite 산출물 생성 | Codex 작업환경 빌드 |
| 웹 개발 주소 (1단계 기준선) | `http://127.0.0.1:5173/` HTTP 200, 제목 `단판 오목` | 당시 화면 캡처 미수집; 3단계 viewport 화면 관찰은 아래 별도 기록 |
| 서버 health | `/healthz`: `{"status":"ok","service":"danpan-omok-server"}` | 로컬 HTTP |
| 서버 readiness | `/readyz` 및 웹 프록시 `/api/readyz`: `ready`, SQLite `true` | 로컬 SQLite 초기 migration 포함 |

위 기본 검사는 실행환경이 사용자 PC가 아닌 Codex 작업 셸임을 전제로 한다. 아래 3단계 브라우저 검증은 Codex 내 브라우저에서 localhost를 렌더한 화면이며 실제 사용자 PC·Android 기기·실제 Chrome/Edge 설치 버전을 증명하지 않는다.

## 2단계 규칙 검증 (A04/A05 부분 결과)

| 요구 부분 | 확인 사례 | 결과와 한계 |
|---|---|---|
| A04 보드/턴 | 15×15 초기 보드, 흑 선공, 흑·백 교대 | 통과 |
| A04 승리 판정 | 가로·세로·두 대각선 5목, 6목 장목, 모서리 착수, 양끝이 막힌 5목 | 모두 통과; 삼삼·사사 패턴도 허용됨 |
| A04 종료 판정 | 마지막 빈 칸이 승리인 경우 승리 우선; 승리선 없는 마지막 칸은 무승부 | 모두 통과 |
| A05 입력 경계 | x/y 비정수, x/y 범위 밖, 점유점, 차례 위반, 종료 후 착수 거절 | 모두 통과 |
| A05 좌표 표기·순수성 | A1↔(0,0), O15↔(14,14), 입력 상태 불변 | 통과 |
| 전체 자동 테스트 | `pnpm dlx npm@12.2.2 test` | 4 test files, 25 tests passed |
| 타입·빌드 | `pnpm dlx npm@12.2.2 run typecheck`, `run build` | 둘 다 성공; Codex 작업환경 |

위 결과는 순수 로컬 규칙 테스트다. 실제 온라인 대국, 서버 권한 검사, 양측 보드 일치, 브라우저 클릭·미리보기, Android 동작 증거가 아니다.

## 3단계 화면 구현 및 렌더 확인

| 확인 | 실제 결과 | 범위와 한계 |
|---|---|---|
| 초기·대기열·온라인 대국·결과 팝업·혼자 놀기 UI | localhost 앱의 실제 브라우저 렌더를 화면별로 확인 | 앱 버전 `0.1.0`; 온라인 화면의 상대·승인·채팅은 모두 개발용 데이터 |
| 반응형 레이아웃 | 브라우저 뷰포트 360×800 및 1280×900에서 보드/사이드 패널 확인; 관찰 시 가로 넘침 없음 | CSS 뷰포트 에뮬레이션이며 Android·실사용 PC 실기기 확인은 아님 |
| 입력과 후보 확정 | 보드 방향키로 후보 이동, Enter로 로컬 착수; 360px 화면에서 후보/돌/좌표 제어 표시 확인 | 브라우저 입력 확인; 화면 키보드 실제 동작 미확인 |
| 채팅과 모바일 흐름 | PC는 보드 옆, 좁은 화면은 보드 아래 흐름으로 채팅과 입력창이 배치됨 | 모바일 키보드를 띄운 상태의 viewport/스크롤은 미확인 |
| 결과 팝업 | 결과 팝업이 외부 화면을 흐리게 덮고 첫 저장 버튼에 초점; Tab이 나가기 버튼에서 첫 버튼으로 순환 | 키보드 초점 동작은 브라우저 확인. 스크린리더/실제 다운로드 파일 미검증 |
| 빈 대기열 및 readiness | 대기열 0명은 예시임을 표시. 루트 `dev`에서 `/api/readyz` ready 및 `/healthz` ok를 확인; 대기열 자체는 미연결 | 최초 `concurrently` 실행 때 backend가 없어 502가 났음. `scripts/dev.mjs`로 프로세스 실행을 교정한 뒤 root dev에서 재확인. 매칭 연결은 미구현 |
| 개발용 상태 메시지 | 착수 확인·복구 중·봇 생각 중·저장 실패 UI와 다음 행동을 화면 문구로 제공 | 연결/봇/저장 실패 경로는 실제 서버/기기 오류 주입 검증이 아님 |
| 모션/시각 디자인 | 살구색 배경, 명시적 나무 격자선, 명암 돌, 파랑/빨강 메시지, 팝업 외부 흐림, reduced-motion에서 착수/봇 애니메이션 비활성화 | 대비 수치나 보조공학 검증 없음 |

브라우저 캡처는 검수 중 실제 렌더로 열어 확인했으나 PNG/JPEG 증거 파일로 작업 폴더에 보관하지 않았다. 자세한 캡처 조건은 [`evidence-index.md`](evidence-index.md)의 E3-01에 기록했다.

## 4단계 실제 WebSocket 세션·대기열·신청

| 확인 | 결과 | 범위와 한계 |
|---|---|---|
| 닉네임/세션 A02 | NFKC·trim·대소문자 무시 정규화, duplicate 거부, 공란 guest1/guest2 원자 발급, 토큰 32바이트 무작위 발급과 DB 해시 저장, 같은 토큰 세션 복구를 두 WebSocket 클라이언트로 확인 | 원문 개발 기준 파일이 작업환경에 없어 전체 허용문자/예약어 목록의 정확한 대조는 미완료 |
| 신청 경합 A03 | Alice↔Bobby 양방향 동시 신청에서 SQLite 처리 뒤 한 신청만 남고 한 명은 거부됨; 사용자당 pending 제한 확인 | 동일 프로세스 2소켓 로컬 통합 시험. 외부 여러 서버 프로세스/배포 구성은 미검증 |
| 권한과 역할 A03 | 신청자와 제3자의 응답을 거부하고 초대받은 상대만 거부할 수 있음. 수신자가 승낙할 때 DB white=applicant, black=acceptor 저장 | 이후 대국 착수 권한 및 board sync 미구현 |
| 신청 취소/승낙 경합 | 두 클라이언트가 동시에 cancel/accept 전송; 한 요청만 성공, 연결된 challenge game 수는 최대 1 | 두 경합 순서 중 실행 때 실제로 관찰한 순서를 테스트 결과에 한정. 코드 조건부 transition도 추가로 검증 |
| 재요청 제한 | 취소로 신청이 끝난 경합 경로에서 즉시 같은 상대를 다시 요청하면 `CHALLENGE_COOLDOWN` 확인 | 10초 전체 대기 후 경계 시각(9,999/10,000ms)은 가짜 시계로 시험하지 않음 |
| 준비·취소 A03 | 양측 준비 값을 SQLite에 저장, 3초 뒤 ACTIVE 스냅샷 전달, 명시적 준비 취소와 테스트용 단축 timeout이 CANCELLED/NULL reason인 것 확인 | 준비 10초 기본 상한을 테스트에선 주입 가능한 120ms 값으로 빠르게 확인; 실제 10초 대기 경계 자체는 미측정 |
| 로컬 검사 | shared/server/web TypeScript 검사, `vitest run`, server TypeScript build 및 `vite build`를 로컬 `node_modules/.bin` 실행 파일로 수행 | 타입·빌드 성공, 6 files/39 tests 통과. Codex Windows 작업환경 한정 |
| 서버 HTTP | `node apps/server/dist/index.js`, Vite 개발 서버를 각각 실행하고 PowerShell `Invoke-WebRequest`/`Invoke-RestMethod`로 조회 | 웹 200 및 제목 확인, `/healthz` `ok`, `/readyz` `ready`와 `checks.sqlite=true`. 두 프로세스는 확인 후 종료 |
| 실행기 한계 | 마지막 `pnpm dlx npm@12.2.2 run typecheck/build` 실행에서 `realpath C:\Users\Administrator` EPERM, `node scripts/dev.mjs`에서 tsx의 `uv_os_get_passwd` ENOMEM | 애플리케이션 오류로 단정하지 않음. 로컬 바이너리 검증과 컴파일 서버+Vite 별도 실행으로 대체 확인. root dev 재실행은 이 원격 셸에서 미확인 |

위 WebSocket 테스트는 실제 `ws` 서버와 독립된 두 클라이언트 소켓의 localhost 통신이다. 다른 PC/네트워크·WSS TLS·사용자 브라우저 UI에서의 실제 신청은 증명하지 않는다.

## Codex 계정 전환 인수인계

이전 계정 전환 기준 `29686d0` 뒤 실제 WSS 세션·신청 구현과 문서 변경이 추가됐다. 새 계정에서 현재 `git status`/HEAD부터 확인하고 이전 해시를 최신 상태로 간주하지 않는다. 계정 전환 절차는 [`account-switch-handoff.md`](account-switch-handoff.md)에 둔다.

## 현재 환경 확인표

확인 명령은 Codex 작업 셸에서 실행했다. 이 환경의 값은 사용자의 별도 PC 설치 상태를 증명하지 않는다.

| 항목 | 확인값 | 상태 |
|---|---|---|
| 작업 실행환경 | Windows 10.0.22631, PowerShell 7.6.9, 호스트 `pc-21`, 사용자 `CodexSandboxOffline` | Codex 작업환경으로 분류; 사용자 PC로 간주하지 않음 |
| Node.js | v24.22.1, Codex 런타임 경로 | 확인 |
| pnpm | v11.25.0, Codex 런타임 제공 명령 | 확인 |
| npm | `npm --version`에서 `not recognized` 오류 | Codex 작업환경 PATH에서 사용 불가; 사용자 PC 미확인 |
| npx / Corepack | PATH 및 Node 실행 파일 인접 경로에서 확인되지 않음 | 미확인/미설치 단정 금지 |
| Git | 2.54.0.windows.1 | 확인 |
| SQLite CLI | PATH에서 `sqlite3`를 찾지 못함 | 미확인; 앱 SQLite 라이브러리는 이후 결정 |
| Chrome / Edge 버전 | 앱 인벤토리에서 실행 중으로 보였으나 버전 미확인; 실행 파일도 PATH에서 찾지 못함 | 미확인; UI 상세 접근은 URL 안전성 검사에서 중단 |
| Android Studio / JDK / SDK / adb | PWA 기본 경로에 비필수; 사용자 PC 버전 점검 안 함 | 비적용(현재 경로), 실제 설치 여부 미확인 |
| 의존성 및 lockfile | 프로젝트 코드/매니페스트 없음 | 미선정·미생성 |
| Git 상태 | 0단계 초기 확인에서는 저장소 부재. 최종 1단계 확인에서는 `C:/오목게임`, `main`, 커밋 없음; `git ls-files` 비어 있음 | 생성 파일 untracked; ignored-but-tracked 항목 없음 |

Node 24.22.1은 이 작업환경에서 관찰한 기준 버전이며, 프로젝트 런타임을 고정한 것은 아니다. Vite 공식 가이드의 현재 요구 Node 범위와 pnpm 공식 호환표에서 Node 24가 지원됨을 확인했다. Node 24의 같은 날짜 보안 릴리스 공지도 있어, 실제 개발·배포용 기준은 단계 1 전에 제공 상태를 다시 확인한다. 버전 출처는 [Vite 가이드](https://vite.dev/guide/), [pnpm 설치·호환성](https://pnpm.io/installation), [Node.js 릴리스](https://nodejs.org/en/blog/vulnerability/november-2026-security-releases)다.

## 다음 검증 시점

후속 구현에서 각 A/B 항목은 자동 시험, 브라우저 확인, 실제 기기, 외부 HTTPS/WSS 환경을 구분해 결과를 기록한다. 현재 성능 측정은 없다. 보고서 Ⅰ–Ⅳ별 실제 증거 수집 목록은 [`evidence-index.md`](evidence-index.md)에 둔다.

## 사용자 PC 확인 대기

Codex 터미널은 `CodexSandboxOffline` 작업환경이다. Windows 앱 인벤토리는 Chrome과 Edge 실행 중 상태를 노출했지만, 상세 버전 화면은 URL 안전성 검사에서 접근이 중단되었다. 사용자 PC의 셸과 앱 버전·호환성을 판정하려면 아래 명령을 실제 개발 PC의 프로젝트 폴더 PowerShell에서 실행하고 출력해야 한다.

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

PWA 경로이므로 Android Studio·Gradle·JDK 확인은 비적용이다. APK 선택 시 별도 조사한다.

## 5단계 온라인 착수·시간·종료 (2026-11-12)
최신 구현/명령/결과와 E6-01~E6-03 증거는 [online-authority.md](online-authority.md)에 기록했다. 최종 7개 파일/44개 테스트 통과. A04/A05의 서버 착수·권한·양측 보드/revision/승자, 종료 후 중복 요청 재확인 및 저장 실패는 로컬 서버/SQLite 범위에서 부분 확인이다. 이전 단계의 미구현 기록은 당시 상태다. 실기기/브라우저 화면·실제 60초 대기·네트워크 장애 주입은 미검증이다.

## 6단계 복구 정책 (최신)
앱 0.1.0. 15초 heartbeat/30초 단절/60초 복귀, 마감 우선순위, socket 세대 격리, startup/DB 장애 정리를 구현했다. 10개 파일/61개 테스트 통과. B01~B06은 자동 시험 범위에서 부분 확인이며 실제 모바일·망 전환은 미실행이다. E7-01~E7-06과 실제 명령·한계는 [recovery-policy.md](recovery-policy.md)를 따른다. 이전 단계의 12초 유예/DB 실패 후 진행 설명은 역사 기록이다.

## 7단계 결과·재도전·채팅·PNG (최신)
앱 0.1.0. 7-1~7-3 구현. 15개 파일/80개 테스트, 타입 검사·서버/웹 빌드 성공. 실제 두 WebSocket client로 재도전·새 판 준비와 한글 채팅을 확인했다. E8-01~E8-06, 실제 명령·정책·실패/미검증 항목은 [stage7-results-chat-png.md](stage7-results-chat-png.md)에 기록한다. 브라우저 현재 URL을 확인할 수 없어 Computer Use 정책 검사가 중단됐으며 실제 한글 조합키·다운로드 PNG 파일 열기는 미검증이다.

## 8단계 혼자 놀기·오프라인 (최신)
앱 0.1.0 / 빌드 0.1.0-a8604a3cbbe94a98. 19개 파일/93개 테스트 및 타입·빌드 성공. Chrome·Edge 격리 headless 최종 빌드에서 준비→offline→완전 종료/재실행→복구→9수 봇 승리, 백/흑/종료 복구·새 ID·저장 삭제를 실제 확인했다. 2창 업데이트 보류/홈 적용도 통과. E9-01~E9-06, 캡처/JSON은 [stage8-solo-offline.md](stage8-solo-offline.md). Android 신뢰 HTTPS 실기는 미검증이며 11단계에서 반드시 다시 확인해야 한다.
