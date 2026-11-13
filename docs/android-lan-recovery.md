# Android LAN 복구와 앱 생명주기

작성일: 2026-11-13 · 앱 `0.5.0-android-recovery` / versionCode 3 · LAN protocol v3

## 실행 구조

`MainActivity`는 UI와 WebView를 소유하고, LAN 검색·소켓·SQLite·시계는 `LanSessionService`가 소유한다. 사용자가 LAN 대기 화면을 열면 Activity가 보이는 상태에서 `connectedDevice` 포그라운드 서비스를 시작하고, 서비스는 즉시 ongoing 알림을 표시한다. Activity 종료만으로 전송기나 대국 저장소를 닫지 않는다. ACTIVE 대국 동안만 부분 CPU wake lock을 잡아 screen-off 상태에서 시계/heartbeat가 실행될 기회를 보장하고, 종료·서비스 해제 때 놓는다. 이는 Wi-Fi 라디오나 프로세스 생존을 보장하지 않으며 배터리 사용이 증가할 수 있다. 알림의 연결 종료 또는 앱 안의 초기 화면 복귀는 사용자가 세션 종료를 요청한 것으로 처리한다.

Android 14(API 34) 이상이 요구하는 서비스 타입과 타입별 권한을 Manifest와 `startForeground()`에 선언했다. 기존 `CHANGE_WIFI_MULTICAST_STATE`가 connected-device 타입의 전제 조건에 해당한다. Android 13 이상에서는 알림 권한을 요청하지만 거부해도 FGS 시작을 막지 않는다. 이 경우 OS Task Manager에는 FGS가 보일 수 있으나 알림 서랍 표시가 제한될 수 있다.

현재 `targetSdk=36`이다. 공식 로컬 네트워크 안내에 따르면 Android 16의 opt-in 제한 시험은 `NEARBY_WIFI_DEVICES`가 필요하고 Android 17에서 target 37 이상은 `ACCESS_LOCAL_NETWORK` 경로를 채택해야 한다. 현재 compileSdk36 프로젝트에는 향후 target 37용 권한 UI/API를 추가하지 않았으므로 targetSdk를 올리기 전에 해당 정책과 NSD system picker/API를 다시 반영해야 한다.

## 재접속 정책

- 논리 heartbeat는 15초마다 보낸다. 화면이 살아 있을 때의 snapshot 조회도 유효 요청으로 호스트의 마지막 유효 응답 시각을 갱신하며, 화면이 멈춘 백그라운드에서는 서비스 scheduler가 heartbeat를 보낸다.
- 권위 호스트는 단조 증가 시계 기준 30초간 유효 요청이 없으면 상대 연결을 단절로 본다. 그 시각부터 60초 복귀 유예를 둔다.
- 매 250ms 마감 점검은 턴 마감과 단절 복귀 마감 중 더 이른 실제 monotonic deadline을 고른다. 같은 시각이면 시간패가 우선한다. 처리 지연으로 두 마감이 모두 지난 경우에도 과거 deadline 값을 비교한다.
- 재접속은 NSD에서 동일 playerId를 다시 발견한 뒤 token 인증 요청 → 권위 호스트의 최신 DB snapshot 수신 → 입력 활성화 순서다. 인증/스냅샷 동안 버튼을 잠그며 기존 턴 deadline을 재설정하지 않는다.
- 앱의 TCP는 요청마다 새 짧은 연결을 여닫는 RPC 방식이다. 정상 RPC 소켓 종료 자체는 단절 이벤트가 아니므로 연결 상태는 명시적 15초 app heartbeat와 유효 요청 부재로 판정한다. 소켓 오류/NSD 서비스 상실은 클라이언트 UI를 즉시 재접속 상태로 바꾸지만 클라이언트는 결과를 만들지 않는다.
- 각 요청은 단일 IO executor에서 처리되고 NSD discovery generation과 동일 peer ID를 확인한다. 오래된 discovery callback은 무시한다. 한 TCP 요청은 완료/실패 후 닫히므로 이전 요청 연결이 재접속 상태를 덮어쓰지 않는다.

## 권위 호스트 종료와 SQLite 복구

자동 호스트 이전은 없다. 상대 기기에서 호스트 연결이 사라져도 승자나 단절패를 임의 생성하지 않고 마지막 승인 스냅샷을 읽기 전용으로 보여준다. 호스트가 다시 열리면 저장 DB를 먼저 복구하고 같은 playerId/토큰으로 snapshot을 확인한다.

새 `LanGameRepository`는 DB migration 뒤 첫 transaction에서 `PENDING` 신청을 `CANCELLED`로 바꾸고 `ACTIVE` 대국을 `ABORTED`, `SYSTEM_ABORT`, 승자 없음으로 revision을 올려 기록한다. 상태와 시스템 성공 기록은 같은 transaction이며 이미 `FINISHED`인 5목·시간패·기권·단절패·무승부는 변경하지 않는다. 사용자 알림의 연결 종료도 진행 중인 권위 판을 승패 없는 `SYSTEM_ABORT`로 저장한다. DB 복구가 실패하면 서비스를 준비 완료로 표시하지 않는다.

## 생명주기별 동작

| 상황 | 동작 |
|---|---|
| 화면 꺼짐·앱 전환·Activity 재생성 | FGS와 대국 중 부분 CPU wake lock으로 NSD/TCP·SQLite·250ms 마감 검사·15초 heartbeat가 계속 실행될 기회를 높임. Activity 복귀 시 참가자 인증→스냅샷→입력 순서 재확인 |
| 앱 안에서 초기 화면 복귀 / 알림 연결 종료 | 사용자 세션 종료. 권위 호스트의 진행 중 판은 무효 저장, 최종 결과는 유지. 참가 클라이언트는 자신의 승패를 정하지 않음 |
| 일반 참가자 프로세스/네트워크 단절 | 호스트는 마지막 heartbeat 이후 30초에 단절, 이어 60초 유예. 재접속하면 기존 시계 유지. 유예 만료는 호스트가 판정 |
| Wi-Fi 끊김·복구·IP 변경 | NetworkCallback이 기존 NSD/소켓 자원을 정리하고 새 Wi-Fi IPv4로 서비스 재등록·재검색. 단절 중 턴 deadline은 진행 |
| 호스트 프로세스 강제 종료 | OS가 `onDestroy()`를 호출한다고 가정하지 않음. 상대는 무승패 대기 상태. 사용자가 앱을 다시 열어 DB 복구가 실행되면 미종결 ACTIVE를 시스템 중단 무효 처리 |
| Android가 서비스를 종료하거나 앱 강제 중지 | FGS는 프로세스 생존 보장이 아니다. 자동 재시작/호스트 이전하지 않음. 앱을 다시 열기 전까지 상대에게 새 권위 결과가 전달되지 않을 수 있음 |
| 로컬 네트워크 권한 회수/게스트 Wi-Fi | TCP/NSD 오류를 연결 실패로 안내. 권한·일반 Wi-Fi·공유기 기기 격리를 확인하도록 안내 |

## 검증과 한계

`LanRecoveryPolicy`는 Android API에서 분리된 순수 Kotlin 정책이다. fake clock vector는 29,999/30,000ms 단절 경계, 90초 유예 만료, 재접속 heartbeat, 시간 마감 우선, 양쪽 deadline 경과 후 더 먼저 온 단절 마감, 동시각 시간패 우선순위를 검사한다. 이는 DB transaction, NSD, Android 서비스, 기기 백그라운드 실행 시험이 아니다. 해당 결과는 [E15 JSON](evidence/android-lan-recovery-stage.json)에 기록한다.

Android 프로세스와 서비스가 실제로 유지될지는 OS 메모리 압박, 사용자의 강제 중지, 제조사 배터리 정책, Wi-Fi 구현에 따라 달라진다. FGS는 사용자가 인지하는 장기 작업을 위한 정책 준수 선택이며 생존 보장이 아니다. 실제 두 기기 화면 꺼짐·망 전환·IP 변경·권한 회수·강제 종료는 adb 연결 기기 부재와 APK 빌드 실패 때문에 미검증이다.

## 공식 Android 문서

- [Foreground service 유형과 connectedDevice 권한](https://developer.android.com/develop/background-work/services/fgs/service-types#connected-device)
- [Foreground service 실행 및 시작 제한](https://developer.android.com/develop/background-work/services/fgs/launch)
- [Foreground service 개요와 사용자 알림](https://developer.android.com/develop/background-work/services/fgs)
- [Android Activity/프로세스 종료 및 상태 복구](https://developer.android.com/guide/components/activities/activity-lifecycle)
- [알림 런타임 권한과 FGS 알림](https://developer.android.com/develop/ui/compose/notifications/notification-permission)
- [로컬 네트워크 권한(Android 16/17 가이드)](https://developer.android.com/privacy-and-security/local-network-permission)
