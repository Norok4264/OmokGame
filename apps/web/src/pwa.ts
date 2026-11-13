import {warmBotWorker} from "./bot-runner.js";
declare const __PWA_BUILD__:string;
let busy=true,registration:ServiceWorkerRegistration|null=null;
const locks=new Set<string>(),listeners=new Set<()=>void>();
export const pwaState={ready:false,message:"오프라인 자원을 준비하고 있습니다.",waiting:false,locked:false};
function publish(){pwaState.locked=locks.size>0;for(const listener of listeners)listener();}
export function subscribePwa(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function setPwaBusy(value:boolean){busy=value;}
export function updateLocked(){return locks.size>0;}
function request(worker:ServiceWorker,message:object):Promise<any>{
  return new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();reject(new Error("오프라인 상태 응답 시간 초과"));},5000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};worker.postMessage(message,[channel.port2]);});
}
function bounded<T>(promise:Promise<T>):Promise<T>{return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("자원 준비가 지연되고 있습니다. 네트워크를 확인한 뒤 준비를 재시도하세요.")),60000);promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});}
async function verify(){
  const controller=navigator.serviceWorker.controller;if(!controller)throw new Error("서비스 워커 제어를 기다립니다.");
  let status=await request(controller,{type:"OFFLINE_STATUS"});
  if(!status.ready&&status.version===__PWA_BUILD__){await request(controller,{type:"OFFLINE_REPAIR"});status=await request(controller,{type:"OFFLINE_STATUS"});}
  if(!status.ready||status.version!==__PWA_BUILD__)throw new Error("앱 자원이 아직 준비되지 않았습니다. 홈에서 업데이트 또는 재시도하세요.");
  const fonts=await document.fonts.load('16px "Danpan Noto"',"혼자 놀기 오프라인 준비 완료");await document.fonts.ready;
  if(!fonts.length)throw new Error("한글 폰트를 준비하지 못했습니다.");
  const image=new Image();image.src="/omok-hero.svg";await image.decode();await warmBotWorker();
  pwaState.ready=true;pwaState.message="혼자 놀기 오프라인 준비 완료";publish();
}
let started=false;
export async function prepareOffline(){
  if (window.AndroidOmok) {
    pwaState.ready=true;
    pwaState.message="Android 앱에 포함된 화면·규칙·봇 자원을 사용합니다.";
    publish();
    return;
  }
  pwaState.ready=false;
  try{
    if(!import.meta.env.PROD){pwaState.message="개발 서버입니다. 최종 빌드에서 오프라인 자원을 준비하세요.";publish();return;}
    if(!("serviceWorker"in navigator)||!window.isSecureContext)throw new Error("신뢰되는 HTTPS 또는 localhost에서 앱을 열어 주세요.");
    if(!started){
      started=true;
      navigator.serviceWorker.addEventListener("message",event=>{
        const m=event.data;
        if(m?.type==="PWA_ACTIVITY_QUERY"){
          if(!busy){locks.add(m.requestId);publish();setTimeout(()=>{locks.delete(m.requestId);publish();},6000);}
          (event.source as ServiceWorker|null)?.postMessage({type:"PWA_ACTIVITY_REPLY",requestId:m.requestId,busy});
        }
        if(m?.type==="PWA_UPDATE_CANCEL"){locks.delete(m.requestId);if(!busy)pwaState.message="다른 창의 대국이 끝난 뒤 업데이트하세요.";publish();}
        // Keep the UI locked until controllerchange/reload on accepted activation.
      });
      navigator.serviceWorker.addEventListener("controllerchange",()=>{if(!busy && locks.size)location.reload();else void verify().catch(error=>{pwaState.ready=false;pwaState.message=String(error.message);publish();});});
    }
    registration=await navigator.serviceWorker.getRegistration("/")??await navigator.serviceWorker.register("/sw.js",{updateViaCache:"none"});
    void registration.update().catch(()=>{}); // Existing offline controller remains usable.
    const waiting=()=>{pwaState.waiting=Boolean(registration?.waiting);publish();};waiting();
    registration.addEventListener("updatefound",()=>registration?.installing?.addEventListener("statechange",waiting));
    await bounded(navigator.serviceWorker.ready);
    if(!navigator.serviceWorker.controller)await bounded(new Promise<void>(resolve=>navigator.serviceWorker.addEventListener("controllerchange",()=>resolve(),{once:true})));
    await verify();
  }catch(error){pwaState.message=error instanceof Error?error.message:"오프라인 준비 실패. 네트워크를 확인하고 재시도하세요.";publish();}
}
export async function applyPwaUpdate(){
  if(busy||!registration?.waiting)return;
  try{const result=await request(registration.waiting,{type:"REQUEST_UPDATE",requestId:crypto.randomUUID()});if(!result.accepted){pwaState.message="진행 중인 다른 창을 종료하거나 홈으로 이동한 뒤 다시 업데이트하세요.";publish();}}
  catch(error){pwaState.message=String(error);publish();}
}
