import assert from "node:assert/strict";
import { createGame, cloneGame, applyMove, generateMoves, isLegalMove } from "../src/xiangqi";
import { moveToUci } from "../src/fairyStockfishEngine";
import { makeReport, replayLine } from "../src/coach/logic";
import { boardPoint, guideRoutes, guideSegment, legalThreats, openLanes, type BoardHint } from "../src/boardGuides";
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
assert.ok(openLanes(cannon, "black", blackCannon.id).some((lane) => lane.to.row === target.row && lane.to.col === target.col), "cannon lane reaches a target through one screen");
const mirrored = cloneGame(cannon);
for (const piece of cannon.pieces) {
  const opposite = mirrored.pieces[piece.id < 16 ? piece.id + 16 : piece.id - 16];
  opposite.dead = piece.dead;
  opposite.row = 9 - piece.row;
  opposite.col = 8 - piece.col;
}
const oppositeId = (id: number) => id < 16 ? id + 16 : id - 16;
assert.deepEqual(legalThreats(mirrored, "red"), legalThreats(cannon, "black").map((threat) => ({ ...threat, attacker: oppositeId(threat.attacker), target: oppositeId(threat.target) })), "threat guides work for either color");
const originalPosition = JSON.stringify(cannon);
legalThreats(cannon, "red");
openLanes(cannon, "red");
assert.equal(JSON.stringify(cannon), originalPosition, "guides never change the displayed game or its history");
screen.dead = true;
assert.ok(!legalThreats(cannon, "black").some((threat) => threat.attacker === blackCannon.id && threat.target === target.id), "cannon cannot capture without screen");
assert.ok(!openLanes(cannon, "black", blackCannon.id).some((lane) => lane.to.row === target.row && lane.to.col === target.col), "cannon lane cannot imply a capture without a screen");

const pinned = sparse();
const pinnedRook = pinned.pieces.find((piece) => piece.side === "red" && piece.type === "rook")!;
const pinnedTarget = pinned.pieces.find((piece) => piece.side === "black" && piece.type === "soldier")!;
pinnedRook.dead = false; pinnedRook.row = 5; pinnedRook.col = 4;
pinnedTarget.dead = false; pinnedTarget.row = 5; pinnedTarget.col = 5;
assert.ok(!legalThreats(pinned, "red").some((threat) => threat.attacker === pinnedRook.id && threat.target === pinnedTarget.id), "a pinned piece cannot create a legal capture guide");

for (let row = 0; row < 10; row++) for (let col = 0; col < 9; col++) {
  const normal = boardPoint(row, col), flipped = boardPoint(row, col, true);
  assert.equal(normal.x + flipped.x, 540, "guide columns rotate with the pieces");
  assert.equal(normal.y + flipped.y, 600, "guide rows rotate with the pieces");
}

const verticalGuide: BoardHint = { kind: "threat", text: "Capture route", from: { row: 7, col: 1 }, to: { row: 0, col: 1 } };
const horizontalGuide: BoardHint = { ...verticalGuide, to: { row: 7, col: 7 } };
const verticalSegment = guideSegment(verticalGuide);
const horizontalSegment = guideSegment(horizontalGuide);
assert.notEqual(verticalSegment.from.x, boardPoint(7, 1).x, "vertical guide leaves the board file visible");
assert.notEqual(horizontalSegment.from.y, boardPoint(7, 1).y, "horizontal guide leaves the board rank visible");
assert.ok(verticalSegment.to.y > boardPoint(0, 1).y, "capture arrow stops at the target piece's edge");
const flippedSegment = guideSegment(verticalGuide, true);
assert.equal(verticalSegment.from.x + flippedSegment.from.x, 540, "offset guides follow board rotation");
assert.equal(verticalSegment.from.y + flippedSegment.from.y, 600, "offset guide ends follow board rotation");
const combinedRoutes = guideRoutes([
  verticalGuide,
  { ...verticalGuide, from: verticalGuide.to, to: verticalGuide.from },
  { ...verticalGuide, kind: "lane" }
]);
assert.equal(combinedRoutes.length, 1, "capture and lane overlays never redraw the same route");
assert.equal(combinedRoutes[0].bothWays, true, "mutual captures share one line with two arrowheads");

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
