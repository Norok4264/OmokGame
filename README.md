# 단판 오목

PC Chrome·Edge와 Android Chrome을 대상으로 하는 반응형 PWA와 Node.js 게임 서버입니다. 현재는 프로젝트 기반과 화면·DB·네트워크에 독립적인 공유 오목 규칙 모듈까지 구현했습니다. 아직 규칙을 온라인 서버/대국 UI에 연결하지 않았고, 온라인 대국·대기열·전체 UI·봇·오프라인 재실행도 구현되지 않았습니다.

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

`.env.example`에는 로컬 기본값만 있습니다. 필요할 때 복사해 `.env`를 만들 수 있으며 실제 `.env`, 비밀값, DB 파일은 `.gitignore` 대상입니다. 현재 단계에서는 인증·실제 외부 Origin 허용 목록·실서버 설정이 구현되지 않았습니다.

## 다음 단계

1. 실제 사용자 PC의 Node/npm/Git/브라우저 출력을 확인하고 환경 문서를 보완합니다.
2. 공통 규칙을 대국 화면과 서버 판정 경로에 연결하고 입력 미리보기/확정을 검증합니다.
3. 규칙 모듈을 미리보기/확정 UI 및 서버 권위 판정에 연결한 뒤 반응형 대기열·대국 화면을 구현합니다.
4. 온라인 세션, 신청/승낙, 영속 서버 판정과 재접속을 순서대로 구현합니다.
5. 결과·채팅·PNG·봇·PWA 오프라인 동작, 통신 보기와 실제 증거를 추가합니다.

상세한 현재 상태는 `docs/handoff.md`, 요구사항 출처는 `docs/requirements.md`, 메시지 계약은 `docs/protocol.md`, 검증 상태는 `docs/acceptance.md`를 참고하세요.
