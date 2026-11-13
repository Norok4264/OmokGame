# Android LAN 결과·재도전·채팅·PNG·통신 보기 — E16

작성: 2026-11-13 (Asia/Seoul). 앱 소스 버전 `0.6.0-android-results-chat-comm` / versionCode 4 / LAN protocol `danpan-lan-v4`. 이 문서는 Android LAN 구현의 최신 코드 기준이다. PWA 7단계 및 Android E13~E15는 과거 시점 기록으로 보존한다.

## 결과방과 재도전

- `LanGameRepository`에서 FINISHED/ABORTED 결과의 SQLite `ended_at_ms`를 기준으로 결과방 마감을 `끝난 시각 + 300,000ms`로 고정한다. 만료 뒤 권위 스냅샷은 이전 게임을 노출하지 않고 두 앱의 폴링 화면이 대기 화면으로 돌아간다.
- 승자 ID가 있는 FINISHED 결과에 한해서 패자만 `rematch.request`를 보낼 수 있다. 요청 시각부터 30,000ms와 결과방 만료 시각 중 이른 값을 DB `deadline_ms`에 저장한다.
- 승자만 `rematch.respond(accept=true|false)`로 응답한다. 응답은 만료 시각과 결과방 만료를 다시 검사한다. 만료·거부 요청은 한 번 처리된 상태로 남는다.
- 승낙 transaction은 PENDING→ACCEPTED, 새 UUID gameId, 빈 15×15 판, 첫 흑 차례와 새 60초 deadline, 권위 호스트 ID와 백·흑 참가자 ID를 함께 저장한다. 재도전 요청자가 백, 응답한 승자가 흑이며 호스트 여부는 색 결정에 쓰지 않는다. 새 gameId가 채팅 파티션도 새로 시작한다.
- 패자는 대기 중인 재도전을 취소할 수 있다. 거부·취소·응답 만료 뒤에는 10초 cooldown이 끝나면 결과방이 유효한 동안 다시 요청할 수 있다. cooldown은 결과방 만료를 연장하지 않는다.
- 새 요청은 검증 → SQLite 트랜잭션 안 상태/성공 요청 저장 → commit → 최신 snapshot 공개 순서다. 기존 성공 requestId 재확인도 현재 snapshot을 반환한다.
- 결과방에 있는 동안 15초 heartbeat는 계속되어 상대 연결 상태를 전달한다. 마지막 유효 수신 후 30초가 지나면 상대 연결 없음으로 표시하고 재도전 입력을 막는다. client의 인증·snapshot 미완료도 재도전을 잠근다.

## 채팅

- 명령은 `chat.send(gameId,messageId,body)`이며 참가 권한은 호스트의 game/challenge 연결과 session token으로 검증한다. 게임 revision과 분리된 game별 증가 sequence를 쓴다.
- Unicode code point 기준 1~200글자, 사용자별 rolling 5초 5건 제한을 서버에서 검증한다. 게임별 최근 100개 본문과 순번을 SQLite에 둔다. 결과방 만료 시 메시지와 중복 방지 ID 행도 정리한다.
- `lan_chat_ids`는 messageId에 sender와 본문 hash를 묶는다. 다른 requestId로 같은 ID·같은 본문을 다시 보내면 최초 sequence를 돌려주고, 다른 내용이나 발신자는 거부한다. 재시도는 UI의 수동 버튼만 제공하며 전송 payload에 같은 messageId를 사용한다.
- 진행 중에만 송신할 수 있다. FINISHED/ABORTED에서는 본문을 읽을 수 있지만 입력/전송은 잠긴다.
- UI는 gameId별 초안을 localStorage에 저장한다. 통신 복구 뒤 초안을 자동 송신하지 않는다. Enter 전송은 composition 상태와 keyCode 229를 확인해 한글 조합 중을 막는다.
- 각 화면에서 내 이름/메시지는 파랑, 상대는 빨강으로 표시한다. 메시지 출력은 React 텍스트 렌더링을 사용한다.

## PNG 저장과 공유

`LanResultPng`는 최종 15×15 보드, 양쪽 표시명/백·흑, 승리 제목, 종료 사유, 승리 착수 원, 저장 기기 시각을 그린다. 채팅, 주소, token, player/game ID는 렌더러 입력 allow-list에 포함되지 않는다. 패자가 PNG를 저장할 수 없고 승자에게만 저장/열기와 공유 메뉴가 보인다.

Android API 29 이상은 MediaStore의 Pictures/DanpanOmok 아래에 `image/png`로 저장한다. 앱이 만든 사진에는 광범위 저장소 권한을 추가하지 않는다. API 23~28은 `ACTION_CREATE_DOCUMENT`로 사용자가 위치를 선택한다. URI는 ACTION_VIEW 및 ACTION_SEND의 read grant로 연다/공유한다. 실패하면 결과 화면을 유지하고 다시 저장 버튼을 제공한다.

저장 API 근거: [공유 미디어 파일 저장](https://developer.android.com/training/data-storage/shared/media), [문서 선택과 ACTION_CREATE_DOCUMENT](https://developer.android.com/training/data-storage/shared/documents-files), [content URI 공유 권한](https://developer.android.com/training/secure-file-sharing/share-file).

## 통신 보기

`LanTransport.rpc`의 실제 JSON 쓰기/응답 읽기, `handleRequest`의 실제 수신/응답 쓰기에 기록 코드를 붙였다. 앱 로컬 호스트의 로컬 명령은 실제 네트워크 전송과 구별해 `LOCAL→HOST`/`HOST→LOCAL`로 기록한다.

각 이벤트는 메시지 종류, TX/RX 또는 local direction, 해당 기기 시각, (있는 경우) x/y, 요청/승인 revision, JSON UTF-8 payload byte 수를 기록한다. 바이트 수는 JSON 한 줄의 UTF-8 크기이며 뒤따르는 newline·TCP/IP·Wi-Fi 헤더·재전송을 포함하지 않는다. 대기 응답 중 송신 이벤트도 먼저 기록한다. 상대 기기의 이벤트나 시계를 서로 빼지 않는다.

요청/응답 왕복시간은 요청을 보내기 전 `SystemClock.elapsedRealtimeNanos()`와 같은 기기가 응답을 읽은 시각 차이이며 UI에 **응용 왕복시간**으로 표시한다. ID는 앞 8자, 채팅은 본문을 기록하지 않고 code point 길이만 보인다. access token, 본문 원문, 주소, 원시 JSON은 ring buffer에 저장하지 않는다. 앱 메모리에서 가장 최근 200건만 유지하며 파일/SQLite에 보관하지 않는다.

통신 보기의 OSI 표는 역할 설명이다. 7 응용 메시지, 6 표현/인코딩/암호화 관련 역할, 5 대화 설정/유지/종료 역할, 4 TCP/포트, 3 IP/라우팅, 2 링크 프레임/MAC, 1 실제 연결 매체다. 현재 Android LAN TCP JSON은 TLS 암호화를 사용하지 않는다. Android host는 대국 권위자이고 gameId는 대국 식별자다. 앱이 OSI 각 계층을 별도 프로토콜/코드로 구현했다는 설명과 구분한다.

## 변경 위치

| 경로 | 변경 |
|---|---|
| `android/app/src/main/java/kr/danpan/omok/LanGameRepository.kt` | SQLite v3 migration, result room expiry, rematch/chat validation·저장·snapshot, 오류 경계 |
| `android/app/src/main/java/kr/danpan/omok/LanTransport.kt` | protocol v4, 재도전/채팅 송수신, heartbeat, 실제 통신 event ring buffer |
| `android/app/src/main/java/kr/danpan/omok/LanResultPng.kt` | 최종 보드 PNG 생성 |
| `android/app/src/main/java/kr/danpan/omok/MainActivity.kt` | WebView bridge, MediaStore/SAF 저장, 열기·공유 |
| `apps/web/src/android-bridge.ts`, `NativeLanScreen.tsx`, `styles.css` | snapshot 타입, 결과/재도전/채팅/통신 UI와 composing 처리 |
| `android/app/build.gradle.kts`, `LanProtocol.kt` | 앱 versionCode 4/version 0.6.0, wire protocol v4 |

## 실제 검증과 한계

자동 TypeScript test 23 files/117 tests와 전체 TypeScript 검사, Vite WebView asset build가 통과했다. pure `LanResultChatPolicy`는 별도 fake-time vectors에서 5분/30초 deadline min·만료 경계와 10초 cooldown, 한글 1/200/201 code point, supplementary Unicode, 5초 구간 경계·5건 상한을 확인했다. 설치된 Android Studio Kotlin compiler 2.4.0/JDK17을 사용해 main Kotlin 소스 모두 Android SDK API36 `android.jar` classpath로 직접 컴파일했고 오류 없이 끝났다(기존 Android API deprecation warnings). 이는 project 지정 Kotlin Gradle Plugin 2.3.10의 Gradle task가 아니며 DB transaction이나 Android network/runtime 검증을 대신하지 않는다.

프로젝트 Wrapper 8.13의 `:app:assembleDebug`는 JDK17 지정 후에도 Gradle 초기화 단계에서 `java.io.IOException: Unable to establish loopback connection`으로 끝났다. `--stacktrace`의 원인은 `PipeImpl/UnixDomainSockets`에서 `java.net.SocketException: Invalid argument: connect`였다. IPv4 preference, 두 기기 연결 후, `--no-daemon`/빈 `org.gradle.jvmargs` 재시도도 같은 오류로 daemon connection 단계에서 실패했다. APK는 생성되지 않았다. 최초 adb query는 비어 있었지만 사용자 USB debugging 승인 후 재조회에서 SM-N981N(Android 13/API 33), SM-X510(Android 16/API 36)이 `device`로 표시됐다. 따라서 SQLite migration/transaction, NSD/TCP 양쪽 대국, 응답 경합/만료, 한글 실기 IME, PNG 저장 파일 생성과 Android 앱에서 실제 열기/공유, 화면 캡처·패킷 캡처는 아직 실행하지 않았다. E16 JSON은 실행한 명령 결과만 보관하며 화면·파일 증거를 만들지 않는다.

다음 검증은 Gradle loopback 실패 해결 후 APK 빌드 → 두 Android 앱 설치 → 승패 결과 → 5분/30초 경계와 결과방 만료 → 채팅 한글 조합/수동 중복 재시도 → 승자 MediaStore 또는 SAF 저장/갤러리 열기/공유 순서다. build 성공만으로 위 기능을 검증 처리하지 않는다.

### E16 후속 실기 결과 — 2026-11-13

위의 Gradle 실패/미실행 표는 최초 E16 시점의 기록이다. 이후 Android 연결 기기를 다시 사용해 수정·빌드·설치를 진행했다. Windows JDK17 loopback 초기화 오류를 프로세스 한정 JVM 임시 경로, SDK env, ASCII `subst X:` 드라이브 경로로 우회했다. 이어 KGP 2.3.10에서 오류로 처리되는 `android.kotlinOptions.jvmTarget`을 `kotlin.compilerOptions.jvmTarget`으로 마이그레이션했다. `LanTransport`가 NSD 등록에 protocol `4`를 싣고 발견 시 `3`과 비교하던 결함을 찾아 공통 `SERVICE_PROTOCOL_VERSION=4` 사용으로 고쳤다. APK build 성공 후 두 기기에 설치·실행했고, 재빌드 설치 후 양쪽에서 자동 발견을 확인했다.

실제 두 기기에서 신청자 백·승낙자 흑, 독립적인 authority host 표시와 게임 생성 스냅샷, 시간패 종료와 양측 revision1 결과, Android 결과 PNG의 Samsung Gallery 열기, 패자의 요청과 승자의 승낙 후 새 빈 판/재도전 요청자 백·응답자 흑을 관찰했다. 갤러리에서 열린 PNG는 최종 화면의 이름·색·종료 사유·저장 시각과 전체 보드를 표시했으며 이 대국은 수가 확정되지 않은 시간패라 보드가 비어 있었다. 증거 이미지는 `docs/evidence/android-lan-*` 및 `android-result-png-opened-gallery.png`, 상세 명령·범위는 `docs/evidence/android-lan-results-chat-png-stage.json`에 있다.

채팅은 태블릿 입력창에 `hello-lank` 초안이 있는 화면까지 확인했으나 메시지 목록은 비어 있고 상대 화면 수신도 확인되지 않았다. 송수신 성공이 아니다. 통신 보기, 같은 ID 재시도, 한글 IME 조합, 200건 제한, Wi-Fi 전환, 앱 백그라운드/종료 복구, SQLite 실패/요청 경합, 실제 착수 동기화·5목 승리, 5분/30초 경계와 PNG 공유는 여전히 미검증이다. 과거 E16 상태는 변경하지 않고 최신 상태를 [acceptance.md](acceptance.md)와 [evidence-index.md](evidence-index.md)에 덧붙였다.
