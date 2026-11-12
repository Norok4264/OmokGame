import { describe, expect, it } from "vitest";
import type { BoardCell, StoneColor } from "./types.js";
import {
  BOARD_SIZE,
  createRuleGame,
  fromScreenCoordinate,
  hasFiveOrMore,
  playMove,
  toScreenCoordinate,
  type Coordinate,
  type RuleGameState,
} from "./rules.js";

function stateWith(
  stones: ReadonlyArray<{ x: number; y: number; color: StoneColor }>,
  nextColor: StoneColor = "BLACK",
): RuleGameState {
  const board: BoardCell[][] = Array.from({ length: BOARD_SIZE }, () => Array<BoardCell>(BOARD_SIZE).fill(null));
  for (const stone of stones) board[stone.y]![stone.x] = stone.color;
  return { board, nextColor, status: "ACTIVE", result: null, lastMove: null };
}

function winningMove(stones: Coordinate[], move: Coordinate, color: StoneColor = "BLACK") {
  return playMove(stateWith(stones.map((point) => ({ ...point, color }))), move, color);
}

function hasExistingWinner(board: BoardCell[][]): boolean {
  return board.some((row, y) => row.some((cell, x) =>
    cell !== null && hasFiveOrMore(board, { x, y }, cell),
  ));
}

describe("15×15 free-style omok rules", () => {
  it("starts on an empty 15×15 board with Black to move, and maps A1 through O15", () => {
    const game = createRuleGame();
    expect(game.board).toHaveLength(15);
    expect(game.board.every((row) => row.length === 15 && row.every((cell) => cell === null))).toBe(true);
    expect(game.nextColor).toBe("BLACK");
    expect(toScreenCoordinate({ x: 0, y: 0 })).toBe("A1");
    expect(toScreenCoordinate({ x: 14, y: 14 })).toBe("O15");
    expect(fromScreenCoordinate("A1")).toEqual({ x: 0, y: 0 });
    expect(fromScreenCoordinate("O15")).toEqual({ x: 14, y: 14 });
    expect(fromScreenCoordinate("P1")).toBeNull();
    expect(fromScreenCoordinate("A16")).toBeNull();
  });

  it("alternates one stone per turn and never mutates the previous state", () => {
    const initial = createRuleGame();
    const black = playMove(initial, { x: 7, y: 7 }, "BLACK");
    expect(black.ok).toBe(true);
    if (!black.ok) return;
    expect(initial.board[7]![7]).toBeNull();
    expect(black.state.board[7]![7]).toBe("BLACK");
    expect(black.state.nextColor).toBe("WHITE");
    expect(playMove(black.state, { x: 7, y: 8 }, "WHITE")).toMatchObject({ ok: true });
  });

  it.each([
    ["horizontal", [{ x: 3, y: 7 }, { x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 }], { x: 7, y: 7 }],
    ["vertical", [{ x: 7, y: 3 }, { x: 7, y: 4 }, { x: 7, y: 5 }, { x: 7, y: 6 }], { x: 7, y: 7 }],
    ["diagonal down-right", [{ x: 2, y: 2 }, { x: 3, y: 3 }, { x: 4, y: 4 }, { x: 5, y: 5 }], { x: 6, y: 6 }],
    ["diagonal up-right", [{ x: 2, y: 6 }, { x: 3, y: 5 }, { x: 4, y: 4 }, { x: 5, y: 3 }], { x: 6, y: 2 }],
  ])("wins with five connected stones in the %s direction", (_name, stones, move) => {
    const result = winningMove(stones, move);
    expect(result).toMatchObject({ ok: true, state: { status: "FINISHED", result: { kind: "WIN", winner: "BLACK" } } });
  });

  it("wins with six or more connected stones and with both ends blocked", () => {
    const overline = winningMove(
      [{ x: 3, y: 7 }, { x: 4, y: 7 }, { x: 5, y: 7 }, { x: 6, y: 7 }, { x: 7, y: 7 }],
      { x: 8, y: 7 },
    );
    expect(overline).toMatchObject({ ok: true, state: { result: { kind: "WIN", winner: "BLACK" } } });

    const blockedEnds = playMove(stateWith([
      { x: 2, y: 9, color: "WHITE" },
      { x: 3, y: 9, color: "BLACK" }, { x: 4, y: 9, color: "BLACK" },
      { x: 5, y: 9, color: "BLACK" }, { x: 6, y: 9, color: "BLACK" },
      { x: 8, y: 9, color: "WHITE" },
    ]), { x: 7, y: 9 }, "BLACK");
    expect(blockedEnds).toMatchObject({ ok: true, state: { result: { kind: "WIN", winner: "BLACK" } } });
  });

  it("recognizes a win along the board corner without wrapping at the edge", () => {
    const result = winningMove(
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }],
      { x: 4, y: 0 },
    );
    expect(result).toMatchObject({ ok: true, state: { result: { kind: "WIN", winner: "BLACK" } } });
  });

  it("allows double-three and double-four patterns because there are no forbidden moves", () => {
    const doubleThree = playMove(stateWith([
      { x: 6, y: 7, color: "BLACK" }, { x: 8, y: 7, color: "BLACK" },
      { x: 7, y: 6, color: "BLACK" }, { x: 7, y: 8, color: "BLACK" },
    ]), { x: 7, y: 7 }, "BLACK");
    expect(doubleThree).toMatchObject({ ok: true, state: { status: "ACTIVE" } });

    const doubleFour = playMove(stateWith([
      { x: 5, y: 7, color: "BLACK" }, { x: 6, y: 7, color: "BLACK" }, { x: 8, y: 7, color: "BLACK" },
      { x: 7, y: 5, color: "BLACK" }, { x: 7, y: 6, color: "BLACK" }, { x: 7, y: 8, color: "BLACK" },
    ]), { x: 7, y: 7 }, "BLACK");
    expect(doubleFour).toMatchObject({ ok: true, state: { status: "ACTIVE" } });
  });

  it("checks a winning final square before declaring a full-board draw", () => {
    const board: BoardCell[][] = Array.from({ length: BOARD_SIZE }, (_, y) =>
      Array.from({ length: BOARD_SIZE }, (_, x) => ((x + 2 * y) % 5 < 2 ? "BLACK" : "WHITE") as StoneColor),
    );
    for (let x = 10; x <= 13; x += 1) board[14]![x] = "BLACK";
    board[14]![9] = "WHITE";
    board[13]![14] = "WHITE";
    board[14]![14] = null;
    expect(hasExistingWinner(board)).toBe(false);
    const finalWin = playMove({ board, nextColor: "BLACK", status: "ACTIVE", result: null, lastMove: null }, { x: 14, y: 14 }, "BLACK");
    expect(finalWin).toMatchObject({ ok: true, state: { status: "FINISHED", result: { kind: "WIN", winner: "BLACK" } } });

    const drawBoard: BoardCell[][] = Array.from({ length: BOARD_SIZE }, (_, y) =>
      Array.from({ length: BOARD_SIZE }, (_, x) => ((x + 2 * y) % 5 < 2 ? "BLACK" : "WHITE") as StoneColor),
    );
    const finalColor = drawBoard[14]![14]!;
    drawBoard[14]![14] = null;
    expect(hasExistingWinner(drawBoard)).toBe(false);
    const draw = playMove({ board: drawBoard, nextColor: finalColor, status: "ACTIVE", result: null, lastMove: null }, { x: 14, y: 14 }, finalColor);
    expect(draw).toMatchObject({ ok: true, state: { status: "FINISHED", result: { kind: "DRAW" } } });
  });

  it.each([
    ["non-integer x coordinate", { x: 1.5, y: 0 }, "BLACK", "INVALID_COORDINATE"],
    ["non-integer y coordinate", { x: 0, y: 1.5 }, "BLACK", "INVALID_COORDINATE"],
    ["x coordinate beyond the board", { x: 15, y: 0 }, "BLACK", "OUT_OF_BOUNDS"],
    ["y coordinate beyond the board", { x: 0, y: 15 }, "BLACK", "OUT_OF_BOUNDS"],
    ["negative coordinate", { x: 0, y: -1 }, "BLACK", "OUT_OF_BOUNDS"],
    ["wrong turn", { x: 0, y: 0 }, "WHITE", "WRONG_TURN"],
  ] as const)("rejects a %s", (_label, coordinate, color, error) => {
    expect(playMove(createRuleGame(), coordinate, color)).toEqual({ ok: false, error });
  });

  it("rejects occupied points and all moves after the game ends", () => {
    const occupied = stateWith([{ x: 1, y: 2, color: "BLACK" }]);
    expect(playMove(occupied, { x: 1, y: 2 }, "BLACK")).toEqual({ ok: false, error: "OCCUPIED" });
    const finished = { ...occupied, nextColor: null, status: "FINISHED" as const, result: { kind: "DRAW" as const } };
    expect(playMove(finished, { x: 0, y: 0 }, "BLACK")).toEqual({ ok: false, error: "GAME_FINISHED" });
  });
});
