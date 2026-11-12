import {useSyncExternalStore} from "react";
import {communicationLog,type AppEvent} from "./communication-log.js";
const empty:readonly AppEvent[]=[];
export function CommunicationView(){
  const events=useSyncExternalStore(communicationLog.subscribe,communicationLog.snapshot,()=>empty);
  return <details className="communication-view"><summary>통신 보기 · 실제 앱 이벤트 {events.length}/200</summary>
    <section aria-label="실제 앱 이벤트"><h2>이 브라우저의 실제 송수신</h2>
      <p>JSON UTF-8 페이로드 바이트 수입니다. TCP 패킷 전체 크기나 전송량이 아닙니다. WebSocket/TLS/TCP/IP/링크 헤더와 재전송은 포함하지 않습니다.</p>
      <p>응용 왕복시간은 이 기기의 단조 시계로 전송 API 호출부터 해당 요청 ID의 성공·오류·heartbeat 응답 수신까지 잽니다. 서버 처리·대기·전달 시간이 포함되며 단방향 지연이나 TCP RTT가 아닙니다.</p>
      <p>토큰·닉네임·주소·채팅 본문은 기록하지 않습니다. ID는 앞 8자, 채팅은 글자 수만 표시합니다. 최근 200건만 메모리에 두며 새로고침하면 사라집니다.</p>
      <button className="button button-quiet" onClick={communicationLog.clear}>표시 기록 지우기</button>
      {!events.length&&<p>아직 실제 WebSocket 송수신이 없습니다. 혼자 놀기는 서버 통신을 만들지 않습니다.</p>}
      <div className="communication-events"><table><thead><tr><th>시각 (UTC)</th><th>종류 / 방향</th><th>좌표</th><th>revision</th><th>JSON UTF-8</th><th>응용 왕복시간</th><th>안전한 요약</th></tr></thead><tbody>
        {[...events].reverse().map(event=><tr key={event.serial}>
          <td><time dateTime={event.atUtc}>{event.atUtc}</time></td>
          <td><strong>{event.kind}</strong><br/>{event.direction==="SEND"?"브라우저 → 서버":"서버 → 브라우저"}</td>
          <td>{event.coordinate?`${event.coordinate.label} (${event.coordinate.x},${event.coordinate.y}) · ${event.coordinate.source==="request"?"요청":"snapshot 마지막 수"}`:"—"}</td>
          <td>{[event.expectedRevision!==undefined?`예상 ${event.expectedRevision}`:null,event.approvedRevision!==undefined?`승인 ${event.approvedRevision}`:null,event.revision!==undefined?`현재 ${event.revision}`:null].filter(Boolean).join(" / ")||"—"}</td>
          <td>{event.payloadBytes} bytes</td><td>{event.applicationRttMs!==undefined?`${event.applicationRttMs.toFixed(2)} ms`:event.rttNote??"—"}</td><td><code>{JSON.stringify(event.summary)}</code></td>
        </tr>)}
      </tbody></table></div>
    </section>
    <section aria-label="OSI 역할 설명"><h2>개념 설명 · OSI 역할과 실제 앱의 관계</h2>
      <p>아래는 역할을 이해하기 위한 대응입니다. 앱이 7계층을 각각 별도 코드로 구현한 것은 아닙니다. gameId는 대국 식별자이며 OSI 세션 프로토콜과 동일하지 않습니다.</p>
      <table><thead><tr><th>계층</th><th>이 앱에서 설명할 역할</th></tr></thead><tbody>
        <tr><th>7 응용</th><td>착수·신청·채팅 JSON 메시지와 서버 검증/응답.</td></tr>
        <tr><th>6 표현</th><td>JSON 직렬화·UTF-8 인코딩. WSS의 TLS 암호화 관련 역할은 브라우저/전송 라이브러리·TLS 종단이 담당하며 OSI 설명과 실제 프로토콜 구현을 구별합니다.</td></tr>
        <tr><th>5 세션</th><td>앱 토큰 인증·heartbeat·복구·종료는 대화 관리에 대응하는 응용 기능입니다. 별도 OSI 세션 프로토콜을 구현한 것은 아닙니다.</td></tr>
        <tr><th>4 전송</th><td>WebSocket의 TCP 연결과 포트. 실제 TCP 상태/재전송은 OS와 네트워크 스택이 담당합니다.</td></tr>
        <tr><th>3 네트워크</th><td>IP 주소·라우팅. 목적지까지의 경로를 앱 JSON에서 직접 관찰하지 않습니다.</td></tr>
        <tr><th>2 데이터 링크</th><td>각 링크 구간 프레임·MAC. 원격 상대의 MAC이 종단 간 그대로 전달되는 것은 아니며 loopback 캡처에 Ethernet MAC이 있다고 가정하지 않습니다.</td></tr>
        <tr><th>1 물리</th><td>실제 Wi-Fi 무선·유선 케이블 등 연결 매체. localhost 시험으로 실제 무선 구간을 검증하지 않습니다.</td></tr>
      </tbody></table>
      <p>실제 패킷은 이 화면에서 수집하지 않습니다. WSS 캡처에서는 보통 암호화된 TLS를 관찰하며, 복호화 조건 없이는 JSON 내용을 볼 수 없습니다.</p>
    </section>
  </details>;
}
