# 7단계 결과·재도전·채팅·PNG

기록일: 2026-11-12 (Asia/Seoul), 앱 버전 0.1.0.
이번 변경은 7-1 결과/재도전, 7-2 채팅, 7-3 PNG를 모두 포함한다.
이전 문서에서 채팅·재도전·PNG가 미구현이라고 한 문장은 당시 단계 기록이다.

## 7-1 결과와 재도전

결과 사유는 5목 승리, 시간패, 기권, 단절패, 무승부, 시스템/양측 단절 무효로 구별한다. 기권한 사람도 결과 dialog에 머문다. 승자에게 PNG 다운로드/미리보기, 패자에게 재도전 요청, 양쪽에게 마지막 오른쪽 나가기를 제공한다.

SQLite migration 3에 result_rooms와 rematches를 추가했다. 결과방 만료는 게임 종료 commit 시 ended_at_utc + 5분으로 고정하고 재접속·거절·재요청으로 연장하지 않는다. 재도전 요청은 패자만, 응답은 승자만 허용한다. 요청 응답 마감은 요청 후 30초와 결과방 만료 중 이른 때이며 실행 중에는 단조 시계로 판정한다.

상대 퇴장/단절이면 pending 요청을 취소하고 재도전을 비활성화하며 이유를 표시한다. 결과방 만료는 서버 sweep(250ms) 또는 새 요청 처리 전에 먼저 적용하고, 양쪽 최신 스냅샷에서 game=null을 보내 대기열로 옮긴다. 네트워크가 단절된 화면은 서버 스냅샷을 다시 수신할 때 동기화된다.

승낙 시 새 PREPARING 게임·신청자 백/승낙자 흑·빈 판·성공 요청 기록·이전 결과방 닫기를 하나의 immediate transaction에 저장한 뒤 공개한다. 같은 성공 요청 ID는 재확인하고 중복 승낙으로 새 판이 늘어나지 않는다. 새로운 gameId의 채팅은 비어 있다. 준비 최대 10초와 양쪽 준비 후 3초 안내를 다시 적용하고, 실제 시작부터 흑 60초다.

## 7-2 채팅

실제 WebSocket chat.send 명령과 참가자별 lobby.snapshot의 messages[]를 사용한다. 메시지는 해당 판 두 참가자에게만 전달하며 표시명은 서버의 닉네임이다. 내 메시지는 파랑, 상대는 빨강이며 PC/모바일 모두 메시지 목록 바로 아래 입력창을 둔다.

양끝 공백 제거 후 Unicode code point 1~200개, 사용자별 최근 5초 최대 5건이다. 참가자별 제한으로 한 사람이 상대의 전송 몫을 소진하지 않게 했다. 방별 sequence는 착수 revision과 독립적이다. 최근 100건의 본문만 서버 메모리에 남고 SQLite/로그에는 채팅 본문을 저장하지 않는다. 같은 메시지 ID의 과거 본문 hash와 승인 순번은 방 수명 동안 메타데이터로 보존해 100건 밖의 재시도도 중복 전달하지 않는다. 결과방 닫기/만료 때 메모리 채팅을 정리한다. 프로세스 재시작은 이전 본문을 복원하지 않는다.

전송 중/완료/실패와 수동 재시도를 표시한다. 수동 재시도는 messageId와 requestId를 그대로 쓴다. 조합 중 Enter와 keyCode 229는 전송하지 않는다. 단절 중에도 초안은 tab sessionStorage에 남으며 복구 후 자동 전송하지 않는다. 새 gameId는 새 초안/채팅 상태를 쓴다. 위쪽 기록을 읽으면 신규 메시지에 강제 스크롤하지 않고, 기존 위치가 하단 40px 이내일 때만 따라간다. 종료 후에는 읽기만 허용하며 기존 승인 메시지 재확인은 중복 전송 없이 ACK만 반환할 수 있다.

## 7-3 PNG

1100×1500 Canvas에 15×15 전체 보드와 모든 가장자리 돌, 양쪽 닉네임과 흑/백, 승리 팝업 형식의 카드(승자/돌 색/승리 문구), 종료 사유, 저장 시각과 브라우저 시간대를 그린다. 채팅·주소·세션 토큰은 렌더 입력에 포함하지 않는다. 팝업 카드는 실제 화면을 캡처한 스크린샷이 아니라 결과 데이터를 같은 의미로 그린 것이다.

브라우저 폰트 준비 뒤 렌더하고 image/png Blob 및 download 링크를 사용한다. 실패해도 결과방을 유지하고 재시도·미리보기를 제공한다. 다운로드 준비 전 Data URL 미리보기를 만들어 Blob/다운로드 준비 실패 때도 확인할 수 있게 했다. 브라우저의 링크 클릭 성공만으로 실제 디스크 저장 완료를 판정하지 않는다.

## 실제 실행 명령·결과

Codex Windows PowerShell의 C:\오목게임에서 실행했다. 사용자 PC 설치 상태·모바일 결과로 간주하지 않는다.

| 명령 | 실제 결과 |
|---|---|
| node_modules/.bin/tsc.cmd -p packages/shared/tsconfig.build.json | 성공 |
| node_modules/.bin/tsc.cmd -p apps/server/tsconfig.json --noEmit | 성공 |
| node_modules/.bin/tsc.cmd -p apps/web/tsconfig.json --noEmit | 성공 |
| node_modules/.bin/vitest.cmd run | 15 files / 80 tests 통과 |
| node_modules/.bin/tsc.cmd -p apps/server/tsconfig.build.json | 성공 |
| node_modules/.bin/vite.cmd build apps/web --config apps/web/vite.config.ts | Vite 8.3.7 성공; 최종 JS index-DgGRVFXK.js |
| node --input-type=module -e 로 컴파일 서버/메모리 SQLite를 실행해 fetch 조회 | readyz 200, status=ready, checks.sqlite=true, migration=3 |
| DATABASE_PATH=data/stage7-evidence.sqlite 로 컴파일 서버 및 별도 Vite 실행 | 3001/5173 시작 성공. UI 시험 준비용이며 브라우저 자동화 차단 후 종료 |
| Git/dependency | 의존성·lockfile 변경 없음. 작업은 미커밋 상태 |

실행이 만든 data/stage7-evidence.sqlite는 런타임 DB 제외 대상이다. 브라우저가 앱에 들어오기 전에 차단되어 이 파일에 실제 사용자 대국을 시험하지 않았다.

## 실제 증거와 범위

| ID | 항목 | 증거 | 확인한 범위 |
|---|---|---|---|
| E8-01 | A07/A08 실제 통신 | apps/server/src/room-websocket.test.ts | 실제 localhost ws 서버와 두 독립 대국 client 및 제3자 socket. 한글 메시지 전달/순번/중복 ACK/참가자 격리/종료 후 새 전송 거절. 패자 요청·승자 승인 후 새 gameId, 이전 흑이 새 백, 빈 판·빈 채팅·revision 0, 준비/3초/흑 60초 재적용. 퇴장 후 비활성화·양쪽 대기열 snapshot |
| E8-02 | A07 경계·원자성 | rooms.test.ts 및 lobby-recovery.test.ts | 가짜 시계로 결과방 만료 1ms 전 요청의 짧아진 마감, 5분 만료 취소/양쪽 game=null. 30초 응답 만료, 거절/단절/퇴장, 고정 만료 유지, DB trigger 실패 시 새 판·역할·성공 요청 원자 롤백 |
| E8-03 | A08 채팅 | rooms.test.ts, chat.test.ts, lobby-client.test.ts | 한글/200글자/빈 본문/길이/5초 5건/100건/오래된 ID 중복/충돌/게임 revision 독립. React 정적 마크업의 이름·순서·escape, 조합 Enter/229 판단 함수, 스크롤 판단 함수, 같은 ID 수동 재시도 전송 payload 일치. 실제 IME/DOM 스크롤·색 시각 검사는 아님 |
| E8-04 | A10 PNG·결과 | result-image.test.ts, online-result.test.ts | Canvas API 모형으로 마지막 돌까지 이미지 범위, 필수 문구·이름·색·사유·시각, 민감 항목 비포함, PNG 변환 null·URL 생성 실패의 오류 반환, download 링크 호출. React 정적 결과 마크업의 6종 사유·승자 PNG·패자 재도전·양쪽 나가기. 실제 PNG 파일 디코딩/다운로드/열기 증거는 아님 |
| E8-05 | 실행 | 위 명령 출력 | 타입·서버/웹 빌드와 80개 테스트, 실제 readiness와 migration 3 |
| E8-06 | 브라우저 시험 실패 | computer-use @oai/sky get_window_state 결과 | Chrome의 현재 URL을 충분히 확인할 수 없어 정책 검사가 Computer Use를 중단함. 이후 브라우저 입력을 하지 않았고 다른 자동화로 우회하지 않았다. 실제 한글 조합·PNG 다운로드 파일 열기는 미검증 |

새 화면 캡처·패킷 캡처·실제 PNG 다운로드 파일·성능 수치를 만들거나 확보했다고 주장하지 않는다. 기존 E3 화면은 이 단계의 새 결과/채팅 UI 증거가 아니다.

## 사용자가 실행할 최소 조작

프로젝트 루트에서 npm run dev를 실행한다. npm이 현재 PATH에 없고 pnpm을 쓸 수 있으면 기존 pnpm dlx npm@12.2.2 run dev를 사용한다.
독립 브라우저 둘에서 입장→신청→승낙→양쪽 준비 후 진행한다.

1. 한쪽 기권 후 기권자 결과 유지, 승자 저장/패자 재도전/양쪽 오른쪽 나가기를 확인한다.
2. 패자 재도전→승자 승낙 후 새 판·백/흑·준비·시간·빈 채팅을 확인한다.
3. 실제 한국어 IME로 조합 중 Enter가 전송되지 않는지, 조합 확정 뒤 Enter/전송 버튼으로 한 번만 전송되는지 확인한다. 위쪽 메시지 읽기 중 신규 메시지가 와도 스크롤이 움직이지 않는지 확인한다.
4. 단절 중 초안을 입력하고 복구 후 자동 전송되지 않는지 확인한다. 실패 메시지의 같은 ID 수동 재시도를 확인한다.
5. 승자 PNG 다운로드 후 실제 다운로드 파일을 이미지 앱에서 열어 15행·15열의 돌, 두 이름·색·승리 카드·사유·저장 시각을 확인한다. 채팅/주소/토큰이 없는지도 확인한다.
6. 5분 뒤 양쪽 대기열 복귀를 확인한다. 자동 경계 시험은 통과했지만 실제 기기 5분 대기는 아직 별도다.

실제 Android Chrome·Chrome/Edge 버전 조합, 실제 IME, DOM 스크롤, PNG 파일 저장/열기는 사용자 PC에서 후속 확인이 필요하다. 다음 개발 범위는 오프라인 PWA와 통신 보기 및 실제 기기 증거 수집이다.


## 변경 파일과 마무리 보완

- 서버: rooms.ts, lobby.ts, online-game.ts, storage/migrations.ts, storage/recovery.ts 및 대응 테스트.
- 웹: OnlineGame.tsx, Chat.tsx, result-image.ts, App.tsx, lobby-client.ts, styles.css 및 대응 테스트.
- 공유: room-types.ts, protocol.ts, index.ts.
- 문서: README, environment, protocol, acceptance, handoff, evidence-index, account-switch-handoff와 이 기록.
- 결과 창 전환에도 전송 중/실패 메시지 상태를 유지하도록 Chat 상태를 대국 화면 부모에 두었다. 승인된 메시지는 outbox에서 제거해 서버 최근 100건에서 밀려난 옛 메시지가 다시 나타나지 않게 했다.
- 단절 중 결과 나가기는 우선 화면을 대기열로 옮기고, 같은 클라이언트가 재접속해 옛 결과방 snapshot을 받으면 의도한 서버 퇴장을 완료한다. 이 UI 경로의 실제 브라우저 조작은 아직 미검증이다.
- 최종 80개 테스트 및 웹 타입 검사·빌드를 통과했다. 최종 JS는 index-DgGRVFXK.js다.
