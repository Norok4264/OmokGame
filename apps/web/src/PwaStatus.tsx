import {useEffect,useState} from "react";
import {pwaState,subscribePwa,setPwaBusy,prepareOffline,applyPwaUpdate} from "./pwa.js";
export function PwaStatus({busy}:{busy:boolean}){
  const [state,setState]=useState({...pwaState});
  useEffect(()=>subscribePwa(()=>setState({...pwaState})),[]);
  useEffect(()=>{setPwaBusy(busy);},[busy]);
  useEffect(()=>{void prepareOffline();},[]);
  return <aside className="offline-status" role="status" aria-live="polite">
    <span>{state.message}</span>
    {!state.ready && !busy && <button className="button button-quiet" onClick={()=>void prepareOffline()}>오프라인 준비 재시도</button>}
    {state.waiting && !busy && <div><p>새 버전이 준비되었습니다. 다른 창도 대국 중이 아닐 때 적용합니다.</p><button className="button button-secondary" onClick={()=>void applyPwaUpdate()}>업데이트하고 다시 열기</button></div>}
    {state.locked && <div className="pwa-update-lock" role="alert">안전한 업데이트를 확인하고 있습니다. 잠시 기다려 주세요.</div>}
  </aside>;
}
