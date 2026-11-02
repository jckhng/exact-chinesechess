import { moveToUci, parseUciMove } from "./fairyStockfishEngine";
import { applyMove, pieceAt } from "./xiangqi";
import type { Game, Side } from "./types";

export const INVITATION_LIFETIME = 30 * 60 * 1000;
const MAX_SIGNAL_BYTES = 48000;
export type FriendSignal = { version: 1; session: string; expires: number; description: { type: "offer" | "answer"; sdp: string } };
export type FriendPacket =
  | { type: "hello"; session: string; version: 1; side: Side }
  | { type: "move"; session: string; ply: number; move: string; before: string; after: string }
  | { type: "ack"; session: string; ply: number; position: string };

export function validateSignal(value: unknown, expected: "offer" | "answer", now = Date.now()): FriendSignal {
  const signal = value as FriendSignal | null;
  if (!signal || signal.version !== 1 || typeof signal.session !== "string" || !/^[a-f0-9-]{36}$/.test(signal.session) ||
    !Number.isFinite(signal.expires) || signal.expires > now + INVITATION_LIFETIME + 60000 ||
    signal.description?.type !== expected || typeof signal.description.sdp !== "string" ||
    signal.description.sdp.length > 32000 || !/^v=0\r?\n/.test(signal.description.sdp) || !signal.description.sdp.includes("m=application "))
    throw new Error(`This is not a valid ${expected === "offer" ? "invitation" : "reply"}. Copy the complete text and try again.`);
  if (signal.expires < now) throw new Error("This invitation has expired. Ask for a new invitation.");
  if (/^m=(audio|video)\s/m.test(signal.description.sdp) || /^a=candidate:.*\btyp relay\b/m.test(signal.description.sdp))
    throw new Error("This invitation does not describe a direct chess connection.");
  return signal;
}

async function limitedBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_SIGNAL_BYTES) { await reader.cancel(); throw new Error("Connection text is too large."); }
      parts.push(value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

export async function encodeSignal(signal: FriendSignal): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(signal));
  if (bytes.length > MAX_SIGNAL_BYTES) throw new Error("Connection text is too large.");
  const compressed = typeof CompressionStream !== "undefined" && typeof DecompressionStream !== "undefined";
  const data = compressed ? await limitedBytes(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"))) : bytes;
  return `${compressed ? "xq1z" : "xq1"}.${btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;
}

export function invitationFromHash(hash: string): string {
  return new URLSearchParams(hash.replace(/^#/, "")).get("invite") || "";
}

export function invitationLink(code: string, base: string): string {
  const url = new URL(base);
  url.hash = new URLSearchParams({ invite: code }).toString();
  return url.href;
}

export async function decodeSignal(input: string, expected: "offer" | "answer"): Promise<FriendSignal> {
  if (input.length > 70000) throw new Error("Connection text is too large.");
  let code = input.trim();
  if (/^https?:\/\//i.test(code)) {
    try { code = invitationFromHash(new URL(code).hash); }
    catch { throw new Error("Copy the complete invitation link."); }
  }
  code = code.replace(/\s/g, "");
  const match = /^(xq1z|xq1)\.([A-Za-z0-9_-]+)$/.exec(code);
  if (!match) throw new Error(`Paste the complete ${expected === "offer" ? "invitation link" : "reply code"}.`);
  try {
    const bytes = Uint8Array.from(atob(match[2].replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    if (match[1] === "xq1z" && typeof DecompressionStream === "undefined") throw new Error("This browser cannot open the invitation. Use a current browser.");
    const unpacked = match[1] === "xq1z" ? await limitedBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"))) : bytes;
    if (unpacked.length > MAX_SIGNAL_BYTES) throw new Error("Connection text is too large.");
    return validateSignal(JSON.parse(new TextDecoder().decode(unpacked)), expected);
  } catch (error) {
    if (error instanceof Error && !(error instanceof SyntaxError) && !(error instanceof DOMException) && error.message) throw error;
    throw new Error("The connection text is incomplete or damaged. Copy it again.");
  }
}

export function positionKey(game: Game): string {
  return `${game.turn}:${Number(game.gameOver)}:${game.pieces.map((p) => p.dead ? "x" : `${p.row},${p.col}`).join(";")}`;
}

export function parsePacket(text: unknown): FriendPacket {
  if (typeof text !== "string" || text.length > 4000) throw new Error("Invalid game message.");
  const p = JSON.parse(text) as FriendPacket;
  if (!p || typeof p.session !== "string") throw new Error("Invalid game message.");
  if (p.type === "hello" && p.version === 1 && (p.side === "red" || p.side === "black")) return p;
  if ((p.type === "move" || p.type === "ack") && Number.isSafeInteger(p.ply) && p.ply >= 0) {
    if (p.type === "ack" && typeof p.position === "string" && p.position.length < 500) return p;
    if (p.type === "move" && typeof p.move === "string" && /^([a-i])(10|[1-9])([a-i])(10|[1-9])$/.test(p.move) &&
      typeof p.before === "string" && typeof p.after === "string" && p.before.length < 500 && p.after.length < 500) return p;
  }
  throw new Error("Invalid game message.");
}

export function prepareFriendMove(game: Game, side: Side, token: string, session: string) {
  if (game.turn !== side || !/^([a-i])(10|[1-9])([a-i])(10|[1-9])$/.test(token)) throw new Error("It is not your turn, or that move is invalid.");
  const parsed = parseUciMove(token)!;
  const result = applyMove(game, pieceAt(game, parsed.fromRow, parsed.fromCol), parsed.toRow, parsed.toCol);
  if (!result) throw new Error("That move is not legal.");
  const packet: FriendPacket = { type: "move", session, ply: game.history.length, move: moveToUci(result.move), before: positionKey(game), after: positionKey(result.game) };
  return { game: result.game, packet };
}

export function receiveFriendMove(game: Game, remoteSide: Side, packet: Extract<FriendPacket, { type: "move" }>): Game {
  if (packet.ply !== game.history.length || packet.before !== positionKey(game)) throw new Error("The two boards do not match. Play is paused; create a new invitation.");
  const result = prepareFriendMove(game, remoteSide, packet.move, packet.session);
  if (packet.after !== positionKey(result.game)) throw new Error("The two boards do not match. Play is paused; create a new invitation.");
  return result.game;
}
