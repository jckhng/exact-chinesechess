import { createGame, otherSide } from "./xiangqi";
import type { Game, Side } from "./types";
import { decodeSignal, encodeSignal, INVITATION_LIFETIME, parsePacket, positionKey, prepareFriendMove, receiveFriendMove, type FriendPacket, type FriendSignal } from "./friendProtocol";

export type FriendStatus = "preparing" | "waiting" | "connecting" | "connected" | "interrupted" | "failed" | "closed";
export const FRIEND_RTC_CONFIG: RTCConfiguration = {
  // Discovery only: no TURN or hosted signaling service.
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
  iceCandidatePoolSize: 0
};

type Events = {
  onStatus: (status: FriendStatus, detail?: string) => void;
  onGame: (game: Game, pending: boolean) => void;
};

export class FriendConnection {
  private pc: RTCPeerConnection;
  private channel: RTCDataChannel | null = null;
  private abort = new AbortController();
  private game = createGame();
  private greeted = false;
  private pending: { ply: number; position: string } | null = null;
  private ackTimer: ReturnType<typeof setTimeout> | undefined;
  private connectionTimer: ReturnType<typeof setTimeout> | undefined;
  private recoveryTimer: ReturnType<typeof setTimeout> | undefined;
  private expiryTimer: ReturnType<typeof setTimeout> | undefined;
  private status: FriendStatus = "preparing";
  private signal: FriendSignal | null = null;

  constructor(readonly side: Side, private readonly events: Events, createPeer = (config: RTCConfiguration) => new RTCPeerConnection(config)) {
    this.pc = createPeer(FRIEND_RTC_CONFIG);
    this.pc.addEventListener("connectionstatechange", () => {
      if (this.abort.signal.aborted) return;
      if (this.pc.connectionState === "failed" || this.pc.connectionState === "closed") this.fail("A direct connection could not be maintained. Try another network and exchange a new invitation.");
      else if (this.pc.connectionState === "disconnected") {
        this.setStatus("interrupted", "Connection interrupted. Waiting for your friend to return…");
        if (!this.recoveryTimer) this.recoveryTimer = setTimeout(() => this.fail("The connection was lost. Save the game if you want to keep it, then exchange a new invitation."), 20000);
      } else if (this.pc.connectionState === "connected") {
        clearTimeout(this.recoveryTimer); this.recoveryTimer = undefined;
        if (this.greeted) this.setStatus("connected");
      }
    });
    this.pc.addEventListener("datachannel", (event) => {
      if (this.side !== "black" || this.channel || event.channel.label !== "xiangqi-v1") { event.channel.close(); return; }
      this.attachChannel(event.channel);
    });
  }

  private setStatus(status: FriendStatus, detail?: string) {
    this.status = status;
    this.events.onStatus(status, detail);
  }

  private ensureOpen() {
    if (this.abort.signal.aborted) throw new Error("This connection has been closed. Create a new invitation.");
  }

  private async gather() {
    this.ensureOpen();
    if (this.pc.iceGatheringState !== "complete") await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer);
        this.pc.removeEventListener("icegatheringstatechange", changed);
        this.abort.signal.removeEventListener("abort", cancelled);
        if (error) reject(error); else resolve();
      };
      const changed = () => { if (this.pc.iceGatheringState === "complete") finish(); };
      const cancelled = () => finish(new Error("Connection cancelled."));
      const timer = setTimeout(() => {
        // A blocked STUN endpoint must not prevent a same-network connection.
        // Include all candidates gathered so far in this one-shot exchange.
        if (/^a=candidate:.*\btyp (host|srflx|prflx)\b/m.test(this.pc.localDescription?.sdp || "")) finish();
        else finish(new Error("Network discovery timed out. Check your connection and try again."));
      }, 10000);
      this.pc.addEventListener("icegatheringstatechange", changed);
      this.abort.signal.addEventListener("abort", cancelled, { once: true });
      changed();
    });
    this.ensureOpen();
    const description = this.pc.localDescription;
    if (!description?.sdp) throw new Error("Could not prepare connection details.");
    return { type: description.type as "offer" | "answer", sdp: description.sdp };
  }

  async createInvitation(): Promise<string> {
    this.attachChannel(this.pc.createDataChannel("xiangqi-v1", { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    const description = await this.gather();
    this.signal = { version: 1, session: crypto.randomUUID(), expires: Date.now() + INVITATION_LIFETIME, description };
    const code = await encodeSignal(this.signal);
    this.ensureOpen();
    this.expiryTimer = setTimeout(() => this.fail("This invitation has expired. Create a new invitation."), INVITATION_LIFETIME);
    this.setStatus("waiting");
    return code;
  }

  async acceptInvitation(code: string): Promise<string> {
    this.signal = await decodeSignal(code, "offer");
    this.ensureOpen();
    await this.pc.setRemoteDescription(this.signal.description);
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    const description = await this.gather();
    const reply = await encodeSignal({ ...this.signal, description });
    this.ensureOpen();
    this.setStatus("waiting");
    this.expiryTimer = setTimeout(() => this.fail("The invitation expired before connection. Ask your friend for a new invitation."), Math.max(1, this.signal.expires - Date.now()));
    return reply;
  }

  async acceptReply(code: string) {
    if (!this.signal || this.pc.signalingState !== "have-local-offer") throw new Error("Create an invitation in this tab first.");
    const reply = await decodeSignal(code, "answer");
    this.ensureOpen();
    if (reply.session !== this.signal.session || reply.expires !== this.signal.expires) throw new Error("This reply belongs to another invitation. Paste the reply for this waiting game.");
    await this.pc.setRemoteDescription(reply.description);
    this.ensureOpen();
    if (!this.greeted) {
      this.setStatus("connecting");
      this.connectionTimer = setTimeout(() => this.fail("These networks could not connect directly. Try another Wi-Fi network and create a new invitation."), 30000);
    }
  }

  private attachChannel(channel: RTCDataChannel) {
    this.channel = channel;
    channel.addEventListener("open", () => {
      if (!this.signal || this.abort.signal.aborted) return;
      this.send({ type: "hello", session: this.signal.session, version: 1, side: this.side });
    });
    channel.addEventListener("message", (event) => {
      if (this.abort.signal.aborted) return;
      try { this.receive(parsePacket(event.data)); }
      catch (error) { this.fail(error instanceof Error && !(error instanceof SyntaxError) ? error.message : "Invalid game message. Play is paused."); }
    });
    channel.addEventListener("close", () => { if (!this.abort.signal.aborted) this.fail("Your friend disconnected. Save the game to keep it, then exchange a new invitation."); });
    channel.addEventListener("error", () => this.fail("The direct connection failed. Exchange a new invitation to try again."));
  }

  private send(packet: FriendPacket) {
    if (this.channel?.readyState !== "open" || this.channel.bufferedAmount > 64000) throw new Error("Your friend is not connected. Play is paused.");
    this.channel.send(JSON.stringify(packet));
  }

  private receive(packet: FriendPacket) {
    if (!this.signal || packet.session !== this.signal.session) throw new Error("This message belongs to a different game.");
    if (packet.type === "hello") {
      if (this.greeted || packet.side !== otherSide(this.side)) throw new Error("The other player has an incompatible game session.");
      this.greeted = true;
      clearTimeout(this.connectionTimer); clearTimeout(this.expiryTimer);
      this.setStatus("connected");
      this.events.onGame(this.game, false);
      return;
    }
    if (!this.greeted) throw new Error("The other player has not joined the game.");
    if (packet.type === "ack") {
      if (!this.pending || packet.ply !== this.pending.ply || packet.position !== this.pending.position) throw new Error("Move confirmation did not match. Play is paused.");
      clearTimeout(this.ackTimer);
      this.pending = null;
      this.events.onGame(this.game, false);
      return;
    }
    if (this.pending) throw new Error("The previous move has not been confirmed. Play is paused.");
    const next = receiveFriendMove(this.game, otherSide(this.side), packet);
    this.send({ type: "ack", session: packet.session, ply: next.history.length, position: positionKey(next) });
    this.game = next;
    this.events.onGame(next, false);
  }

  move(token: string): boolean {
    if (this.status !== "connected" || !this.signal || this.pending) return false;
    const result = prepareFriendMove(this.game, this.side, token, this.signal.session);
    this.send(result.packet);
    this.game = result.game;
    this.pending = { ply: this.game.history.length, position: positionKey(this.game) };
    this.ackTimer = setTimeout(() => this.fail("Your friend has not confirmed the move. Play is paused; save the game before reconnecting."), 15000);
    this.events.onGame(this.game, true);
    return true;
  }

  fail(detail: string) {
    if (this.abort.signal.aborted) return;
    this.dispose();
    this.setStatus("failed", detail);
  }

  dispose() {
    if (this.abort.signal.aborted) return;
    this.abort.abort();
    clearTimeout(this.ackTimer); clearTimeout(this.connectionTimer); clearTimeout(this.recoveryTimer); clearTimeout(this.expiryTimer);
    this.channel?.close();
    this.pc.close();
    this.status = "closed";
  }
}
