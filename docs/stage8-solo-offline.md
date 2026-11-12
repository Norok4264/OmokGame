# 8단계 혼자 놀기와 PWA 오프라인

기록일: 2026-11-12 (Asia/Seoul)
앱: 0.1.0 / 최종 빌드: 0.1.0-a8604a3cbbe94a98
클라이언트 JS: index-DPNVuLud.js / Worker: bot.worker-2BxL8Zow.js

## 구현

혼자 놀기는 온라인 입장/닉네임 등록 없이 별도 SoloGame에서 즉시 시작한다. 사용자는 백, 봇은 흑이며 첫 수는 H8이다. shared의 15×15 자유룰을 그대로 사용하고 턴 제한시간과 채팅 UI는 표시하지 않는다. 외부 AI API를 쓰지 않는다.

봇의 선택 순서는 즉시 승리 → 상대 즉시 승리 방어 → 4방향 열린 4/3 등 공격·방어 점수 → 중앙/인접 점수다. 규칙과 평가 함수는 순수 TypeScript이고 실제 계산은 별도 Web Worker에서 한다. UI에는 생각 중을 표시한다. 목표는 1초이고, 2초가 지나거나 Worker가 실패하면 terminate 후 UI에서 최대 225개 빈 점 중 합법적인 대체 수를 고른다. 늦은 응답은 gameId/revision/taskId 및 현재 작업 객체로 거절한다. 제한시간 타이머는 UI 이벤트 루프가 지연되면 늦게 실행될 수 있으므로 수신 때도 deadline을 검사한다.

로컬 저장은 danpan-omok-solo-v1이며 gameId/revision/착수 이력만 기록한다. 복구 시 이력을 shared 규칙으로 재실행하고 저장된 승패 객체를 신뢰하지 않는다. ACTIVE이며 흑 차례일 때만 실제 대국 계산을 다시 시작한다. 백 차례/종료 판은 다시 착수하지 않는다. 오프라인 준비의 별도 warmup 작업은 게임 상태를 바꾸지 않는다.
재경기는 새 gameId·빈 상태로 교체하고 이전 Worker를 취소한다. 나가기는 Worker 취소 후 저장판을 삭제하고 홈으로 간다. 저장/삭제 실패는 이유를 표시한다. 서버 게임 상태와 로컬 판 저장소는 결합하지 않는다.

## PWA와 자원 준비

Vite 빌드가 index/JS/CSS/shared 포함 bundle/Worker/이미지/manifest/icons/폰트 등 정적 산출물과 SHA-256 목록을 생성한다. service worker는 그 목록만 precache하고, 파일 누락/해시 불일치 시 해당 설치 캐시를 버려 부분 준비를 완료로 표시하지 않는다. 버전 및 산출물 지문별 캐시로 이전 활성 버전을 보호한다. 캐시 일부가 지워졌을 때 온라인 재준비로 허용된 정적 자원만 복구한다.

‘혼자 놀기 오프라인 준비 완료’는 서비스 워커 제어 및 전체 캐시 존재/페이지 버전 일치 → 한글 폰트 로드 → 오목 이미지 decode → 실제 Worker warmup(H8/shared 확인)이 모두 성공한 뒤 표시한다. 개발 서버에서는 완료를 표시하지 않고 최종 빌드 사용을 안내한다.

GET·동일 origin·공개 allowlist·query 없음·Authorization 없음만 서비스 워커가 처리한다. 세션/인증/API/실시간 게임/URL query/POST는 공개 캐시에 저장하지 않는다. unknown 경로는 네트워크 경로로 남는다. localStorage의 혼자 놀기 판은 CacheStorage의 공개 자원과 별개다.

manifest와 PNG 192/512 아이콘, 기존 SVG를 포함했다. 한글 폰트는 공식 [Google Fonts Noto Sans KR](https://github.com/google/fonts/tree/main/ofl/notosanskr) 파일과 OFL 1.1 원문을 함께 로컬에 둔다. 파일 크기는 10,414,588 bytes, SHA-256은 194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252다. 실행 시 Google Fonts로 요청하지 않는다. 최초 준비에는 이 자원 다운로드가 필요하며 브라우저 저장소를 삭제/회수한 경우 다시 준비해야 한다.

## 대국 중 업데이트 보호

설치 시 skipWaiting을 하지 않는다. 새 버전 안내/적용 버튼은 홈 또는 종료 뒤에만 보인다. 적용 요청 시 같은 origin의 모든 앱 창에 활동 상태를 질의한다. ACTIVE/PREPARING/보류 신청·재도전/혼자 놀기 ACTIVE 또는 무응답 창이 하나라도 있으면 거절한다.
모든 창이 idle일 때만 적용한다. 응답한 idle 창은 잠시 새 대국 입력을 잠그며, 활성 controller 변경 후 안전한 창만 다시 연다. 대국 중 페이지를 강제로 reload하지 않는다. 프로토콜 버전 불일치 거절은 기존 shared protocol 시험도 유지했다.

## 실제 실행 명령·결과

Codex Windows PowerShell, 프로젝트 루트 C:\오목게임.

| 명령 | 실제 결과 |
|---|---|
| tsc.cmd -p packages/shared/tsconfig.build.json | 성공 |
| tsc.cmd -p apps/server/tsconfig.json --noEmit | 성공 |
| tsc.cmd -p apps/web/tsconfig.json --noEmit | 성공 |
| node_modules/.bin/vitest.cmd run | 19개 파일 / 93개 테스트 통과 |
| tsc.cmd -p apps/server/tsconfig.build.json | 성공 |
| node_modules/.bin/vite.cmd build apps/web --config apps/web/vite.config.ts | Vite 8.3.7 성공; manifest/sw/Worker 생성 |
| vite.cmd preview apps/web ... --port 4173 --strictPort | 최종 정적 빌드 실제 시작, 브라우저 시험 뒤 종료 |
| node scripts/check-offline.mjs (Chrome 테스트 프로필) | 온라인 준비→브라우저 네트워크 차단→브라우저 완전 종료/재기동→복구→9수 봇 승리 성공 |
| 같은 script, TEST_BROWSER_EXE=Edge / TEST_EVIDENCE_TAG=stage8-edge | 같은 최종 빌드로 동일 과정 성공 |
| node scripts/check-pwa-update.mjs | 2창 중 한 창 대국이면 거절, 두 창 홈 이후 이전 빌드 f4e221f7555b9dff→최종 a8604a3cbbe94a98 적용 성공 |
| 공식 폰트 다운로드 | 최초 sandbox 소켓 접근 실패. 승인된 네트워크 실행으로 폰트/OFL 다운로드 성공 |
| Git/의존성 | package-lock·의존성 버전 유지. root preview:web 스크립트 추가. 작업은 미커밋 |

tsc.cmd는 루트 node_modules/.bin의 실행 파일을 사용했다. 테스트 도구 Playwright/Sharp는 Codex 제공 번들을 사용했으며 프로젝트 의존성에 추가하지 않았다. 브라우저는 기존 사용자 프로필을 건드리지 않는 .cache 전용 프로필로 실행했다. 이 값은 작업환경의 관측값이며 사용자 PC 전체 설치 검증으로 일반화하지 않는다.

Chrome 157.0.8103.51과 Edge 157.0.4341.42, viewport 1280×1000, localhost HTTP의 secure-context 예외에서 실행했다. Android HTTPS/실기기나 설치된 홈 아이콘 PWA 실행의 증거가 아니다. 네트워크 차단은 Playwright context의 브라우저 네트워크 에뮬레이션이며 물리적 Wi-Fi 전환은 아니다.

이번 표본에서 Worker 생성/메시지 왕복 최대치는 Chrome 약 16.3ms, Edge 약 16.9ms였다. 이 짧은 한 대국씩의 관측은 1초 목표 충족 표본이며 모바일 성능 보증이나 일반 성능 수치가 아니다.

## A09 / B09 / B10 / B11 증거

| ID | 항목 | 실제 파일·결과 |
|---|---|---|
| E9-01 | A09 혼자 놀기 | bot.test.ts / solo-state.test.ts 및 실제 Chrome·Edge: 사용자 백/봇 흑/H8, 자유룰, 공격·방어, 판 복구·새 ID·저장 삭제. 실제 시험 onlineRequests=[] |
| E9-02 | B09 최종 빌드 오프라인 | evidence/stage8-offline.json, stage8-edge-offline.json. controller cache의 모든 정적 자원 확인, 준비 완료 후 offline·브라우저 close/relaunch·9수 종료. ready/final PNG는 해당 실제 렌더 캡처 |
| E9-03 | B10 오래된 작업·대체 | bot-runner.test.ts 가짜 시계: game/revision/task 거절, 1999/2000ms 경계, terminate/합법 대체/늦은 응답/나가기. 실제 브라우저에서 흑 차례 Worker 송신을 시험용으로 멈추고 닫은 뒤 한 수만 재계산. 백 차례/종료 복구는 실제 수를 재계산하지 않음 |
| E9-04 | B11 업데이트 | service-worker.test.ts의 active/idle/무응답/부분 캐시/민감 경로 제외와 기존 protocol 거절. evidence/stage8-update.json: 실제 2창의 대국 중 적용 거절, 홈 이후 적용. 사용한 이전 버전은 시험용 보존 빌드이며 외부 배포 결과 아님 |
| E9-05 | 실행/자원 | 93개 테스트·타입·빌드, 공식 폰트/OFL, manifest/192·512 PNG·Worker 정적 allowlist |
| E9-06 | Android HTTPS | 환경/기기 미확인·미검증. 아래 11단계 gate에서 반드시 재확인 |

실제 캡처:
- [Chrome 준비 완료](evidence/stage8-ready.png)
- [Chrome 오프라인 종료](evidence/stage8-offline-final.png)
- [Edge 준비 완료](evidence/stage8-edge-ready.png)
- [Edge 오프라인 종료](evidence/stage8-edge-offline-final.png)
- [Chrome 원시 결과](evidence/stage8-offline.json)
- [Edge 원시 결과](evidence/stage8-edge-offline.json)
- [업데이트 원시 결과](evidence/stage8-update.json)

## 최소 실행과 확인

루트에서:
    npm run build
    npm run preview:web
http://127.0.0.1:4173/에서 온라인으로 ‘혼자 놀기 오프라인 준비 완료’를 기다린다. 네트워크를 차단하고 앱/브라우저를 닫았다 다시 같은 origin으로 연다. 혼자 놀기를 진행하고 재경기/나가기/새로고침 복구를 확인한다. dev 모드의 표시를 오프라인 완료로 오인하지 않는다.

브라우저 재현 script에는 Playwright와 브라우저 실행 파일이 필요하다. 이 작업환경은 TEST_NODE_MODULES를 Codex 번들 node_modules, TEST_BROWSER_EXE를 해당 Chrome/Edge 실행 파일로 설정했다. 다른 환경의 설치 경로는 추정하지 않는다. 업데이트 script의 TEST_OLD_BUILD에는 별도로 보존한 이전 완전 빌드 폴더가 필요하다. .cache 시험 프로필·이전 빌드는 Git 제외 대상이다.

## 11단계 필수 재검증 gate

현재 제공/확인된 Android 실기기와 신뢰되는 HTTPS 배포 주소는 없다. 다음을 11단계에서 반드시 실제 확인하고, 결과 없이는 Android 오프라인 항목을 완료로 표시하지 않는다.

1. 유효하고 신뢰되는 인증서의 HTTPS origin과 Android Chrome 실제 버전·기기를 기록한다. 경고 우회·인증서 신뢰 가정으로 대신하지 않는다.
2. 전체 자원 준비 완료→비행기 모드/실제 네트워크 차단→앱 완전 종료→홈 아이콘/동일 origin 재실행→봇 대국 종료를 시험한다.
3. Android Worker 1초 목표/2초 대체, 봇 차례 강제 종료·복구, 저장판 삭제·새 ID를 확인한다.
4. Android 대국 중 업데이트 보류, 종료/홈 적용, 다중 창·온라인 대국과의 병행, 실제 망 전환을 확인한다.
5. 기기/OS/브라우저/HTTPS 주소/앱 빌드/시각/실제 화면과 결과를 증거 색인에 추가한다.

## 변경 파일 / 다음 단계

- 웹: SoloGame.tsx, solo-state.ts, bot.ts, bot.worker.ts, bot-runner.ts와 테스트, pwa.ts, PwaStatus.tsx, service-worker.js 및 테스트.
- 빌드/에셋: pwa-build.ts, vite.config.ts, manifest.webmanifest, public/icons, public/fonts와 OFL.
- 연결: App.tsx의 혼자 놀기 우선 복구·즉시 진입·업데이트 차단, OnlineGame.tsx의 재도전 중 업데이트 잠금, styles.css, root preview:web.
- 시험/기록: scripts/check-offline.mjs, check-pwa-update.mjs, 실제 evidence 파일, acceptance/handoff/evidence-index.
- 다음 기능은 통신 보기와 보고서 증거 보완이며, 11단계에서 위 Android HTTPS gate 및 이전 단계의 실제 IME/다운로드 파일 확인을 수행한다.
