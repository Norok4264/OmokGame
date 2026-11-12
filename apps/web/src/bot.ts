import {
  BOARD_SIZE,
  playMove,
  type Coordinate,
  type RuleGameState,
  type StoneColor,
} from "@danpan/shared";

/**
 * Small deterministic local opponent: win immediately, block an immediate win,
 * otherwise prefer nearby stones and central intersections.
 */
export function chooseBotMove(state: RuleGameState, botColor: StoneColor): Coordinate | null {
  if (state.status !== "ACTIVE" || state.nextColor !== botColor) return null;

  const candidates = getCandidates(state);
  if (candidates.length === 0) return null;

  for (const candidate of candidates) {
    const result = playMove(state, candidate, botColor);
    if (result.ok && result.state.result?.kind === "WIN") return candidate;
  }

  const opponent: StoneColor = botColor === "BLACK" ? "WHITE" : "BLACK";
  const opponentState = { ...state, nextColor: opponent };
  for (const candidate of candidates) {
    const result = playMove(opponentState, candidate, opponent);
    if (result.ok && result.state.result?.kind === "WIN") return candidate;
  }

  return candidates.reduce((best, candidate) =>
    evaluate(state, candidate, botColor) > evaluate(state, best, botColor) ? candidate : best,
  );
}

/** Contiguous open threats in all four directions; no Renju restrictions. */
export function threatScore(state: RuleGameState, point: Coordinate, color: StoneColor): number {
  let total=0;
  for(const [dx,dy] of [[1,0],[0,1],[1,1],[1,-1]] as const){
    let count=1,open=0;
    for(const direction of [-1,1]){
      let x=point.x+dx*direction,y=point.y+dy*direction;
      while(x>=0&&x<15&&y>=0&&y<15&&state.board[y]?.[x]===color){count++;x+=dx*direction;y+=dy*direction;}
      if(x>=0&&x<15&&y>=0&&y<15&&state.board[y]?.[x]===null)open++;
    }
    total+=count>=5?1000000:count===4?(open===2?100000:open===1?20000:0):count===3?(open===2?8000:open===1?700:0):count===2?(open===2?300:open===1?30:0):0;
  }
  return total;
}
function evaluate(state:RuleGameState,point:Coordinate,color:StoneColor):number {
  const attack=threatScore(state,point,color),defense=threatScore(state,point,color==="BLACK"?"WHITE":"BLACK");
  return Math.max(attack*1.05,defense)+attack*.1+defense*.1+score(state,point);
}
/** Constant bounded work on the UI thread if the worker fails or exceeds 2s. */
export function legalFallback(state:RuleGameState):Coordinate|null {
  if(state.status!=="ACTIVE"||state.nextColor!=="BLACK")return null;
  const points:Coordinate[]=[];
  for(let y=0;y<15;y++)for(let x=0;x<15;x++)if(state.board[y]?.[x]===null)points.push({x,y});
  return points.sort((a,b)=>(Math.abs(7-a.x)+Math.abs(7-a.y))-(Math.abs(7-b.x)+Math.abs(7-b.y)))[0]??null;
}

function getCandidates(state: RuleGameState): Coordinate[] {
  const stones: Coordinate[] = [];
  for (let y = 0; y < BOARD_SIZE; y += 1) {
    for (let x = 0; x < BOARD_SIZE; x += 1) {
      if (state.board[y]?.[x] !== null) stones.push({ x, y });
    }
  }
  if (stones.length === 0) return [{ x: 7, y: 7 }];

  const nearby = new Map<string, Coordinate>();
  for (const stone of stones) {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const x = stone.x + dx;
        const y = stone.y + dy;
        if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) continue;
        if (state.board[y]?.[x] !== null) continue;
        nearby.set(`${x},${y}`, { x, y });
      }
    }
  }
  return [...nearby.values()].sort((a, b) => score(state, b) - score(state, a));
}

function score(state: RuleGameState, point: Coordinate): number {
  let value = 0;
  for (let y = Math.max(0, point.y - 2); y <= Math.min(BOARD_SIZE - 1, point.y + 2); y += 1) {
    for (let x = Math.max(0, point.x - 2); x <= Math.min(BOARD_SIZE - 1, point.x + 2); x += 1) {
      const stone = state.board[y]?.[x];
      if (stone === null) continue;
      const distance = Math.max(Math.abs(point.x - x), Math.abs(point.y - y));
      value += (stone === state.nextColor ? 5 : 4) / distance;
    }
  }
  const centerDistance = Math.abs(7 - point.x) + Math.abs(7 - point.y);
  return value - centerDistance / 100;
}
