import {afterEach,it,expect,vi} from "vitest";
import {createRuleGame} from "@danpan/shared";
import {BotRunner,type WorkerPort,type BotJob} from "./bot-runner.js";
class WorkerStub implements WorkerPort{onmessage:WorkerPort["onmessage"]=null;onerror:WorkerPort["onerror"]=null;postMessage=vi.fn();terminate=vi.fn();reply(data:unknown){this.onmessage?.({data}as MessageEvent);}}
const job=(id="g",revision=0,taskId="task"):BotJob=>({gameId:id,revision,taskId,state:createRuleGame()});
afterEach(()=>vi.useRealTimers());
it("B10 ignores stale game/revision/task answers and cancelled workers",()=>{
  vi.useFakeTimers();const workers:WorkerStub[]=[];const runner=new BotRunner(()=>{const w=new WorkerStub();workers.push(w);return w;});const accept=vi.fn();
  const old=job(),fresh=job("new",2,"new-task");runner.run(old,accept);runner.run(fresh,accept);
  workers[0]!.reply({...old,move:{x:7,y:7}});workers[1]!.reply({...fresh,taskId:"wrong",move:{x:7,y:7}});workers[1]!.reply({...fresh,revision:1,move:{x:7,y:7}});expect(accept).not.toHaveBeenCalled();
  workers[1]!.reply({...fresh,move:{x:7,y:7}});expect(accept).toHaveBeenCalledOnce();expect(accept).toHaveBeenCalledWith({gameId:"new",revision:2,taskId:"new-task",move:{x:7,y:7},fallback:false});
  expect(()=>workers[1]!.reply({...fresh,move:{x:8,y:7}})).not.toThrow();expect(accept).toHaveBeenCalledOnce();
});
it("B10 terminates after 2 seconds and uses a legal fallback without accepting late output",()=>{
  vi.useFakeTimers();const worker=new WorkerStub(),accept=vi.fn(),runner=new BotRunner(()=>worker),task=job();runner.run(task,accept);
  vi.advanceTimersByTime(1999);expect(accept).not.toHaveBeenCalled();vi.advanceTimersByTime(1);
  expect(worker.terminate).toHaveBeenCalledOnce();expect(accept).toHaveBeenCalledWith({gameId:"g",revision:0,taskId:"task",move:{x:7,y:7},fallback:true});
  worker.reply({...task,move:{x:8,y:8}});expect(accept).toHaveBeenCalledOnce();
});
it("B10 worker errors or invalid coordinates fall back and explicit exit cancellation never applies a move",()=>{
  vi.useFakeTimers();const w=new WorkerStub(),accept=vi.fn(),runner=new BotRunner(()=>w),task=job();runner.run(task,accept);w.reply({...task,move:{x:99,y:0}});
  expect(accept).toHaveBeenCalledWith(expect.objectContaining({move:{x:7,y:7},fallback:true}));
  accept.mockClear();runner.run(job("exit"),accept);runner.cancel();vi.advanceTimersByTime(5000);expect(accept).not.toHaveBeenCalled();
});
