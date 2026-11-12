# 단판 오목

PC Chrome·Edge와 Android Chrome을 대상으로 하는 반응형 PWA와 Node.js 게임 서버입니다. 프로젝트 기반, 공유 오목 규칙 모듈, 초기·대기열·온라인 대국 준비·결과·혼자 놀기 화면이 있습니다. 대기열, 세션, 접속자 선택, 신청/승낙/취소와 대국 준비는 실제 WebSocket·SQLite 상태에 연결되어 있습니다. 서버 권위 착수·60초 제한시간·승패·기권과 양측 결과 snapshot을 연결했습니다. 결과방·재도전·서버 채팅·결과 PNG를 연결했습니다. 실제 IME와 다운로드 PNG 파일 열기는 미검증입니다. 최신 검증 범위는 docs/stage7-results-chat-png.md를 참고하세요. 혼자 놀기는 Worker 봇·로컬 판 복구를 지원합니다. 최종 PWA 빌드의 오프라인 종료/재실행을 데스크톱 Chrome/Edge에서 확인했습니다. Android의 신뢰 HTTPS 실기는 11단계 필수 재검증입니다.

## 기술 구성

- `apps/web`: React 19.3.1, TypeScript, Vite 8.3.7
- `apps/server`: Node.js HTTP/WebSocket 서버, `ws` 8.22.2, `better-sqlite3` 13.0.3
- `packages/shared`: 상태·식별자·JSON 메시지 런타임 검증과 화면/DB/네트워크 독립 오목 규칙
- npm workspaces, 정확한 직접 의존성 버전, `package-lock.json`

기본 개발환경은 Node.js 24.x입니다. 이 저장소의 npm CLI 기준은 12.2.2입니다. Node 24.22.1은 0단계 Codex 작업환경에서 확인된 값이며, 보안 패치가 적용된 지원 버전을 사용하세요. Windows 셸에서 `npm`을 사용할 수 없는 경우 설치된 Node.js 배포본에 npm이 포함되어 있는지 확인한 뒤 실행하세요.

## 시작

프로젝트 루트에서 실행합니다.

```powershell
npm install
npm run dev
```

웹 화면은 `http://127.0.0.1:5173`, 서버는 `http://127.0.0.1:3001`에서 열립니다. 웹 개발 서버의 `/api/healthz` 및 `/api/readyz` 요청은 Node 서버로 전달됩니다.

## 검사 및 빌드

```powershell
npm run typecheck
npm test
npm run build
```

서버를 별도로 실행한 상태에서 다음 명령으로 health/readiness를 확인할 수 있습니다.

```powershell
npm run check:server
```

`GET /healthz`는 프로세스 응답 여부, `GET /readyz`는 SQLite 연결과 필수 마이그레이션 적용 여부를 반환합니다. HTTP health 확인은 실제 온라인 대국, 외부 접근, 배포 또는 기기 호환성 검증이 아닙니다.

## SQLite와 영속성

최초 실행 시 루트의 `data/omok.sqlite`에 데이터베이스를 생성합니다. 이 파일과 WAL/SHM은 런타임 데이터이므로 Git에 포함되지 않습니다. 스키마 변경은 `apps/server/src/storage/migrations.ts`에서 버전 관리합니다. 채팅 본문은 현재 스키마에 저장하지 않습니다. 실행 중 마감 시각은 단조 증가 시계로 다루고, 저장 시각은 UTC ISO 형식으로 보관합니다.

검증된 게임 변경을 저장할 때 `persistGameTransition`은 현재 revision 확인, 게임 상태 갱신, 성공 requestId 응답 기록을 한 SQLite 트랜잭션에 넣습니다. 함수가 commit 후 반환된 뒤에만 상위 서버가 메모리 상태를 공개하고 연결된 클라이언트에 전달해야 합니다.

## 환경 설정

`.env.example`에는 로컬 기본값만 있습니다. 필요할 때 복사해 `.env`를 만들 수 있으며 실제 `.env`, 비밀값, DB 파일은 `.gitignore` 대상입니다. 세션 토큰 인증은 구현했습니다. 실제 외부 Origin 허용 목록·실서버 설정은 별도 확인이 필요합니다.

## 다음 단계

실제 별도 PC·Android 두 대와 신뢰 HTTPS/WSS를 확보하여 기기 조합·망 전환·IME·PNG·오프라인/업데이트를 재검증합니다. [전체 통합 검증표와 G11 필수 항목](docs/integration-validation.md)을 따르세요. PC 뷰포트 에뮬레이션은 Android 실기 시험이 아닙니다.

상세한 현재 상태는 `docs/handoff.md`, 요구사항 출처는 `docs/requirements.md`, 메시지 계약은 `docs/protocol.md`, 검증 상태는 `docs/acceptance.md`를 참고하세요.
Codex 계정을 바꾸고 같은 PC 작업 폴더에서 이어갈 때는 `docs/account-switch-handoff.md`를 먼저 읽으세요.

최신 복구: 15초 heartbeat, 30초 단절 확인, 60초 복귀 유예. 재인증 후 스냅샷으로 복구하며 기존 턴 마감을 유지합니다. 서버 재시작·DB 장애로 정상 진행하지 못한 ACTIVE는 시스템 무효 종료합니다. 검증 결과와 한계: [docs/recovery-policy.md](docs/recovery-policy.md).

7단계 상세 구현·80개 테스트·브라우저 검증 제한: [docs/stage7-results-chat-png.md](docs/stage7-results-chat-png.md).

최종 PWA 확인은 npm run build 후 npm run preview:web로 실행합니다. 오프라인 준비 완료를 확인한 후 네트워크 차단/재실행하세요. 최신 구현·실제 캡처·93개 테스트·Android gate: [docs/stage8-solo-offline.md](docs/stage8-solo-offline.md).

## 통신 보기와 보고서 자료

각 화면의 ‘통신 보기’를 펼치면 현재 브라우저의 실제 WebSocket 송수신을 확인할 수 있습니다. 최근 200건만 메모리에 유지하며 토큰·닉네임·채팅 본문을 제외합니다. 바이트는 원본 JSON UTF-8 크기, 왕복시간은 같은 기기의 응용 요청/응답 시간입니다. [현재 구조도·착수 흐름도·보고서 Ⅱ·Ⅲ 수집 절차](docs/report-network-collection.md), [9단계 실제 결과와 한계](docs/stage9-communication.md)를 참고하세요. 실제 Wireshark 패킷 및 WSS 배포 검증은 아직 없습니다.

## 최신 통합 검증

앱0.1.0 / 웹0.1.0-8f52d08ed448ebe3, 22개 파일115개 테스트·타입/빌드 통과. npm PATH가 없는 현재 Codex 셸에서는 `node scripts/verify-integrated.mjs`로 재현할 수 있습니다. Chrome/Edge 격리 대국·실제 PNG 열기·오프라인 재실행·업데이트와 실제 별도 Node/파일 WAL DB 재시작을 확인했습니다. 실제 기기 전체 인수는 미완료입니다. [검증표](docs/integration-validation.md), [최신 증거](docs/evidence-index.md). 의존성·lockfile 유지.
