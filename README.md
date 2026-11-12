# 단판 오목

PC Chrome·Edge와 Android Chrome을 대상으로 하는 React·TypeScript·Vite PWA와 Node.js·ws·SQLite 앱입니다. 온라인은 서버가 착수와 결과를 확정하며, 혼자 놀기는 같은 자유룰과 기기 내부 Worker 봇을 사용합니다.

현재 앱은 **0.1.0**, 이번 Windows 빌드는 **0.1.0-8f52d08ed448ebe3**입니다. [인수 기준](docs/acceptance.md), [11단계 전달·검증 기록](docs/release-handoff.md), [실제 증거](docs/evidence-index.md)를 먼저 확인하세요. 실제 서버/도메인과 Android 기기가 제공되지 않아 **공개 배포·Android 실기 인수는 미완료**입니다. 로컬 WS 패킷은 실제 수집했으며 WSS 캡처는 없습니다.

## 고정 실행환경과 설치

릴리스/CI 기준은 **Node 24.22.3, npm 12.2.2**입니다. 공식 배포 목록에서 확인한 같은 Node 24 유지보수 선의 보안 패치를 별도 복사본에서 검증했습니다. 기존 Codex 전역 Node 24.22.1은 변경하지 않았으며 프로젝트 의존성과 lockfile도 유지했습니다. [.node-version](.node-version), [.nvmrc](.nvmrc), [고정 이미지·액션](deploy/runtime-lock.json)을 포함합니다.

Node 24.22.3을 준비한 개발 셸에서 프로젝트 루트 기준으로 실행합니다. npm 버전 변경 명령은 해당 셸/설치에 적용되므로 먼저 버전을 확인하세요.

~~~powershell
node --version
npm --version
# npm이 12.2.2가 아닐 때 준비
npm install --global npm@12.2.2
npm ci --no-audit --no-fund
npm run typecheck
npm test
npm run build
~~~

`npm ci`는 기존 package-lock.json을 사용합니다. 승인된 better-sqlite3/esbuild 고정 버전의 설치 스크립트는 package.json의 allowScripts 정책을 따릅니다. native 모듈을 소스로 빌드해야 하는 환경에는 Python·C/C++ 빌드 도구가 필요하며 Docker/CI에는 이를 준비했습니다. 설치 과정에서 lockfile을 재생성하거나 자동 의존성 업그레이드를 하지 마세요.

구조는 apps/web, apps/server, packages/shared, docs입니다. 배포 설정은 deploy, CI는 .github/workflows/ci.yml, 검증/포장 도구는 scripts에 있습니다. 기본 경로는 PWA이며 Android Studio·Gradle·JDK는 빌드 필수 아님입니다. Android 프로젝트/Gradle Wrapper를 새로 생성하지 않았습니다.

## 로컬 실행과 재현

~~~powershell
npm run dev
~~~

웹은 http://127.0.0.1:5173, Node는 http://127.0.0.1:3001입니다. /api와 /ws는 개발 프록시로 연결됩니다. 선택적으로 .env.example을 .env로 복사합니다. 실제 .env는 Git/전달본 제외입니다.

PWA·오프라인은 최종 빌드에서 확인합니다. 다음 두 프로세스를 별도 터미널에서 실행하세요.

~~~powershell
npm run build
npm run start:server
# 다른 터미널
npm run preview:web
~~~

preview 주소는 http://127.0.0.1:4173입니다. localhost 예외로 가능한 데스크톱 PWA 시험을 Android의 신뢰 HTTPS 시험으로 취급하지 않습니다. 서버 종료는 해당 터미널의 Ctrl+C입니다.

루트 `node scripts/verify-integrated.mjs`는 설치된 고정 도구로 타입·전체 테스트·서버/웹 빌드를 실행하고 docs/evidence/stage11-checks.json에 실제 결과를 남깁니다. 별도 깨끗한 복사본의 npm ci→타입→테스트→빌드 결과는 [clean-install JSON](docs/evidence/stage11-clean-install.json)입니다. 실제 이번 결과는 **23개 파일/117개 테스트 통과**입니다.

## 단일 인스턴스 HTTPS 배포 구성

오래 실행되는 Linux 서버/VM과 Docker Engine·Compose plugin을 사용하는 구성입니다. Node 서버는 한 인스턴스로 실행하고 Caddy가 같은 HTTPS 출처의 웹·API·WSS를 제공합니다. 정적 GitHub Pages만으로 Node/WebSocket 서버를 대체할 수 없습니다.

~~~mermaid
flowchart LR
  B[PC / Android 브라우저] -->|HTTPS 443 정적 PWA| C[Caddy 한 출처]
  B <-->|WSS /ws| C
  C -->|HTTP /api 접두사 제거| N[Node 단일 인스턴스 :3001]
  C <-->|내부 WS| N
  N --> D[(영속 볼륨 omok_data /data/omok.sqlite)]
~~~

실제 서버 주소·도메인은 정해지지 않았습니다. 자신의 실제 DNS 이름이 있고 그 DNS/방화벽이 서버의 80·443에 연결되며 인증서 발급 조건을 만족해야 합니다. Node 3001은 외부에 publish하지 않습니다. [Dockerfile](deploy/Dockerfile), [Compose](deploy/compose.yaml), [Caddyfile](deploy/Caddyfile)은 기본 구조를 그대로 실행하도록 준비했습니다. 이 작업환경에는 Docker가 없어 **컨테이너 빌드/실행은 미검증**입니다. 이미지 태그/digest 존재와 Caddy 2.11.7 구문 검사 및 로컬 HTTP proxy/WS 시험은 확인했습니다.

아래 명령은 저장소 루트에서 실행합니다. PowerShell에서는 Copy-Item, Linux에서는 cp로 예제를 복사하고 APP_DOMAIN에 실제 DNS 이름만 입력합니다(https://와 경로 제외). 빈 값은 Compose에서 거절합니다.

~~~powershell
Copy-Item deploy/.env.production.example deploy/.env.production
# deploy/.env.production의 APP_DOMAIN을 실제 값으로 편집
# Linux에서는: cp deploy/.env.production.example deploy/.env.production

docker compose --env-file deploy/.env.production -f deploy/compose.yaml config
docker compose --env-file deploy/.env.production -f deploy/compose.yaml build
docker compose --env-file deploy/.env.production -f deploy/compose.yaml up -d --wait
docker compose --env-file deploy/.env.production -f deploy/compose.yaml ps
~~~

Caddy는 준비된 Node /readyz가 healthy가 된 뒤 시작하며, 실제 DNS 이름의 인증서를 자동 관리하도록 구성했습니다. /data와 /config 인증서 볼륨도 유지합니다. /ws의 Upgrade/양방향 통신을 지원하고 짧은 스트림 만료시간을 설정하지 않았습니다. 대국 종료 후 배포·재시작을 수행하세요. 동일 볼륨을 공유하는 서버 replica를 늘리거나 여러 Node 프로세스로 분산하지 않습니다. Compose의 고정 container_name도 다중 replica 실행을 막습니다.

| 설정 | 로컬 / 배포 값 |
|---|---|
| APP_DOMAIN | 배포 env 파일에만 실제 DNS 이름 입력. 기본 공란; 실제 값 미제공 |
| ALLOWED_ORIGINS | 로컬 .env.example의 정확한 localhost 출처 / Compose가 https://APP_DOMAIN으로 지정 |
| HOST / PORT | 로컬 127.0.0.1:3001 / 컨테이너 내부 0.0.0.0:3001 |
| DATABASE_PATH | 로컬 ./data/omok.sqlite / 컨테이너 /data/omok.sqlite |
| NODE_ENV | 배포 production |
| omok_data | SQLite와 WAL/SHM을 보관하는 이름 있는 영속 볼륨. 웹 정적 파일과 분리 |
| caddy_data / caddy_config | 인증서와 Caddy 상태. 비밀 자료이며 소스에 넣지 않음 |

소스·이미지의 고정 값은 [runtime-lock.json](deploy/runtime-lock.json)에 있습니다. Node/Caddy 이미지 digest와 checkout 액션 SHA를 고정했고 npm 의존성은 lockfile을 따릅니다. apt 저장소의 빌드 도구까지 전체 바이너리 동일성을 보장하는 구성은 아닙니다. 실제 Linux 이미지 빌드와 GitHub CI 실행 결과는 앞으로 확보해야 합니다.

## DB 마이그레이션·readiness·정리

서버 시작 시 SQLite open/WAL 설정 → migration 1~5 적용 → 미종결 정리 → 만료 기록 정리 → listen 순서입니다. migration은 schema_migrations에 기록하고 트랜잭션으로 적용합니다. 실패하면 새 접속을 열지 않습니다. 별도 수동 SQL 적용 명령은 필요하지 않습니다.

- PREPARING은 CANCELLED, ACTIVE는 ABORTED / SYSTEM_ABORT로 정리하며 저장된 최종 결과는 보존합니다.
- 착수·종료·대국 생성은 검증→상태/성공 요청 원자 저장→commit→메모리 공개/알림 순서입니다. DB 장애 중 착수·시간패 확정을 중지하고 복구 후 정상 진행하지 못한 ACTIVE는 시스템 무효 처리합니다.
- 결과·연관 성공 요청/조회 링크는 종료 24시간 기준으로 시작 시 및 실행 중 최대 60초 주기로 정리합니다. 결과 조회 권한은 24시간 경계에서 차단하며 활성 판은 삭제하지 않습니다.
- 채팅 최근 100건은 메모리에만 유지하고 양쪽 결과방 퇴장 또는 종료 5분 중 이른 때 삭제합니다. 이름 예약은 세션 종료·복귀 유예 만료에 해제합니다.
- /healthz는 프로세스 응답, /readyz는 DB/정리 상태를 확인하며 장애·종료 중에는 503입니다. 외부에서는 /api/healthz, /api/readyz도 같습니다. 상태 응답은 no-store입니다.

~~~powershell
# 개발/별도 서버 실행 중
npm run check:server
# 배포 컨테이너 안에서 readiness 확인
docker compose --env-file deploy/.env.production -f deploy/compose.yaml exec -T server node -e "fetch('http://127.0.0.1:3001/readyz').then(async r=>{console.log(r.status,await r.text());process.exit(r.ok?0:1)})"
~~~

운영 접근 로그와 Docker 영속 운영 로그는 기본 비활성화했습니다(logging driver none). 현재 기본 구성에는 별도 운영 로그 파일 정리 대상이 없습니다. 상태는 health/readiness·Compose ps로 확인합니다. 운영 집계/디버그 로그를 추가하는 실제 서버에서는 비공개 저장 위치와 최대 24시간 수명 정책을 함께 구성·검증해야 하며 원시 로그를 Git/보고서 공개 자료로 복사하지 않습니다.

## 프로세스 재시작·업데이트·백업

~~~powershell
docker compose --env-file deploy/.env.production -f deploy/compose.yaml restart server
# 소스 변경 후, 진행 중인 대국이 없는 시점에
docker compose --env-file deploy/.env.production -f deploy/compose.yaml up -d --build --wait
~~~

SIGTERM/SIGINT에서 새 처리를 중지하고 WebSocket 1012 종료를 보낸 뒤 HTTP/WS를 정리하고 DB를 닫습니다. 응답하지 않는 연결은 10초 뒤 종료하며 Compose 유예는 15초입니다. 다음 시작 시 저장된 상태를 위 정책으로 정리합니다. 실제 함수의 WS drain/강제 종료 경계 시험과 별도 Node 강제 종료·WAL 재시작 시험이 있습니다. Linux 컨테이너의 OS signal/볼륨 시험은 아직 없습니다.

Compose의 down은 이름 있는 볼륨을 유지합니다. 볼륨 삭제 옵션은 데이터를 지우므로 재시작/업데이트 절차에 사용하지 않습니다. 백업은 앱을 정지한 뒤 /data 전체를 비공개 보관하거나 SQLite의 일관된 backup API를 사용하세요. 실행 중 .sqlite 하나만 복사하면 WAL 데이터가 빠질 수 있습니다. 정지 후 복사 예시는 다음과 같습니다.

~~~powershell
New-Item -ItemType Directory -Force data | Out-Null
docker compose --env-file deploy/.env.production -f deploy/compose.yaml stop server
docker compose --env-file deploy/.env.production -f deploy/compose.yaml cp server:/data data/backup
docker compose --env-file deploy/.env.production -f deploy/compose.yaml start server
~~~

복구/rollback은 백업과 migration 호환성을 확인한 뒤 같은 단일 인스턴스/볼륨 정책으로 수행합니다. 이 작업에서 사용자의 실제 runtime DB를 초기화하지 않았습니다.

## GitHub·소스 전달본·개인 보고서

확인한 원격은 https://github.com/Norok4264/OmokGame 입니다. 이 단계 시작 시 실제 remote main과 로컬 HEAD 31d2096727f18b52eae1c487877065b757e0732d가 일치했습니다. [실제 조회](docs/evidence/stage11-remote.json). 이번 배포/CI 변경은 **로컬 준비 상태이며 push하지 않았습니다**. 원격 주소가 있다는 사실을 앱 배포 성공으로 취급하지 않습니다.

~~~powershell
node scripts/check-release.mjs
node scripts/package-source.mjs
Get-FileHash releases/danpan-omok-source-0.1.0.tar.gz -Algorithm SHA256
~~~

최신 작업 파일을 담은 전달본은 releases/danpan-omok-source-0.1.0.tar.gz, 체크섬은 releases/SHA256SUMS.txt입니다. 소스·에셋·고정 lockfile·테스트·예제 환경·CI·배포 설정·문서를 포함합니다. SOURCE_MANIFEST.json은 파일별 SHA-256과 코드 해시를 담습니다. 빈 폴더에 압축을 푼 뒤 그 폴더에서 `node scripts/verify-source.mjs`로 확인하고 위 설치/검사 명령을 실행하세요. 전달본은 .git과 node_modules 없이 생성하며 Git에서 제외합니다.

.gitignore와 포장 도구는 실제 .env/비밀 설정, SQLite/WAL/SHM, 빌드/캐시/로그, 원시 pcap/pcapng/HAR, 개인 IDE와 private-reports·submission-private를 제외합니다. .env.example과 deploy/.env.production.example은 포함합니다. 기존 추적 파일에도 제외 규칙이 자동 적용되지는 않으며 이번 검사에서 추적된 제외 대상은 0건입니다. Android 프로젝트는 없으며 향후 필요한 경우 Gradle Wrapper 소스/바이너리는 포함하고 local.properties·build·서명키는 제외합니다.

**코드 공개는 학번·성명이 있는 개인 보고서 공개를 뜻하지 않습니다.** 개인 보고서는 private-reports/ 또는 별도 비공개 저장 위치에 두고 교수 제출 경로로 따로 전달하세요. 코드 전달본에는 개인 PDF/DOCX/HWP 보고서를 넣지 않습니다. 학번·성명을 추정하지 않았습니다. 폰트의 OFL 원문은 공개 자원에 유지했습니다.

사용자가 검토 후 업로드할 때:

~~~powershell
git status --short
git remote -v
node scripts/check-release.mjs
git add --dry-run .
git add .
git diff --cached --stat
# 검토 후에만
git commit -m "Prepare deployment, CI and reproducible source delivery"
git push origin main
~~~

원격 연결을 바꾸거나 새 저장소를 생성하지 않았습니다. CI는 push/PR/manual trigger에서 고정 Node 이미지·npm으로 npm ci→타입→전체 핵심 테스트→빌드를 실행합니다. 배포/비밀값 업로드 단계는 없고 이 작업에서 실제 GitHub Actions 실행을 관측하지 않았습니다.

## 시연 순서와 보고서 증거

1. 두 독립 클라이언트로 입장 → B가 A에게 신청 → A 승낙(흑) → 양쪽 준비/3초 안내.
2. 후보를 선택하고 돌 놓기로 확정. 빠른 정상 시연은 흑 A1~E1, 백 A3~D3 순으로 9수 종료. 실제 대국에서는 상대가 자유롭게 선택합니다.
3. 채팅 한글·색·과거 스크롤·상대 숨김과 통신 보기의 좌표/revision/JSON 바이트/응용 왕복시간 확인.
4. 승자 PNG 다운로드/실제 파일 열기 → 패자 재도전/승낙 → 새 ID·배정·빈 판·새 채팅/준비 확인.
5. 혼자 놀기 오프라인 준비 완료 → 네트워크 차단 → 앱 종료/재실행 → 봇 대국 완료. Android는 신뢰 HTTPS와 실제 기기에서 별도 확인.
6. 실제 패킷 자료는 [안전한 요약](docs/evidence/stage11-packet-summary.json)과 [수집 절차](docs/report-network-collection.md)를 사용합니다. 이번 캡처는 Vite→Node의 평문 loopback WS이며 공인 WSS/물리 링크 시험이 아닙니다.

[11단계 전달·실제 결과·알려진 한계](docs/release-handoff.md)에 설치/배포 검증, Android·WSS·PWA 설치/PNG/재접속 재확인 상태와 제출 증거 목록을 기록했습니다. 이전 단계의 실제 관측은 역사 증거로 보존합니다.

## 구성 근거

- [Node 공식 배포 목록](https://nodejs.org/dist/index.json): 확인한 24.22.3 보안 패치와 실제 격리 재검증.
- [npm ci](https://docs.npmjs.com/cli/v12/commands/npm-ci/): lockfile 기반 설치.
- [Caddy WebSocket reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy): Upgrade와 양방향 연결 지원.
- [Compose health 의존성](https://docs.docker.com/compose/how-tos/startup-order/): service_healthy 이후 앞단 시작.
