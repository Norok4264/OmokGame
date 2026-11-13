# Android LAN 전환 기준

## LAN 게임 구현 갱신 — 2026-11-13

[Android LAN 대국 구현 문서](android-lan-game.md)를 추가했다. Android 화면과 NSD/TCP v2 연결을 challenge/승낙·거부·취소·만료, Kotlin 자유룰, authority SQLite transactions와 연결했다. per pair installation UUID 선출, player ID/authority/white/black 분리, SQLite DB 단위 닉네임 scope와 guestN 정책을 확정했다. 실제 two-device networking/SQLite runtime/APK build는 미검증이며 ADB 장치는 연결되지 않았다. 순수 Kotlin rules test와 전체 Kotlin source compile은 실행했다. 이는 실제 Android OS 또는 LAN 시험이 아니다.

2026-11-13 후속 상태: [Android 전환 0단계 실제 환경 조사](android-stage0.md)와 [구조 선택·LAN 연결 시제품](android-lan-prototype.md)을 완료했다. 기존 PWA는 보존하며 Android 프로젝트를 android/에 추가했다. Gradle wrapper 버전은 실행 확인, APK 빌드와 Android 연결은 미검증이다.

기록일: 2026-11-13 (Asia/Seoul). 상태: 공통 지침·0단계 환경 조사·하이브리드 구조 선택·네이티브 LAN 연결 시제품 구현. APK 빌드와 실제 Android 연결은 미완료다.

## 새 제품 범위

현재 사용자 지시에 따라 Android 전용 설치형 앱으로 전환한다. 최종 사용자는 PC·터미널·외부 서버·도메인 없이, 같은 Wi-Fi의 상대를 앱에서 검색하고 선택한다. IP·포트 수동 입력은 제공할 기본 사용 흐름이 아니다. 공유기에 인터넷 연결이 없어도 내부 통신으로 대국할 수 있어야 한다. 한 휴대전화가 권위 호스트가 되며 호스트 역할과 돌 색은 독립적이다.

필수 Android 권한 승인·상대 선택은 사용자 조작으로 남을 수 있다. 게스트망·기기 격리 등 연결 실패의 이유와 다음 행동을 안내한다. 단순 APK 포장으로 LAN 검색·호스트 기능이 생기는 것으로 취급하지 않는다.

## 보존 요구사항

- 15×15, 흑 선공, 한 수씩 교대, 5개 이상 연속 승리, 삼삼·사사·장목 허용, 무르기·패스 없음.
- 후보 선택 후 돌 놓기 확정. 호스트 자신의 착수도 검증과 저장 승인을 거친다.
- 신청자 백·승낙자 흑, 재도전도 요청자 백·승낙자 흑. 호스트와 색을 연동하지 않는다.
- 닉네임, 상대 선택, 신청·승낙·거부, 제한시간, 기권, 승리·시간패·기권·단절패·무승부·무효 결과.
- 승자 PNG, 패자 재도전, 결과 후 나가기. 채팅 입력창은 메시지 바로 아래, 내 파랑·상대 빨강.
- 혼자 놀기는 사용자 백·봇 흑·첫 수 H8. 시간제한·채팅·외부 AI 호출 없이 기기 내부 계산.
- 살구색·보드/돌 에셋·명암·그라데이션·팝업 외부 흐림. 실제 통신 관측과 OSI 설명 구분.
- 영속 변경의 검증 → 상태/성공 요청 원자 저장 → commit → 공개 순서와 중복 요청·revision 검증은 이식 대상이다.

## 기존 정책과 전환 설계 과제

| 항목 | 기존 PWA | Android LAN 설계에서 확정할 사항 |
|---|---|---|
| 접속자 | 중앙 서버 인증 목록 | LAN 검색 목록의 수명, 검색 중복, 연결 전 표시와 인증 후 상태 구분 |
| 이름 중복 | 중앙 서버 예약·guestN | LAN 전체 중복을 보장한다고 가정하지 않음. 호스트/방 범위와 동명이인 식별 정책 확정 필요 |
| 세션 | 브라우저 sessionStorage·서버 토큰 해시 | Android 저장 위치·기기 식별·호스트 변경·세션 폐기 범위 |
| 호스트 선정 | 고정 Node 인스턴스 | 동시 신청/연결 경합, 단일 권위 선정, 재도전에서 호스트 유지 여부 |
| 복구 | 서버 스냅샷과 기존 마감 | 참가자 단절과 호스트 프로세스 종료 분리. 없는 호스트 판정을 참가자가 만들어내지 않음 |
| 저장/종료 | 서버 SQLite·재시작 시 ACTIVE 무효 | Android 저장소와 생명주기 대응. 확정 결과 보존, 자동 호스트 이전은 미확정 |
| 보안/업데이트 | 공개 HTTPS/WSS·PWA 캐시 | LAN 인증·암호화·동일 앱 식별 및 APK 자원·업데이트 정책 별도 설계 |

정책 미확정은 구현 완료를 의미하지 않는다. 기존 PWA의 실기·배포 미검증은 역사 기록으로 남기며 새 제품 범위 밖 항목을 통과로 바꾸지 않는다.

## 재사용 후보와 경계

| 실제 파일 | 재사용/변환 후보 | 확인할 경계 |
|---|---|---|
| packages/shared/src/rules.ts, rules.test.ts | 순수 규칙과 판정 사례 | JS 유지 시 재사용, Kotlin 등으로 이식 시 동일 입력·결과 대조 |
| apps/web/src/bot.ts, bot-runner.ts, bot.worker.ts | 수 선택 알고리즘·오래된 작업 폐기 | Worker와 Android 작업 실행 방식 호환성 |
| apps/web/src/App.tsx, OnlineGame.tsx, SoloGame.tsx, Chat.tsx, styles.css | React 화면·스타일 또는 네이티브 화면 기준 | WebView 재사용과 네이티브 이식 비용 비교 |
| apps/web/public/omok-hero.svg, icons/, fonts/ | 이미지·아이콘·Noto Sans KR | OFL.txt 등 라이선스 함께 보존 |
| packages/shared/src/protocol.ts, types.ts, room-types.ts | 메시지·상태·식별자 계약 | LAN 발견/호스트 선정을 위한 확장과 호환 버전 |
| apps/server/src/online-game.ts, lobby.ts, rooms.ts | 권위 판정·신청·채팅·결과 처리 정책 | Node 서버를 Android에서 그대로 실행 가능하다고 가정하지 않음 |
| apps/server/src/storage/ | 스키마·트랜잭션·재시작/보관 정책 | database.ts의 node:fs·better-sqlite3 의존성은 Android 저장 계층 검토 필요 |
| apps/web/src/result-image.ts | 최종 보드 이미지 구성 | Canvas 렌더와 Android 저장·공유 API 연결 또는 이식 |
| apps/web/src/communication-log.ts, CommunicationView.tsx | 안전한 실제 송수신 관측·표시 | Android 전송 구현과 같은 기기 시계에 다시 연결 |
| 기존 *.test.ts와 docs/evidence/ | 회귀 사례·과거 증거 | APK 또는 두 Android 실기 통과 증거로 재분류하지 않음 |

하이브리드 화면 재사용과 네이티브 이식은 후보이다. Android Studio/JBR/Gradle JDK/SDK/Wrapper/AGP 확인과 작은 LAN 연결 시제품 결과를 바탕으로 선택한다. 현재 버전 조합이나 Android 라이브러리를 고정하지 않는다.

## Android 인수 대응표

새 항목은 모두 미검증이다. 기존 A01~A12/B01~B12 번호와 과거 결과는 그대로 보존한다.

| 새 ID | 대상 | 기존 대응 |
|---|---|---|
| AND-01 | 두 Android 설치·권한·자동 검색·인터넷 없는 LAN·격리망 안내 | A01, A02, A03, B08 |
| AND-02 | 규칙·후보·호스트 승인·상태 일치 | A04, A05, B01, B02, B07 |
| AND-03 | 결과·재도전·색과 호스트 분리 | A06, A07, B04 |
| AND-04 | 채팅·IME·키보드·반응형·접근성 | A08, A11, B08 |
| AND-05 | 오프라인 봇·복구·오래된 작업 폐기·앱 업데이트 | A09, B09, B10, B11 |
| AND-06 | Android PNG 저장·공유·실제 파일 열기 | A10 |
| AND-07 | 실제 LAN 통신·패킷과 OSI 설명 | A12 |
| AND-08 | 참가자/호스트 단절·OS 종료·저장 실패·보관 | B03, B04, B05, B06, B12 |

## Android 통합 실기 갱신 — E17 (2026-11-13)

위의 전부 미검증 기록은 전환 설계 단계의 당시 상태다. 최신 실기 판정은 [acceptance.md Android 대응표](acceptance.md#android-요구사항--기존-ab-대응표) 및 [E17 증거 JSON](evidence/android-lan-integration-stage.json)을 따른다. 두 실제 기기에서 설치/실행, 같은 WPA2-Enterprise Wi-Fi의 검색, 상대 선택, 신청·승낙, revision0 대국 진입은 관찰했다. 이전 E16에서 시간패 결과/PNG 열기/재도전 색 배정도 관찰한 바 있다. 이번 E17은 유효 착수 확정 전 60초 만료, chat send/receive 미확인이라 A04/A05와 A08을 Android 통과로 바꾸지 않는다.

Wi-Fi는 Android에서 internet-validated였고 cellular IMS가 켜져 있어 외부 인터넷 없이 내부 LAN만 쓰는 조건이 아니었다. Guest isolation SSID가 없어 실패 안내는 시험하지 않았다. 앱 설치 UUID 기반 호스트는 이 쌍에서 태블릿으로 고정됐고 앱 데이터 삭제를 수행하지 않아 호스트 역할 교환은 미검증이다. 기존 A01~A12/B01~B12 PWA 기록은 이 Android 시험과 구별해 보존한다.

## 중단 작업과 이번 확인

Git HEAD 4585cd0, main. 시작 시 vite.config.ts의 OMOK_VITE_HOST, scripts/dev.mjs의 OMOK_COMPILED_SERVER 변경과 미추적 scripts/start-local.ps1, scripts/use-pinned-runtime.ps1이 있었다. 앞선 Windows 실행기 작업에서 생성된 변경이며 이번 전환에서 보존했다. 이전 실행기 문서 갱신은 패치 적용 실패 후 중단되어 완료되지 않았다.

실제 명령: git status --short --branch, git log -1 --oneline, git diff --stat, git diff, rg 파일/의존성 검색, Get-Content 문서/소스 조회, netstat -ano -p tcp. 재개 시 3001/5173/4173 LISTENING 항목은 없었다. 전체 프로세스 조회는 중단 전 Get-CimInstance에서 접근 거부되어 확인하지 못했으며 포트 부재를 전체 프로세스 종료 증거로 쓰지 않는다.

기존 문서의 0단계 상태는 당시 기록이다. 1단계 시제품에서 AGP8.13.2/Gradle8.13/Kotlin2.3.10/JDK17/API36 후보를 고정하고 Wrapper `--version`을 통과했다. `assembleDebug`는 단일-use Gradle daemon loopback pipe 생성 단계에서 실패했다. 실제 기기·AVD가 없어 NSD/TCP 왕복은 관측하지 못했다. 상세 명령/결과는 [android-lan-prototype.md](android-lan-prototype.md) 및 [증거 JSON](evidence/android-lan-prototype.json)에 기록했다. 다음 단계는 loopback 빌드 환경 문제를 해결하거나 실제 Android Studio에서 JDK17 설정으로 빌드를 확인하고, 먼저 단일 에뮬레이터/기기 상태를 수집하는 것이다. 전체 게임 이식은 LAN 연결 경로 확인 뒤 진행한다.
