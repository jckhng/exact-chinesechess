import assert from "node:assert/strict";
import { createGame, applyMove, generateMoves, isLegalMove } from "../src/xiangqi";
import { moveToUci } from "../src/fairyStockfishEngine";
import { legalThreats, makeReport, replayLine } from "../src/coach/logic";
import { exercises, exerciseGame } from "../src/coach/exercises";

function sparse() {
  const game = createGame();
  for (const piece of game.pieces) piece.dead = true;
  game.pieces[4].dead = false;
  game.pieces[4].row = 0; game.pieces[4].col = 4;
  game.pieces[20].dead = false;
  game.pieces[20].row = 9; game.pieces[20].col = 4;
  return game;
}

for (const exercise of exercises) assert.equal(exerciseGame(exercise).turn, "red", `exercise ${exercise.id} is playable`);

const initial = createGame();
const first = generateMoves(initial, "red")[0];
assert.ok(first);
const afterFirst = applyMove(initial, first.moveId, first.toRow, first.toCol);
assert.ok(afterFirst);
assert.equal(replayLine(initial, [moveToUci(first)]).length, 2);
assert.equal(replayLine(initial, [moveToUci(first), "not-a-move"]).length, 2);

const horse = sparse();
const redHorse = horse.pieces.find((piece) => piece.side === "red" && piece.type === "horse")!;
const blackSoldier = horse.pieces.find((piece) => piece.side === "black" && piece.type === "soldier")!;
const redSoldier = horse.pieces.find((piece) => piece.side === "red" && piece.type === "soldier")!;
redHorse.dead = false; redHorse.row = 6; redHorse.col = 1;
blackSoldier.dead = false; blackSoldier.row = 4; blackSoldier.col = 2;
redSoldier.dead = false; redSoldier.row = 5; redSoldier.col = 1;
assert.equal(isLegalMove(horse, redHorse.id, 4, 2), false, "occupied horse leg blocks capture");
redSoldier.col = 4;
assert.equal(isLegalMove(horse, redHorse.id, 4, 2), true, "horse capture opens when leg clears");

const cannon = sparse();
const blackCannon = cannon.pieces.find((piece) => piece.side === "black" && piece.type === "cannon")!;
const target = cannon.pieces.find((piece) => piece.side === "red" && piece.type === "rook")!;
const screen = cannon.pieces.find((piece) => piece.side === "black" && piece.type === "soldier")!;
blackCannon.dead = false; blackCannon.row = 2; blackCannon.col = 4;
target.dead = false; target.row = 6; target.col = 4;
screen.dead = false; screen.row = 4; screen.col = 4;
assert.ok(legalThreats(cannon, "black").some((threat) => threat.attacker === blackCannon.id && threat.target === target.id), "cannon needs one screen");
screen.dead = true;
assert.ok(!legalThreats(cannon, "black").some((threat) => threat.attacker === blackCannon.id && threat.target === target.id), "cannon cannot capture without screen");

const reply = generateMoves(afterFirst.game, "black")[0];
assert.ok(reply);
const redReplyGame = applyMove(afterFirst.game, reply.moveId, reply.toRow, reply.toCol);
assert.ok(redReplyGame);
const continuation = generateMoves(redReplyGame.game, "red")[0];
assert.ok(continuation);
const otherFirst = generateMoves(initial, "red").find((move) => moveToUci(move) !== moveToUci(first))!;
const report = makeReport(initial, afterFirst.game, first,
  { bestMove: moveToUci(otherFirst), depth: 8, score: { kind: "cp", value: 120 }, pv: [moveToUci(otherFirst)] },
  { bestMove: moveToUci(reply), depth: 8, score: { kind: "cp", value: 200 }, pv: [moveToUci(reply), moveToUci(continuation)] });
assert.equal(report.verdict, "Serious mistake");
assert.equal(report.playedSteps.length, 4);
assert.equal(report.preferredSteps.length, 2);
console.log("Coaching rules, replay, and comparison fixtures passed.");
