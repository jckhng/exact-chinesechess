import { createGame } from "../xiangqi";
import type { Game } from "../types";
import { applyUci } from "./logic";

export type Exercise = {
  id: string;
  title: string;
  focus: "awareness" | "calculation" | "development";
  prompt: string;
  history: string[];
};

// These positions are legal continuations of a full-strength engine opening.
// Keeping startpos histories lets the same UCI engine analyse every exercise.
export const exercises: Exercise[] = [
  { id: "first-look", title: "First look", focus: "awareness", prompt: "Scan Black's capture routes before choosing an opening move.", history: [] },
  { id: "scan-developed", title: "Scan again", focus: "awareness", prompt: "In a developed position, identify Black's capture routes before moving.", history: ["h1g3", "b10c8", "d1e2", "c10e8", "c1e3", "d10e9"] },
  { id: "activate", title: "Activate pieces", focus: "development", prompt: "Find a move that improves the useful squares of a horse, rook, or cannon.", history: ["h1g3", "b10c8", "d1e2", "c10e8"] },
  { id: "reply", title: "Expect the reply", focus: "calculation", prompt: "Choose a move, then predict Black's most testing answer.", history: ["h1g3", "b10c8", "d1e2", "c10e8", "c1e3", "d10e9", "g4g5", "h10g8"] },
  { id: "second-reply", title: "Plan two turns", focus: "calculation", prompt: "Look for Black's answer and your next best move before committing.", history: ["h1g3", "b10c8", "d1e2", "c10e8", "c1e3", "d10e9", "g4g5", "h10g8", "c4c5", "a10d10"] },
  { id: "battlefield", title: "Shape the center", focus: "development", prompt: "Compare the lines your move opens for both sides.", history: ["h1g3", "b10c8", "d1e2", "c10e8", "c1e3", "d10e9", "g4g5", "h10g8", "c4c5", "a10d10", "b1c3", "g7g6"] }
];

export function exerciseGame(exercise: Exercise): Game {
  let game = createGame();
  for (const token of exercise.history) {
    const result = applyUci(game, token);
    if (!result) throw new Error(`Invalid exercise ${exercise.id}: ${token}`);
    game = result.game;
  }
  if (game.turn !== "red" || game.gameOver) throw new Error(`Invalid exercise endpoint: ${exercise.id}`);
  return game;
}
