import type { BoardCell, StoneColor } from "./types.js";

export const BOARD_SIZE = 15 as const;

export interface Coordinate {
  readonly x: number;
  readonly y: number;
}

export type RuleBoard = ReadonlyArray<ReadonlyArray<BoardCell>>;
export type RuleResult = { readonly kind: "WIN"; readonly winner: StoneColor } | { readonly kind: "DRAW" };

export interface RuleGameState {
  readonly board: RuleBoard;
  readonly nextColor: StoneColor | null;
  readonly status: "ACTIVE" | "FINISHED";
  readonly result: RuleResult | null;
  readonly lastMove: Coordinate | null;
}

export type MoveError =
  | "INVALID_COORDINATE"
  | "OUT_OF_BOUNDS"
  | "WRONG_TURN"
  | "OCCUPIED"
  | "GAME_FINISHED";

export type MoveResult =
  | { readonly ok: true; readonly state: RuleGameState }
  | { readonly ok: false; readonly error: MoveError };

const DIRECTIONS: ReadonlyArray<Coordinate> = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: 1, y: 1 },
  { x: 1, y: -1 },
];

const otherColor = (color: StoneColor): StoneColor => color === "BLACK" ? "WHITE" : "BLACK";

export function createRuleGame(): RuleGameState {
  const board = Array.from({ length: BOARD_SIZE }, () =>
    Array<BoardCell>(BOARD_SIZE).fill(null),
  );
  return { board, nextColor: "BLACK", status: "ACTIVE", result: null, lastMove: null };
}

/**
 * Apply one proposed move without mutating the input state.
 * This module contains game rules only; callers own UI, persistence and transport.
 */
export function playMove(
  state: RuleGameState,
  coordinate: Coordinate,
  color: StoneColor,
): MoveResult {
  if (state.status !== "ACTIVE" || state.nextColor === null) {
    return { ok: false, error: "GAME_FINISHED" };
  }
  if (!Number.isInteger(coordinate.x) || !Number.isInteger(coordinate.y)) {
    return { ok: false, error: "INVALID_COORDINATE" };
  }
  if (
    coordinate.x < 0 || coordinate.x >= BOARD_SIZE ||
    coordinate.y < 0 || coordinate.y >= BOARD_SIZE
  ) {
    return { ok: false, error: "OUT_OF_BOUNDS" };
  }
  if (color !== state.nextColor) return { ok: false, error: "WRONG_TURN" };
  if (state.board[coordinate.y]?.[coordinate.x] !== null) {
    return { ok: false, error: "OCCUPIED" };
  }

  const board = state.board.map((row) => [...row]);
  board[coordinate.y]![coordinate.x] = color;
  const move = { x: coordinate.x, y: coordinate.y };

  if (hasFiveOrMore(board, move, color)) {
    return {
      ok: true,
      state: { board, nextColor: null, status: "FINISHED", result: { kind: "WIN", winner: color }, lastMove: move },
    };
  }

  if (board.every((row) => row.every((cell) => cell !== null))) {
    return {
      ok: true,
      state: { board, nextColor: null, status: "FINISHED", result: { kind: "DRAW" }, lastMove: move },
    };
  }

  return {
    ok: true,
    state: { board, nextColor: otherColor(color), status: "ACTIVE", result: null, lastMove: move },
  };
}

/** At least five connected stones wins; board edges and blocked ends do not alter the rule. */
export function hasFiveOrMore(board: RuleBoard, coordinate: Coordinate, color: StoneColor): boolean {
  return DIRECTIONS.some(({ x: dx, y: dy }) => {
    const connected = 1 + countDirection(board, coordinate, color, dx, dy)
      + countDirection(board, coordinate, color, -dx, -dy);
    return connected >= 5;
  });
}

function countDirection(
  board: RuleBoard,
  origin: Coordinate,
  color: StoneColor,
  dx: number,
  dy: number,
): number {
  let count = 0;
  let x = origin.x + dx;
  let y = origin.y + dy;
  while (x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE && board[y]?.[x] === color) {
    count += 1;
    x += dx;
    y += dy;
  }
  return count;
}

/** Convert an internal zero-based coordinate to visible A1–O15 notation. */
export function toScreenCoordinate(coordinate: Coordinate): string {
  if (
    !Number.isInteger(coordinate.x) || !Number.isInteger(coordinate.y) ||
    coordinate.x < 0 || coordinate.x >= BOARD_SIZE ||
    coordinate.y < 0 || coordinate.y >= BOARD_SIZE
  ) {
    throw new RangeError("Coordinate must be an integer point on the 15×15 board");
  }
  return String.fromCharCode(65 + coordinate.x) + String(coordinate.y + 1);
}

/** Parse visible A1–O15 notation; malformed or out-of-board labels return null. */
export function fromScreenCoordinate(label: string): Coordinate | null {
  const match = /^([A-O])(1[0-5]|[1-9])$/.exec(label);
  if (!match) return null;
  return { x: match[1]!.charCodeAt(0) - 65, y: Number(match[2]) - 1 };
}
