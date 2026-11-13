# Android 앱 설치·재현·제출 안내

기록 기준일: 2026-11-13. 이 문서는 실제 이 작업환경에서 빌드하고 두 Android 기기에 설치한 디버그 APK의 재현 안내다. 배포용 서명 APK는 생성하지 않았다.

## 산출 APK와 서명

| 항목 | 실제 값 |
|---|---|
| 앱 ID | `kr.danpan.omok` |
| 앱 버전 | `0.6.0-android-results-chat-comm` (versionCode 4, LAN protocol v4) |
| minSdk / targetSdk / compileSdk | 23 / 36 / 36 |
| Build Tools | 35.0.0 |
| APK | `releases/android/danpan-omok-0.6.0-debug-v4.apk` |
| 크기 | 6,811,218 bytes |
| SHA-256 | `58327D65591BA53404B42B0DBE5EC3564529CFBAB6D511FD782073E97F307576` |
| 서명 | `apksigner verify` 성공, Android Debug 인증서로 서명 |

이 파일은 개발·실기 검증용 **debug-signed APK**다. 개발 PC의 Android debug key로 서명했다. `apksigner`가 관측한 debug 인증서 SHA-256은 `e746031aaeda6eea691a7a92a74c2dcd5be78a5eab2f619e6851df2ef09fca04`다. 이 인증서는 배포 서명키가 아니다.

Release signing 설정·release APK·배포 keystore는 이 작업에서 만들거나 교체하지 않았다. Play 배포나 외부 배포에는 소유자가 비공개 보관하는 기존 배포키와 별도 비밀 설정이 필요하다. 저장소에 키/비밀을 넣지 않는다. 디버그 키로 설치된 앱은 다른 서명키로 빌드한 앱으로 인플레이스 업데이트할 수 없다.

## 실제 빌드·실행 환경

| 구성 | 확인값과 역할 |
|---|---|
| OS / 셸 | Windows 11 build 22631, PowerShell |
| Android Studio | `C:\Program Files\Android\Android Studio`; Studio `AI-262.10968.63.2622.16730706`, data directory `AndroidStudio2026.2.2` |
| IDE 실행 JBR | Studio bundled JBR, OpenJDK 25.0.4 (`+25.0.4+-16339643-b508.27`); 이번 Gradle 빌드 JVM으로 쓰지 않음 |
| Gradle 빌드 JDK | Microsoft JDK 17.0.21.0.2+1-LTS at `C:\Users\Administrator\.jdks\ms-17.0.21.0.2`; Gradle launcher/daemon 관측값 모두 17.0.21.0.2 |
| Wrapper / AGP / Kotlin | Gradle Wrapper 8.13, AGP 8.13.2, Kotlin Android plugin 2.3.10 |
| Daemon JVM criteria | `android/gradle/gradle-daemon-jvm.properties`: toolchain 17 |
| Java / Kotlin target | 17 / JVM_17 |
| Android SDK | `C:\Users\Administrator\AppData\Local\Android\Sdk`, API 36 platform (revision 2, extension 17), Build Tools 35.0.0 |
| Platform Tools | adb 1.0.41 / 37.0.1-15733141 |
| Web asset build runtime | Node.js 24.22.3, npm 12.2.2, Vite 8.3.7; this was a process-local pinned runtime, not a global machine upgrade |

`JAVA_HOME` is not set globally in this PC shell and `java` is not globally on PATH. Build verification set `JAVA_HOME` only in the build process. Android Studio's JBR 25, terminal Java, and Gradle JDK are distinct settings; do not infer one from another. `libs.versions.toml` is not present: Android plugin versions are pinned in `android/build.gradle.kts`, Wrapper in `android/gradle/wrapper/gradle-wrapper.properties`, and app SDK/JVM/app version in `android/app/build.gradle.kts`. There are no external Android `implementation(...)` dependencies in the current Gradle app; web dependencies are pinned by root `package-lock.json`.

## 수행한 빌드와 기기 설치

이번 작업에서 수행한 핵심 단계:

1. Process-only pinned runtime로 `npm run build:web` 실행 — Vite 8.3.7 성공.
2. JDK 17.0.21.0.2, Gradle User Home 및 SDK를 process 환경에 지정.
3. 프로젝트 경로가 한글이어서 Android Gradle Plugin이 거부하는 문제를 피하려고 Windows `DefineDosDeviceW`로 임시 ASCII `X:` 드라이브 별칭을 만들고 그 경로에서 `android\gradlew.bat --no-daemon --rerun-tasks :app:assembleDebug` 실행. Wrapper 8.13, 36개 task 실행, `BUILD SUCCESSFUL` (23초). 별칭은 빌드 종료 때 제거했고 PC 전역 설정은 바꾸지 않았다.
4. `aapt dump badging`으로 앱 ID·versionCode/name·SDK 범위를 확인하고 `apksigner verify --print-certs`로 debug 서명 검증.
5. `adb install -r`로 기존 앱 데이터를 지우지 않고 두 연결 기기에 설치. 양쪽에서 versionCode 4, versionName, minSdk23, targetSdk36을 `dumpsys package`로 확인.

두 기기 설치 확인은 SM-N981N / Android 13(API 33) 및 SM-X510 / Android 16(API 36)에서 성공했다. 기기 일련번호는 저장하지 않는다. 설치 성공은 이번 APK를 열어 사용자가 전체 대국 시나리오를 재검증했다는 뜻은 아니다. E19까지의 LAN·채팅 증거와 남은 미검증 항목은 [evidence-index.md](evidence-index.md), [acceptance.md](acceptance.md)에 연결했다.

## 다른 PC에서 소스로 재빌드

프로젝트는 Android Gradle Plugin에서 비ASCII 경로를 거부하는 문제가 확인되었다. 다른 PC에서는 ZIP을 `C:\omok` 같은 ASCII 경로에 압축 해제하거나 저장소를 ASCII 경로에 clone한다. 이번 `C:\오목게임`의 임시 별칭 코드는 개발자 명령 기록에만 있고 프로젝트 소스에 의존하지 않는다.

아래는 PowerShell 기준이다. 먼저 해당 PC에 Android Studio/SDK, JDK 17, Android SDK API36, Build Tools35.0.0이 설치되어 있어야 한다. 실제 설치 폴더가 다르면 환경변수 경로만 그 PC의 확인된 값으로 바꾼다. 이 예제는 debug APK만 만든다.

```powershell
Set-Location C:\omok
$env:JAVA_HOME = 'C:\path\to\jdk-17'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
java -version
node --version  # 24.22.3
npm --version   # 12.2.2
npm ci --no-audit --no-fund
npm run build:web
Push-Location android
.\gradlew.bat --version
.\gradlew.bat --no-daemon :app:assembleDebug
Pop-Location
```

산출 경로는 `android/app/build/outputs/apk/debug/app-debug.apk`다. 원본 소스와 이 문서에는 Gradle Wrapper JAR/properties, Kotlin/Gradle 설정, `package-lock.json`, 앱 에셋·폰트 라이선스·테스트가 포함된다. Node runtime은 `.node-version`, `.nvmrc`, `scripts/use-pinned-runtime.ps1`를 참고한다. 설치된 버전을 먼저 확인하고 임의로 의존성을 올리지 않는다. APK 파일 자체는 `.gitignore`의 `releases/`/`build/` 제외 정책에 따라 Git 소스 전달본에 넣지 않는다. 사용자가 받은 개별 APK의 SHA-256은 위 값과 대조한다.

## Android 기기에 설치하고 LAN 대국하기

1. 위 APK를 USB 파일 전송, 로컬 파일 공유 등으로 휴대전화에 복사한다.
2. 파일 관리자에서 APK를 열고 Android가 요구하면 해당 파일 관리자에 한해 알 수 없는 앱 설치를 허용한 뒤 설치 확인을 누른다. 조직 정책이나 Play Protect가 별도 경고를 띄우면 화면 안내를 따른다.
3. 두 휴대전화를 같은 Wi-Fi에 연결하고 앱을 연다. 처음 요청되는 주변 기기/알림 등 권한은 OS 설명을 확인한 뒤 허용한다. 거부하면 자동 검색·백그라운드 알림 등 해당 권한 기능이 제한될 수 있다.
4. 닉네임을 입력하거나 공란으로 두어 guest 이름을 받고 LAN 대국에 입장한다. 목록에서 상대를 선택해 신청하고, 상대가 승낙한다. 신청자는 백, 승낙자는 흑이며 흑이 먼저 둔다. 후보 교차점을 고른 뒤 ‘돌 놓기’로 확정한다.
5. 두 기기 사이의 직접 Wi-Fi LAN 경로이므로 앱 사용에 PC·외부 서버·도메인은 필요하지 않다. 공유기/게스트망이 클라이언트 간 통신을 막으면 검색 또는 연결에 실패할 수 있고 앱은 이 차단을 우회하지 않는다.

이번에 연결한 네트워크는 인터넷 연결이 `VALIDATED`된 사설 Wi-Fi였고 셀룰러도 연결되어 있었다(E17). 따라서 여기서 말하는 PC/외부 서버 불필요는 실제 앱 구조와 같은 Wi-Fi 시험 결과이며, 인터넷을 완전히 끈 상태의 실증 결과는 아니다. 앱의 OS 강제 종료/화면 꺼짐/Wi-Fi 전환 후 무조건 유지, 게스트망 통신, 모든 제조사·Android 버전 호환을 보장하지 않는다.

## 공개 저장소·개인 제출물

`.gitignore`와 실제 `git ls-files` 확인에서 추적 중인 local.properties, Gradle/build 출력, SQLite, 서명키, 비밀 설정, 로그, 캡처 원본, `releases/` 항목은 0건이었다. 새 APK는 local `releases/android/`에만 두며 Git에 add하지 않는다. Android Wrapper·소스·에셋·라이선스·테스트·문서는 소스 대상이다. 이 작업에서는 학번·성명을 작성하지 않았고 개인 보고서를 공개 저장소나 전달본에 자동 포함하지 않았다.

소스 전달본 `releases/danpan-omok-android-0.6.0-android-results-chat-comm-source.tar.gz`는 244개 파일을 포함한다. 같은 폴더의 `SHA256SUMS.txt`에는 전달본 체크섬이 기록된다. 압축 안의 `SOURCE_MANIFEST.json`에는 파일별 체크섬과 앱 버전이 있다. 별도 `.cache/verify-android-source-e20` 폴더로 풀어 `node scripts/verify-source.mjs <압축 해제 경로>` 검증을 실제 성공했고, 전달본에는 APK·비공개 보고서·서명키가 포함되지 않는다.

보고서에는 [LAN 구조](android-lan-game.md)의 구조도/호스트 권위 흐름, 사용자가 확보한 두 기기 화면과 채팅 증거 E19, 향후 통신 캡처 절차 [report-network-collection.md](report-network-collection.md), 실제 검증과 미검증을 분리한 [evidence-index.md](evidence-index.md)를 사용한다. 캡처하지 않은 화면/패킷/성능값은 증거로 만들지 않는다.
