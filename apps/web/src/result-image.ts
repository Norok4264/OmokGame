import { resultReason, type RuleBoard } from "@danpan/shared";
export interface ResultImageInput { board:RuleBoard;whiteName:string;blackName:string;winner:"WHITE"|"BLACK";status:string;endReason:string|null; savedAt:Date }
export async function renderResultImage(input:ResultImageInput):Promise<HTMLCanvasElement> {
  if(document.fonts) await document.fonts.ready;
  const canvas=document.createElement("canvas");canvas.width=1100;canvas.height=1500;
  const ctx=canvas.getContext("2d");if(!ctx)throw new Error("이미지를 만들 수 없습니다.");
  ctx.fillStyle="#ffdfcc";ctx.fillRect(0,0,1100,1400);
  ctx.fillStyle="#fff7ef";ctx.fillRect(40,30,1020,260);ctx.strokeStyle="#ba7754";ctx.lineWidth=3;ctx.strokeRect(40,30,1020,260);
  ctx.textAlign="center";ctx.fillStyle="#352119";ctx.font='bold 52px "Malgun Gothic",sans-serif';ctx.fillText("승리! · 단판 오목",550,100);
  ctx.font='bold 35px "Malgun Gothic",sans-serif';ctx.fillText(`${input.winner==="BLACK"?input.blackName:input.whiteName} · ${input.winner==="BLACK"?"흑":"백"} 승리`,550,155);
  ctx.font='28px "Malgun Gothic",sans-serif';ctx.fillText(`종료 사유: ${resultReason(input.status,input.endReason)}`,550,208);
  ctx.fillText(`저장 시각: ${input.savedAt.toLocaleString("ko-KR")} (${Intl.DateTimeFormat().resolvedOptions().timeZone})`,550,253);
  ctx.font='bold 30px "Malgun Gothic",sans-serif';ctx.fillText(`흑 · ${input.blackName}`,550,338);ctx.fillText(`백 · ${input.whiteName}`,550,385);
  const left=95,top=475,gap=65,end=left+14*gap;
  ctx.fillStyle="#dba968";ctx.fillRect(35,415,1030,1040);ctx.strokeStyle="#795437";ctx.lineWidth=2;
  for(let i=0;i<15;i++){
    ctx.beginPath();ctx.moveTo(left,top+i*gap);ctx.lineTo(end,top+i*gap);ctx.moveTo(left+i*gap,top);ctx.lineTo(left+i*gap,top+14*gap);ctx.stroke();
    ctx.font='22px sans-serif';ctx.fillStyle="#352119";ctx.fillText(String.fromCharCode(65+i),left+i*gap,450);ctx.fillText(String(i+1),60,top+i*gap+7);
  }
  input.board.forEach((row,y)=>row.forEach((stone,x)=>{
    if(!stone)return;
    const cx=left+x*gap,cy=top+y*gap,gradient=ctx.createRadialGradient(cx-9,cy-10,2,cx,cy,28);
    gradient.addColorStop(0,stone==="BLACK"?"#666":"#fff");gradient.addColorStop(1,stone==="BLACK"?"#101010":"#ccc");
    ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(cx,cy,28,0,Math.PI*2);ctx.fill();ctx.strokeStyle="#665347";ctx.stroke();
  }));
  return canvas;
}
export function downloadResultImage(canvas:HTMLCanvasElement):Promise<void> {
  return new Promise((resolve,reject)=>{
    try {canvas.toBlob(blob=>{
      try {
      if(!blob){reject(new Error("PNG 변환에 실패했습니다."));return;}
      const url=URL.createObjectURL(blob),link=document.createElement("a");
      link.href=url;link.download=`단판오목-${new Date().toISOString().replace(/[:.]/g,"-")}.png`;document.body.appendChild(link);
      try{link.click();resolve();}catch(error){reject(error);}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
      } catch(error) { reject(error); }
    },"image/png");}catch(error){reject(error);}
  });
}
