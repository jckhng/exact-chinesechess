import { moveToUci, parseUciMove } from "../fairyStockfishEngine";
import type { Game, Move, Piece, PieceType, Side } from "../types";
import { applyMove, cloneGame, generateMoves, inCheck, otherSide, pieceAt } from "../xiangqi";
import type { EngineLine, EngineScore } from "./engine";

export type Concept = "threat" | "lane" | "development" | "calculation";
export type Threat = { attacker: number; target: number; defended: boolean };
export type BoardHint = {
  kind: "threat" | "lane" | "move" | "activity";
  text: string;
  from: { row: number; col: number };
  to: { row: number; col: number };
  targetId?: number;
  danger?: boolean;
};
export type Insight = { concept: Concept; text: string; hint?: BoardHint };
export type LineStep = { game: Game; move: Move | null; label: string };
export type CoachReport = {
  before: Game;
  after: Game;
  played: Move;
  preferred: EngineLine | null;
  playedAnalysis: EngineLine | null;
  verdict: string;
  assessment: string;
  insights: Insight[];
  threats: Threat[];
  playedSteps: LineStep[];
  preferredSteps: LineStep[];
};

export const pieceNames: Record<PieceType, string> = {
  general: "general", advisor: "advisor", elephant: "elephant", horse: "horse",
  rook: "rook", cannon: "cannon", soldier: "soldier"
};
export const pieceLetters: Record<PieceType, string> = {
  general: "k", advisor: "a", elephant: "b", horse: "n", rook: "r", cannon: "c", soldier: "p"
};
export const pieceGlyphs: Record<Side, Record<PieceType, string>> = {
  red: { general: "帥", advisor: "仕", elephant: "相", horse: "馬", rook: "車", cannon: "炮", soldier: "兵" },
  black: { general: "將", advisor: "士", elephant: "象", horse: "馬", rook: "車", cannon: "砲", soldier: "卒" }
};

export function square(row: number, col: number): string {
  return `${"abcdefghi"[col]}${10 - row}`;
}

export function moveLabel(game: Game, move: Move): string {
  const piece = game.pieces[move.moveId];
  return `${piece.side === "red" ? "Red" : "Black"} ${pieceNames[piece.type]} ${square(move.fromRow, move.fromCol)}–${square(move.toRow, move.toCol)}`;
}

export function applyUci(game: Game, token: string): { game: Game; move: Move } | null {
  const parsed = parseUciMove(token);
  if (!parsed) return null;
  const id = pieceAt(game, parsed.fromRow, parsed.fromCol);
  if (id < 0) return null;
  return applyMove(game, id, parsed.toRow, parsed.toCol);
}

export function replayLine(before: Game, tokens: string[]): LineStep[] {
  const steps: LineStep[] = [{ game: cloneGame(before), move: null, label: "Starting position" }];
  let current = before;
  for (const token of tokens.slice(0, 7)) {
    const result = applyUci(current, token);
    if (!result) break;
    steps.push({ game: result.game, move: result.move, label: moveLabel(current, result.move) });
    current = result.game;
    if (current.gameOver) break;
  }
  return steps;
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

function normalizedScore(score: EngineScore, turn: Side, learner: Side): EngineScore {
  return { kind: score.kind, value: turn === learner ? score.value : -score.value };
}

function verdict(preferred: EngineLine | null, played: EngineLine | null, before: Game, after: Game, move: Move): { title: string; detail: string } {
  if (!preferred || !played || !preferred.pv.length) return { title: "Board changes", detail: "Engine comparison is unavailable; the hints below come from the rules." };
  const best = normalizedScore(preferred.score, before.turn, before.turn);
  const chosen = normalizedScore(played.score, after.turn, before.turn);
  if (preferred.bestMove === moveToUci(move)) return { title: "Engine agrees", detail: `The analysed best line starts with your move. Depth ${preferred.depth}.` };
  if (best.kind === "mate" || chosen.kind === "mate") {
    if (chosen.kind === "mate" && chosen.value < 0 && !(best.kind === "mate" && best.value < 0))
      return { title: "Serious mistake", detail: "The analysed continuation allows a forced loss of the general." };
    return { title: "Different plans", detail: "At least one line contains a mate sequence; inspect the continuations before judging the move." };
  }
  if (Math.min(preferred.depth, played.depth) < 6) return { title: "Tentative comparison", detail: "The search is too shallow for a reliable move grade. Inspect the concrete line." };
  const loss = best.value - chosen.value;
  if (loss >= 200) return { title: "Serious mistake", detail: "The engine finds a substantially better outcome after another move. Inspect the reply." };
  if (loss >= 80) return { title: "Inaccuracy", detail: "The engine prefers another move. Follow both lines to see what changes." };
  return { title: "Sound alternative", detail: "The engine prefers a different move, but this search shows a small difference." };
}

function threatInsight(after: Game, threat: Threat): Insight {
  const attacker = after.pieces[threat.attacker];
  const target = after.pieces[threat.target];
  const text = `${target.side === "red" ? "Your" : "Their"} ${pieceNames[target.type]} on ${square(target.row, target.col)} can be captured by the ${pieceNames[attacker.type]} on ${square(attacker.row, attacker.col)}${threat.defended ? "; a legal recapture exists" : "; no immediate legal recapture exists"}.`;
  return { concept: "threat", text, hint: {
    kind: "threat", text,
    from: { row: attacker.row, col: attacker.col }, to: { row: target.row, col: target.col }, targetId: target.id, danger: !threat.defended
  } };
}

function activityInsights(before: Game, after: Game, learner: Side): Insight[] {
  const beforeMoves = generateMoves(before, learner);
  const afterMoves = generateMoves(after, learner);
  const insights: Insight[] = [];
  for (const piece of after.pieces) {
    if (piece.dead || piece.side !== learner || !["rook", "cannon", "horse"].includes(piece.type)) continue;
    const earlier = beforeMoves.filter((move) => move.moveId === piece.id).length;
    const now = afterMoves.filter((move) => move.moveId === piece.id).length;
    if (now - earlier < 3) continue;
    const text = `Your ${pieceNames[piece.type]} on ${square(piece.row, piece.col)} gains ${now - earlier} legal destinations. This improves its activity.`;
    const newMoves = afterMoves.filter((move) => move.moveId === piece.id && !beforeMoves.some(
      (old) => old.moveId === piece.id && old.toRow === move.toRow && old.toCol === move.toCol
    ));
    const lane = piece.type !== "horse" ? newMoves.find((move) => move.toCol === piece.col || move.toRow === piece.row) : null;
    insights.push({ concept: piece.type === "horse" ? "development" : "lane", text, hint: lane ? {
      kind: "lane", text, from: { row: piece.row, col: piece.col },
      to: { row: lane.toRow, col: lane.toCol }
    } : undefined });
  }
  return insights;
}

export function makeReport(before: Game, after: Game, played: Move, preferred: EngineLine | null, playedAnalysis: EngineLine | null): CoachReport {
  const threats = legalThreats(after, after.turn);
  const earlierTargets = new Set(legalThreats(before, after.turn).map((threat) => threat.target));
  const insights: Insight[] = [];
  const newThreats = threats.filter((threat) => !earlierTargets.has(threat.target) && after.pieces[threat.target].side === before.turn);
  newThreats.sort((a, b) => Number(a.defended) - Number(b.defended));
  newThreats.slice(0, 2).forEach((threat) => insights.push(threatInsight(after, threat)));
  if (inCheck(after, after.turn)) insights.push({ concept: "calculation", text: "Your move gives check. Look for the opponent's legal escape before planning the next attack." });
  if (played.captureId >= 0) {
    const captured = before.pieces[played.captureId];
    insights.push({ concept: "calculation", text: `You captured the ${pieceNames[captured.type]} on ${square(played.toRow, played.toCol)}. Check whether the capturing piece can be recaptured.` });
  }
  if (before.pieces[played.moveId].type === "soldier" && played.fromRow >= 5 && played.toRow <= 4 && before.turn === "red") {
    insights.push({ concept: "development", text: `Your soldier crossed the river at ${square(played.toRow, played.toCol)} and can now move sideways.` });
  }
  insights.push(...activityInsights(before, after, before.turn).slice(0, 2));
  const playedTokens = [moveToUci(played), ...(playedAnalysis?.pv || [])];
  const playedSteps = replayLine(before, playedTokens);
  const preferredSteps = preferred ? replayLine(before, preferred.pv) : [];
  const preferredAfter = preferredSteps[1]?.game;
  if (preferredAfter) {
    const preferredTargets = new Set(legalThreats(preferredAfter, preferredAfter.turn).map((threat) => threat.target));
    const avoided = newThreats.find((threat) => !preferredTargets.has(threat.target) && !preferredAfter.pieces[threat.target].dead);
    if (avoided) {
      const piece = after.pieces[avoided.target];
      insights.unshift({ concept: "threat", text: `The engine's move avoids the new capture route against your ${pieceNames[piece.type]} on ${square(piece.row, piece.col)}. Compare the boards after each first move.` });
    }
    const playedActivity = generateMoves(after, before.turn);
    const preferredActivity = generateMoves(preferredAfter, before.turn);
    const activityGain = before.pieces.find((piece) => !piece.dead && piece.side === before.turn && ["rook", "cannon", "horse"].includes(piece.type) &&
      preferredActivity.filter((move) => move.moveId === piece.id).length - playedActivity.filter((move) => move.moveId === piece.id).length >= 3);
    if (activityGain && !avoided) {
      const extra = preferredActivity.filter((move) => move.moveId === activityGain.id).length - playedActivity.filter((move) => move.moveId === activityGain.id).length;
      insights.unshift({ concept: "development", text: `The engine's move leaves your ${pieceNames[activityGain.type]} with ${extra} more legal destinations than your move. Inspect its routes in both positions.` });
    }
  }
  const reply = playedSteps[2]?.move;
  if (reply?.captureId !== undefined && reply.captureId >= 0) {
    const captured = after.pieces[reply.captureId];
    insights.unshift({ concept: "calculation", text: `In the engine line, the opponent captures your ${pieceNames[captured.type]} on ${square(reply.toRow, reply.toCol)}. Step forward to inspect your best response.` });
    if (playedSteps[3]?.move && preferred && playedAnalysis && preferred.score.kind === "cp" && playedAnalysis.score.kind === "cp" && preferred.score.value + playedAnalysis.score.value >= 200) {
      insights.push({ concept: "calculation", text: `Your best continuation is ${playedSteps[3].label}. The analysis still rates the result substantially worse than the recommended branch.` });
    }
  }
  if (!insights.length) insights.push({ concept: "development", text: "No immediate tactical change was verified. Compare each side's piece activity and future access in the two lines." });
  const grade = verdict(preferred, playedAnalysis, before, after, played);
  return { before, after, played, preferred, playedAnalysis, verdict: grade.title, assessment: grade.detail, insights, threats, playedSteps, preferredSteps };
}

export function pieceAsset(piece: Piece): string {
  return `${import.meta.env.BASE_URL}assets/xiangqi/${piece.side === "red" ? "r" : "b"}_${pieceLetters[piece.type]}.png`;
}

export function openLanes(game: Game, side: Side, selectedId = -1): BoardHint[] {
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
