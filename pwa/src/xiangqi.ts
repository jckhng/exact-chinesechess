import type { Difficulty, Game, Move, Piece, PieceType, Side } from "./types";

export const ROWS = 10;
export const COLS = 9;
const MAX_MOVES = 256;
export const pieceValues: Record<PieceType, number> = {
  general: 10000, advisor: 20, elephant: 40, horse: 60, rook: 100, cannon: 80, soldier: 10
};

const blackStart: Array<[number, number, PieceType]> = [
  [0, 0, "rook"], [0, 1, "horse"], [0, 2, "elephant"], [0, 3, "advisor"], [0, 4, "general"],
  [0, 5, "advisor"], [0, 6, "elephant"], [0, 7, "horse"], [0, 8, "rook"],
  [2, 1, "cannon"], [2, 7, "cannon"],
  [3, 0, "soldier"], [3, 2, "soldier"], [3, 4, "soldier"], [3, 6, "soldier"], [3, 8, "soldier"]
];

export function otherSide(side: Side): Side { return side === "red" ? "black" : "red"; }
export function inBounds(row: number, col: number): boolean { return row >= 0 && row < ROWS && col >= 0 && col < COLS; }

export function createGame(): Game {
  const pieces: Piece[] = [];
  blackStart.forEach(([row, col, type], index) => {
    pieces.push({ id: index, row, col, type, side: "black", dead: false });
    pieces.push({ id: index + 16, row: 9 - row, col: 8 - col, type, side: "red", dead: false });
  });
  pieces.sort((a, b) => a.id - b.id);
  return { pieces, history: [], turn: "red", gameOver: false, winner: "black" };
}

export function cloneGame(game: Game): Game {
  return {
    pieces: game.pieces.map((p) => ({ ...p })),
    history: game.history.map((m) => ({ ...m })),
    turn: game.turn, gameOver: game.gameOver, winner: game.winner
  };
}

export function pieceAt(game: Game, row: number, col: number): number {
  if (!inBounds(row, col)) return -1;
  return game.pieces.findIndex((p) => !p.dead && p.row === row && p.col === col);
}

function lineCount(game: Game, row1: number, col1: number, row2: number, col2: number): number {
  let count = 0;
  if (row1 !== row2 && col1 !== col2) return -1;
  if (row1 === row2) {
    const min = Math.min(col1, col2), max = Math.max(col1, col2);
    for (let col = min + 1; col < max; col++) if (pieceAt(game, row1, col) !== -1) count++;
  } else {
    const min = Math.min(row1, row2), max = Math.max(row1, row2);
    for (let row = min + 1; row < max; row++) if (pieceAt(game, row, col1) !== -1) count++;
  }
  return count;
}

function palaceContains(side: Side, row: number, col: number): boolean {
  if (col < 3 || col > 5) return false;
  return side === "red" ? row >= 7 && row <= 9 : row >= 0 && row <= 2;
}

export function rawMoveLegal(game: Game, moveId: number, captureId: number, row: number, col: number): boolean {
  if (moveId < 0 || moveId >= game.pieces.length || !inBounds(row, col)) return false;
  const piece = game.pieces[moveId];
  if (piece.dead) return false;
  if (captureId !== -1 && game.pieces[captureId].side === piece.side) return false;
  const dr = row - piece.row, dc = col - piece.col;
  const adr = Math.abs(dr), adc = Math.abs(dc);
  switch (piece.type) {
    case "general":
      if (captureId !== -1 && game.pieces[captureId].type === "general") return lineCount(game, piece.row, piece.col, row, col) === 0;
      return palaceContains(piece.side, row, col) && ((adr === 1 && adc === 0) || (adr === 0 && adc === 1));
    case "advisor": return palaceContains(piece.side, row, col) && adr === 1 && adc === 1;
    case "elephant":
      if (adr !== 2 || adc !== 2) return false;
      if (pieceAt(game, (piece.row + row) / 2, (piece.col + col) / 2) !== -1) return false;
      return piece.side === "red" ? row >= 5 : row <= 4;
    case "horse":
      if (!((adr === 1 && adc === 2) || (adr === 2 && adc === 1))) return false;
      return adr === 1 ? pieceAt(game, piece.row, (piece.col + col) / 2) === -1 : pieceAt(game, (piece.row + row) / 2, piece.col) === -1;
    case "rook": return lineCount(game, piece.row, piece.col, row, col) === 0;
    case "cannon": { const c = lineCount(game, piece.row, piece.col, row, col); return captureId === -1 ? c === 0 : c === 1; }
    case "soldier":
      if (!((adr === 1 && adc === 0) || (adr === 0 && adc === 1))) return false;
      if (piece.side === "red") { if (dr > 0) return false; if (piece.row >= 5 && dr === 0) return false; }
      else { if (dr < 0) return false; if (piece.row <= 4 && dr === 0) return false; }
      return true;
  }
}

function fakeMove(game: Game, move: Move): void {
  if (move.captureId !== -1) game.pieces[move.captureId].dead = true;
  game.pieces[move.moveId].row = move.toRow;
  game.pieces[move.moveId].col = move.toCol;
  game.turn = otherSide(game.turn);
}

function unfakeMove(game: Game, move: Move): void {
  game.turn = otherSide(game.turn);
  game.pieces[move.moveId].row = move.fromRow;
  game.pieces[move.moveId].col = move.fromCol;
  if (move.captureId !== -1) game.pieces[move.captureId].dead = false;
}

export function inCheck(game: Game, side: Side): boolean {
  const general = side === "red" ? 20 : 4;
  if (game.pieces[general].dead) return true;
  for (const piece of game.pieces) {
    if (piece.dead || piece.side === side) continue;
    if (rawMoveLegal(game, piece.id, general, game.pieces[general].row, game.pieces[general].col)) return true;
  }
  return false;
}

export function isLegalMove(game: Game, moveId: number, row: number, col: number): boolean {
  if (moveId < 0 || moveId >= game.pieces.length || game.pieces[moveId].side !== game.turn) return false;
  const captureId = pieceAt(game, row, col);
  if (!rawMoveLegal(game, moveId, captureId, row, col)) return false;
  const copy = cloneGame(game);
  fakeMove(copy, { moveId, captureId, fromRow: game.pieces[moveId].row, fromCol: game.pieces[moveId].col, toRow: row, toCol: col });
  return !inCheck(copy, game.turn);
}

export function generateMoves(game: Game, side: Side, maxMoves = MAX_MOVES): Move[] {
  const copy = cloneGame(game);
  copy.turn = side;
  const moves: Move[] = [];
  for (const piece of copy.pieces) {
    if (piece.dead || piece.side !== side) continue;
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (isLegalMove(copy, piece.id, row, col)) {
          moves.push({ moveId: piece.id, captureId: pieceAt(copy, row, col), fromRow: piece.row, fromCol: piece.col, toRow: row, toCol: col });
          if (moves.length >= maxMoves) return moves;
        }
      }
    }
  }
  return moves;
}

function hasLegalMove(game: Game, side: Side): boolean { return generateMoves(game, side, 1).length > 0; }

export function applyMove(game: Game, moveId: number, row: number, col: number): { game: Game; move: Move } | null {
  if (game.gameOver || !isLegalMove(game, moveId, row, col)) return null;
  const next = cloneGame(game);
  const move: Move = { moveId, captureId: pieceAt(next, row, col), fromRow: next.pieces[moveId].row, fromCol: next.pieces[moveId].col, toRow: row, toCol: col };
  fakeMove(next, move);
  next.history.push(move);
  if (next.pieces[4].dead || next.pieces[20].dead || !hasLegalMove(next, next.turn)) {
    next.gameOver = true;
    next.winner = otherSide(next.turn);
  }
  return { game: next, move };
}

export function undoOne(game: Game): Game {
  const next = cloneGame(game);
  const move = next.history.pop();
  if (!move) return next;
  unfakeMove(next, move);
  next.gameOver = false;
  return next;
}

function positionScore(type: PieceType, row: number, col: number, side: Side): number {
  const forward = side === "red" ? 9 - row : row;
  const centerBonus = 4 - Math.abs(4 - col);
  switch (type) {
    case "horse": return centerBonus * 2 + (forward >= 3 && forward <= 6 ? 4 : 0);
    case "rook": return centerBonus + forward;
    case "cannon": return centerBonus * 2;
    case "soldier": return forward >= 5 ? 12 + centerBonus : forward * 2;
    default: return 0;
  }
}

function evaluate(game: Game, aiSide: Side, level: Difficulty): number {
  if (game.pieces[4].dead) return aiSide === "red" ? 100000 : -100000;
  if (game.pieces[20].dead) return aiSide === "black" ? 100000 : -100000;
  return game.pieces.reduce((score, piece) => {
    if (piece.dead) return score;
    let value = pieceValues[piece.type];
    if (level !== "easy") value += positionScore(piece.type, piece.row, piece.col, piece.side);
    return score + (piece.side === aiSide ? value : -value);
  }, 0);
}

function alphabeta(game: Game, depth: number, alphaValue: number, betaValue: number, aiSide: Side, level: Difficulty): number {
  let alpha = alphaValue, beta = betaValue;
  if (depth === 0 || game.gameOver) return evaluate(game, aiSide, level);
  const moves = generateMoves(game, game.turn);
  if (moves.length === 0) return game.turn === aiSide ? -90000 - depth : 90000 + depth;
  const maxing = game.turn === aiSide;
  let best = maxing ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const move of moves) {
    fakeMove(game, move);
    const score = alphabeta(game, depth - 1, alpha, beta, aiSide, level);
    unfakeMove(game, move);
    if (maxing) { best = Math.max(best, score); alpha = Math.max(alpha, score); }
    else { best = Math.min(best, score); beta = Math.min(beta, score); }
    if (alpha >= beta) break;
  }
  return best;
}

export function chooseAiMove(game: Game, level: Difficulty): Move | null {
  const moves = generateMoves(game, game.turn);
  if (!moves.length) return null;
  if (level === "easy" && Math.random() < 0.42) return moves[Math.floor(Math.random() * moves.length)];
  const depth = level === "easy" ? 1 : level === "medium" ? 2 : 3;
  const aiSide = game.turn;
  let bestScore = Number.NEGATIVE_INFINITY, bestMoves: Move[] = [];
  for (const move of moves) {
    const copy = cloneGame(game);
    fakeMove(copy, move);
    let score = alphabeta(copy, depth - 1, Number.NEGATIVE_INFINITY + 1, Number.POSITIVE_INFINITY - 1, aiSide, level);
    if (move.captureId !== -1) score += pieceValues[game.pieces[move.captureId].type] / 4;
    if (score > bestScore) { bestScore = score; bestMoves = [move]; }
    else if (score === bestScore) bestMoves.push(move);
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)] || null;
}
