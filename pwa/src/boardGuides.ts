import type { Game, PieceType, Side } from "./types";
import { applyMove, cloneGame, generateMoves, otherSide } from "./xiangqi";

export type Threat = { attacker: number; target: number; defended: boolean };
export type BoardHint = {
  kind: "threat" | "lane" | "move" | "activity";
  text: string;
  from: { row: number; col: number };
  to: { row: number; col: number };
  targetId?: number;
  danger?: boolean;
};

export const pieceNames: Record<PieceType, string> = {
  general: "general", advisor: "advisor", elephant: "elephant", horse: "horse",
  rook: "rook", cannon: "cannon", soldier: "soldier"
};

export function square(row: number, col: number): string {
  return `${"abcdefghi"[col]}${10 - row}`;
}

export function legalThreats(game: Game, attackerSide: Side): Threat[] {
  if (game.gameOver) return [];
  const threats: Threat[] = [];
  const seen = new Set<string>();
  for (const move of generateMoves(game, attackerSide)) {
    if (move.captureId < 0) continue;
    const key = `${move.moveId}-${move.captureId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const setup = cloneGame(game);
    setup.turn = attackerSide;
    const captured = applyMove(setup, move.moveId, move.toRow, move.toCol);
    const defended = captured ? generateMoves(captured.game, otherSide(attackerSide)).some(
      (reply) => reply.captureId === move.moveId
    ) : false;
    threats.push({ attacker: move.moveId, target: move.captureId, defended });
  }
  return threats;
}

export function openLanes(game: Game, side: Side, selectedId = -1): BoardHint[] {
  if (game.gameOver) return [];
  const moves = generateMoves(game, side);
  const candidates: Array<BoardHint & { distance: number }> = [];
  for (const piece of game.pieces) {
    if (piece.dead || piece.side !== side || (piece.type !== "rook" && piece.type !== "cannon")) continue;
    if (selectedId >= 0 && piece.id !== selectedId) continue;
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const ray = moves.filter((move) => move.moveId === piece.id &&
        (dr !== 0 ? move.toCol === piece.col && Math.sign(move.toRow - piece.row) === dr
          : move.toRow === piece.row && Math.sign(move.toCol - piece.col) === dc));
      if (!ray.length) continue;
      ray.sort((a, b) => Math.abs(b.toRow - piece.row) + Math.abs(b.toCol - piece.col) -
        Math.abs(a.toRow - piece.row) - Math.abs(a.toCol - piece.col));
      const move = ray[0];
      const distance = Math.abs(move.toRow - piece.row) + Math.abs(move.toCol - piece.col);
      if (distance < 2) continue;
      const isCapture = move.captureId >= 0;
      const text = isCapture && piece.type === "cannon"
        ? `The ${pieceNames[piece.type]} on ${square(piece.row, piece.col)} has a capture route to ${square(move.toRow, move.toCol)} through one screen.`
        : `The ${pieceNames[piece.type]} on ${square(piece.row, piece.col)} can reach ${square(move.toRow, move.toCol)} along this ${dc === 0 ? "file" : "rank"}.`;
      candidates.push({ kind: "lane", text, from: { row: piece.row, col: piece.col }, to: { row: move.toRow, col: move.toCol }, distance });
    }
  }
  return candidates.sort((a, b) => b.distance - a.distance).slice(0, selectedId >= 0 ? 4 : 3);
}

export function boardPoint(row: number, col: number, flipped = false): { x: number; y: number } {
  return { x: 30 + (flipped ? 8 - col : col) * 60, y: 30 + (flipped ? 9 - row : row) * 60 };
}

export function guideSegment(hint: BoardHint, flipped = false) {
  const from = boardPoint(hint.from.row, hint.from.col, flipped);
  const to = boardPoint(hint.to.row, hint.to.col, flipped);
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const dx = (to.x - from.x) / distance, dy = (to.y - from.y) / distance;
  // Leave the printed grid visible and stop arrows at the pieces' edges.
  return {
    from: { x: from.x + dx * 25 - dy * 7, y: from.y + dy * 25 + dx * 7 },
    to: { x: to.x - dx * 25 - dy * 7, y: to.y - dy * 25 + dx * 7 }
  };
}

export function guideRoutes(hints: BoardHint[]): Array<{ hint: BoardHint; bothWays: boolean }> {
  const routes = new Map<string, { hint: BoardHint; bothWays: boolean }>();
  for (const hint of hints) {
    const from = `${hint.from.row},${hint.from.col}`, to = `${hint.to.row},${hint.to.col}`;
    if (from === to) continue;
    const key = [from, to].sort().join(":");
    const existing = routes.get(key);
    if (!existing) routes.set(key, { hint, bothWays: false });
    else if (hint.kind === "threat" && existing.hint.kind === "threat" &&
      hint.from.row === existing.hint.to.row && hint.from.col === existing.hint.to.col) existing.bothWays = true;
  }
  return [...routes.values()];
}
