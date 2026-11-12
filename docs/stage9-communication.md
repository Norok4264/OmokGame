# 9단계 통신 보기·보고서 자료

기록일: 2026-11-12 (Asia/Seoul). 앱 0.1.0 / 최종 빌드 `0.1.0-9aa3175978d99527`.

## 구현과 변경 파일

- `apps/web/src/communication-log.ts`: 실제 JSON 송수신 메타데이터, UTF-8 크기, 같은 기기 단조 시계 기반 응용 왕복시간, 200건 메모리 제한. 원문은 보관하지 않고 허용된 필드만 요약한다. 같은 ID의 중첩 전송은 RTT 모호함을 표시한다.
- `apps/web/src/lobby-client.ts`: 인증·일반 요청·heartbeat의 실제 send 및 현재 소켓 message에 계측 연결. 게임 프로토콜/서버 판정은 변경하지 않았다.
- `apps/web/src/CommunicationView.tsx`, `App.tsx`, `styles.css`: 모든 화면에서 펼치는 통신 보기, 기록 지우기, OSI 역할 설명. 접힌 상태를 기본으로 하여 대국 조작을 방해하지 않는다. 넓은 이벤트 표는 자체 가로/세로 스크롤을 제공한다.
- `communication-log.test.ts`, `lobby-client.test.ts`: 개인정보 제외, 원본 바이트, RTT, 소켓 격리, 중첩 요청, 200건/삭제 검증.
- `scripts/check-communication.mjs`: 격리 브라우저 두 세션과 실제 Node/SQLite 통합 시험. raw frame은 시험 중 메모리 비교에만 쓰며 파일에는 안전한 요약만 저장한다.
- `.gitignore`: 민감 정보가 들어갈 수 있는 원본 캡처용 `private-captures/` 제외. 기존 추적 파일에는 자동 소급 적용되지 않는다. 현재 해당 경로의 추적 파일은 없다.
- README, protocol, acceptance, handoff, evidence-index 및 [Ⅱ·Ⅲ 수집 절차](report-network-collection.md) 갱신. 의존성/lockfile 변경 없음.

## 실제 명령과 결과

Codex Windows PowerShell 작업 셸에서 실행했다. 일반 사용자 PC의 터미널 설정/Android 실기를 대신하지 않는다.

~~~powershell
.\node_modules\.bin\tsc.cmd -p packages/shared/tsconfig.build.json
.\node_modules\.bin\tsc.cmd -p apps/server/tsconfig.build.json
.\node_modules\.bin\tsc.cmd -p apps/web/tsconfig.json --noEmit
.\node_modules\.bin\vitest.cmd run
.\node_modules\.bin\vite.cmd build apps/web --config apps/web/vite.config.ts
~~~

타입 검사·빌드 성공. 전체 20개 파일/99개 테스트 통과. shared/server 기본 tsconfig 검사도 성공했다. 최초 재확인 중 `vite build --config apps/web/vite.config.ts`에서 웹 root 인자를 빠뜨려 ENOENT가 발생했다. 위의 루트 package.json과 같은 올바른 명령으로 재실행하여 성공했다. npm CLI PATH 문제를 우회해 설치된 바이너리를 사용했으며 의존성을 다시 설치하지 않았다.

Vite preview를 127.0.0.1:4173에 실행한 뒤 다음 실제 브라우저 시험을 실행했다. 이 스크립트는 3001 포트에 별도 in-memory SQLite 서버를 생성하고 종료하므로 기존 서버를 먼저 중지해야 한다.

~~~powershell
$env:TEST_NODE_MODULES='C:\Users\Administrator\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules'
$env:TEST_BROWSER_EXE='C:\Program Files\Google\Chrome\Application\chrome.exe'
node scripts/check-communication.mjs
~~~

번들 Playwright 경로는 이 작업환경 전용이다. 브라우저 격리 실행에는 샌드박스 밖 프로세스 실행 승인을 사용했다. 사용자 기존 브라우저 창을 조작하지 않았다.

Chrome 157.0.8103.51, 독립 context A/B, localhost HTTP/WS/Vite proxy 시험 성공. A 28건/B 20건의 안전한 표시 기록, 양쪽 H8 흑·revision 2 일치, 실제 송신 착수 JSON 180 UTF-8 bytes와 표의 일치, 채팅 길이 13, 전체 토큰/ID/채팅 본문 제외, 응용 RTT 존재, 기록 지우기를 확인했다. 이는 표본 한 번의 기능 확인이며 성능 평균이나 TCP 패킷 길이 측정이 아니다.

## 완료·실패·미검증

요청한 통신 보기, 개념 설명, 구조도/착수 흐름도와 수집 절차를 구현했다. 잘못된 CLI 인자 실행은 교정했다. Wireshark/pcapng, 실제 NIC·IP·MAC/라우팅, TLS 복호화, WSS 배포, Android 실기, 이번 빌드의 Edge 및 모바일 통신 보기 시각 확인은 미실행이다. 기존 8단계의 다른 빌드 시험은 역사 증거로 유지한다. 이번 빌드를 그때의 오프라인 시험 완료 버전이라고 표시하지 않는다.

## 사용자 최소 확인

기존 의존성이 준비된 사용자 개발 셸에서 `npm run dev`. 독립 브라우저 프로필 두 개로 대기열 입장→B가 A에게 신청→A 승낙→준비→A H8 선택/돌 놓기→채팅 한 건을 진행한다. 각 화면의 ‘통신 보기’를 열어 좌표/revision/바이트/응용 왕복시간과 채팅 길이를 확인한다. 실제 패킷 수집은 [절차 문서](report-network-collection.md)의 Ⅲ을 따른다.

## 실제 증거와 인수인계

[안전한 앱 이벤트 JSON](evidence/stage9-application-events.json), [A 화면](evidence/stage9-communication-a.png), [B 화면](evidence/stage9-communication-b.png)은 실제 로컬 브라우저 관측이다. 구조도/OSI 대응은 설명 자료이며 Wireshark 절차는 미수집 자료의 안내다. 증거 식별자는 evidence-index의 E10/C10/P10을 따른다.

다음 단계는 허가된 실제 환경의 패킷 수집 및 11단계 실기 종합 검증이다. Android 신뢰 HTTPS 오프라인 재실행 gate를 유지한다. 새 캡처에 앱 빌드·기기·인터페이스·실제 시각/필터/암호화 조건을 붙이고 관측하지 못한 값은 비워 둔다. 학번·성명은 추정하지 않는다.
