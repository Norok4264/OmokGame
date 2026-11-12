import {describe,it,expect} from "vitest";
import {createRuleGame,type RuleGameState} from "@danpan/shared";
import {chooseBotMove,legalFallback,threatScore} from "./bot.js";
function position(stones:Array<[number,number,"BLACK"|"WHITE"]>):RuleGameState{const state=createRuleGame(),board=state.board.map(row=>[...row]);for(const [x,y,color]of stones)board[y]![x]=color;return {...state,board};}
describe("A09 local bot tactics",()=>{
  it("opens at H8 and takes its immediate win before defending",()=>{
    expect(chooseBotMove(createRuleGame(),"BLACK")).toEqual({x:7,y:7});
    const state=position([[0,0,"BLACK"],[1,0,"BLACK"],[2,0,"BLACK"],[3,0,"BLACK"],[0,2,"WHITE"],[1,2,"WHITE"],[2,2,"WHITE"],[3,2,"WHITE"]]);
    expect(chooseBotMove(state,"BLACK")).toEqual({x:4,y:0});
  });
  it("blocks the opponent's immediate edge win",()=>{
    expect(chooseBotMove(position([[0,0,"WHITE"],[1,0,"WHITE"],[2,0,"WHITE"],[3,0,"WHITE"]]),"BLACK")).toEqual({x:4,y:0});
  });
  it("evaluates open fours/threes for attack and defense ahead of central proximity",()=>{
    const own=position([[6,7,"BLACK"],[7,7,"BLACK"],[8,7,"BLACK"]]);
    expect([5,9]).toContain(chooseBotMove(own,"BLACK")!.x);expect(chooseBotMove(own,"BLACK")!.y).toBe(7);
    expect(threatScore(own,{x:5,y:7},"BLACK")).toBeGreaterThan(threatScore(own,{x:7,y:6},"BLACK"));
    const defense=chooseBotMove(position([[4,3,"WHITE"],[5,3,"WHITE"],[6,3,"WHITE"],[7,7,"BLACK"]]),"BLACK")!;
    expect([3,7]).toContain(defense.x);expect(defense.y).toBe(3);
  });
  it("returns only legal fallback points and never moves after finish or on white turn",()=>{
    const state=position([[7,7,"BLACK"]]);expect(legalFallback(state)).not.toEqual({x:7,y:7});
    expect(chooseBotMove({...state,nextColor:"WHITE"},"BLACK")).toBeNull();expect(legalFallback({...state,status:"FINISHED",nextColor:null})).toBeNull();
  });
});
