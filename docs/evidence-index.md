# 증거 색인

기록 시점: 2026-11-12 (Asia/Seoul)  
앱 버전: 0.1.0 / Windows 웹 0.1.0-8f52d08ed448ebe3 — 11단계. 최신 실제 검증은 E12, 재현 런타임 Node24.22.3/npm12.2.2. E9~E11은 당시 조건의 역사 증거. 최신 전달/한계는 release-handoff.md.

이전 단계의 미수집/미구현 문장은 당시 상태이며 최신 표를 우선한다. 과거 로컬 WSS 표기는 TLS 검증 증거가 아니다. 이번 시험은 HTTP/WS이다.

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

## 5단계 온라인 착수·시간·종료 (2026-11-12)
최신 구현/명령/결과와 E6-01~E6-03 증거는 [online-authority.md](online-authority.md)에 기록했다. 최종 7개 파일/44개 테스트 통과. A04/A05의 서버 착수·권한·양측 보드/revision/승자, 종료 후 중복 요청 재확인 및 저장 실패는 로컬 서버/SQLite 범위에서 부분 확인이다. 이전 단계의 미구현 기록은 당시 상태다. 실기기/브라우저 화면·실제 60초 대기·네트워크 장애 주입은 미검증이다.

## 6단계 복구 정책 (최신)
앱 0.1.0. 15초 heartbeat/30초 단절/60초 복귀, 마감 우선순위, socket 세대 격리, startup/DB 장애 정리를 구현했다. 10개 파일/61개 테스트 통과. B01~B06은 자동 시험 범위에서 부분 확인이며 실제 모바일·망 전환은 미실행이다. E7-01~E7-06과 실제 명령·한계는 [recovery-policy.md](recovery-policy.md)를 따른다. 이전 단계의 12초 유예/DB 실패 후 진행 설명은 역사 기록이다.

## 7단계 결과·재도전·채팅·PNG (최신)
앱 0.1.0. 7-1~7-3 구현. 15개 파일/80개 테스트, 타입 검사·서버/웹 빌드 성공. 실제 두 WebSocket client로 재도전·새 판 준비와 한글 채팅을 확인했다. E8-01~E8-06, 실제 명령·정책·실패/미검증 항목은 [stage7-results-chat-png.md](stage7-results-chat-png.md)에 기록한다. 브라우저 현재 URL을 확인할 수 없어 Computer Use 정책 검사가 중단됐으며 실제 한글 조합키·다운로드 PNG 파일 열기는 미검증이다.

## 8단계 혼자 놀기·오프라인 (최신)
앱 0.1.0 / 빌드 0.1.0-a8604a3cbbe94a98. 19개 파일/93개 테스트 및 타입·빌드 성공. Chrome·Edge 격리 headless 최종 빌드에서 준비→offline→완전 종료/재실행→복구→9수 봇 승리, 백/흑/종료 복구·새 ID·저장 삭제를 실제 확인했다. 2창 업데이트 보류/홈 적용도 통과. E9-01~E9-06, 캡처/JSON은 [stage8-solo-offline.md](stage8-solo-offline.md). Android 신뢰 HTTPS 실기는 미검증이며 11단계에서 반드시 다시 확인해야 한다.

## 9단계 실제 관측 E10 (패킷 캡처 아님)

| ID | 실제 자료 | 결과와 범위 |
|---|---|---|
| E10-01 | [안전한 앱 이벤트 JSON](evidence/stage9-application-events.json) | Chrome 157.0.8103.51 격리 두 세션 + Node/SQLite :memory:, 최종 빌드 0.1.0-9aa3175978d99527. UTC는 파일 내 실제 기록. A 28/B 20건, 착수 180 UTF-8 bytes 일치, H8/revision 2 양쪽 일치, 채팅 길이 13, 민감 필드 제외·삭제 통과. 응용 RTT 표본이며 TCP 성능 수치 아님 |
| E10-02 | [A 실제 통신 보기](evidence/stage9-communication-a.png), [B 실제 통신 보기](evidence/stage9-communication-b.png) | 실제 렌더한 통신 보기 영역만 캡처. 채팅 본문 영역 제외. localhost 데스크톱 headless 시험이며 Android 화면 아님 |
| E10-03 | communication-log.test.ts, lobby-client.test.ts, 전체 vitest run | 20개 파일/99개 테스트 통과. UTF-8 원본 크기/200건/삭제/단조 시계/중첩 ID·연결 교체/정보 제외를 자동 시험. 실제 명령은 [9단계 기록](stage9-communication.md) |

## 9단계 소스 기반 개념 설명 C10

| ID | 설명 자료 | 구분 |
|---|---|---|
| C10-01 | [보고서 Ⅱ-1·Ⅱ-2 구조도/착수 흐름도](report-network-collection.md) | 현재 소스의 브라우저→Vite→Node→shared/SQLite 구조와 commit 후 전달을 설명. 실제 배포망/경로 캡처 아님 |
| C10-02 | 같은 문서 Ⅱ-3·Ⅱ-4, 앱 OSI 역할 표 | JSON/UTF-8·TLS 관련 역할·대화 관리·TCP/포트·IP/라우팅·프레임/MAC·매체 설명. gameId는 대국 ID. 앱이 OSI 전 계층을 별도 구현했다는 뜻 아님 |

## 9단계 미수집 안내 P10

| ID | 수집 예정 자료 | 현재 상태 |
|---|---|---|
| P10-01 | [Ⅲ Wireshark 수집 절차](report-network-collection.md) | 인터페이스 확인, loopback/NIC 위치, 필터, 착수/채팅 시연, WSS 암호화 한계 안내만 작성. 실제 pcap/pcapng·패킷 수/길이·stream·NIC/IP/MAC 관측 없음 |
| P10-02 | 실제 WSS·Android/서로 다른 기기 시험 | 미실행. 11단계 신뢰 HTTPS Android 오프라인 gate 유지. 실제 확보 후 앱 버전·시간·환경과 함께 별도 등록 |

원본 캡처에는 인증 토큰/본문/주소가 포함될 수 있다. private-captures/는 Git 제외이며 현재 추적 파일은 없다. E10 JSON 크기는 실제 응용 페이로드이며 TCP 패킷 전체 크기가 아니다. 학번·성명은 미제공 상태로 유지한다.

## 10단계 실제 소프트웨어 관측 E11

모든 최신 웹 시험은 빌드 **0.1.0-8f52d08ed448ebe3**이며 서버 소스 해시는 E11-06에 있다. 실제 기기 조합·HTTPS 배포·패킷 완료와 구별한다. [전체 A/B 표·시험 조건·G11 게이트](integration-validation.md).

| ID | 실제 파일/구현 시험 | 결과와 한계 |
|---|---|---|
| E11-00 | [최종 검증 요약 JSON](evidence/stage10-summary.json) | 원시 파일의 completed/빌드 일치·테스트·Git·성능 범위를 재검사하여 집계. 실제 기기 세 조합은 모두 NOT_RUN |
| E11-01 | [명령/종료 코드/stdout](evidence/stage10-checks.json), [전체 테스트 결과](evidence/stage10-tests.json) | 타입·22개 파일/115개 테스트·서버/웹 빌드 통과. 규칙 17건, 실제 WS 통합, 가짜 시계/실패 주입 포함. 실제 망·전원/디스크 손상 아님 |
| E11-02 | [Chrome/Edge E2E JSON](evidence/stage10-browser.json), [Chrome 결과 화면](evidence/stage10-chrome-result.png), [Edge 결과 화면](evidence/stage10-edge-result.png), [온라인 360px](evidence/stage10-online-mobile-emulation.png), [홈 360px](evidence/stage10-mobile-emulation.png) | 실제 Chrome157.0.8103.51/Edge157.0.4341.46. 신청·9수 승패·새로고침 마감·재도전·여러 창 교체·HTML 안전 텍스트·조합 이벤트·채팅 과거 스크롤/숨김. 360px는 PC 에뮬레이션이며 Android/실제 IME 아님 |
| E11-03 | [Chrome offline JSON](evidence/stage10-chrome-offline.json), [Edge offline JSON](evidence/stage10-edge-offline.json), [Chrome 준비](evidence/stage10-chrome-ready.png), [Chrome 오프라인 종료](evidence/stage10-chrome-offline-final.png), [Edge 준비](evidence/stage10-edge-ready.png), [Edge 오프라인 종료](evidence/stage10-edge-offline-final.png) | 최종 빌드 자원 준비→context offline→실제 브라우저 프로세스 종료/재실행→9수 종료, 복구/새 ID/저장 삭제. 물리 Wi-Fi 차단이나 Android 시험은 아님 |
| E11-04 | [안전한 실제 앱 이벤트 JSON](evidence/stage10-application-events.json), [A 통신 보기](evidence/stage10-communication-a.png), [B 통신 보기](evidence/stage10-communication-b.png) | 원본 착수 JSON180 UTF-8 bytes 일치, 양쪽 H8/revision2, 채팅 길이13, 정보 제외·기록 지우기. 응용 이벤트이며 TCP 패킷 캡처 아님 |
| E11-05 | [실제 다운로드 PNG](evidence/stage10-downloaded-result.png), [파일을 브라우저에서 연 화면](evidence/stage10-png-open.png), [변환 실패 주입 화면](evidence/stage10-png-failure.png) | 1100×1500 디코드/실제 파일 열기, 전체 판·이름·색·승리/사유/시각 육안 확인. toBlob 실패 주입→결과 유지→재시도 성공. 실제 디스크 실패/Android 열기 아님 |
| E11-06 | [실제 저장소/환경 검사](evidence/stage10-repository-environment.json), .gitignore | 실제 ignored-but-tracked 0, 18개 규칙 probe 일치, lockfile 변경 없음. Node/OS/CPU/RAM/Git HEAD·서버 소스 SHA. 제외 규칙은 추적 파일에 소급 자동 적용되지 않음 |
| E11-07 | [실제 Node 강제 종료/재시작](evidence/stage10-restart.json), scripts/check-restart.mjs | 전용 .cache WAL DB로 별도 Node 프로세스 실제 종료/재시작. FINISHED rev2 보존, ACTIVE rev2→ABORTED rev3, PREPARING rev0→CANCELLED rev1, readiness 후 기존 토큰 결과 조회. 운영 볼륨/전원 장애 아님 |
| E11-08 | [설치 브라우저/adb 실제 조회](evidence/stage10-device-check.json) | adb1.0.41/platform-tools37.0.1-15733141; 기기 목록 비어 있음. Android Chrome 버전 null, 별도 PC/신뢰 HTTPS 미확인 |
| E11-09 | [두 창 업데이트 JSON](evidence/stage10-update.json) | Chrome 실제 구 빌드 f4e221f7555b9dff→최종 빌드. 대국 중 보류·홈 이후 적용. 설치 Android PWA/실제 온라인 대국 병행은 아님 |
| E11-10 | [40세션/20대국 실제 합성 부하](evidence/stage10-capacity.json) | 41번째 세션 거절, 100건 send→ACK p95 268.36ms. 같은 PC Node/loopback/:memory: SQLite. 서버 내부 처리만/브라우저/화면 지연 아님. 외부 망 목표 달성으로 판정하지 않음 |

## 10단계 개념 설명과 미수집 자료

C10의 구조/착수 흐름도·OSI 역할은 [소스 기반 설명](report-network-collection.md)으로 유지·갱신했다. E11의 실제 앱 관측을 패킷으로 명명하지 않는다. pcap/pcapng/TLS 키 로그는 여전히 없으며 P10 수집 절차와 G11-08로 연결한다. 실제 PC-PC/PC-Android/Android-Android, Android 신뢰 HTTPS 오프라인/PNG, 전체 성능 조건은 G11-01~09의 계획이다. 학번·성명은 미제공 상태다.

## 11단계 실제 재현/전달 증거 E12

**공개 배포/실제 Android/실제 GitHub Actions run은 아직 없다.** 아래 관측과 C10 소스 기반 설명, 미실행 G11 게이트를 구분한다.

| ID | 실제 자료 | 결과/범위 |
|---|---|---|
| E12-01 | [깨끗한 설치/명령 원문](evidence/stage11-clean-install.json), [초기 Node24.22.1 비교 기록](evidence/stage11-clean-install-node24221.json) | 최종 Node24.22.3/npm12.2.2 복사본 npm ci→typecheck→test→build 성공, 23 files/117 tests. 원본 node_modules/DB 유지. codeSha256은 최종 소스 전달본과 대조 |
| E12-02 | [최종 명령/종료 코드](evidence/stage11-checks.json), [117개 시험](evidence/stage11-tests.json) | 타입·서버/웹 빌드 성공. WS1012 drain/비협조 연결 종료·종료 중 readiness 시험 포함. Linux OS signal 인수는 아님 |
| E12-03 | [실제 런타임 준비](evidence/stage11-runtime.json), [고정 OCI/액션 값](../deploy/runtime-lock.json), [Caddy 구문 검사](evidence/stage11-caddy-validation.json) | 공식 checksum 확인, 전역 Node 변경 없음, manifest/tag/SHA 실제 조회. Caddy2.11.7 validate 성공. image build/run·공인 cert 발급은 미실행 |
| E12-04 | [실제 Caddy proxy/WS](evidence/stage11-deployment-smoke.json) | Windows 로컬 HTTP용 치환본, 웹/API/SW/manifest/health/readiness200·Origin 유지, WS 약16초/heartbeat3건. Docker/공인 HTTPS/WSS 아님 |
| E12-05 | [새 실제 Chrome/Edge 시연](evidence/stage11-browser.json), [Chrome 결과](evidence/stage11-chrome-result.png), [Edge 결과](evidence/stage11-edge-result.png), [온라인 360px](evidence/stage11-online-mobile-emulation.png), [홈 360px](evidence/stage11-mobile-emulation.png) | Node24.22.3의 실제 두 브라우저, 신청·9수 승리·채팅2·복구·PNG·재도전·창 대체·키보드/기본색 대비. 360px는 PC 에뮬레이션. 별도 PC/Android 아님 |
| E12-06 | [실제 패킷 안전 요약](evidence/stage11-packet-summary.json), scripts/check-packet-capture.mjs | Wireshark4.6.8/Npcap Loopback 332프레임/4stream/HTTP101 4건. 브라우저 착수9/채팅2 대조. frame105 JSON180/TCP payload188/frame232 bytes. NULL/Loopback, 평문 WS. 토큰/본문은 요약에 저장 안 함. 원본 private-captures/*.pcapng는 Git/Docker/전달본 제외 |
| E12-07 | [실기·도구 재확인](evidence/stage11-device-packet-check.json) | 실제 adb 목록0, Android Chrome null, 신뢰 HTTPS 없음. 표준 Wireshark 경로 발견 후 실제 capture 완료를 별도 시각으로 갱신. Android HTTPS/설치/offline/PNG/망 전환은 미실행 |
| E12-08 | [GitHub main 실제 조회](evidence/stage11-remote.json), [공개 소스 audit](evidence/stage11-release-audit.json) | 기존 원격/로컬 기준 HEAD 일치. 새 변경 push 없음. 추적 제외 대상0·실제 env/개인 보고서/원시 pcap 제외·예제 포함·lock 유지·CI pin 일치 |
| E12-09 | [Node24.22.3 파일 WAL 재시작](evidence/stage11-restart.json) | 실제 별도 process kill/restart, FINAL 유지/ACTIVE 무효/PREPARING 취소·ready 후 기존 토큰 조회. 기존 stage10 파일은 원문 복원해 보존 |
| E12-10 | 로컬 releases/SHA256SUMS.txt, source-manifest.json, source-validation.json 및 전달본 안 SOURCE_MANIFEST.json | 최신 소스/에셋/lock/테스트/CI/deploy/docs 전달. 포장 후 압축 해제와 파일별 hash·clean-install code hash 대조. releases는 Git 제외이며 사용자 로컬 전달용. 개인 학번/성명 보고서·비밀·raw pcap 미포함 |
| E12-11 | [실제 PC PNG](evidence/stage11-downloaded-result.png), [파일 열기](evidence/stage11-png-open.png), [변환 실패 주입](evidence/stage11-png-failure.png) | 실제 다운로드/디코드·브라우저 파일 열기·실패 후 결과 유지/재시도. Android 파일 열기 아님 |

## 11단계 미해결 실제 인수

[release-handoff.md](release-handoff.md)의 표와 G11-01~09를 유지한다. 별도 PC/Android 조합, Android Chrome 실제 버전·신뢰 HTTPS/WSS·PWA 설치/offline/PNG/재접속, 물리 NIC/WSS packet, Linux container/볼륨/OS signal, 실제 CI run은 미실행이다. 이제 **로컬 평문 WS packet은 실제 확보했으므로** 이를 과거 “캡처 없음” 기록과 구별한다. C10 구조도/OSI 표는 설명 자료이며 실제 radio/MAC/TLS 수치로 사용하지 않는다. 개인 최종 보고서는 코드 공개와 별도로 제출한다.
