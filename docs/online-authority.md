# 5단계 서버 권위 온라인 대국

기록일 2026-11-12, 앱 0.1.0. Codex Windows/PowerShell 작업환경에서 확인했다.

## 구현과 순서

online-game.ts는 shared playMove를 재사용한다. 클라이언트는 gameId/requestId/expectedRevision/x/y만 제안한다. 색과 차례, 결과는 서버 DB에서 결정한다. 동기식 better-sqlite3와 단일 Node 이벤트 루프에서 명령/마감/시작을 await 없이 순차 실행한다. 다중 Node 서버 운영은 검증하지 않았다.

성공 요청 조회 → 동일 내용이면 원래 approvedRevision 및 최신 snapshot 반환 → 새 요청이면 참가자/상태/마감/revision/규칙 검사 → 게임 상태·착수 기록·성공 요청을 immediate transaction에 저장 → commit → 단조 마감 메모리 변경 → 양측 snapshot 공개 순서다. 동일 ID의 다른 내용은 REQUEST_ID_CONFLICT다. 종료 후 성공 요청도 재확인할 수 있다. 오래된 새 revision은 거절하고 최신 lobby.snapshot을 별도로 보낸다.

시작부터 흑 60초, 유효한 착수 commit 후 다음 차례 60초다. 250ms sweep와 명령 수신 모두 서버 마감을 검사한다. 기권/시간 만료/규칙 승리/무승부는 FINISHED이며 결과는 한 번만 저장된다. 내부 abort는 ABORTED/SYSTEM_ABORT이며 승자 없이 기록한다. 저장된 보드/차례가 유효하지 않으면 sweep가 내부 abort를 시도한다. JSON 자체가 파손돼 파싱 불가능한 상태의 자동 복구는 미검증이다.

클라이언트는 실제 돌을 서버 snapshot에서만 그린다. 후보는 반투명 표시다. 3초 지연 시 snapshot을 조회하고 새 ID로 돌을 자동 재전송하지 않는다. 기권은 확인 후 요청하고 결과 dialog에 머문다. 결과에서 대기열로 이동해도 세션/닉네임은 유지한다. PNG 저장 버튼은 제공하지만 이번 단계 다운로드 파일 검증은 하지 않았다.

## 실제 실행과 결과

- node_modules/.bin/tsc.cmd -p packages/shared/tsconfig.build.json: 성공
- node_modules/.bin/tsc.cmd -p apps/server/tsconfig.json --noEmit: 성공
- node_modules/.bin/tsc.cmd -p apps/web/tsconfig.json --noEmit: 성공
- node_modules/.bin/tsc.cmd -p apps/server/tsconfig.build.json: 성공
- node_modules/.bin/vite.cmd build apps/web --config apps/web/vite.config.ts: 성공, Vite 8.3.7
- node_modules/.bin/vitest.cmd run: 7 files, 44 tests 통과

실제 localhost ws 서버와 두 client socket: 흑 착수 후 양측 board/revision 일치, 백의 차례 위반 거절, 첫 승인 응답을 애플리케이션에서 버린 것으로 간주한 뒤 같은 requestId 재확인, 백 기권 후 양측 승자/revision 일치. 기권 저장 시에도 실제 SQLite trigger 실패를 주입해 WebSocket 오류 응답과 ACTIVE/revision 유지, trigger 제거 후 동일 요청 성공을 확인했다. 이는 TCP 패킷 손실을 주입한 시험은 아니다.

online-game.test.ts의 실제 SQLite 시험: 5목/승리 후 과거 성공 요청 재확인, ID 충돌, 외부인/차례/점유/범위/소수 좌표/오래된 revision 거절, 기권 중복 처리, 주입된 20ms 마감의 단일 확정, 무효 종료. 다섯 번째 승리 돌 저장 직전에 SQLite trigger로 성공 요청 저장을 실패시켜 상태/revision/착수 기록 롤백과 publication 없음 확인. trigger 제거 후 같은 요청 성공.

## 한계와 다음 확인

브라우저 UI 자동/수동 조작, Android 실기기, Chrome/Edge 버전, 외부 TLS/WSS, 실제 60초 대기, 패킷 손실/지연 주입, PNG 다운로드, 다중 서버·프로세스 강제 종료 복구는 미검증이다. 이번 화면 캡처 파일은 없다. 채팅/재도전/오프라인 PWA는 후속 단계다.

사용자 PC 최소 실행은 기존 루트 npm run dev (npm을 PATH에서 찾지 못하면 pnpm dlx npm@12.2.2 run dev)이다. localhost:5173을 독립 브라우저 두 개에서 열고 신청→승낙→양쪽 준비→흑 후보 선택/돌 놓기→백 착수→기권/결과를 확인한다. 이전 원격 셸의 tsx 사용자 정보 조회 오류는 이번 단계에서 재현 여부를 검사하지 않았다.

증거 E6-01: apps/server/src/lobby.test.ts 실제 두 WebSocket client의 승인/재확인/기권 및 보드 일치.
증거 E6-02: apps/server/src/online-game.test.ts SQLite 저장 실패·중복·권한·규칙·시간·무효 종료.
증거 E6-03: 위 실제 타입 검사·빌드·44개 테스트 출력. 패킷 캡처/스크린샷은 아님.

