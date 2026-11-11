# 인수 기준 및 검증 현황

기록 시점: 2026-11-11 (Asia/Seoul)  
현재 단계: 1단계 — 기본 구조·공통 계약·SQLite 기반  
앱 구현 상태: 기반 구조와 개발용 시작 화면만 있음; 게임 기능 미구현

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

아래 A01–A12/B01–B12는 인수인계 기준의 식별자를 유지한다. 기본 구조 검사 통과는 이 사용자 기능·예외 상황의 실기 검증이 아니므로 모두 **미검증**이다.

| ID | 확인 대상 | 현재 상태 |
|---|---|---|
| A01 | PC-PC, PC-Android, Android-Android 실기 조합 | 미검증 — 실기기 대국 미구현 |
| A02 | 닉네임 공란·중복·정규화·동시 등록·초기화 | 미검증 |
| A03 | 신청·취소·승낙·거부·만료·준비 실패 | 미검증 |
| A04 | 15×15 자유룰, 5목·장목 승리, 금수 없음, 마지막 칸 승리 우선 | 미검증 |
| A05 | 후보/미리보기/확정, 서버 검증, 양쪽 보드 일치 | 미검증 |
| A06 | 승리·시간패·기권·단절패·무승부·무효 | 미검증 |
| A07 | 패자 재도전 요청, 상대 승낙, 배정·새 판 초기화 | 미검증 |
| A08 | 대국 채팅 격리·표시·한글·스크롤·종료 후 읽기 | 미검증 |
| A09 | 사용자 백·봇 흑, 오프라인 혼자 놀기·복귀 | 미검증 |
| A10 | 승자 최종 보드 PNG 생성·저장 | 미검증 |
| A11 | 모바일·키보드·팝업·대비·움직임 축소 | 미검증 |
| A12 | 실제 통신 관측과 OSI 개념 설명 구분 | 미검증 |
| B01 | 중복 요청·응답 유실 | 미검증 |
| B02 | 마감 경계·늦은 타이머 | 미검증 |
| B03 | 단절·망 전환 후 복구 | 미검증 |
| B04 | 양측 단절과 확정 결과 보존 | 미검증 |
| B05 | 여러 창·이전 소켓 | 미검증 |
| B06 | 서버 재시작·부분 전달·DB 실패 | 미검증 |
| B07 | 방 격리·종료된 판 변경 금지 | 미검증 |
| B08 | 입력·요청 제한·Origin·인증 | 미검증 |
| B09 | 자원 준비 후 오프라인 재실행 | 미검증 |
| B10 | 이전 봇 응답·지연 계산 대체 | 미검증 |
| B11 | 대국 중 업데이트·프로토콜 불일치 | 미검증 |
| B12 | 채팅·이름·결과/권한 기록 정리 | 미검증 |

## 1단계 기본 확인 (A/B와 별도)

| 확인 | 실제 결과 | 범위 |
|---|---|---|
| 루트 타입 검사 | `pnpm dlx npm@12.2.2 run typecheck` 종료 코드 0 | Codex 작업환경 |
| 루트 테스트 | `pnpm dlx npm@12.2.2 test`: 3 files, 8 tests passed | 공통 메시지 검증, SQLite migration/저장소, HTTP readiness 단위 테스트 |
| 루트 빌드 | `pnpm dlx npm@12.2.2 run build` 성공; 웹 Vite 산출물 생성 | Codex 작업환경 빌드 |
| 웹 개발 주소 | `http://127.0.0.1:5173/` HTTP 200, 제목 `단판 오목` | 실제 브라우저 화면 캡처 없음 |
| 서버 health | `/healthz`: `{"status":"ok","service":"danpan-omok-server"}` | 로컬 HTTP |
| 서버 readiness | `/readyz` 및 웹 프록시 `/api/readyz`: `ready`, SQLite `true` | 로컬 SQLite 초기 migration 포함 |

위 검사는 실행환경이 사용자 PC가 아닌 Codex 작업 셸임을 전제로 한다. 서로 다른 기기, 실제 Chrome/Edge UI, 모바일 반응형, 프로토콜 게임 명령, 외부망·배포는 확인하지 않았다.

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
