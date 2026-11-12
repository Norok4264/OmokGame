import {createRuleGame,playMove,type Coordinate,type RuleGameState} from "@danpan/shared";
export const SOLO_KEY="danpan-omok-solo-v1";
export interface SoloState {version:1;gameId:string;revision:number;moves:Coordinate[];state:RuleGameState}
export function newSolo():SoloState{return {version:1,gameId:crypto.randomUUID(),revision:0,moves:[],state:createRuleGame()};}
export function moveSolo(game:SoloState,move:Coordinate):SoloState{
  if(!game.state.nextColor)throw new Error("이미 종료된 대국입니다.");
  const result=playMove(game.state,move,game.state.nextColor);if(!result.ok)throw new Error(result.error);
  return {...game,revision:game.revision+1,moves:[...game.moves,move],state:result.state};
}
export function decodeSolo(raw:string):SoloState|null{
  try{
    const v=JSON.parse(raw);if(v.version!==1||typeof v.gameId!=="string"||!v.gameId||v.gameId.length>128||!Array.isArray(v.moves)||v.moves.length>225||v.revision!==v.moves.length)return null;
    let game:SoloState={version:1,gameId:v.gameId,revision:0,moves:[],state:createRuleGame()};
    for(const [index,point]of v.moves.entries()){
      if(!point||typeof point!=="object"||index===0&&(point.x!==7||point.y!==7))return null;
      game=moveSolo(game,{x:point.x,y:point.y});
    }
    return game;
  }catch{return null;}
}
export function loadSolo():SoloState|null{try{const raw=localStorage.getItem(SOLO_KEY);return raw?decodeSolo(raw):null;}catch{return null;}}
export function saveSolo(game:SoloState){localStorage.setItem(SOLO_KEY,JSON.stringify({version:1,gameId:game.gameId,revision:game.revision,moves:game.moves}));}
export function removeSolo(){localStorage.removeItem(SOLO_KEY);}
