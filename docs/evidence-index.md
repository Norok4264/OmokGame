# 증거 색인

기록 시점: 2026-11-11 (Asia/Seoul)  
앱 버전: `0.1.0` 개발 기반 단계 (게임 기능 미구현)

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

앱 기능 화면 캡처, WebSocket 실제 대국 교환, 패킷, 실기기, 성능 측정은 아직 수집되지 않았다. 웹 루트 HTTP 및 health 응답은 확인했으나 브라우저 화면 캡처는 확보하지 않았다. 개념도나 예시 이미지는 실제 증거로 등록하지 않는다.

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

현재 위 항목은 계획뿐이며, 실제 캡처·통신·검증 증거는 아직 없다.
