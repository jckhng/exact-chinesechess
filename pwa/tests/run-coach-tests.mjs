import { build } from "esbuild";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import assert from "node:assert/strict";

const temp = await mkdtemp(join(tmpdir(), "xiangqi-coach-tests-"));
try {
  const outfile = join(temp, "fixtures.mjs");
  await build({ entryPoints: ["tests/coach-fixtures.ts"], outfile, bundle: true, platform: "node", format: "esm", define: { "import.meta.env.BASE_URL": '"/"' }, logLevel: "error" });
  await import(pathToFileURL(outfile).href);
} finally { await rm(temp, { recursive: true, force: true }); }

const source = await readFile("public/engine/fairy-stockfish/coach-worker.js", "utf8");
let listener;
let onEngineLine;
const messages = [];
const fakeEngine = {
  addMessageListener(callback) { onEngineLine = callback; },
  postMessage(command) {
    if (command === "uci") queueMicrotask(() => onEngineLine("uciok"));
    if (command === "isready") queueMicrotask(() => onEngineLine("readyok"));
    if (command.startsWith("go movetime")) queueMicrotask(() => {
      onEngineLine("info depth 8 multipv 1 score cp 42 nodes 90 pv a4a5 b7b6 a5a6");
      onEngineLine("bestmove a4a5");
    });
  }
};
const self = {
  location: { href: "https://example.test/engine/fairy-stockfish/coach-worker.js" },
  postMessage(message) { messages.push(message); },
  addEventListener(type, callback) { if (type === "message") listener = callback; }
};
vm.runInNewContext(source, { self, URL, SharedArrayBuffer, importScripts() {}, Stockfish: async () => fakeEngine, queueMicrotask });
listener({ data: { type: "init" } });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(messages.some((message) => message.type === "ready"));
listener({ data: { type: "analyze", id: 7, moves: [], ms: 500 } });
await new Promise((resolve) => setTimeout(resolve, 0));
const result = messages.find((message) => message.type === "result");
assert.equal(result.id, 7);
assert.equal(result.info.score.value, 42);
assert.equal(result.info.pv.length, 3);
listener({ data: { type: "analyze", id: 8, moves: [], ms: 500 } });
listener({ data: { type: "cancel" } });
await new Promise((resolve) => setTimeout(resolve, 0));
assert.ok(messages.some((message) => message.type === "cancelled" && message.id === 8), "cancelled analysis cannot become a lesson");
console.log("Coaching UCI analysis and cancellation fixtures passed.");
