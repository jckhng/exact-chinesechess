import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { createGame, generateMoves } from "../src/xiangqi";
import { moveToUci } from "../src/fairyStockfishEngine";
import { FriendConnection, FRIEND_RTC_CONFIG } from "../src/friendConnection";
import { decodeSignal, encodeSignal, invitationFromHash, invitationLink, INVITATION_LIFETIME, parsePacket, positionKey, prepareFriendMove, receiveFriendMove, validateSignal, type FriendSignal } from "../src/friendProtocol";
Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
const sdp = "v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n";
const signal: FriendSignal = { version: 1, session: crypto.randomUUID(), expires: Date.now() + INVITATION_LIFETIME - 1000, description: { type: "offer", sdp } };
const code = await encodeSignal(signal);
assert.deepEqual(await decodeSignal(code, "offer"), signal);
const link = invitationLink(code, "https://example.test/games/xiangqi/");
assert.equal(new URL(link).pathname, "/games/xiangqi/");
assert.equal(invitationFromHash(new URL(link).hash), code);
assert.deepEqual(await decodeSignal(link, "offer"), signal);
const plain = `xq1.${btoa(JSON.stringify(signal)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")}`;
assert.deepEqual(await decodeSignal(plain, "offer"), signal, "uncompressed fallback works");
await assert.rejects(decodeSignal(code, "answer"), /not a valid reply/);
await assert.rejects(decodeSignal("truncated", "offer"), /complete/);
await assert.rejects(decodeSignal("x".repeat(70001), "offer"), /too large/);
assert.throws(() => validateSignal({ ...signal, expires: Date.now() - 1 }, "offer"), /expired/);
assert.throws(() => validateSignal({ ...signal, description: { type: "offer", sdp: sdp + "a=candidate:1 1 UDP 1 10.0.0.1 100 typ relay\r\n" } }, "offer"), /direct chess/);
assert.ok(FRIEND_RTC_CONFIG.iceServers?.every((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]).every((url) => url.startsWith("stun:"))), "no relay or signaling service");
const game = createGame(), token = moveToUci(generateMoves(game, "red")[0]);
const result = prepareFriendMove(game, "red", token, signal.session);
if (result.packet.type !== "move") throw new Error("Expected move packet");
assert.deepEqual(receiveFriendMove(game, "red", result.packet), result.game);
assert.equal(game.history.length, 0, "validation does not mutate the previous board");
assert.throws(() => prepareFriendMove(game, "black", token, signal.session), /not your turn/);
assert.throws(() => prepareFriendMove(game, "red", token + "junk", signal.session), /invalid/);
assert.throws(() => receiveFriendMove(game, "red", { ...result.packet, ply: 4 }), /boards do not match/);
assert.throws(() => receiveFriendMove(game, "red", { ...result.packet, after: "changed" }), /boards do not match/);
assert.throws(() => receiveFriendMove(result.game, "red", result.packet), /boards do not match/, "duplicate move rejected");
assert.throws(() => parsePacket(JSON.stringify({ ...result.packet, ply: -1 })), /Invalid/);
assert.throws(() => parsePacket("{"), SyntaxError);
class Channel extends EventTarget {
  label = "xiangqi-v1"; readyState = "connecting"; bufferedAmount = 0; remote!: Channel; sent: string[] = [];
  send(text: string) { this.sent.push(text); queueMicrotask(() => { if (this.remote.readyState === "open") this.remote.dispatchEvent(new MessageEvent("message", { data: text })); }); }
  close() {
    if (this.readyState === "closed") return;
    this.readyState = "closed"; this.dispatchEvent(new Event("close"));
    if (this.remote) { this.remote.readyState = "closed"; this.remote.dispatchEvent(new Event("close")); }
  }
}
class Peer extends EventTarget {
  iceGatheringState = "complete"; connectionState = "new"; signalingState = "stable";
  localDescription: RTCSessionDescriptionInit | null = null;
  channel = new Channel(); remote!: Peer;
  createDataChannel() { return this.channel; }
  async createOffer() { return { type: "offer", sdp } as const; }
  async createAnswer() { return { type: "answer", sdp } as const; }
  async setLocalDescription(d: RTCSessionDescriptionInit) { this.localDescription = d; this.signalingState = d.type === "offer" ? "have-local-offer" : "stable"; }
  async setRemoteDescription(d: RTCSessionDescriptionInit) {
    if (d.type === "offer") this.dispatchEvent(Object.assign(new Event("datachannel"), { channel: this.channel }));
    else {
      this.signalingState = "stable";
      queueMicrotask(() => {
        for (const p of [this, this.remote]) { p.connectionState = "connected"; p.dispatchEvent(new Event("connectionstatechange")); p.channel.readyState = "open"; p.channel.dispatchEvent(new Event("open")); }
      });
    }
  }
  close() { this.connectionState = "closed"; this.channel.close(); }
}
const hp = new Peer(), gp = new Peer();
hp.remote = gp; gp.remote = hp; hp.channel.remote = gp.channel; gp.channel.remote = hp.channel;
let hg = createGame(), gg = createGame(), hs = "", gs = "", pending = false;
const host = new FriendConnection("red", { onStatus: (s) => { hs = s; }, onGame: (g, p) => { hg = g; pending = p; } }, () => hp as unknown as RTCPeerConnection);
const guest = new FriendConnection("black", { onStatus: (s) => { gs = s; }, onGame: (g) => { gg = g; } }, () => gp as unknown as RTCPeerConnection);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
try {
  assert.equal(host.move(token), false, "moves wait for handshake");
  const invite = await host.createInvitation(), answer = await guest.acceptInvitation(invite);
  const decoded = await decodeSignal(answer, "answer");
  await assert.rejects(host.acceptReply(await encodeSignal({ ...decoded, session: crypto.randomUUID() })), /another invitation/);
  assert.equal(hp.signalingState, "have-local-offer", "wrong reply leaves correct invitation usable");
  await host.acceptReply(answer); await flush();
  assert.equal(hs, "connected"); assert.equal(gs, "connected");
  assert.equal(host.move(token), true); assert.equal(pending, true);
  await flush();
  assert.equal(pending, false, "move acknowledgment releases pending state");
  assert.equal(positionKey(hg), positionKey(gg));
  assert.throws(() => host.move(token), /not your turn/);
  guest.move(moveToUci(generateMoves(gg, "black")[0])); await flush();
  assert.equal(positionKey(hg), positionKey(gg)); assert.equal(hg.history.length, 2);
  hp.channel.send(hp.channel.sent.find((text) => JSON.parse(text).type === "move")!); await flush();
  assert.equal(gs, "failed", "stale network moves freeze play");
  assert.equal(gg.history.length, 2, "rejected message does not alter board");
} finally { host.dispose(); guest.dispose(); }
console.log("Manual invitation/reply, direct-only configuration, move validation, acknowledgments and desynchronization tests passed.");
