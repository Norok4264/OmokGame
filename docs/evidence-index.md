# 증거 색인

기록 시점: 2026-11-12 (Asia/Seoul)  
앱 버전: `0.1.0` 화면 및 실제 WebSocket lobby 단계 (보드 착수/실시간 대국은 미연결)

## 4단계 실제 WebSocket 증거

| ID | 요구사항 | 실제 자료와 조건 | 결과/한계 |
|---|---|---|---|
| E5-01 | A02 닉네임·세션 | `apps/server/src/lobby.test.ts`, 로컬 HTTP/WSS 서버와 별개 두 client socket; `pnpm dlx npm@12.2.2 test` | NFKC/trim/case normalize, duplicate `Alice` 거부, blank guest1/guest2, token random 발급 후 DB token_hash가 원문과 다름, 같은 token의 session resume 성공. 원문 reserved-name 목록 대조는 미완료 |
| E5-02 | A03 동시 신청/권한/역할 | 독립 WSS client에서 두 클라이언트 상호 challenge.create 동시 전송, respond/cancel 경합, 제3자 응답, 초대 상대의 decline | 동시 상호 신청 중 한 pending만 생성, 한 판 이하 생성. 신청자 white/후공, 수락자 black/선공. 신청자·제3자의 응답은 `NOT_CHALLENGE_RECIPIENT`로 거절, 초대 상대 거부는 게임 없이 저장 |
| E5-03 | A03 준비·취소·timeout | 로컬 WSS 2-client 테스트에서 양쪽 ready 후 3초 지나 ACTIVE 스냅샷 수신, 명시 cancel request replay, test-injected preparation timeout | DB에 PREPARING readiness와 countdown UTC 저장, ACTIVE 전파; 취소/준비 만료는 `CANCELLED`, `end_reason=null`. 실서비스 장시간 30초 challenge expiry/10초 timer boundary는 미측정 |
| E5-04 | 자동 검증 및 readiness | shared/server/web TypeScript 검사, `vitest run`, server TypeScript build, `vite build`; 이어서 컴파일된 localhost 서버+Vite와 PowerShell HTTP 요청 | 6개 테스트 파일/39개 통과, 타입·웹 빌드 성공, 웹 200, `/healthz` ok, `/readyz` ready 및 `checks.sqlite=true`. 마지막 `pnpm dlx npm`/tsx root-dev 재시도는 원격 셸의 realpath/OS user lookup 오류를 냈으므로 직접 로컬 바이너리·분리 실행으로 검증. 외부 PC/네트워크·TLS 실증은 아님 |

## 3단계 화면 렌더 확인

| ID | 보고서 연결 | 실제 자료와 조건 | 결과/한계 |
|---|---|---|---|
| E3-01 | Ⅰ·Ⅲ 화면 구성 및 반응형 | 4단계 이전 Codex 브라우저에서 `http://127.0.0.1:5173/` 앱 버전 `0.1.0`을 실제 렌더해 확인. viewport 360×800 및 1280×900. 홈, 대기열, 개발용 온라인 대국, 혼자 놀기, 결과 팝업 화면을 관찰 | 4단계 실제 lobby 전의 화면 시뮬레이션이었다. 모바일/PC 배치, 채팅 흐름과 popup blur를 확인. 이미지 파일 미보관, 사용자 PC/Android 실기기 캡처 아님 |
| E3-02 | A05 입력 UI | 같은 브라우저 세션에서 보드 포커스, 방향키 후보 이동 및 Enter 착수, 후보 표식과 선택 좌표 관찰 | 규칙 엔진 연동 로컬 동작. 온라인 착수는 가상 승인 절차이며 서버 메시지/권한 검증의 증거가 아님 |
| E3-03 | A11 초점/키보드 | 결과 팝업을 다시 열어 첫 저장 버튼에 초점, Tab으로 나가기 버튼 이동, 다음 Tab에서 첫 버튼으로 순환 확인 | Codex 브라우저 확인. 스크린리더·Android 키보드·WCAG 자동/수동 감사는 미실행 |
| E3-04 | 대기열 readiness/error 화면 | 첫 root dev 확인에서 backend 미실행 상태 HTTP 502. `scripts/dev.mjs`로 root `dev`를 교정한 뒤 웹 200, `/api/readyz` `ready` 및 SQLite true, `/healthz` `ok` 확인 | 대기열 매칭 endpoint는 없음. 서버 health/readiness만 확인했으며 온라인 접속·매칭 성공으로 계산하지 않음 |

디자인 선택: 살구색 페이지와 부드러운 그라데이션으로 기획 색을 따르고, 격자선은 축소 화면에서도 선명하도록 별도 선 요소로 그렸다. 후보 돌은 반투명 표식으로 기존 돌과 구분하고 좌표/확정 버튼을 함께 둔다. PC에서는 채팅을 보드 옆, 좁은 화면에서는 보드 다음 문서 흐름에 두어 판과 입력이 겹치지 않게 했다. 주요 액션은 46–48px 이상 높이로 구성했다. 모션 축소 설정에서 승인 돌 연출과 봇 애니메이션을 끈다. 대비 수치는 측정하지 않았다.

## Codex 계정 전환 문서 증거

| ID | 연결 | 실제 자료와 조건 | 결과/한계 |
|---|---|---|---|
| E4-01 | 같은 PC·환경의 계정 전환 인수 | `2026-11-12` Codex 셸에서 `Get-Location`, `git status --short --branch`, `git log -5 --oneline --decorate`, `node/npm/pnpm/git --version` 실행 | `C:/오목게임`, `main`, `29686d0`과 `origin/main` 동기화, Node 24.22.1, npm 명령 PATH 미발견, pnpm 11.25.0, Git 2.54.0 확인. 새 계정이 같은 런타임·인증을 쓰는지는 전환 후 재확인 필요. 기록 절차: [`account-switch-handoff.md`](account-switch-handoff.md) |

## 2단계 실제 증거 — A04/A05 규칙 부분

| ID | 보고서 연결 | 실제 자료와 조건 | 결과/한계 |
|---|---|---|---|
| E2-01 | A04 규칙 테스트 | `packages/shared/src/rules.test.ts`; 루트 `pnpm dlx npm@12.2.2 test` | 4 files/25 tests 전체 통과. 15×15·턴·4방향 5목·장목·모서리·양끝 차단·마지막 수 승리/무승부·금수 허용 포함 |
| E2-02 | A05 규칙 경계 테스트 | 같은 테스트 출력과 `packages/shared/src/rules.ts` | x/y 비정수·범위 밖, 점유점, 차례 위반, 종료 후 착수 거절 및 A1/O15 표기 통과. 온라인 미리보기·서버 승인·양측 보드 동기화 증거는 아님 |
| E2-03 | 공유 API 호환 | `pnpm dlx npm@12.2.2 run typecheck`, `run build` 출력 | 타입 검사와 shared/server/Vite 빌드 성공. 실제 브라우저 및 온라인 서비스 검증 아님 |

## 1단계 실제 증거

| ID | 보고서 연결 | 실제 자료와 조건 | 결과/한계 |
|---|---|---|---|
| E1-01 | 기본 구조·버전 | 루트 `package.json`, `package-lock.json` v3, workspace manifests; 앱 버전 0.1.0 | Codex 작업 폴더의 실제 파일. Git `main`에 커밋은 아직 없음 |
| E1-02 | SQLite 설계·저장 | `apps/server/src/storage/migrations.ts`, `game-repository.ts`; `npm test` 실행 기록 | migration, 게임 생성·상태 변경·성공 requestId 레코드 원자 저장 코드 및 테스트. production multi-process/장애 검증은 아님 |
| E1-03 | 자동 검사 | `pnpm dlx npm@12.2.2 run typecheck`, `... test`, `... run build` 실행 출력 | 타입 검사 통과, 3개 test files/8 tests 통과, Vite 8.3.7 build 성공. Codex 셸 한정 |
| E1-04 | 실제 HTTP 응답 | 로컬 dev 실행 중 Invoke-WebRequest/Invoke-RestMethod 출력; `127.0.0.1` | 웹 200, server health ok, readiness와 프록시 SQLite true. 응답 본문/환경은 docs/handoff.md에 기록; 패킷 캡처 아님 |
| E1-05 | Git 제외 정책 | `.gitignore`, `git status`, `git ls-files`, `git ls-files -ci --exclude-standard` | 작업 트리 존재, 커밋 전. 추적 파일 없음, ignored-but-tracked 파일 없음; 규칙은 기존 추적 파일에 자동 적용되지 않음 |
| E1-06 | 의존성 실행 정책 | npm CLI 12.2.2 `install-scripts approve better-sqlite3 esbuild`, `rebuild` 출력 및 root `package.json` | 두 정확한 버전(13.0.3/0.28.2)만 승인, rebuild 성공 후 테스트 통과. audit은 moderate 2건 통보, 세부 항목 조사 미실행 |

| ID | 보고서 연결 | 실제 자료와 조건 | 결과/한계 |
|---|---|---|---|
| E0-01 | 기획·요구사항 기준 | `단판오목_Codex_인수인계서.txt`; `단판오목_Codex_인수인계_패키지.zip` 및 압축 해제 자료 | 인수 내용·기능 정책 확인. ZIP은 계획 자료이며 앱 소스 아님 |
| E0-02 | 설계 기준 | `danpan_omok_handoff/references/01_development_spec_v2_text.txt` | 검색용 PDF 텍스트로 정책 확인. 17쪽 원본 PDF 시각 레이아웃 검토는 미실행 |
| E0-03 | 추가 요구·보고서 구조 | `sources/06_additional_requirements.txt`, `sources/07_report_template_text.txt` | 요구사항과 2쪽 양식 텍스트 확인. 원본 PDF 시각 레이아웃 검토는 미실행 |
| E0-04 | 작업환경 | Codex 작업 셸 출력(2026-11-11): Windows 10.0.22631, PowerShell 7.6.9, 호스트/사용자, Node/pnpm/Git 및 PATH 확인 | Codex 작업환경의 값. 사용자 PC 설치 상태를 증명하지 않음 |
| E0-05 | 프로젝트 현황 | `rg --files`, `Get-ChildItem -Force`, package/lockfile 검색, `git status --short --branch` | 앱 파일·매니페스트·lockfile·Git 저장소 없음. Git 명령은 저장소 부재로 실패 |
| E0-06 | 자료별 요구사항 | [`requirements.md`](requirements.md) 및 패키지의 인수서·개발 기준 텍스트·추가 요구·보고서 텍스트 | 자료와 현재 사용자 지시의 적용 순서를 명시. 기준 PDF 시각 검토는 미실행 |
| E0-07 | 브라우저 인벤토리 | Windows 앱 인벤토리(2026-11-11) | Chrome·Edge 실행 중 표시는 확인. 버전 창은 URL 안전성 검사에서 접근 중단되어 미확인 |

저장된 화면 캡처 파일, WebSocket 실제 대국 교환, 패킷, 실기기, 성능 측정은 아직 수집되지 않았다. E3 표의 localhost 렌더 육안 확인은 화면 관찰 증거이며 파일 이미지나 실기기 증거가 아니다. 개념도나 예시 이미지는 실제 증거로 등록하지 않는다.

## 최종 보고서용 증거 수집 목록

아래는 수집 계획이며 현재 확보된 증거로 오인하지 않는다. 모두 앱 구현과 동일 앱 버전에서 실제로 확보하고 기기·브라우저·OS·서버 주소/빌드·네트워크 조건·시각을 함께 기록한다. 학번·성명은 사용자 제공 전까지 빈칸으로 둔다.

| 보고서 절 | 필요한 실제 증거 |
|---|---|
| 요약·표지 | 확정 앱명, 구현/검증 범위, 사용자 제공 학번·성명. 미제공 정보는 미기입 |
| Ⅰ. 프로그램 소개 | 앱 목적·대상·과제와의 관계를 뒷받침하는 확정 요구사항 및 완성된 초기 화면 캡처 |
| Ⅱ. 구성과 작동 | 실제 배포 구조도(브라우저·HTTPS/WSS·Node 서버·SQLite), 착수 요청→서버 검증→SQLite 트랜잭션/commit→공개 흐름, 실제 메시지/로그, OSI 개념 설명과 앱·OS·네트워크 장비 역할 구분, 초기·대기열·대국 화면 및 디자인 이유 |
| Ⅲ. 실제 동작 | 실제 초기/대기열/신청·승낙/대국/채팅/승패/승리 팝업·PNG/패자의 재도전/재도전 결과/나가기 화면, 서로 다른 기기의 같은 대국 기록, 연결 복구 기록, 준비 완료 후 네트워크 차단·앱 재실행·봇 대국 완료 화면. 각 캡처를 실행 로그와 연결 |
| Ⅳ. 장점과 한계 | A01–A12/B01–B12 결과표, 기기·브라우저·서버·망 조합, 측정한 성능 표본·측정 방식, 실패·미검증 범위와 실제 한계 |
| OSI·패킷 설명 | 실제 수집한 브라우저/서버 앱 이벤트와 허용된 패킷 캡처. TCP ACK·MAC 등 관찰하지 않은 정보는 별도 증거 없이 주장 금지 |

화면은 E3에서 실제 렌더로 관찰했지만 캡처 파일은 저장하지 않았다. 온라인 통신·실기기·성능 증거는 수집되지 않았다. E2 테스트는 로컬 규칙 엔진 결과이므로 온라인 대국 확인으로 집계하지 않는다.
