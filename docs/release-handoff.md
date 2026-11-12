# 11단계 실행·재현·배포 구성·제출 인계

기록일 2026-11-12 (Asia/Seoul). 앱 0.1.0 / 이번 Windows 웹 빌드 0.1.0-8f52d08ed448ebe3. 실행·설치·배포·재시작 명령의 최신 기준은 [README](../README.md)이다. 과거 문서의 ‘아직 구현하지 않음’은 해당 단계 당시 기록이다.

## 전달 상태

| 항목 | 실제 상태 |
|---|---|
| 실행 경로 | 기존 PWA/workspaces 유지. 단일 Node + 영속 SQLite + 같은 HTTPS 출처 Caddy 정적 웹/API/WSS 구성 |
| 실제 배포 | **미배포**. 실제 서버·도메인·공인 인증서 제공 없음. Docker CLI/daemon도 이 환경에서 확인되지 않음 |
| 소스 | 기존 remote main과 로컬 HEAD 31d2096727f18b52eae1c487877065b757e0732d 실제 일치 확인. 이 단계 변경은 로컬이고 push/새 저장소/배포하지 않음 |
| 전달본 | releases/danpan-omok-source-0.1.0.tar.gz 및 SHA256SUMS.txt, source-manifest.json. 작업 트리의 최신 미커밋 파일 포함. .git/node_modules/실제 env/DB/원시 로그·pcap/개인 보고서 제외 |
| 재현성 | 코드/설정/테스트별 해시는 SOURCE_MANIFEST.json. 압축 해제 후 scripts/verify-source.mjs로 검증. 최종 코드 해시는 깨끗한 설치 기록의 codeSha256과 대조 |
| 개인 보고서 | 학번/성명 미제공·미추정. 공개 코드와 별개이며 private-reports 또는 별도 비공개 경로로 제출. 코드 전달본에 개인 PDF/DOCX/HWP를 포함하지 않음 |

## 변경 파일과 선택 이유

- `deploy/Dockerfile`, `compose.yaml`, `Caddyfile`, `.env.production.example`, `runtime-lock.json`: 실제 환경 미제공에 따라 실행 가능한 배포 구성과 필수 입력을 마련했다. Node 인스턴스 하나, backend 비공개 3001, Caddy 80/443, omok_data SQLite 볼륨, 인증서 볼륨, readiness 의존성, 계속 유지되는 WS를 사용한다. 실제 도메인 예시를 운영 주소처럼 만들지 않고 APP_DOMAIN을 공란/필수 값으로 둔다.
- `.node-version`, `.nvmrc`, `.github/workflows/ci.yml`: Node 24.22.3·npm 12.2.2·OCI digest·공식 checkout SHA 고정. 같은 Node 24 유지보수 선의 보안 패치를 공식 목록에서 확인하고 독립 복사본에서 실제 검증했다. 기존 전역 Node 24.22.1과 프로젝트 의존성/lockfile은 유지했다. CI는 npm ci→타입→전체 핵심 시험→빌드만 하며 배포/개인 보고서 업로드가 없다.
- `apps/server/src/shutdown.ts`, `shutdown.test.ts`, `index.ts`, `lobby.ts`: 종료 중 새 작업/readiness를 중지하고 1012로 WS를 닫으며, 비협조 연결에도 10초 안에 DB 종료를 진행한다. 이후 startup 정리 정책은 기존대로 유지한다. 함수 수준의 실제 WS drain과 강제 종료 경계를 시험했다.
- `.gitignore`, `.dockerignore`, `scripts/source-files.mjs`, `package-source.mjs`, `verify-source.mjs`, `check-release.mjs`: 소스·에셋·lockfile·테스트·예제 환경·문서/CI만 전달하도록 추적 목록과 제외 규칙을 확인한다. 원시 캡처/운영 로그·개인 보고서·서명키·런타임 DB를 제외한다. 기존 추적 파일을 자동 해제하는 것으로 설명하지 않는다.
- `scripts/check-clean-install.mjs`, `check-deployment.mjs`, `check-packet-capture.mjs`, 기존 `check-integrated-browser.mjs`, `verify-integrated.mjs`: 설치 재현, 실제 proxy/WS 경로, 실제 packet→브라우저 이벤트 대조, 단계별 증거 저장을 추가했다. 이전 stage10 파일을 덮어쓰지 않도록 최신 증거는 stage11로 분리한다.
- README와 environment/requirements/protocol/acceptance/handoff/evidence-index/report-network-collection을 갱신했다. 게임 규칙·돌 배정·승인/저장 순서는 변경하지 않았다. Android/Gradle 프로젝트는 없고 Wrapper도 비적용이다.

## 실제 실행과 결과

| 실행 | 실제 결과 / 한계 |
|---|---|
| `git ls-remote origin refs/heads/main` | 실제 remote main=로컬 HEAD. 네트워크 제한 셸 실패 후 승인된 읽기 전용 조회로 확인. [원격 기록](evidence/stage11-remote.json) |
| 공식 Node/npm/Caddy 준비 | 공식 tar/zip 무결성 검증 후 .cache/tools 안에서만 실행. Node 24.22.3 SHA-256, npm 12.2.2 registry integrity, Caddy 2.11.7 SHA-512 확인. Caddy의 체크섬을 SHA-256으로 잘못 비교한 시도는 실행 전에 중단했고 실제 SHA-512 형식을 확인해 교정 |
| `node scripts/check-clean-install.mjs` (Node 24.22.3로 호출) | 새 .cache 검증 복사본에서 npm12.2.2 ci→typecheck→test→build 성공. **23 files/117 tests**, 같은 Windows 웹 빌드. 원본 node_modules/DB 미변경. [실제 설치 원문/종료 코드](evidence/stage11-clean-install.json) |
| `node scripts/verify-integrated.mjs` (Node 24.22.3로 호출) | 타입·117개 테스트·서버/웹 빌드 성공. [명령 결과](evidence/stage11-checks.json), [시험 상세](evidence/stage11-tests.json). 초기에 node.exe를 JS 인자로 전달한 호출 오류는 PowerShell 실행 파일 호출(&)로 교정 |
| `caddy validate --config deploy/Caddyfile --adapter caddyfile` | 실제 Caddy 2.11.7에서 성공. validation.invalid는 예약된 구문 시험 값이며 배포 도메인이 아님. [구문 검사](evidence/stage11-caddy-validation.json) |
| `node scripts/check-deployment.mjs` | 같은 Caddyfile의 로컬 HTTP용 치환본으로 실제 정적 웹/API/health/ready/SW/manifest 200, no-cache 헤더·Origin 보존·인증 확인. WS 약 16초 유지, heartbeat 응답 3건. [proxy 실제 결과](evidence/stage11-deployment-smoke.json). Docker/공인 TLS 실증 아님 |
| `node scripts/check-packet-capture.mjs` | 실제 Npcap loopback + dumpcap/tshark 4.6.8. Chrome/Edge 실제 E2E 착수9/채팅2와 캡처 대조. [패킷 요약](evidence/stage11-packet-summary.json), [브라우저 시연](evidence/stage11-browser.json) |
| `adb devices -l`, 캡처 도구·자료 재조회 | Android 연결 목록은 비어 있고 Chrome 버전은 미확인. PATH에는 없던 Wireshark를 표준 경로에서 발견해 인터페이스/실제 캡처까지 확인. [재확인 기록](evidence/stage11-device-packet-check.json) |
| `node scripts/check-release.mjs` | 실제 추적/예제·개인 보고서·원시 캡처 제외 probe, CI/배포 pin 일치, lockfile 변경 없음 확인. [공개 소스 검사](evidence/stage11-release-audit.json) |
| 포장/압축 해제/manifest 검증 | releases의 SHA256SUMS/source-manifest/source-validation을 확인. 전달 파일/코드 해시를 실제 재검증하며 원본 캡처는 포함하지 않음 |

공식 고정 환경 확인은 [Node 배포 목록](https://nodejs.org/dist/index.json), [npm ci](https://docs.npmjs.com/cli/v12/commands/npm-ci/), [Caddy WS proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy), [Compose readiness](https://docs.docker.com/compose/how-tos/startup-order/)를 참고했다. OCI manifest 존재 확인은 컨테이너 실행 검증과 다르다. GitHub CI도 설정만 작성했으며 실제 Actions run은 아직 없다.

## 실제 패킷의 범위와 수치

시험 전 3001 포트가 비어 있음을 확인했다. 독립 Vite preview/Node 시험 서버만 열고 `\Device\NPF_Loopback`, capture filter `tcp port 3001`로 25초 수집했다. Windows Caddy proxy 시험과 별개로 이 캡처는 **브라우저→Vite→Node 중 Vite↔Node 구간**이다. 외부 트래픽이나 사용자의 다른 포트로 필터를 넓히지 않았다.

- 캡처 332프레임, TCP stream 4개, HTTP 101 응답 4건. 새로고침/새 창에 따라 연결이 늘어난 것이며 4판을 의미하지 않는다.
- 브라우저 실제 전송과 짧은 requestId/gameId·좌표·revision 또는 채팅 길이로 11건 대조: 착수9, 채팅2. 서로 다른 기기의 시각을 빼서 지연을 계산하지 않았다.
- 첫 착수 frame105는 A1 (0,0), expectedRevision1, **JSON180 bytes / TCP payload188 bytes / 캡처 frame232 bytes**다. JSON을 TCP 전체 크기로 쓰지 않는다. 한 사례의 분해이며 모든 메시지가 패킷 한 개에 대응한다는 뜻이 아니다.
- capinfos와 frame.encap_type에서 NULL/Loopback(15)을 확인했다. Ethernet MAC이나 실제 Wi-Fi 무선 헤더를 관측했다고 쓰지 않는다. 실제 IPv4 loopback 127.0.0.1 관측이다.
- raw 원본은 `private-captures/stage11-loopback-1794468092342.pcapng` (177036 bytes)에만 있다. 평문 인증 토큰/채팅이 들어갈 수 있으므로 Git·Docker context·소스 전달본에서 제외한다. 공개 JSON은 허용된 메타데이터/짧은 ID/본문 길이만 남기며 raw TShark JSON도 저장하지 않는다.

이번에는 **TLS/WSS가 없었다**. 운영 WSS는 일반 캡처에서 JSON을 그대로 볼 수 없고, 실제 TLS 종단/복호화 조건/링크 유형을 별도 기록해야 한다. [Ⅱ·Ⅲ 수집 절차](report-network-collection.md)의 HTTPS 한계 설명은 그대로 적용된다. 소스 기반 OSI 대응은 개념 자료이며 실제 packet 자료와 구별한다.

## 11단계 실제 기기 재확인표

| 항목 | 이번 확인 / 아직 필요한 증거 |
|---|---|
| PC-PC / PC-Android / Android-Android | 같은 호스트 Chrome·Edge만 실제 실행. 별도 PC 2대·Android 2대 조합 미실행. G11-01~03 유지 |
| Android Chrome 버전·HTTPS/WSS | adb 연결0, 도메인/신뢰 HTTPS 미제공. 버전·실제 인증서·WSS 접속 증거 없음 |
| Android PWA 설치/오프라인 | 실제 설치·비행기모드·종료/재실행·봇 종료 미실행. 같은 웹 빌드의 기존 데스크톱 offline E11-03은 별도 증거이며 실기로 바꾸지 않음 |
| Android PNG 저장/열기 | 미실행. 이번 PC Chrome의 실제 다운로드/파일 열기·실패 주입/재시도는 E12에 등록 |
| Android 재접속/망 전환/IME | 실제 Wi-Fi↔이동통신 전환·절전/탭 복원·소프트 키보드는 미실행. 자동 시험/PC 새로고침과 구분 |
| 실제 packet | 로컬 평문 WS loopback 캡처 완료. 물리 NIC/공개 WSS/TLS 캡처는 미실행 |
| Linux container/호스트 | Docker 없음. 실제 OCI build/영속 볼륨 권한·OS signal·자동 재시작·공인 TLS·운영 관찰은 미실행 |

없던 장비·HTTPS·수치를 만들어 통과 처리하지 않는다. G11-01~09는 이번 단계에서 **소프트웨어 준비 완료 / 실기 게이트 미해결**로 구분한다. 실제 환경을 제공받으면 이 표를 같은 단계에서 다시 확인해야 한다. 단계 번호를 바꾸어 미검증을 숨기지 않는다.

## 사용자 최소 조작과 제출 순서

1. 전달본의 SHA256SUMS 확인 → 빈 폴더에 압축 해제 → `node scripts/verify-source.mjs`.
2. Node24.22.3/npm12.2.2 준비 → `npm ci` → `npm run typecheck` → `npm test` → `npm run build`.
3. 로컬은 `npm run dev`, PWA 확인은 별도 서버 + `npm run preview:web`. 실제 배포는 README의 실제 APP_DOMAIN 입력/Compose 절차를 따른다. Docker/HTTPS 미검증을 먼저 확인한다.
4. README의 신청→착수/채팅→5목→PNG→재도전→offline 시연 순서를 따른다. 실제 Android는 신뢰 HTTPS와 기기 연결을 확보한 뒤 위 표를 채운다.
5. 공개 소스는 `node scripts/check-release.mjs`와 staged diff 확인 후 사용자가 commit/push한다. 개인 보고서·원본 pcap·DB·비밀값을 함께 공개하지 않는다.
6. 보고서 Ⅰ 소개/화면, Ⅱ 구조/OSI와 실제 통신 구분, Ⅲ 실제 대국/PNG/패킷·기기, Ⅳ A/B와 한계를 E12 및 기존 E11에 연결한다. 학번·성명 있는 최종 보고서는 별도 비공개 제출한다.

서버에 영속 운영 로그를 붙일 경우 최대24시간 수명과 비밀정보 제외를 실제 호스트에서 확인한다. 현재 Compose는 운영 로그 비보관을 기본으로 하며 DB 결과 정리는 구현되어 있다. 외부 망 RTT≤100ms 조건에서 종단 간 화면 p95≤1초는 아직 실기 목표이며 로컬 ACK/DOM 수치로 대체하지 않는다.
