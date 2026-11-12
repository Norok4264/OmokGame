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
    score(state, candidate) > score(state, best) ? candidate : best,
  );
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
