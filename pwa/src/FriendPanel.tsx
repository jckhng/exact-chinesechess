import { useEffect, useRef, useState } from "react";
import { FriendConnection, type FriendStatus } from "./friendConnection";
import { invitationFromHash, invitationLink } from "./friendProtocol";
import { createGame, inCheck } from "./xiangqi";
import type { Game, Side } from "./types";

function clearInvitationHash() {
  if (invitationFromHash(window.location.hash)) window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

export function useFriendGame() {
  const [open, setOpen] = useState(() => Boolean(invitationFromHash(window.location.hash)));
  const [incoming, setIncoming] = useState(() => invitationFromHash(window.location.hash));
  const [outgoing, setOutgoing] = useState("");
  const [side, setSide] = useState<Side | null>(null);
  const [game, setGame] = useState<Game>(createGame);
  const [status, setStatus] = useState<FriendStatus | null>(null);
  const [detail, setDetail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(false);
  const connection = useRef<FriendConnection | null>(null);
  const generation = useRef(0);

  useEffect(() => () => { generation.current++; connection.current?.dispose(); connection.current = null; }, []);
  useEffect(() => {
    const incomingLink = () => {
      const code = invitationFromHash(window.location.hash);
      if (code && !connection.current) { setIncoming(code); setOpen(true); }
    };
    window.addEventListener("hashchange", incomingLink);
    return () => window.removeEventListener("hashchange", incomingLink);
  }, []);

  async function start(player: Side) {
    const token = ++generation.current;
    connection.current?.dispose(); connection.current = null;
    setSide(player); setGame(createGame()); setStatus("preparing"); setBusy(true);
    setError(""); setDetail(""); setOutgoing(""); setPending(false);
    if (player === "red") setIncoming("");
    try {
      if (typeof RTCPeerConnection === "undefined") throw new Error("This browser cannot make a direct connection. Use a current browser.");
      const peer = new FriendConnection(player, {
        onStatus(next, message) {
          if (token !== generation.current) return;
          setStatus(next); setDetail(message || "");
          if (next === "connected") clearInvitationHash();
        },
        onGame(next, awaiting) { if (token === generation.current) { setGame(next); setPending(awaiting); } }
      });
      connection.current = peer;
      const code = player === "red" ? await peer.createInvitation() : await peer.acceptInvitation(incoming);
      if (token === generation.current) setOutgoing(player === "red"
        ? invitationLink(code, new URL(import.meta.env.BASE_URL, window.location.href).href) : code);
    } catch (reason) {
      if (token === generation.current) {
        connection.current?.dispose();
        setStatus("failed"); setError(reason instanceof Error ? reason.message : "Could not prepare the connection.");
      }
    } finally { if (token === generation.current) setBusy(false); }
  }

  async function acceptReply() {
    const token = generation.current;
    setBusy(true); setError("");
    try { await connection.current?.acceptReply(incoming); }
    catch (reason) { if (token === generation.current) setError(reason instanceof Error ? reason.message : "Could not accept the reply."); }
    finally { if (token === generation.current) setBusy(false); }
  }

  function leave() {
    generation.current++; connection.current?.dispose(); connection.current = null;
    setSide(null); setStatus(null); setOutgoing(""); setIncoming(""); setError(""); setDetail(""); setBusy(false); setPending(false);
    clearInvitationHash();
  }

  function move(token: string) {
    try { return connection.current?.move(token) || false; }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The move could not be sent."); return false; }
  }

  return { open, setOpen, incoming, setIncoming, outgoing, side, game, status, detail, error, busy, pending,
    active: side !== null, start, acceptReply, leave, move };
}

export function friendStatusText(friend: ReturnType<typeof useFriendGame>): string {
  if (friend.status === "connected") {
    if (friend.game.gameOver) return `Game over. ${friend.game.winner === friend.side ? "You win." : "Your friend wins."}`;
    if (friend.pending) return "Waiting for move confirmation…";
    const turn = friend.game.turn === friend.side ? "Your turn." : "Your friend's turn.";
    return inCheck(friend.game, friend.game.turn) ? `${turn} Check.` : turn;
  }
  if (friend.status === "preparing") return "Preparing connection details…";
  if (friend.status === "waiting") return friend.side === "red" ? "Waiting for your friend's reply code." : "Send the reply code back to your friend.";
  if (friend.status === "connecting") return "Connecting directly to your friend…";
  if (friend.status === "interrupted") return "Connection interrupted. Play is paused.";
  return "Friend game paused.";
}

export default function FriendPanel({ friend }: { friend: ReturnType<typeof useFriendGame> }) {
  const [copyNote, setCopyNote] = useState("");
  useEffect(() => { setCopyNote(""); }, [friend.outgoing]);

  async function copy() {
    try { await navigator.clipboard.writeText(friend.outgoing); setCopyNote("Copied. Send it to your friend."); }
    catch { setCopyNote("Select and copy the complete text in the box."); }
  }
  async function share() {
    try {
      await navigator.share(friend.side === "red" ? { title: "Play Xiangqi with me", url: friend.outgoing } : { title: "Xiangqi connection reply", text: friend.outgoing });
    } catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setCopyNote("Use Copy to send the text through your messaging app."); }
  }

  if (!friend.open && !friend.active) return null;
  const waiting = friend.status === "waiting";
  return <section className="friend-panel" aria-label="Play a friend" data-friend-session={friend.active ? "active" : undefined}>
    <div className="friend-heading"><h2>Play a friend{friend.side ? ` · You play ${friend.side === "red" ? "Red" : "Black"}` : ""}</h2>
      <button aria-label={friend.active ? "Leave friend game" : "Close"} onClick={() => { friend.leave(); friend.setOpen(false); }}>{friend.active ? "Leave game" : "Close"}</button></div>
    {!friend.active ? <>
      <p>Start a new game with a friend. Send an invitation, then paste their reply here. Keep both game tabs open.</p>
      <button className="friend-primary" onClick={() => void friend.start("red")}>Create invitation</button>
      <details open={Boolean(friend.incoming)}><summary>Have an invitation? Join a friend</summary>
        <label htmlFor="friend-invitation">Invitation link</label><textarea id="friend-invitation" value={friend.incoming} onChange={(e) => friend.setIncoming(e.target.value)} maxLength={70000} rows={3} spellCheck={false} autoCapitalize="off" />
        <button className="friend-primary" disabled={!friend.incoming.trim()} onClick={() => void friend.start("black")}>Accept invitation</button>
      </details>
      <p className="friend-note">A friend game has its own board. Leaving returns you to your solo game.</p>
    </> : <>
      <p role="status">{friendStatusText(friend)}</p>
      {friend.status === "preparing" && <p>This may take a few seconds while your browser checks possible connection routes.</p>}
      {waiting && friend.outgoing && <>
        <p>{friend.side === "red" ? "1. Send this invitation link to your friend. Keep this original tab open." : "Send this reply code back. Your friend must paste it into their original waiting game."}</p>
        <label htmlFor="friend-share">{friend.side === "red" ? "Invitation link" : "Reply code"}</label><textarea id="friend-share" readOnly value={friend.outgoing} rows={3} spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
        <div className="friend-actions"><button onClick={() => void copy()}>{friend.side === "red" ? "Copy invitation" : "Copy reply"}</button>{typeof navigator.share === "function" && <button onClick={() => void share()}>Share</button>}</div>
        {copyNote && <p role="status">{copyNote}</p>}
        <p className="friend-note">This invitation expires after 30 minutes.</p>
        {friend.side === "red" && <>
          <label htmlFor="friend-reply">2. Paste your friend's reply code</label><textarea id="friend-reply" value={friend.incoming} onChange={(e) => friend.setIncoming(e.target.value)} maxLength={70000} rows={3} spellCheck={false} autoCapitalize="off" />
          <button className="friend-primary" disabled={friend.busy || !friend.incoming.trim()} onClick={() => void friend.acceptReply()}>Connect to friend</button>
        </>}
      </>}
      {friend.detail && <p>{friend.detail}</p>}
      {friend.error && <p role="alert">{friend.error}</p>}
      {friend.status === "failed" && <button onClick={friend.leave}>Start setup again</button>}
      <p className="friend-note">{friend.status === "connected"
        ? "Keep this tab open to stay connected. Save keeps a local copy."
        : "Keep this tab open. Refreshing or leaving ends the connection. Use Save to keep a local copy of the game. Some networks block direct connections."}</p>
    </>}
  </section>;
}
