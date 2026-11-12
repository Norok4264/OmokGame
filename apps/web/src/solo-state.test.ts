import {it,expect} from "vitest";
import {decodeSolo,newSolo,moveSolo} from "./solo-state.js";
const encode=(game:ReturnType<typeof newSolo>)=>JSON.stringify({version:1,gameId:game.gameId,revision:game.revision,moves:game.moves});
it("A09/B09 restores white and bot turns by replaying the same shared rules, not trusting a saved winner",()=>{
  let game=newSolo();expect(decodeSolo(encode(game))?.state.nextColor).toBe("BLACK");
  game=moveSolo(game,{x:7,y:7});expect(decodeSolo(encode(game))?.state.nextColor).toBe("WHITE");game=moveSolo(game,{x:0,y:0});expect(decodeSolo(encode(game))?.state.nextColor).toBe("BLACK");
  const restored=decodeSolo(JSON.stringify({...JSON.parse(encode(game)),state:{status:"FINISHED",winner:"WHITE"}}))!;expect(restored.state.status).toBe("ACTIVE");expect(restored.gameId).toBe(game.gameId);expect(restored.revision).toBe(2);
  expect(newSolo().gameId).not.toBe(game.gameId);
});
it("A09 finished recovery remains finished and corrupted boards/history are rejected",()=>{
  let game=newSolo();for(const point of [{x:7,y:7},{x:0,y:0},{x:7,y:6},{x:1,y:0},{x:7,y:8},{x:2,y:0},{x:7,y:5},{x:3,y:0},{x:7,y:9}])game=moveSolo(game,point);
  expect(decodeSolo(encode(game))?.state).toMatchObject({status:"FINISHED",nextColor:null,result:{winner:"BLACK"}});
  expect(decodeSolo(JSON.stringify({version:1,gameId:"bad",revision:1,moves:[{x:0,y:0}]}))).toBeNull();expect(decodeSolo("corrupt")).toBeNull();
  expect(decodeSolo(JSON.stringify({version:1,gameId:"bad",revision:2,moves:[{x:7,y:7},{x:7,y:7}]}))).toBeNull();
});
