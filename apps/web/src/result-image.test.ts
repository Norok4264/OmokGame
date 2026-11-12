import { afterEach, describe, it, expect, vi } from "vitest";
import { createRuleGame, resultReason } from "@danpan/shared";
import { renderResultImage, downloadResultImage } from "./result-image.js";
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();vi.useRealTimers();});
describe("A10 result PNG drawing and failure handling",()=>{
  it("draws every edge stone, names, colors, victory card, reason and save time using only whitelisted fields",async()=>{
    const texts:string[]=[],circles:number[][]=[];
    const ctx:any=new Proxy({fillText:(text:string)=>texts.push(text),arc:(...p:number[])=>circles.push(p),createRadialGradient:()=>({addColorStop:()=>{}})}, {get:(obj:any,key)=>key in obj?obj[key]:()=>{},set:(obj:any,key,value)=>{obj[key]=value;return true;}});
    const canvas:any={getContext:()=>ctx,width:0,height:0};
    vi.stubGlobal("document",{fonts:{ready:Promise.resolve()},createElement:()=>canvas});
    const state=createRuleGame();const board=state.board.map(r=>[...r]);board[0]![0]="BLACK";board[14]![14]="WHITE";
    const result=await renderResultImage({board,blackName:"검은돌",whiteName:"하얀돌",winner:"BLACK",status:"FINISHED",endReason:"WIN",savedAt:new Date("2026-11-12T12:00:00Z")});
    expect(texts.join(" ")).toContain("승리!");expect(texts.join(" ")).toContain("흑 · 검은돌");expect(texts.join(" ")).toContain("백 · 하얀돌");expect(texts.join(" ")).toContain("5목 승리");expect(texts.join(" ")).toContain("저장 시각:");
    expect(texts.join(" ")).not.toMatch(/token|http|채팅/);
    expect(circles).toHaveLength(2);
    for(const [x,y,r]of circles){expect(x!-r!).toBeGreaterThanOrEqual(0);expect(y!-r!).toBeGreaterThanOrEqual(0);expect(x!+r!).toBeLessThan(result.width);expect(y!+r!).toBeLessThan(result.height);}
    expect(resultReason("ABORTED","DISCONNECT")).toBe("양쪽 단절 무효");
    expect(resultReason("FINISHED","TIMEOUT")).toBe("시간패");
  });
  it("rejects failed PNG conversion so the result view can retain preview and offer retry",async()=>{
    const canvas={toBlob:(cb:(blob:null)=>void)=>cb(null)} as unknown as HTMLCanvasElement;
    await expect(downloadResultImage(canvas)).rejects.toThrow("PNG 변환");
  });
  it("requests an image/png download and reports asynchronous URL failures",async()=>{
    const click=vi.fn(),remove=vi.fn();vi.useFakeTimers();
    const link:any={click,remove};vi.stubGlobal("document",{body:{appendChild:vi.fn()},createElement:()=>link});
    const create=vi.spyOn(URL,"createObjectURL").mockReturnValue("blob:local-png");const revoke=vi.spyOn(URL,"revokeObjectURL").mockImplementation(()=>{});
    const canvas={toBlob:(cb:(blob:Blob)=>void,type:string)=>{expect(type).toBe("image/png");cb(new Blob(["test"],{type}));}} as unknown as HTMLCanvasElement;
    await downloadResultImage(canvas);expect(click).toHaveBeenCalledOnce();expect(link.download).toMatch(/\.png$/);expect(remove).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60000);expect(revoke).toHaveBeenCalledWith("blob:local-png");
    create.mockImplementation(()=>{throw new Error("download unavailable");});
    await expect(downloadResultImage(canvas)).rejects.toThrow("download unavailable");
  });
});
