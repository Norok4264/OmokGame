# Android 전환 0단계 — 실제 환경 및 재사용 조사

확인일: 2026-11-13 (Asia/Seoul). 앱 구현·프로젝트 생성·설치·업그레이드는 수행하지 않았다. 문서와 안전한 관측 요약만 작성했다.

## 실행 환경과 설치 도구

현재 명령 사용자는 PC-21\codexsandboxoffline, PowerShell 7.6.9다. 사용자 Administrator의 설치 경로를 읽기 권한 확장으로 조사했다. 이 셸의 환경변수를 사용자의 별도 터미널 환경과 동일하다고 가정하지 않는다.

| 항목 | 실제 관찰 |
|---|---|
| Studio 설치 경로 | C:\Program Files\Android\Android Studio |
| Studio 버전 | product-info.json의 dataDirectoryName=AndroidStudio2026.2.2. 공식 호환표의 Rabbit 2에 대응 |
| 제품 버전 문자열 | AI-262.10968.63.2622.16730706 |
| 빌드 번호 | 262.10968.63.2622.16730706 |
| 번들 JBR | jbr/bin/java.exe 직접 실행: 25.0.4+-16339643-b508.27 |
| IDE 실행 JBR 증거 | 기존 idea.log의 2026-11-05 17:20:37 시작 기록에서 동일 JRE/JVM 확인. 조사 중 studio64 프로세스 없음. 현재 실행 중 IDE JVM이라고 주장하지 않음 |
| 터미널 java / javac | PATH에서 찾지 못함. java -version은 명령 인식 실패 |
| JAVA_HOME | 현재 process 및 읽은 User/Machine 값 모두 공란 |
| 별도 JDK 17 | C:\Users\Administrator\.jdks\ms-17.0.21.0.2\bin\java.exe 직접 실행 성공: Microsoft OpenJDK 17.0.21.0.2+1-LTS |
| Studio 등록 JDK | jdk.table.xml에 jbr-25, ms-17과 Android SDK 36/37 등록. 등록 목록은 프로젝트 Gradle JDK 선택 증거가 아님 |
| JDK 8 흔적 | C:\Program Files\Android\jdk\jdk-8.0.302.8-hotspot 아래 jdk8u302-b08 하위 폴더 존재. 상위 bin/java.exe 직접 호출 실패. 실제 버전 실행 미확인; 후보에서 제외 |
| 프로젝트 Gradle JDK / Daemon JVM | 프로젝트 생성 전 미설정 |
| Wrapper / AGP / Kotlin / JVM target | 프로젝트 생성 전 미설정 |
| compileSdk / targetSdk / minSdk | 프로젝트 생성 전 미설정 |
| 전역 Gradle | PATH에서 명령 없음. 프로젝트 Wrapper로 간주하지 않음 |
| 사용자 Gradle override | Administrator의 .gradle/gradle.properties 없음. Studio options 검색에서 gradleJvm/gradleJdk/daemonJvm/gradleHome 항목 발견 안 됨 |
| 기본 Node/npm | C:\Program Files\nodejs\node.exe v26.13.1 / npm.ps1 11.20.0 직접 확인 |
| 프로젝트 전용 Node/npm | .cache/tools 직접 실행: v24.22.3 / 12.2.2. package.json의 Node 범위 >=24.22.1 <25이므로 기본 Node 26으로 기존 앱을 빌드하지 않음 |

기존 문서의 Codex PATH Node24.22.1/npm 없음은 과거 관찰이다. 이번에는 실제 경로와 출력이 달랐으며 설치나 PATH를 변경하지 않았다.

## SDK·장치

SDK 루트: C:\Users\Administrator\AppData\Local\Android\Sdk. 아래는 source.properties의 실제 값이다.

| 항목 | 설치 상태 |
|---|---|
| Platform android-36 | API36, revision2, extension17 |
| Platform android-37.0 | API37.0, revision2, extension22, PreviewSdkInt=0, CodeName/BetaVersion 공란 |
| Build Tools | 35.0.0, 36.0.0 |
| Platform Tools / adb | 37.0.1-15733141 / Android Debug Bridge 1.0.41 |
| Command-line Tools | latest 폴더, Pkg.Revision=23.0 |
| Emulator 패키지 | 37.2.13 |
| 시스템 이미지 | android-37.0/google_apis_playstore/x86_64, revision7 |
| 등록 AVD | emulator.exe -list-avds: Medium_Phone_API_37.0 |
| 연결 기기/실행 에뮬레이터 | adb devices -l 빈 목록. AVD는 설치 목록이며 실행 검증이 아님 |

adb 조회 중 없던 adb daemon이 tcp:5037에서 자동 시작되었다. 에뮬레이터는 시작하지 않았다. Android Studio·SDK·JDK를 설치/업그레이드하거나 설정을 바꾸지 않았다.

## 프로젝트 현황과 중단 작업

Git main, HEAD 4585cd0(배포). 시작 시 수정 9개: README, Vite 설정, dev.mjs, environment/requirements/protocol/acceptance/handoff/evidence-index. 미추적 3개: android-transition.md, start-local.ps1, use-pinned-runtime.ps1. 앞선 전환 문서 및 Windows 실행기 변경으로 확인하고 보존했다. package-lock.json diff와 ignored-but-tracked 목록은 비어 있다. 원격을 fetch하거나 push하지 않았다.

저장소의 AndroidManifest, build.gradle(.kts), settings.gradle(.kts), gradle-wrapper.properties, gradlew.bat, 버전 카탈로그 검색 결과 Android 프로젝트 없음. .idea/.gradle/gradle/android/apps/android 디렉터리 조회에서도 해당 프로젝트 설정을 찾지 못했다. 따라서 정확한 명령 .\gradlew.bat --version은 파일 부재로 실행 대상이 없다. 다른 프로젝트나 전역 Gradle로 대체하지 않았다.

## 실제 소스 기반 재사용 범위

| 경로 | 확인한 구현 | 재사용/변환 판단 |
|---|---|---|
| packages/shared/src/rules.ts, rules.test.ts | playMove, 좌표/차례/종료 거절, WIN 다음 DRAW 검사 | TS 유지 시 재사용 우선. Kotlin 이식 시 기존 사례를 동일 입력으로 대조 |
| apps/web/src/bot.ts, bot-runner.ts, bot.worker.ts | 즉시 승리/방어, Worker, gameId/revision/taskId 검증, 2000ms 대체 | 알고리즘 재사용. WebView Worker 실행 및 앱 생명주기는 재검증 |
| apps/web/src/App.tsx, OnlineGame.tsx, SoloGame.tsx, Chat.tsx, styles.css | React 화면, 후보/결과·채팅, composing/keyCode229 처리, 응답 지연 조회 | 하이브리드 화면 후보. 네이티브 선택 시 화면 기준/스타일로 변환 |
| apps/web/public/omok-hero.svg, omok-icon.svg, icons/, fonts/NotoSansKR.ttf, OFL.txt | 실제 SVG·PNG·폰트·라이선스 파일 | 에셋과 라이선스 재사용 |
| packages/shared/src/protocol.ts, types.ts, room-types.ts, nickname.ts | parser·상태·ID·닉네임 규칙 | 계약과 사례 재사용. 검색/호스트 선출/이름 범위는 추가 설계 |
| apps/web/src/lobby-client.ts | location.host 기반 /ws, sessionStorage, 15초 heartbeat/30초 수신 확인 | endpoint 탐색과 Android 저장소 어댑터 필요. 그대로 LAN 발견 기능이 되지 않음 |
| apps/server/src/online-game.ts, lobby.ts, rooms.ts | 요청 재확인·권위 판정·마감·방/채팅 상태 처리 | 정책/테스트 이식. Node 런타임 및 crypto/ws 의존성을 Android 지원으로 오인하지 않음 |
| apps/server/src/storage/database.ts, game-repository.ts, migrations.ts, recovery.ts, retention.ts | node:fs/better-sqlite3, WAL, 트랜잭션, 상태/요청 저장, 재시작 ACTIVE 무효 | SQLite 스키마·정책 재사용. Android DB 드라이버와 수명 관리는 교체/변환 |
| apps/web/src/result-image.ts | 1100×1500 Canvas, 승리/이름/종료/시각, toBlob·a.download | 이미지 구성 재사용. Android 저장/공유 API 연결 필요. Malgun Gothic 폰트 의존도 조정 후보 |
| apps/web/src/communication-log.ts, CommunicationView.tsx | TextEncoder UTF-8, performance.now RTT, 최근200건 | 안전한 기록 모델 재사용, 실제 Android 전송 지점에 재연결 |
| packages/shared/src/*.test.ts, apps/server/src/**/*.test.ts, apps/web/src/*.test.ts | 규칙·메시지·저장·복구·보관·봇·PNG·채팅 등 실제 테스트 파일 23개 | Android 회귀 사례로 활용. 이번 조사에서는 테스트를 실행하지 않음 |

React/TS 하이브리드는 화면·규칙·봇 재사용량이 높지만 NSD·호스트·SQLite·Android 생명주기용 네이티브 계층이 필요하다. Kotlin 네이티브는 Android 연결 계층을 직접 다룰 수 있지만 화면과 규칙 이식 비용이 크다. Node/better-sqlite3 내장은 Android ABI·네이티브 모듈 빌드 검증 부담 때문에 ‘그대로 재사용’으로 선정하지 않는다. 최종 선택은 다음 단계의 작은 연결 시제품에서 결정한다.

## 공식 표와 대조한 버전 후보

현재 설치된 Studio/JDK/SDK를 활용하는 후보이며 빌드 통과 또는 최종 채택을 의미하지 않는다.

| 후보 | 조합 | 적용 판단 |
|---|---|---|
| A: API37 사용 후보 | Studio2026.2.2 유지, AGP9.5.0, Gradle Wrapper9.6.0, 기존 Microsoft JDK17, Build Tools36.0.0, compileSdk/targetSdk37 후보 | 현재 설치 SDK37 및 로컬 네트워크 권한 API 검토에 적합. AGP9 내장 Kotlin 사용을 검토하고 실제 의존 Kotlin 버전은 다음 단계 의존성 해석에서 확인·고정. 외부 Kotlin plugin 임의 추가 금지 |
| B: 기존 플러그인 호환 후보 | Studio 유지, AGP8.13.2, Wrapper8.13, JDK17, Build Tools35.0.0, compileSdk/targetSdk36 후보, KGP2.3.10 | 하이브리드 라이브러리가 AGP8을 요구할 때 검토. AGP8.13의 API 상한은36.1이므로 SDK37을 억지로 사용하지 않음 |

두 후보의 minSdk는 연결할 실제 기기 OS와 선택 라이브러리 최소 버전을 확인한 뒤 정한다. Java/Kotlin toolchain·JVM target은 17을 후보로 함께 맞추며 현재 설정은 미설정이다. IDE JBR25를 빌드 JDK17로 바꿀 필요는 없다. JBR25로 Gradle을 실행하려면 Gradle9.1 이상이어야 하므로 후보 B의 Gradle8.13에 IDE JBR을 그대로 사용하면 안 된다.

공식 근거(2026-11-13 조회):

- [Studio/AGP 호환표](https://developer.android.com/build/releases/about-agp): Rabbit2 2026.2.2는 AGP7.1~9.5 범위.
- [AGP9.5](https://developer.android.com/build/releases/agp-9-5-0-release-notes): Gradle9.6.0, Build Tools36.0.0, JDK17, 최대API37.
- [AGP8.13](https://developer.android.com/build/releases/agp-8-13-0-release-notes): Gradle8.13, Build Tools35.0.0, JDK17, 최대API36.1; 8.13.2의 Kotlin2.3 지원.
- [Kotlin 호환표](https://kotlinlang.org/docs/gradle-configure-project.html): KGP2.3.10의 Gradle7.6.3~9.0.0, AGP8.2.2~9.0.0 범위로 후보B 대조.
- [Gradle Java 호환표](https://docs.gradle.org/current/userguide/compatibility.html): Java17은 Gradle7.3 이상, Java25는9.1.0 이상에서 실행 지원.
- [Android JDK 선택](https://developer.android.com/build/jdks), [AGP9 내장 Kotlin](https://developer.android.com/build/releases/agp-9-0-0-release-notes): IDE JVM과 Gradle JVM, 내장 Kotlin과 외부 plugin을 구분.

## 선행 조건·다음 단계

1. 새 Android 프로젝트에 실제 Wrapper·AGP를 추가할 때 선택 JDK17을 Gradle JDK와 터미널에 일치시킨다. 전역 JAVA_HOME 교체 없이 해당 셸/프로젝트 범위로 적용한다.
2. 프로젝트 생성 후 Daemon JVM criteria 유무와 우선 적용을 확인하고 .\gradlew.bat --version의 Launcher/Daemon JVM을 기록한다. 현재 등록 JDK만으로 이를 완료 처리하지 않는다.
3. 선택할 하이브리드/네이티브 의존성과 SDK37 및 AGP9 호환성을 검토한다. 필요한 Gradle/AGP 다운로드·SDK 라이선스 수락·의존성 캐시·네트워크 접근 가능 여부는 아직 미검증이다.
4. 두 실제 Android 기기를 연결해 OS/ABI와 권한을 조사해야 한다. AVD는 하나 등록되어 있지만 실행·가속 상태는 미검증이며 LAN 실기 대체 증거가 아니다.
5. 다음 단계에서 작은 NSD 검색/호스트 연결 시제품과 디버그 APK 빌드를 먼저 검증한다. 이번 단계에는 앱 구현·빌드·설치·장비 시험을 하지 않았다.

실행 명령과 출력 요약은 [환경 증거 JSON](evidence/android-stage0-environment.json)에 둔다. 사용자의 당장 필수 조작은 없으며 실제 LAN 검증 전에는 Android 두 대가 필요하다.

## 다음 단계에서 고정한 조합 — 2026-11-13

비교 후보 중 AGP8.13.2 / Gradle8.13 / Kotlin2.3.10 / JDK17 / compileSdk36, targetSdk36 / minSdk23 / JVM17을 Android 연결 시제품에 고정했다. 설치된 SDK와 Gradle distribution/cache를 이용하고 AGP8.13/KGP2.3 호환표를 대조했기 때문이다. API37 후보(AGP9.5)를 이번 코드에 쓰지 않은 이유는 target37 권한·새 AGP/Kotlin 내장 경로를 먼저 시제품에서 검증하기보다 이미 설치된 SDK36과 AGP8.13 호환 버전을 우선 사용하기 위해서다. Android 17 target37 이상은 향후 `ACCESS_LOCAL_NETWORK` runtime permission 구현이 필요한 별도 업그레이드 gate다. 현재 API37 SDK 설치 자체를 target37 빌드 검증으로 해석하지 않는다. 상세 결정/실패/증거는 [android-lan-prototype.md](android-lan-prototype.md)에 기록했다.
