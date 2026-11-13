# Android LAN 대국 구현

이 문서는 Android LAN 대국 E14의 기능 구현 기준(`0.4.0-android-lan`, protocol v2)을 보존한다. 서비스·복구 동작은 [`android-lan-recovery.md`](android-lan-recovery.md) (`0.5.0-android-recovery`, protocol v3), 결과·재도전·채팅·PNG·통신 보기는 [`android-lan-results-chat-png.md`](android-lan-results-chat-png.md) (`0.6.0-android-results-chat-comm`, protocol v4)를 우선한다. 코드·자동시험과 실제 Android 실행은 구분한다.

## 연결 구조

각 앱은 로컬 IPv4에 동적 포트로 TCP 서버를 열고 NSD/DNS-SD `_danpan-omok._tcp.` 로 닉네임·설치 playerId·프로토콜 버전만 광고한다. 반대편 앱도 자동 검색을 시작하므로 사용자는 IP/포트를 입력하지 않는다. 구형 protocol 1 광고는 목록에서 제외한다. JSON UTF-8 한 줄 v2 요청은 16 KiB 제한, 4초 socket deadline을 사용한다. 실제 OSI 계층을 앱이 각각 구현했다는 뜻은 아니다.

### 호스트 선출과 색

각 앱 설치 때 저장되는 UUID를 비교해 **두 기기 중 사전순 UUID가 작은 기기**를 그 쌍의 SQLite 권위 호스트로 선출한다. 양쪽 모두 서비스를 등록해 두어 어느 쪽 앱에서도 상대를 발견한다. 큰 UUID 기기는 작은 UUID 기기로 신청하고, 작은 UUID 기기는 큰 UUID 기기에게 신청 제안을 만들 수 있다. 수락/신청 충돌은 하나의 권위 SQLite에서 직렬화된다. 한 시점에 `PENDING` challenge와 `ACTIVE` game 각각 최대 한 건을 partial unique index로 보장한다. 같은 설치쌍은 두 개의 독립 게임 권위자를 만들지 않는다.

대국 행에는 `authority_id`, `white_id`, `black_id`를 별도로 저장한다. 신청/제안 생성자 ID는 `applicant_id`, 응답자는 `acceptor_id`; 착수 색은 **신청자 백, 승낙자 흑** 관계에서 정한다. 따라서 권위 호스트는 큰 기기의 신청을 승낙하면 흑이고, 작은 기기에서 큰 기기로 직접 제안하면 백이다. 호스트 여부로 색을 계산하지 않는다.

### 닉네임 범위

`LanNickname`은 기존 `packages/shared/src/nickname.ts` 정책을 Kotlin으로 옮겼다: NFKC 정규화·앞뒤 공백 제거, 2–12 grapheme, 한글/영문/숫자/결합 문자/밑줄/하이픈, 예약어와 사용자 지정 `guestN` 거절. 공란만 권위 호스트가 SQLite transaction 안에서 아직 사용하지 않은 `guest1`, `guest2`…를 발급한다. 호스트의 `lan_players.nickname_key UNIQUE`가 대소문자/정규화 중복을 막는다.

중복 방지 범위는 **이 대국쌍의 권위 호스트 앱 데이터베이스**다. 이름은 DB에 유지되어 종료 이후에도 재사용하지 않는다. 다른 권위 호스트 앱의 닉네임 공간과 인터넷 전체에서의 중복은 보장하지 않는다. Android 앱 데이터 삭제는 로컬 playerId와 이름 레지스트리를 함께 초기화한다.

### 요청·원자 저장

요청은 `protocol`, `type`, `actorId`, `requestId`를 가지며 게임 착수에는 `gameId`, `expectedRevision`, 정수 `x/y`가 더해진다. 흑/백과 승패는 클라이언트가 보내지 않는다. 서버는 challenge/game의 참가자 ID로 요청자를 검증하고 현재 revision·차례·점유 좌표·상태·마감 시각을 확인한다.

`LanGameRepository.handle`은 방별 단일 권위 SQLite transaction에서 만료 판정 → 권한/요청 검사 → 상태 변경 → move 이력·성공 요청 기록을 함께 기록한다. 성공 응답과 최신 스냅샷은 `endTransaction`/commit 이후에만 생성해 socket으로 반환하거나 WebView에 publish한다. 실패하면 실제 보드 변경/승리 화면을 승인하지 않는다. 같은 actor/requestId와 같은 입력은 원래 승인 revision 및 최신 snapshot을 돌려주고, 내용이 다른 ID 재사용은 `REQUEST_ID_CONFLICT`로 거절한다. 신선한 요청의 `expectedRevision`이 틀리면 `STALE_REVISION`과 최신 snapshot을 돌려준다.

Android `SQLiteOpenHelper` 스키마 at E14:

| 테이블 | 기록 |
|---|---|
| `lan_players` | playerId, unique normalized nickname key, 표시 이름 |
| `lan_challenges` | applicant/acceptor, PENDING/ACCEPTED/DECLINED/CANCELLED/EXPIRED, revision, 30초 마감, 토큰 해시 |
| `lan_games` | 고유 gameId, challenge, authority/white/black ID, ACTIVE/FINISHED, revision, 전체 상태 JSON, 시각 |
| `lan_moves` | gameId/revision/requestId/playerId/x/y/color, revision 및 request 중복 unique |
| `lan_requests` | actorId/requestId primary key, canonical payload SHA-256, 성공 응답, 저장 시각 |

게임 생성은 challenge ACCEPTED, 빈 15×15 보드, player 배정, revision 0, 첫 흑 차례와 60초 마감을 한 transaction으로 저장한다. 착수/기권은 game 상태·revision·이력·성공 요청을 한 transaction으로 저장한다. 승리/무승부·기권 결과는 같은 저장 경계에서 FINISHED가 된다. 제한시간은 권위 호스트가 250ms 간격으로 만료를 검사해 시간패를 commit한다. 클라이언트의 후보 점은 반투명 미리보기뿐이며 호스트도 승인 응답 전 실제 돌을 표시하지 않는다. E16에서 SQLite v3의 결과/채팅 테이블과 Android 저장/공유 경로를 추가했으며, 실제 Android DB·PNG 런타임은 아직 실행되지 않았다.

## 검증 자료와 한계

고정 Node/npm의 타입 검사, 기존 PWA/공유 테스트, Vite 앱 자산 빌드는 증거 JSON을 따른다. Android SDK `android.jar`와 IDE 번들 Kotlin 컴파일러로 전체 main Kotlin 파일을 독립 compile했고, 순수 `LanGameRules` JVM 벡터를 실행했다. 규칙 벡터에는 가로 5목, 장목, 세로·두 대각선, 모서리, 마지막 칸 draw/win 우선, 열린 3 허용, 차례/점유/경계 거절이 있다.

Gradle `assembleDebug`는 기존 실행 환경의 Gradle daemon loopback pipe `Invalid argument: connect`에서 Android task 구성 전에 실패한다. 따라서 APK/Android DB와 WebView의 연결/동작은 실행되지 않았다. adb 연결 기기는 0이고 AVD 목록만 있다. PC 2대/Android 2대, 동시 신청 실제 소켓 경합, SQLite 장애 주입, 보드 일치 실기 확인은 미검증이다. 현재 LAN TCP JSON은 암호화되지 않으며 같은 Wi-Fi의 패킷 관찰자에게 페이로드가 숨겨지지 않는다. Android 앱 프로세스가 강제 종료된 뒤 host 자동 복구/이전은 이번 구현에 포함되지 않는다. 결과 후 재도전·채팅·PNG는 별도 LAN 통합이 남아 있다.
