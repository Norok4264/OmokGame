
## E21 닉네임 새 이용·신청받은 기기 호스트 — 2026-11-13

앱 0.7.0-android-lan-sessions / versionCode 5 / protocol v5.
APK: releases/android/danpan-omok-0.7.0-debug-v5.apk
SHA-256: FD554CCED8E029D90C103CD1E2F9DB35DE7C51E89102531AE89B0AB73A059D18

변경: LanGameRepository 공란 새 이름 발급, ID 대소에 따른 신청/인증 제한 제거.
LanTransport 양방향 challenge.create, 대기 중 호스트 자동 선택 제거, crossed request lock과 세대 격리.
동시 신청은 작은 신청자 ID의 신청만 유지하며 그 신청을 받은 기기가 호스트다.
LanChallengePolicy는 경합 규칙을 분리한다. NativeLanScreen은 항상 createChallenge를 호출한다.
LanSessionService는 대국 ACTIVE가 아닌 상태의 최근 앱 목록 종료에서 세션을 종료한다.
ACTIVE 중 화면 꺼짐/앱 전환은 복구 경로를 유지한다. 진행 중 게임 ID가 없는 이전 인증 정보는 새 transport에서 초기화한다.
앱/프로토콜 버전을 변경했다. 양쪽 동일 v5가 필요하다.

실행: 고정 Node24.22.3/npm12.2.2에서 npm run typecheck, npm test (23 files/117 tests), npm run build:web 통과.
JDK17/Wrapper8.13로 :app:assembleDebug :app:assembleDebugAndroidTest 성공(65 tasks, 26초).
시험 라이브러리는 설치된 SDK의 android.test.runner/base/mock을 사용하며 외부 의존성을 추가하지 않았다.
두 기기 adb install -r 성공. Android Instrumentation 시험 각 3건 통과:
공란 이름 guestN 발급, 양 ID 순서별 신청/중복 재확인/승낙/호스트와 색 배정, 동시 신청 정책.
이는 실제 두 기기 동시 네트워크 신청 시험이 아니다.

실패와 수정: 최초 시험의 RenamingDelegatingContext가 repository의 applicationContext 호출로 우회되어 실제 DB에 시험 ID(local/a/z) 기록이 생성됐다.
getApplicationContext를 시험 context 자체로 반환하도록 수정했다. 명시적 cleanupLegacyProbe 1건 성공으로 해당 시험 ID의 기록만 제거했다.
전체 사용자 DB를 삭제하거나 앱 데이터를 초기화하지 않았다. 최초 시험이 저장소 시작 정리 코드를 실행했으므로 당시 진행 중 판에 대한 영향이 전혀 없었다고 보장하지 않는다.
후속 3건 시험은 분리된 DB에서 두 기기 모두 통과했다.

실기 관측: 태블릿(SM-X510) 신청 → 휴대전화(SM-N981N) 수신 → 휴대전화 승낙 성공.
양쪽 guest2 백(태블릿 신청자), guest1 흑(휴대전화 수신자), 권위 호스트 guest1로 표시.
휴대전화 기권 확정 후 양쪽 guest2 승리/기권/revision1 확인.
결과 후 나가기는 현재 구현에서 홈으로 이동했고 양쪽 입력란 공란을 확인했다.
이는 원래 결과→대기열/이름 유지 요구와 다른 기존 동작으로 남아 있으므로 후속 수정 대상이다.
이미지: [휴대전화 호스트](evidence/android-e21-phone-host.png), [태블릿 신청자](evidence/android-e21-tablet-applicant.png).

미검증: 휴대전화→태블릿 새 신청의 실제 UI 대국, 실제 동시 버튼 조작, 이름 입력→대기열 홈→공란 재입장, 강제 종료 후 공란 재입장.
다음 기기 조작 명령은 사용자 승인에서 거절되어 중단했고 사용자가 직접 확인하기로 했다.
기존 PWA A/B 번호·과거 증거를 보존한다. A02/A03과 Android LAN 세션/호스트 항목의 부분 확인이며 전체 통과로 변경하지 않는다.

