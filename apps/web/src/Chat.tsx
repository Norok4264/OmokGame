import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { RoomChatMessage } from "@danpan/shared";
import type { LobbyClient } from "./lobby-client.js";
export function shouldSendOnEnter(key: string, composing: boolean, keyCode?: number) { return key === "Enter" && !composing && keyCode !== 229; }
export function shouldFollowChat(scrollHeight:number,scrollTop:number,clientHeight:number) { return scrollHeight-scrollTop-clientHeight<40; }
type Outgoing = { messageId: string; requestId: string; body: string; status: "sending" | "sent" | "failed"; error?: string | undefined };
export function acknowledgeChatSnapshot(rows:Outgoing[],messages:RoomChatMessage[],me:string) {
  return rows.filter(row=>!messages.some(message=>message.messageId===row.messageId && message.senderPlayerId===me));
}
export type RoomChatState = { draft:string;setDraft:Dispatch<SetStateAction<string>>;outgoing:Outgoing[];setOutgoing:Dispatch<SetStateAction<Outgoing[]>> };
type ChatProps={gameId:string;messages:RoomChatMessage[];me:string;client:LobbyClient;connected:boolean;readOnly:boolean;ownName?:string;state?:RoomChatState};
export function useRoomChatState(gameId:string):RoomChatState {
  const draftKey=`omok-chat-draft:${gameId}`;
  const [draft,setDraft]=useState(()=>sessionStorage.getItem(draftKey)??"");
  const [outgoing,setOutgoing]=useState<Outgoing[]>([]);
  useEffect(()=>{sessionStorage.setItem(draftKey,draft);},[draft,draftKey]);
  return {draft,setDraft,outgoing,setOutgoing};
}
export function Chat(props:ChatProps) { return props.state ? <ChatView {...props} state={props.state}/> : <LocalChat {...props}/>; }
function LocalChat(props:ChatProps) { const state=useRoomChatState(props.gameId);return <ChatView {...props} state={state}/>; }
function ChatView({gameId, messages, me, client, connected, readOnly, ownName="나",state}:ChatProps&{state:RoomChatState}) {
  const {draft,setDraft,outgoing,setOutgoing}=state;
  const scroll=useRef<HTMLDivElement>(null), nearBottom=useRef(true), composing=useRef(false);
  const [hideOpponent,setHideOpponent]=useState(false),[unread,setUnread]=useState(0);
  const latestSequence=useRef(messages.at(-1)?.sequence??0);
  useEffect(()=>{
    const added=messages.filter(m=>m.sequence>latestSequence.current).length;
    latestSequence.current=messages.at(-1)?.sequence??latestSequence.current;
    if(nearBottom.current && scroll.current){scroll.current.scrollTop=scroll.current.scrollHeight;setUnread(0);}
    else if(added)setUnread(n=>n+added);
    setOutgoing(rows=>acknowledgeChatSnapshot(rows,messages,me));
  },[messages,me]);
  async function send(row:Outgoing) {
    if(!connected || readOnly) return;
    setOutgoing(rows=>[...rows.filter(r=>r.messageId!==row.messageId),{...row,status:"sending" as const,error:undefined}].slice(-100));
    try {
      await client.request("chat.send",{gameId,messageId:row.messageId,body:row.body},row.requestId);
      setOutgoing(rows=>rows.map(r=>r.messageId===row.messageId?{...r,status:"sent",error:undefined}:r));
    } catch(error) { setDraft(current=>current||row.body);setOutgoing(rows=>rows.map(r=>r.messageId===row.messageId?{...r,status:"failed",error:error instanceof Error?error.message:"전송 실패"}:r)); }
  }
  function submit() {
    if(!connected || readOnly || !draft.trim() || [...draft.trim()].length>200) return;
    const body=draft.trim();setDraft("");
    void send({body,messageId:crypto.randomUUID(),requestId:crypto.randomUUID(),status:"sending"});
  }
  return <section className="online-chat" aria-label="대국 채팅">
    <h2>채팅 {readOnly?"· 종료 후 읽기 전용":""}</h2>
    <button className="button button-quiet" aria-pressed={hideOpponent} onClick={()=>setHideOpponent(value=>!value)}>{hideOpponent?"상대 메시지 다시 보기":"상대 메시지 숨기기"}</button>
    <div className="online-chat-messages" ref={scroll} onScroll={()=>{const el=scroll.current!;nearBottom.current=shouldFollowChat(el.scrollHeight,el.scrollTop,el.clientHeight);if(nearBottom.current)setUnread(0);}} role="log" aria-live="polite" aria-relevant="additions">
      {messages.filter(message=>!hideOpponent||message.senderPlayerId===me).map(message=><p key={message.sequence} className={message.senderPlayerId===me?"chat-mine":"chat-theirs"}><strong>{message.displayName}</strong> <span>{message.body}</span> <small>{message.senderPlayerId===me?"전송 완료":""}</small></p>)}
      {outgoing.filter(row=>!messages.some(m=>m.messageId===row.messageId && m.senderPlayerId===me)).map(row=><p key={row.messageId} className="chat-mine"><strong>{ownName}</strong> <span>{row.body}</span> <small>{row.status==="sending"?"전송 중":row.status==="sent"?"전송 완료":"전송 실패"}</small>{row.status==="failed" && <><span role="status">{row.error}</span><button className="button button-quiet" disabled={!connected||readOnly} onClick={()=>void send(row)}>같은 ID로 재시도</button></>}</p>)}
    </div>
    {unread>0&&<button className="button button-secondary" onClick={()=>{nearBottom.current=true;if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;setUnread(0);}}>새 메시지 {unread}건 · 아래로</button>}
    <form onSubmit={event=>{event.preventDefault();if(!composing.current)submit();}}>
      <label htmlFor={`chat-${gameId}`}>메시지 · {[...draft].length}/200</label>
      <div className="online-chat-input"><input id={`chat-${gameId}`} value={draft} disabled={readOnly} onChange={event=>setDraft(event.target.value)}
        onCompositionStart={()=>{composing.current=true;}} onCompositionEnd={()=>{composing.current=false;}}
        onKeyDown={event=>{
          if(!shouldSendOnEnter(event.key,event.nativeEvent.isComposing||composing.current,event.keyCode))return;
          event.preventDefault();submit();
        }}/>
        <button className="button button-primary" type="button" disabled={!connected||readOnly||!draft.trim()||[...draft.trim()].length>200} onClick={submit}>전송</button></div>
      {!connected && <p role="status">연결 복구 중 · 초안은 유지하며 자동 전송하지 않습니다.</p>}
    </form>
  </section>;
}
