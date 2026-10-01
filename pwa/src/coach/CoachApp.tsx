import { useEffect, useMemo, useRef, useState } from "react";
import { moveToUci } from "../fairyStockfishEngine";
import type { Game, Move, Side } from "../types";
import { applyMove, chooseAiMove, createGame, generateMoves, isLegalMove, pieceAt, undoOne } from "../xiangqi";
import { CoachEngine, type EngineLine, type EngineStatus } from "./engine";
import { exerciseGame, exercises, type Exercise } from "./exercises";
import { legalThreats, makeReport, moveLabel, openLanes, pieceAsset, pieceNames, replayLine, square, type BoardHint, type CoachReport, type Concept } from "./logic";

const SAVE_KEY = "exact-chinesechess-coach-game-v1";
const PROGRESS_KEY = "exact-chinesechess-coach-progress-v1";
const VIEW_KEY = "exact-chinesechess-coach-view-v1";
const BASE = import.meta.env.BASE_URL;
type Phase = "turn" | "analyzing" | "predict" | "review" | "gameover";
type Focus = "awareness" | "calculation" | "development";
type Experience = "simple" | "advanced";
type GuidedStep = "notice" | "move";
type Progress = Record<Concept, number>;
const emptyProgress: Progress = { threat: 0, lane: 0, development: 0, calculation: 0 };

function loadGame(): Game {
  try {
    const saved = JSON.parse(localStorage.getItem(SAVE_KEY) || "null") as { history?: string[] } | null;
    if (!saved || !Array.isArray(saved.history)) return createGame();
    let game = createGame();
    for (const token of saved.history.slice(0, 200)) {
      if (typeof token !== "string") return createGame();
      const match = /^([a-i])(10|[1-9])([a-i])(10|[1-9])$/.exec(token);
      if (!match) return createGame();
      const fromRow = 10 - Number(match[2]), fromCol = "abcdefghi".indexOf(match[1]);
      const id = pieceAt(game, fromRow, fromCol);
      const result = applyMove(game, id, 10 - Number(match[4]), "abcdefghi".indexOf(match[3]));
      if (!result) return createGame();
      game = result.game;
    }
    return game.turn === "red" || game.gameOver ? game : undoOne(game);
  } catch { return createGame(); }
}

function loadProgress(): Progress {
  try {
    const value = JSON.parse(localStorage.getItem(PROGRESS_KEY) || "null") as Partial<Progress> | null;
    if (!value) return emptyProgress;
    return {
      threat: Number(value.threat) || 0, lane: Number(value.lane) || 0,
      development: Number(value.development) || 0, calculation: Number(value.calculation) || 0
    };
  } catch { return emptyProgress; }
}

function loadExperience(): Experience {
  try { return localStorage.getItem(VIEW_KEY) === "advanced" ? "advanced" : "simple"; }
  catch { return "simple"; }
}

function point(row: number, col: number) { return { x: 30 + col * 60, y: 30 + row * 60 }; }
function pct(row: number, col: number) { return { left: `${point(row, col).x / 540 * 100}%`, top: `${point(row, col).y / 600 * 100}%` }; }
function sideName(side: Side) { return side === "red" ? "Red" : "Black"; }

export default function CoachApp() {
  const [game, setGame] = useState<Game>(loadGame);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [phase, setPhase] = useState<Phase>(game.gameOver ? "gameover" : "turn");
  const [focus, setFocus] = useState<Focus>("awareness");
  const [experience, setExperience] = useState<Experience>(loadExperience);
  const [guidedStep, setGuidedStep] = useState<GuidedStep>("notice");
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [selected, setSelected] = useState(-1);
  const [report, setReport] = useState<CoachReport | null>(null);
  const [prediction, setPrediction] = useState<Move | null>(null);
  const [branch, setBranch] = useState<"played" | "preferred">("played");
  const [step, setStep] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [hintLine, setHintLine] = useState<EngineLine | null>(null);
  const [showThreats, setShowThreats] = useState(false);
  const [showLanes, setShowLanes] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [scanMode, setScanMode] = useState(false);
  const [scanFeedback, setScanFeedback] = useState("");
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("loading");
  const [engineReason, setEngineReason] = useState("");
  const engineRef = useRef<CoachEngine | null>(null);
  const simpleCardRef = useRef<HTMLElement | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const engine = new CoachEngine((status, reason) => { setEngineStatus(status); setEngineReason(reason || ""); });
    engineRef.current = engine;
    engine.init();
    return () => { generation.current++; engine.dispose(); engineRef.current = null; };
  }, []);

  useEffect(() => {
    if (game.turn === "red" || game.gameOver)
      localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 1, history: game.history.map(moveToUci) }));
  }, [game]);
  useEffect(() => { localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress)); }, [progress]);
  useEffect(() => { localStorage.setItem(VIEW_KEY, experience); }, [experience]);
  useEffect(() => {
    if (experience !== "simple" || phase === "analyzing" || (phase === "turn" && guidedStep === "notice" && game.history.length === 0) || !window.matchMedia("(max-width: 950px)").matches) return;
    const frame = window.requestAnimationFrame(() => simpleCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [experience, phase, guidedStep, branch, step]);

  const lineSteps = report ? branch === "played" ? report.playedSteps : report.preferredSteps : [];
  const displayGame = phase === "review" && lineSteps[step] ? lineSteps[step].game : game;
  const selectableSide: Side | null = phase === "turn" && game.turn === "red" && !game.gameOver ? "red" : phase === "predict" ? "black" : null;
  const legalTargets = useMemo(() => {
    if (selected < 0 || !selectableSide || game.pieces[selected].side !== selectableSide) return new Set<string>();
    const copy = { ...game, turn: selectableSide };
    const targets = new Set<string>();
    for (let row = 0; row < 10; row++) for (let col = 0; col < 9; col++)
      if (isLegalMove(copy, selected, row, col)) targets.add(`${row},${col}`);
    return targets;
  }, [game, selected, selectableSide]);

  const visibleThreats = useMemo(() => showThreats ? legalThreats(displayGame, "black").filter((threat) => displayGame.pieces[threat.target].side === "red").slice(0, 6) : [], [displayGame, showThreats]);
  const lanes = useMemo(() => {
    if (!showLanes) return [];
    const piece = selected >= 0 ? displayGame.pieces[selected] : null;
    const laneFocus = piece && (piece.type === "rook" || piece.type === "cannon") ? selected : -1;
    return openLanes(displayGame, displayGame.turn, laneFocus);
  }, [displayGame, showLanes, selected]);
  const boardHints: BoardHint[] = [
    ...visibleThreats.map((threat) => {
      const attacker = displayGame.pieces[threat.attacker], target = displayGame.pieces[threat.target];
      return { kind: "threat" as const, text: `${sideName(attacker.side)} ${pieceNames[attacker.type]} can capture ${sideName(target.side)} ${pieceNames[target.type]}.`,
        from: { row: attacker.row, col: attacker.col }, to: { row: target.row, col: target.col }, targetId: target.id, danger: !threat.defended };
    }),
    ...lanes,
    ...(phase === "review" && lineSteps[step]?.move ? [{ kind: "move" as const, text: lineSteps[step].label, from: { row: lineSteps[step].move.fromRow, col: lineSteps[step].move.fromCol }, to: { row: lineSteps[step].move.toRow, col: lineSteps[step].move.toCol } }] : []),
    ...(phase === "turn" && hintLevel >= 3 && hintLine?.pv[0] ? (() => {
      const best = replayLine(game, [hintLine.pv[0]])[1]?.move;
      return best ? [{ kind: "move" as const, text: "Engine candidate", from: { row: best.fromRow, col: best.fromCol }, to: { row: best.toRow, col: best.toCol } }] : [];
    })() : []),
    ...(phase === "review" && report && step === 1 && branch === "played" ? report.insights.flatMap((insight) => insight.hint ? [insight.hint] : []) : [])
  ];

  async function requestHint() {
    if (phase !== "turn") return;
    const level = Math.min(3, hintLevel + 1);
    setHintLevel(level);
    if (level === 1) setShowThreats(true);
    if (level === 2) setShowLanes(true);
    if (level === 3 && engineRef.current?.isReady()) {
      const token = ++generation.current;
      const result = await engineRef.current.analyze(game.history, 650);
      if (token === generation.current) setHintLine(result);
    }
  }

  async function makeHumanMove(before: Game, id: number, row: number, col: number) {
    const result = applyMove(before, id, row, col);
    if (!result) return;
    generation.current++;
    engineRef.current?.cancel();
    setGame(result.game);
    setSelected(-1);
    setPrediction(null);
    setHintLine(null);
    setHintLevel(0);
    setShowThreats(false);
    setShowLanes(false);
    setScanMode(false);
    setScanFeedback("");
    setAcknowledged(false);
    setPhase(result.game.gameOver ? "gameover" : "analyzing");
    const token = generation.current;
    const engine = engineRef.current;
    const preferred = await engine?.analyze(before.history, 950) || null;
    if (token !== generation.current) return;
    const played = await engine?.analyze(result.game.history, 950) || null;
    if (token !== generation.current) return;
    const next = makeReport(before, result.game, result.move, preferred, played);
    setReport(next);
    setBranch("played");
    setStep(1);
    if (!result.game.gameOver) setPhase(preferred && played && next.playedSteps.length > 2 ? "predict" : "review");
  }

  function answerScan(id: number | null) {
    const threats = legalThreats(game, "black").filter((threat) => game.pieces[threat.target].side === "red");
    const correct = id === null ? threats.length === 0 : threats.some((threat) => threat.target === id);
    setScanMode(false);
    if (experience === "simple") setGuidedStep("move");
    setScanFeedback(correct ? "Correct. You checked the black capture routes before committing to a move." : threats.length ? `Look again: Black has a capture route to your ${pieceNames[game.pieces[threats[0].target].type]} on ${square(game.pieces[threats[0].target].row, game.pieces[threats[0].target].col)}.` : "No red piece has a legal black capture route from this position.");
    if (correct) setProgress((old) => ({ ...old, threat: old.threat + 1 }));
    else setShowThreats(true);
  }

  function tap(row: number, col: number) {
    if (!selectableSide) return;
    const id = pieceAt(game, row, col);
    if (phase === "turn" && (scanMode || (experience === "simple" && guidedStep === "notice"))) {
      if (id >= 0 && game.pieces[id].side === "red") answerScan(id);
      return;
    }
    if (selected >= 0 && legalTargets.has(`${row},${col}`)) {
      if (phase === "turn") { void makeHumanMove(game, selected, row, col); return; }
      const before = { ...game, turn: "black" as const };
      const result = applyMove(before, selected, row, col);
      if (result) setPrediction(result.move);
      setSelected(-1);
      return;
    }
    setSelected(id >= 0 && game.pieces[id].side === selectableSide ? id : -1);
  }

  function revealReply() {
    if (!report) return;
    if (prediction && report.playedSteps[2]?.move && moveToUci(prediction) === moveToUci(report.playedSteps[2].move))
      setProgress((old) => ({ ...old, calculation: old.calculation + 1 }));
    setPhase("review");
    setBranch("played");
    setStep(Math.min(2, report.playedSteps.length - 1));
    setSelected(-1);
  }

  function continuePractice() {
    if (!report) return;
    let next: Game | null = report.playedSteps[2]?.game || null;
    if (!next && !game.gameOver) {
      const fallback = chooseAiMove(game, "medium");
      next = fallback ? applyMove(game, fallback.moveId, fallback.toRow, fallback.toCol)?.game || null : null;
    }
    if (next) setGame(next);
    setReport(null);
    setPrediction(null);
    setSelected(-1);
    setHintLevel(0);
    setGuidedStep("notice");
    setScanMode(false);
    setScanFeedback("");
    setShowThreats(false);
    setShowLanes(false);
    setPhase(next?.gameOver ? "gameover" : "turn");
  }

  function startExercise(exercise: Exercise) {
    generation.current++;
    engineRef.current?.cancel();
    setGame(exerciseGame(exercise));
    setExerciseId(exercise.id);
    setFocus(exercise.focus);
    setGuidedStep("notice");
    setPhase("turn");
    setReport(null);
    setPrediction(null);
    setSelected(-1);
    setScanMode(false);
    setScanFeedback("");
    setHintLine(null);
    setHintLevel(0);
    setShowThreats(false);
    setShowLanes(false);
  }

  function transferExercise() {
    const matches = exercises.filter((exercise) => exercise.focus === focus);
    const current = matches.findIndex((exercise) => exercise.id === exerciseId);
    startExercise(matches[current < 0 ? Math.min(1, matches.length - 1) : (current + 1) % matches.length] || exercises[0]);
  }

  function newSession() {
    setExerciseId(null);
    generation.current++;
    engineRef.current?.cancel();
    setGame(createGame());
    setFocus("awareness");
    setGuidedStep("notice");
    setHintLine(null);
    setHintLevel(0);
    setShowThreats(false);
    setShowLanes(false);
    setPhase("turn");
    setReport(null);
    setPrediction(null);
    setSelected(-1);
    setScanMode(false);
    setScanFeedback("");
    setHintLine(null);
    setHintLevel(0);
    setShowThreats(false);
    setShowLanes(false);
  }

  function acknowledge() {
    if (acknowledged || !report) return;
    setAcknowledged(true);
    const concepts = [...new Set(report.insights.map((insight) => insight.concept))];
    setProgress((old) => {
      const next = { ...old };
      concepts.forEach((concept) => { next[concept] += 1; });
      return next;
    });
  }

  function advanceGuidedReview() {
    if (!report) return;
    if (step < Math.min(3, lineSteps.length - 1)) { setStep(step + 1); return; }
    if (branch === "played" && report.preferredSteps.length > 1 && report.preferred?.bestMove !== moveToUci(report.played)) {
      setBranch("preferred");
      setStep(1);
      return;
    }
    continuePractice();
  }

  const guidedReviewText = !report ? "" : branch === "preferred"
    ? step === 1 ? "Compare this first move with yours. Which piece or lane is better placed?" : "Follow the reply and notice how the position develops."
    : step === 2 ? report.insights.find((insight) => insight.text.startsWith("In the engine line"))?.text || "This is Black's strongest reply found by the engine."
      : step >= 3 ? report.insights.find((insight) => insight.text.startsWith("Your best continuation"))?.text || "This is your best continuation found by the engine. Compare the resulting position with the other line."
        : report.insights[0]?.text || report.assessment;

  const focusPrompt = focus === "awareness" ? "Before moving, which piece or line is under pressure?"
    : focus === "calculation" ? "If you move here, what is Black's strongest reply?"
      : "Which move improves your pieces' useful squares and access?";
  const reply = report?.playedSteps[2]?.move || null;
  const predictionResult = prediction && reply ? moveToUci(prediction) === moveToUci(reply) : null;
  const guidedReviewDone = Boolean(report && step >= Math.min(3, lineSteps.length - 1) &&
    (branch === "preferred" || report.preferredSteps.length <= 1 || report.preferred?.bestMove === moveToUci(report.played)));

  return (
    <main className={`coach-app ${experience}`}>
      <header className="coach-header">
        <div><p className="eyebrow">Exact Chinese Chess</p><h1>Coaching companion</h1><p className="subtitle">See the board. Think ahead. Shape the position.</p></div>
        <nav aria-label="App navigation"><a href={BASE}>Return to play</a><button onClick={newSession}>New session</button></nav>
      </header>
      <div className="experience-tabs" role="group" aria-label="Coaching view">
        <button className={experience === "simple" ? "active" : ""} onClick={() => { setExperience("simple"); setSelected(-1); setScanMode(false); }} aria-pressed={experience === "simple"}>Simple <span>One step at a time</span></button>
        <button className={experience === "advanced" ? "active" : ""} onClick={() => { setExperience("advanced"); setSelected(-1); setScanMode(false); }} aria-pressed={experience === "advanced"}>Advanced <span>All tools and scenarios</span></button>
      </div>
      <div className="coach-layout">
        <section className="board-column" aria-label="Training board">
          <div className="board-topline"><span>{phase === "review" ? `${branch === "played" ? "Your move" : "Engine line"} · step ${step}/${lineSteps.length - 1}` : `${sideName(displayGame.turn)} to move`}</span><span>{game.history.length} moves in session</span></div>
          <div className="coach-board" role="grid" aria-label="Xiangqi coaching board">
            <img className="coach-board-art" src={`${BASE}assets/xiangqi/board.png`} alt="" draggable={false} />
            <svg className="coach-lines" viewBox="0 0 540 600" preserveAspectRatio="none" aria-hidden="true">
              <defs><marker id="hint-arrow-threat" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="#b94c3b" /></marker><marker id="hint-arrow-lane" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="#186f69" /></marker><marker id="hint-arrow-move" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="#223d88" /></marker><marker id="hint-arrow-prediction" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto"><path d="M0 0 L9 4.5 L0 9 Z" fill="#6453a4" /></marker></defs>
              {boardHints.map((hint, index) => {
                const from = point(hint.from.row, hint.from.col), to = point(hint.to.row, hint.to.col);
                return <line key={`${hint.kind}-${index}`} className={`hint-line ${hint.kind}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} markerEnd={`url(#hint-arrow-${hint.kind === "activity" ? "lane" : hint.kind})`} />;
              })}
              {prediction && phase === "predict" && <line className="hint-line prediction" x1={point(prediction.fromRow, prediction.fromCol).x} y1={point(prediction.fromRow, prediction.fromCol).y} x2={point(prediction.toRow, prediction.toCol).x} y2={point(prediction.toRow, prediction.toCol).y} markerEnd="url(#hint-arrow-prediction)" />}
            </svg>
            {boardHints.filter((hint) => hint.kind === "threat").map((hint, index) => <span key={`threat-${index}`} className={`coach-ring threatened ${hint.danger ? "unrecapturable" : ""}`} style={pct(hint.to.row, hint.to.col)} aria-hidden="true" />)}
            {selected >= 0 && phase !== "review" && <span className="coach-ring selected" style={pct(game.pieces[selected].row, game.pieces[selected].col)} aria-hidden="true" />}
            {[...legalTargets].map((target) => { const [row, col] = target.split(",").map(Number); return <span key={target} className="coach-ring target" style={pct(row, col)} aria-hidden="true" />; })}
            {displayGame.pieces.filter((piece) => !piece.dead).map((piece) => <img key={piece.id} className="coach-piece" src={pieceAsset(piece)} alt="" style={pct(piece.row, piece.col)} draggable={false} />)}
            {Array.from({ length: 90 }, (_, i) => { const row = Math.floor(i / 9), col = i % 9, id = pieceAt(displayGame, row, col), piece = id >= 0 ? displayGame.pieces[id] : null;
              return <button key={i} className="coach-cell" style={pct(row, col)} onClick={() => tap(row, col)} disabled={!selectableSide} aria-label={`${square(row, col)}: ${piece ? `${sideName(piece.side)} ${pieceNames[piece.type]}` : "empty"}${legalTargets.has(`${row},${col}`) ? ", legal destination" : ""}`} />;
            })}
          </div>
          <div className="board-tools">
            <button className={showThreats ? "active" : ""} onClick={() => setShowThreats(!showThreats)} aria-pressed={showThreats}>Threats</button>
            <button className={showLanes ? "active" : ""} onClick={() => setShowLanes(!showLanes)} aria-pressed={showLanes}>Lanes</button>
            <p>{showThreats ? "Rings mark Black capture routes against your pieces. Double rings mean no immediate legal recapture." : showLanes ? "Lines show legal rook and cannon movement or capture routes." : "Turn on a guide to inspect the position."}</p>
          </div>
        </section>
        <section className="lesson-column" aria-label="Coaching lesson">
          <section className="lesson-card simple-card" ref={simpleCardRef} aria-live="polite">
            <p className="eyebrow">{phase === "turn" ? guidedStep === "notice" ? "Step 1 · Notice" : "Step 2 · Choose" : phase === "analyzing" ? "Checking your move" : phase === "predict" ? "Step 3 · Think ahead" : phase === "review" ? "Step 4 · Learn" : "Session complete"}</p>
            {phase === "turn" && guidedStep === "notice" && <>
              <h2>What can Black capture?</h2>
              <p>Look at the board. Tap a Red piece Black can capture, or choose “No capture route.”</p>
              <div className="action-row"><button className="main-action" onClick={() => answerScan(null)}>No capture route</button><button onClick={() => setShowThreats(true)}>Show routes</button><button className="skip-action" onClick={() => { setGuidedStep("move"); setShowThreats(false); }}>Skip question</button></div>
            </>}
            {phase === "turn" && guidedStep === "move" && <>
              <h2>Choose your move</h2><p>{focusPrompt} Tap a Red piece, then its destination.</p>
              {scanFeedback && <p className="scan-feedback">{scanFeedback}</p>}
              <div className="action-row"><button onClick={() => void requestHint()}>Hint {hintLevel ? `${hintLevel}/3` : ""}</button><button className="skip-action" onClick={transferExercise}>Skip scenario</button></div>
              {hintLevel > 0 && <p className="hint-feedback">{hintLevel === 1 ? "Threat routes are marked on the board." : hintLevel === 2 ? "Rook and cannon routes are marked too." : hintLine ? "The engine's candidate move is marked." : "An engine candidate is unavailable."}</p>}
            </>}
            {phase === "analyzing" && <><h2>Checking your move…</h2><p>The coach is checking your move and possible alternatives.</p></>}
            {phase === "predict" && <><h2>What might Black play?</h2><p>Tap a Black piece, then its destination. You can also reveal the reply now.</p>{prediction && <p className="prediction-note">Your prediction: {moveLabel({ ...game, turn: "black" }, prediction)}</p>}<button className="main-action" onClick={revealReply}>{prediction ? "Check prediction" : "Skip prediction · show reply"}</button></>}
            {phase === "review" && report && <>
              <h2>{branch === "preferred" ? "Engine recommendation" : step === 2 ? "Black's reply" : step >= 3 ? "Your best reply" : report.verdict}</h2>
              <p className="verdict-label">{report.verdict}</p><p>{lineSteps[step]?.label || report.assessment}</p>
              {branch === "played" && step <= 2 && <p>{report.assessment}</p>}
              <p className="guided-insight">{guidedReviewText}</p>
              {prediction && branch === "played" && step === 2 && <p className="prediction-note">{predictionResult ? "You found the engine's reply." : `Your prediction was ${moveLabel(game, prediction)}. The engine chose ${reply ? moveLabel(game, reply) : "another reply"}.`}</p>}
              <div className="action-row"><button className="main-action" onClick={advanceGuidedReview}>{guidedReviewDone ? "Continue game" : "Next step"}</button>{!guidedReviewDone && <button className="skip-action" onClick={continuePractice}>Skip explanation</button>}</div>
            </>}
            {phase === "gameover" && <><h2>{sideName(game.winner)} wins</h2><button className="main-action" onClick={newSession}>Start again</button></>}
          </section>
          <section className="exercise-picker" aria-label="Practice scenarios"><p className="eyebrow">Practice scenarios</p><p>Each scenario starts from a prepared board position and asks you to practice one idea.</p><div>{exercises.map((exercise) => <button key={exercise.id} className={exerciseId === exercise.id ? "active" : ""} onClick={() => startExercise(exercise)} aria-pressed={exerciseId === exercise.id}>{exercise.title}</button>)}</div><p>{exerciseId ? exercises.find((exercise) => exercise.id === exerciseId)?.prompt : "Choose a scenario or continue your current game."}</p></section>
          <div className="focus-tabs" role="group" aria-label="Training focus">
            {(["awareness", "calculation", "development"] as Focus[]).map((name) => <button key={name} className={focus === name ? "active" : ""} onClick={() => setFocus(name)} aria-pressed={focus === name}>{name === "awareness" ? "See threats" : name === "calculation" ? "Think ahead" : "Develop"}</button>)}
          </div>
          <section className="lesson-card primary">
            <p className="eyebrow">{phase === "turn" ? "Your turn" : phase === "analyzing" ? "Analyzing" : phase === "predict" ? "Before the reply" : phase === "review" ? "Explore the consequence" : "Session complete"}</p>
            <h2>{phase === "turn" ? focusPrompt : phase === "analyzing" ? "Checking both continuations…" : phase === "predict" ? "What will Black play?" : phase === "review" ? report?.verdict || "Review" : `${sideName(game.winner)} wins`}</h2>
            {phase === "turn" && <><p>Select a red piece and a destination. Inspect the board before asking for a hint.</p><div className="action-row"><button onClick={() => void requestHint()}>Hint {hintLevel ? `${hintLevel}/3` : ""}</button><span>{hintLevel === 1 ? "Look at the threatened pieces." : hintLevel === 2 ? "Inspect open routes for rooks and cannons." : hintLevel === 3 ? hintLine ? "The candidate arrow is on the board." : "Engine candidate unavailable." : "Hints reveal one step at a time."}</span></div></>}
            {phase === "analyzing" && <p>The coach is checking the move you made and the engine's preferred plan from the same position.</p>}
            {phase === "predict" && <><p>Black has a reply in the analysed line. Play a black move on the board to record your prediction, then reveal the line.</p>{prediction && <p className="prediction-note">Prediction: {moveLabel({ ...game, turn: "black" }, prediction)}</p>}<button className="main-action" onClick={revealReply}>Reveal strongest reply</button></>}
            {phase === "review" && report && <><p>{report.assessment}</p>{prediction && <p className="prediction-note">{predictionResult ? "You found the engine's reply." : `Your prediction was ${moveLabel(game, prediction)}. The engine line begins with ${reply ? moveLabel(game, reply) : "an unavailable reply"}.`}</p>}<div className="action-row"><button className="main-action" onClick={continuePractice}>Continue this game</button><button onClick={transferExercise}>Transfer position</button><button onClick={acknowledge} disabled={acknowledged}>{acknowledged ? "Added to progress" : "I understand"}</button></div></>}
            {phase === "gameover" && <button className="main-action" onClick={newSession}>Start again</button>}
          </section>
          {phase === "turn" && focus === "awareness" && <section className="lesson-card scan-card"><p className="eyebrow">Practice a threat scan</p><h2>Could Black capture one of your pieces?</h2><p>Consider Black's legal captures from the current board, then make a call.</p><div className="action-row"><button onClick={() => { setScanMode(true); setSelected(-1); }}>Tap a threatened piece</button><button onClick={() => answerScan(null)}>No capture route</button></div>{scanMode && <p className="prediction-note">Tap one of your pieces on the board.</p>}{scanFeedback && <p className="scan-feedback">{scanFeedback}</p>}</section>}
          {report && (phase === "review" || phase === "predict" || phase === "gameover") && <section className="lesson-card"><p className="eyebrow">What changed</p><ul className="insight-list">{report.insights.slice(0, 4).map((insight, index) => <li key={`${insight.concept}-${index}`}><span className="concept-tag">{insight.concept}</span>{insight.text}</li>)}</ul></section>}
          {report && phase === "review" && <section className="lesson-card"><p className="eyebrow">Look ahead</p><h2>Compare the lines</h2><div className="branch-tabs"><button className={branch === "played" ? "active" : ""} onClick={() => { setBranch("played"); setStep(0); }}>Your move</button><button className={branch === "preferred" ? "active" : ""} disabled={!report.preferredSteps.length} onClick={() => { setBranch("preferred"); setStep(0); }}>Engine line</button></div><div className="step-controls"><button onClick={() => setStep(Math.max(0, step - 1))} disabled={step === 0} aria-label="Previous step">←</button><span>{lineSteps[step]?.label}</span><button onClick={() => setStep(Math.min(lineSteps.length - 1, step + 1))} disabled={step >= lineSteps.length - 1} aria-label="Next step">→</button></div><ol className="variation-list">{lineSteps.slice(1).map((entry, index) => <li key={index}><button className={step === index + 1 ? "active" : ""} onClick={() => setStep(index + 1)}>{entry.label}</button></li>)}</ol></section>}
          <section className="lesson-card progress-card"><p className="eyebrow">Your practice</p><h2>Patterns noticed</h2><div className="progress-grid">{Object.entries(progress).map(([concept, count]) => <div key={concept}><strong>{count}</strong><span>{concept}</span></div>)}</div><p>Each reviewed position is another chance to spot a pattern without a hint.</p></section>
          <p className="engine-note">Engine: {engineStatus === "ready" ? "Fairy-Stockfish analysis ready" : engineStatus === "loading" ? "loading" : `unavailable — ${engineReason}`}. {engineStatus !== "ready" ? "Rule-based guides remain available." : "Engine recommendations are estimates from a bounded search."}</p>
        </section>
      </div>
    </main>
  );
}
