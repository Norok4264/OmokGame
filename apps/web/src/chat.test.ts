import { describe,it,expect,vi,afterEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Chat,shouldSendOnEnter,shouldFollowChat,acknowledgeChatSnapshot } from "./Chat.js";
import type { LobbyClient } from "./lobby-client.js";
afterEach(()=>vi.unstubAllGlobals());
describe("A08 chat presentation and input decisions",()=>{
  it("does not send an Enter during composition or a keyCode 229 IME event",()=>{
    expect(shouldSendOnEnter("Enter",true)).toBe(false);expect(shouldSendOnEnter("Enter",false,229)).toBe(false);
    expect(shouldSendOnEnter("Enter",false,13)).toBe(true);expect(shouldSendOnEnter("Escape",false)).toBe(false);
  });
  it("follows new messages only when the reader is already near the bottom",()=>{
    expect(shouldFollowChat(1000,0,200)).toBe(false);expect(shouldFollowChat(1000,790,200)).toBe(true);
  });
  it("renders named own/opponent messages above the input, escapes markup, and preserves a disconnected draft",()=>{
    vi.stubGlobal("sessionStorage",{getItem:()=>"연결 후 보낼 초안"});
    const html=renderToStaticMarkup(createElement(Chat,{gameId:"g",me:"w",connected:false,readOnly:false,client:{} as LobbyClient,messages:[
      {messageId:"1",sequence:1,senderPlayerId:"w",displayName:"나의 이름",body:"<script>unsafe</script>",createdAtUtc:"now"},
      {messageId:"2",sequence:2,senderPlayerId:"b",displayName:"상대 이름",body:"한글 메시지",createdAtUtc:"now"},
    ]}));
    expect(html).toContain("chat-mine");expect(html).toContain("chat-theirs");expect(html).toContain("나의 이름");expect(html).toContain("상대 이름");
    expect(html).toContain("&lt;script&gt;");expect(html).not.toContain("<script>");
    expect(html.indexOf("한글 메시지")).toBeLessThan(html.indexOf("<input"));
    expect(html).toContain("연결 후 보낼 초안");expect(html).toContain("자동 전송하지 않습니다");
  });
  it("keeps a failed in-flight message visible in the read-only result view",()=>{
    const html=renderToStaticMarkup(createElement(Chat,{gameId:"g",me:"w",connected:true,readOnly:true,ownName:"내 이름",client:{} as LobbyClient,messages:[],
      state:{draft:"",setDraft:vi.fn(),setOutgoing:vi.fn(),outgoing:[{messageId:"stable",requestId:"stable-request",body:"종료 직전 전송",status:"failed",error:"대국 종료"}]}}));
    expect(html).toContain("종료 직전 전송");expect(html).toContain("내 이름");expect(html).toContain("전송 실패");expect(html).toContain("읽기 전용");
    expect(html).toMatch(/disabled=""[^>]*>같은 ID로 재시도/);
  });
  it("does not revive an acknowledged outgoing message after it leaves the recent-100 server history",()=>{
    const outgoing=[{messageId:"old",requestId:"request",body:"승인된 메시지",status:"sent" as const},{messageId:"failed",requestId:"retry",body:"실패 초안",status:"failed" as const}];
    const echo=[{messageId:"old",sequence:1,senderPlayerId:"w",displayName:"나",body:"승인된 메시지",createdAtUtc:"now"}];
    const acknowledged=acknowledgeChatSnapshot(outgoing,echo,"w");expect(acknowledged.map(m=>m.messageId)).toEqual(["failed"]);
    const newer=Array.from({length:100},(_,i)=>({...echo[0]!,messageId:`new-${i}`,sequence:i+2}));
    expect(acknowledgeChatSnapshot(acknowledged,newer,"w").map(m=>m.messageId)).toEqual(["failed"]);
  });
});
