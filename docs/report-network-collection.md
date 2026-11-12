# 보고서 Ⅱ·Ⅲ용 통신 구조와 자료 수집 절차

기록일: 2026-11-12 (Asia/Seoul). 앱 0.1.0.
구조도/계층 표/흐름도는 현재 소스에서 작성한 설명 자료이다. 패킷이나 배포망의 실측 그림이 아니다.
실제 앱 관측은 docs/evidence/stage9-application-events.json 및 stage9-communication-a.png / b.png와 별도로 구분한다. 실제 Wireshark 캡처는 없다.

## Ⅱ-1. 현재 서버–클라이언트 구조도 (소스 기반 설명)

~~~mermaid
flowchart LR
  subgraph A["사용자 A 브라우저"]
    AUI["React 화면"]
    AC["LobbyClient<br/>실제 send / message 콜백"]
    AT["통신 보기<br/>200건 메모리·안전한 요약"]
    AUI <--> AC
    AC -. 계측 .-> AT
  end
  subgraph B["사용자 B 브라우저"]
    BUI["React 화면"]
    BC["별도 세션 LobbyClient"]
    BT["해당 브라우저의 통신 보기"]
    BUI <--> BC
    BC -. 계측 .-> BT
  end
  V["Vite 개발 5173 / preview 4173<br/>정적 앱 제공·WS 프록시"]
  subgraph S["Node.js·TypeScript 서버 127.0.0.1:3001"]
    WS["HTTP upgrade / ws"]
    L["LobbyCoordinator<br/>인증·권한·순서·heartbeat"]
    G["OnlineGames<br/>착수·마감·종료"]
    R["shared 순수 오목 규칙"]
    ROOM["Rooms<br/>결과방·재도전·메모리 채팅"]
    WS <--> L
    L --> G
    L --> ROOM
    G --> R
  end
  AC <-->|"WS /ws (로컬 시험)"| V
  BC <-->|"WS /ws (로컬 시험)"| V
  V <-->|"별도 TCP 연결 /ws"| WS
  DB[("SQLite<br/>상태·착수·성공 요청")]
  G <--> DB
  L <--> DB
  ROOM <--> DB
  CACHE["브라우저 Service Worker<br/>정적 파일만 캐시"]
  SOLO["혼자 놀기 Worker + localStorage<br/>서버 통신 없음"]
  AUI -. 정적 자원 .-> CACHE
  AUI -. 기기 내부 계산 .-> SOLO
~~~

일반 실행 DB는 DATABASE_PATH(기본 data/omok.sqlite), 이번 자동 시험은 :memory: SQLite다. 그림의 서버 내부 선은 함수/DB 호출이며 각각 TCP 연결이 아니다. SQLite는 이 앱에서 외부 DB 서버 포트를 열지 않는다. 채팅 본문은 Rooms 메모리이고 SQLite에는 넣지 않는다.

실제 로컬 연결은 브라우저→Vite→Node 두 TCP 구간이다. preview의 WS proxy는 설치된 Vite 8.3.7의 server.proxy 기본 상속 및 실제 시험으로 확인했다. 운영 환경에서는 dist 정적 파일 제공과 /ws 프록시를 별도로 구성해야 한다. 현재 Node는 createServer(HTTP)이며 자체 TLS 서버를 만들지 않는다. 페이지가 HTTPS일 때 클라이언트는 wss URL을 선택하지만 신뢰 인증서·TLS 종단·실제 WSS 배포는 별도 구성/검증 대상이다. WSS를 이미 배포/캡처했다고 쓰지 않는다.

## Ⅱ-2. 사용자 A → 서버 → 사용자 B 착수 흐름도 (소스 기반 설명)

A가 현재 차례인 흑인 경우다. 실제 시연도 B가 신청(백), A가 승낙(흑)하여 이 흐름으로 진행했다.

~~~mermaid
sequenceDiagram
  participant A as A 화면·LobbyClient
  participant T as A 통신 보기
  participant S as Node LobbyCoordinator·OnlineGames
  participant R as shared 규칙
  participant D as SQLite
  participant B as B 화면·LobbyClient
  A->>A: 교차점 후보 선택 (아직 실제 돌 아님)
  A->>S: 돌 놓기 · game.move.propose<br/>gameId/requestId/expectedRevision/x/y
  A->>T: send API가 받은 원문 UTF-8 크기·t0 계측
  S->>S: 이미 지난 마감 먼저 적용
  S->>D: 성공 requestId/hash 조회
  alt 이미 성공한 같은 요청
    D-->>S: 원래 승인
    S->>D: 최신 대국 상태 조회
    S-->>A: 원래 승인 + 최신 snapshot (새 착수 아님)
  else 새 요청
    S->>S: 참가 권한·색·ACTIVE·차례·revision 검증
    S->>R: playMove로 좌표·점유·5목/장목·무승부 판정
    alt 유효한 착수
      S->>D: BEGIN IMMEDIATE<br/>상태+game_moves+successful_requests 원자 저장
      alt COMMIT 성공
        D-->>S: commit 완료
        S->>S: 다음 턴 마감 메모리 공개
        S-->>A: lobby.snapshot · 승인된 board/revision
        S-->>B: lobby.snapshot · 같은 board/revision
        A->>A: 서버 승인 돌 표시
        B->>B: 서버 승인 돌 표시
        S-->>A: command.result · 원래 승인+최신 snapshot
        A->>T: 같은 요청 ID의 응답 t1<br/>응용 왕복시간=t1-t0
      else 저장 실패
        D-->>S: rollback / 저장 오류
        S-->>A: 오류·가능한 최신 상태<br/>돌 승인/승리 선발송 없음
      end
    else 규칙 또는 상태 검증 실패
      S-->>A: server.error / 최신 snapshot으로 복구
    end
  end
~~~

현재 코드는 commit 뒤 방 참가자 snapshot을 먼저 전달한 다음 요청자에게 command.result를 보낸다. 진행 중 착수는 두 참가자에게만 보내며 접속/대기/종료 변경은 전체 목록을 갱신한다. 따라서 서버가 승인한 snapshot을 받은 돌 표시가 개별 command.result보다 먼저일 수 있다. commit 전 낙관적 돌 표시를 의미하지 않는다. 같은 requestId 재확인은 기존 승인을 반환하며 새 착수처럼 차례를 다시 검사하지 않는다.

command.result 수신 뒤 LobbyClient가 lobby.snapshot.request를 추가로 보낼 수 있다. 같은 마지막 수가 여러 snapshot에 보인다고 착수가 반복된 것은 아니다. 실제 새 착수 수는 성공 승인/revision/game_moves와 함께 확인한다. chat sequence도 game revision과 구별한다.

## Ⅱ-3. 통신 보기의 실제 관측 범위

- SEND: LobbyClient.transmit가 JSON.stringify한 동일 문자열을 WebSocket.send에 전달한 직전의 로컬 단조 시각을 잡고, API가 수락한 뒤 안전한 메타데이터를 기록한다. 네트워크 전달 성공/서버 승인을 send 자체로 확정하지 않는다.
- RECEIVE: 현재 연결의 실제 message 이벤트에서 JSON 문자열 크기와 시각을 기록한다. 그 뒤 기존 런타임 검증/앱 처리를 수행한다. 이전 소켓의 무시된 메시지, HTTP handshake, TCP ACK, WebSocket 제어 ping/pong, 정적 파일 HTTP, Worker 내부 작업 전체를 패킷처럼 열거하는 도구가 아니다.
- bytes: 삭제 전 실제 JSON 문자열을 TextEncoder(UTF-8)로 잰 값이다. 화면의 요약 JSON 크기는 아니다. 원문 문자열과 토큰/채팅 본문은 로그에 보관하지 않는다. 식별자는 앞 8자, 채팅은 Unicode 글자 수/sequence만 남긴다.
- 좌표는 요청 x/y 또는 snapshot.lastMove를 구별한다. 예상 expectedRevision, 원래 승인 approvedRevision, 최신 snapshot revision도 구별한다.
- 응용 왕복시간은 같은 브라우저 performance.now를 사용한다. command.result/server.error/heartbeat.ack만 해당 requestId와 연결한다. broadcast에는 숫자를 만들지 않는다. 연결 교체/삭제/보관 범위를 벗어나거나 같은 ID가 미확정 상태에서 겹쳐 재전송되면 RTT를 표시하지 않거나 모호함을 알린다.
- 이 시간은 OS/프록시/전달·서버 처리·DB 저장·응답 대기 등을 포함한다. 요청 직렬화 이전 및 응답 후 화면 렌더 완료를 재는 값이 아니다. 서버의 serverTimeUtc나 B의 시각을 A의 시각에서 빼지 않는다.
- 자동 저장/서버 업로드/localStorage 저장은 없다. 최근 200건과 제한된 타이밍 상관 메타데이터만 메모리에 둔다. 새로고침 또는 ‘표시 기록 지우기’로 사라진다. 수집 시험 script가 저장하는 안전한 JSON/캡처는 사용자가 요청한 시험 결과물이며 앱의 자동 로그 저장 기능이 아니다.

JSON 크기 ≠ WebSocket frame 전체 ≠ TLS record ≠ TCP segment ≠ 캡처 frame 크기다. 하나의 메시지가 여러 구간으로 나뉘거나 합쳐지고 재전송될 수 있다. 따라서 메시지 하나를 TCP 패킷 하나로 취급하거나 JSON bytes를 실제 선로 전송량으로 합산하지 않는다. WebSocket은 TCP 위의 handshake/framing 프로토콜이다. [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455.html)

## Ⅱ-4. OSI 역할 설명 (개념 자료 C10-01)

| 계층 | 연결할 역할 | 실제 구현 주체/한계 |
|---|---|---|
| 7 응용 | 착수/채팅/신청 JSON과 서버 규칙·응답 | React/LobbyClient와 Node 앱 코드 |
| 6 표현 | 직렬화·UTF-8 표현, 암호화 관련 역할 설명 | JSON/TextEncoder와 브라우저·라이브러리·TLS 종단. TLS를 앱이 별도 ‘6계층 코드’로 구현했다고 쓰지 않음 |
| 5 세션 | 대화 설정·유지·종료 | 앱 토큰 인증, heartbeat, 복귀 유예와 종료는 응용 차원의 대화 관리. gameId는 대국 ID이고 OSI 세션 프로토콜이 아님 |
| 4 전송 | TCP·포트·신뢰 전송 | 브라우저/OS TCP 스택, Node 소켓. 앱 로그만으로 TCP 재전송/혼잡 제어를 직접 관찰하지 못함 |
| 3 네트워크 | IP·라우팅 | OS/라우터. 원격망의 경로는 실제 수집 없이 단정하지 않음 |
| 2 데이터 링크 | 각 구간 프레임·MAC | 해당 링크의 NIC/드라이버/스위치 등. 원격 사용자 MAC이 종단 간 유지되는 것으로 설명하지 않음 |
| 1 물리 | 케이블·무선 등 실제 매체 | 실제 인터페이스/장비 조건을 기록. localhost로 Wi-Fi 무선 신호를 관측했다고 쓰지 않음 |

이 표는 OSI 참조 모델에 대응시켜 역할을 설명한 것이다. 앱이 7계층을 각각 독립 코드로 직접 구현했다는 뜻이 아니다. ‘관측값’으로 제출하지 않고 개념 설명으로 표기한다.

## Ⅲ-1. 앱 이벤트/화면 수집 순서

1. 앱 버전·빌드 ID·기기/OS·브라우저 버전·서버/프록시 주소와 포트·실행 시각을 기록한다. 학번/성명은 사용자 제공 전까지 비워 둔다.
2. 두 독립 브라우저 세션 A/B에서 시험용 이름으로 입장한다. 서로 다른 기기 시험인지 같은 PC 두 세션인지 명시한다.
3. 양쪽 ‘통신 보기’를 열어 자동 예시가 아닌 session/start·snapshot 이벤트인지 확인한다. 토큰 값이 보이지 않는지 점검하고 필요하면 ‘표시 기록 지우기’를 누른다. 지운 이전 요청의 RTT는 더 이상 연결할 수 없다.
4. B가 A에게 신청 → A 승낙 → 양쪽 준비 → 3초 시작 안내를 진행한다. A 흑/B 백을 이름·돌 색 화면에서 확인한다.
5. A가 H8 후보를 선택해 ‘돌 놓기’를 한 번 누른다. A의 SEND game.move.propose와 예상 revision, 양쪽 RECEIVE snapshot의 H8/현재 revision, A의 command.result 승인을 확인한다. 이번 관측 예는 JSON 180 bytes/예상 1/현재 2지만 반복 시험에 고정 숫자로 가정하지 않는다.
6. 시험용 한글 채팅을 한 번 보낸다. 본문은 채팅 영역에서만 확인하고, 통신 보기에는 chatLength 또는 latestChat.length만 나오는지 확인한다. 채팅으로 game revision이 증가했다고 쓰지 않는다.
7. 통신 보기 영역만 캡처해 보고서에 넣는다. ‘원문 JSON’이라는 이름으로 안전한 요약을 제출하지 않는다. 실측 표는 이벤트 종류/방향/UTC시각/짧은 ID/좌표/예상·승인·최신 revision/JSON UTF-8 bytes/응용 왕복시간을 쓰고, 누락 값은 —/해당 없음으로 둔다.
8. 두 기기의 UTC 시각을 빼서 단방향 지연을 계산하지 않는다. 같은 기기의 requestId 응답만 응용 왕복시간으로 제시한다. 시연 표본을 일반 인터넷/모바일 성능으로 일반화하지 않는다.

## Ⅲ-2. Wireshark 수집 준비 (수집 안내 P10-01, 아직 미실행)

실제 pcap/pcapng, 인터페이스 목록, TCP stream 번호, IP/MAC, 재전송 횟수, TLS 관측 결과는 아직 없다. 다음은 사용자가 실제 환경에서 수행할 절차다.

읽기 전용 PowerShell 확인 명령 예시:
~~~powershell
Get-NetIPConfiguration
Get-NetAdapter | Select-Object Name, InterfaceDescription, Status, MacAddress
Get-NetTCPConnection -State Listen |
  Where-Object LocalPort -in 3001,4173,5173,443 |
  Select-Object LocalAddress,LocalPort,OwningProcess
Get-Command wireshark,tshark,dumpcap -ErrorAction SilentlyContinue
~~~
이는 예시이며 여기서 실제 출력/설치 버전/인터페이스를 확인한 것으로 기록하지 않는다. Wireshark의 Help→About에서 실제 Wireshark/Npcap 설치·버전을 기록하고 Capture→Options의 인터페이스 이름·IP·트래픽 변화·link-layer header 종류를 확인한다. [Capture Options 공식 문서](https://www.wireshark.org/docs/wsug_html_chunked/ChCapCaptureOptions.html)

| 배치 | 캡처 위치 선택 | 관찰 한계 |
|---|---|---|
| 같은 PC의 127.0.0.1 브라우저/서버/프록시 | Npcap의 실제 loopback capture 인터페이스 확인 | 물리 NIC/Wi-Fi를 지난 트래픽이 아니며 Ethernet MAC을 가정하지 않음 |
| PC A와 원격 서버 | A가 실제 서버 통신에 쓰는 Wi-Fi/Ethernet 인터페이스 | 해당 클라이언트↔서버 구간만 관찰 |
| 서버에서 A/B 두 연결 | 실제 서버 ingress NIC 또는 실제 프록시 upstream 구간 | A↔서버와 서버↔B는 서로 다른 TCP stream. TLS 종단 앞뒤도 다름 |
| Android↔서버 | 실제 수집 가능한 endpoint/서버/승인된 장비 위치를 정해 기록 | 일반 PC Wi-Fi 캡처로 다른 단말의 무선 프레임 전체가 보인다고 가정하지 않음 |

Windows localhost는 Npcap loopback 지원 여부와 실제 ‘Adapter for loopback traffic capture’ 항목을 확인한다. localhost 트래픽을 물리 NIC에서 찾지 못했다고 앱의 통신 부재로 결론 내리지 않는다. 설치된 인터페이스 이름은 환경마다 다를 수 있다. [공식 loopback 안내](https://wiki.wireshark.org/CaptureSetup/Loopback)

## Ⅲ-3. 필터 예시

아래는 현재 기본 포트에 맞춘 예시다. 실제 설정 포트/IP/stream 번호를 확인하고 바꾼다. Capture filter와 Display filter는 문법과 용도가 다르다. Display filter로 숨긴 패킷은 원본 파일에서 삭제되지 않는다. [공식 필터 설명](https://www.wireshark.org/docs/wsug_html_chunked/ChWorkDisplayFilterSection.html)

| 목적 | Capture filter (시작 전) | Display filter (수집 후) |
|---|---|---|
| 로컬 Node 구간 | tcp port 3001 | tcp.port == 3001 |
| 개발 웹/WS 구간 | tcp port 5173 | tcp.port == 5173 |
| 최종 preview 구간 | tcp port 4173 | tcp.port == 4173 |
| WSS가 실제 443인 경우 | tcp port 443 | tcp.port == 443 |
| 두 로컬 구간을 함께 | tcp port 3001 or tcp port 4173 | tcp.port == 3001 or tcp.port == 4173 |
| 관측 후 고른 한 연결 | 포트/host로 범위 지정 | tcp.stream == N (N은 실제 관측 번호로 교체) |

추가 Display filter:
- websocket : 디섹터가 WebSocket으로 식별한 프레임
- http.request.uri == "/ws" or http.response.code == 101 : 평문 HTTP/1.1 Upgrade 확인
- tls and tcp.port == 443 : 실제 443 TLS 내용. TCP SYN/ACK까지 보려면 tcp.port == 443 사용
- tcp.analysis.retransmission : Wireshark의 재전송 분석 후보. 실제 상황/캡처 누락 여부를 함께 판단

WebSocket 디섹터가 식별되지 않으면 handshake부터 수집했는지와 포트/Decode As 설정을 확인한다. websocket.payload_length의 짧은 길이 필드만 모든 메시지 총길이로 취급하지 않는다. 큰 payload/fragment에는 확장 길이·재조립 정보가 관련된다. [공식 WebSocket 필드](https://www.wireshark.org/docs/dfref/w/websocket.html)

frame.len/frame.cap_len, tcp.len, websocket payload 길이는 서로 다른 범위다. 캡처 link type·snaplen·오프로딩 조건에 따라 실제 매체의 모든 바이트를 나타내지 않을 수 있다. [Frame 필드](https://www.wireshark.org/docs/dfref/f/frame.html), [TCP 필드](https://www.wireshark.org/docs/dfref/t/tcp.html)

## Ⅲ-4. 실제 패킷 시연 절차

1. 개인 통신이 없는 시험 계정/닉네임/채팅을 사용한다. 캡처를 공유하면 앱 로그와 달리 평문 인증 토큰·본문·주소가 들어갈 수 있다. raw 파일은 private-captures 등 공개 Git 제외 위치에 보관하고 자동으로 보고서 증거 폴더에 복사하지 않는다.
2. 선택한 인터페이스·링크 유형·실제 포트와 위 capture filter를 기록한 뒤 캡처를 시작한다. handshake 관찰이 필요하면 브라우저 연결 전에 시작한다. 인증 뒤부터 수집하면 토큰 노출을 줄일 수 있으나 Upgrade 자동 식별에 필요한 패킷이 빠질 수 있다.
3. Ⅲ-1의 B 신청→A 승낙→준비→A H8 확정→채팅 한 건을 재현한다. 이때 A/B 앱 통신 보기의 UTC·짧은 ID·revision을 함께 기록한다.
4. 수집을 중지하고 원본을 pcapng로 실제 저장한다. 파일 이름/시각/위치/사용한 필터/앱 빌드를 실제 기록한다. 수집하지 못하면 파일 없음/미수집으로 남긴다.
5. 실제 TCP stream 번호를 골라 연결 방향과 포트를 확인한다. Vite 앞 4173과 뒤 3001을 모두 잡았다면 동일 앱 요청이 두 구간에 보이는 것을 ‘두 번 착수’로 세지 않는다.
6. 평문 WS에서는 디코딩 가능한 JSON의 requestId/좌표/revision을 앱 관측과 대조할 수 있다. 앱의 짧은 ID는 충돌 가능성이 있으므로 시연 시간·방향·좌표·revision 등도 함께 비교한다. raw 토큰/본문을 공개 표에 옮기지 않는다.
7. 보고서에는 필요한 안전한 화면/필드만 제시한다. 원본에서 민감 값이 그대로 남아 있다면 원본을 공개 자료로 제출하지 않는다. TLS key log도 비밀 자료이며 저장/공유 범위를 따로 관리한다.

## Ⅲ-5. WSS와 캡처 환경의 한계

WSS는 WebSocket을 TLS로 보호한다. 일반적인 외부 구간 캡처에서는 암호화된 TLS 데이터와 연결 메타데이터를 보며 JSON 좌표/채팅/토큰을 그대로 볼 수 없다. 앱의 통신 보기는 암호화 전 송신/복호화 후 수신 응용 문자열을 계측하므로 WSS에서도 동작하지만 TLS 패킷을 복호화하는 도구는 아니다.

허가된 시험에서만 지원 브라우저의 세션 키 로그 등 실제 TLS 복호화 조건을 마련할 수 있다. 서버 인증서/개인키만 있으면 모든 TLS를 읽는다고 설명하지 않는다. 특히 TLS 1.3/PFS에서는 단순 RSA 개인키 방식에 제약이 있다. 이 프로젝트는 TLS key log나 복호화 캡처를 아직 수집하지 않았다. [Wireshark TLS 공식 안내](https://wiki.wireshark.org/TLS)

프록시가 TLS를 종료하면 외부 WSS 구간과 내부 WS 구간의 관찰 조건이 다르다. 내부 평문 구간을 읽었다고 외부 암호문을 해독했다고 쓰지 않는다. localhost에는 실제 물리 네트워크 홉/무선 매체 관측이 없고, 실제 PC/Android 구간은 NIC·라우팅·TLS 종단을 확인한 별도 시험이 필요하다.

## 보고서 자료 분류와 현재 상태

| 분류 | 자료 | 현재 상태 |
|---|---|---|
| 실제 앱 관측 E10 | stage9-application-events.json, stage9-communication-a.png/b.png | 실제 독립 브라우저 세션 두 개 및 Node/SQLite 시험. 패킷 캡처 아님 |
| 소스 기반 개념 C10 | 본 문서 구조도/흐름도/OSI 역할 | 설명 자료. 실제 라우팅·MAC·TLS 캡처나 교수 배점표로 사용하지 않음 |
| 수집 절차 P10 | 본 문서 Wireshark 인터페이스·필터·시연 안내 | 수집 안내만 작성. pcapng/packet count/stream/IP/MAC 관측값 없음 |

본 문서의 테스트 수치와 안전한 앱 관측은 9단계 실행 기록을 따르고, 실제 패킷 자료는 추후 확보했을 때만 docs/evidence-index.md에 별도 등록한다.

10단계 추가: E11은 최종 빌드 0.1.0-8f52d08ed448ebe3의 실제 앱 관측이다. Origin/상한/보관 및 검증 범위는 integration-validation.md 참조. 본 문서의 E10 링크는 9단계 당시 기록이며 새 패킷 수집을 뜻하지 않는다.
