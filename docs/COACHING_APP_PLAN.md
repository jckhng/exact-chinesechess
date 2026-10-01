# Xiangqi Coaching Companion Plan

Status: initial browser implementation available; curriculum and cross-platform work remain open.
Updated: 2026-10-01.

## North star

Build a visual thinking companion that helps a beginner become a capable Xiangqi player. The learner should gain the habit of looking ahead, recognizing what each move changes, and developing the board in their favor. Success means they can explain a plan and anticipate a credible reply, rather than merely repeat an engine move.

The companion is a separate browser app with its own teaching interface. The existing PWA offers a **Coaching** link that launches it. Coaching may later be adapted to PortMaster and Kindle when the browser experience has proved useful.

## What the learner should acquire

1. **Board awareness:** notice legal captures, undefended pieces, checks, cannon screens, blocked horse legs, and exposed generals.
2. **Development:** activate rooks, horses, cannons, and soldiers; improve useful lines and squares; coordinate defenders; avoid improving the opponent's access at the same time.
3. **Calculation:** ask what the opponent's strongest reply is, then find a viable continuation. Understand that a good reply after a mistake may still leave a bad position.
4. **Judgment:** compare plans by material, safety, activity, mobility, control of useful lanes and crossings, and initiative. Recognize when an engine preference is narrow or uncertain.
5. **Transfer:** apply a learned pattern in a new position without being shown the answer first.

## Core learning loop

1. Show a position and invite the learner to inspect threats and choose a move. Offer progressive hints: area of attention, relevant geometry, then a candidate move.
2. After the move, compare it with a full-strength engine recommendation from the *same starting position*. Give a concise verdict only when analysis supports one.
3. Show **what changed on the board**: newly threatened or undefended pieces, opened or blocked lanes, changes in access and mobility, and checks or forcing moves.
4. Ask the learner to predict the opponent's strongest reply before revealing it. Allow them to try their own continuation.
5. Step through the engine line and the learner's line. Show where the outcome diverges and why a later best move may not repair an earlier concession.
6. End with one reusable lesson and a short transfer position that tests the same idea in a different setting.

The learner can request an answer immediately, but the default flow preserves a chance to think first. Feedback explains a causal chain, not just a move grade or score.

## Simple and Advanced experience

**Simple** is the default and presents one teaching card at a time beside the board. The card leads the learner through four steps: notice a capture route, choose a Red move, predict Black's reply, and inspect the consequence. The board displays the hint relevant to the current step. The learner can skip the opening question, skip a scenario, reveal the reply without predicting, or leave the explanation and continue the game. A returning learner's choice of Simple or Advanced is remembered locally.

**Advanced** exposes the board toggles, training focus, scenario picker, full variation list, and progress. Switching views preserves the current game and analysis. A **practice scenario** is a prepared, legal board position with one prompt, such as spotting a threat or developing a piece; it is not a separate rules mode. Scenarios live in Advanced so they do not compete with the Simple step-by-step flow.

On a narrow screen, the current teaching card appears before the board. After a move or step change, the card comes into view so the next instruction is visible. The first complete coaching release should keep the Simple path usable without opening Advanced.

## Required coaching capabilities

### Honest engine comparison

- Separate coaching analysis from the existing difficulty-limited playing engine behavior. Coaching uses full strength and records search depth, score, best move, and continuation.
- Analyse the engine-preferred move and the learner's move under comparable search conditions. Retain the opponent's best reply and the learner's best continuation for each line.
- Treat mate scores separately from centipawn scores. Normalize score perspective so every comparison is from the learner's side.
- Use broad, calibrated verdicts such as **sound**, **inaccuracy**, or **serious mistake** only when the score gap is stable enough. Say **engine preference is unclear** when it is not. A finite engine search is a recommendation, not proof of an optimal move.
- Keep every analysed position and continuation tied to a position identifier. Cancel or discard stale analysis after a new move, undo, load, or branch change.

### Multi-step, explorable explanations

- Support at least the played move, best opponent reply, and best learner continuation, plus the corresponding recommended branch. Longer lines appear when needed to explain the consequence.
- Let the learner step backward and forward, switch branches, and inspect any step without changing the real game.
- Anchor each explanation to a specific step and board fact. Example: **Moving the horse stops defending the cannon. The opponent can capture it next. Your best reply improves your rook, but the cannon remains lost.**
- Validate engine moves against Xiangqi rules before showing a line. If a line is incomplete or invalid, show the valid portion and withhold unsupported claims.

### Strong visual guidance

| Guidance | Board behavior | Meaning |
| --- | --- | --- |
| Immediate threat | Mark the target and attacking piece; reveal the capture path on selection. | The opponent could legally capture this piece on the next move. |
| Undefended target | Add a distinct marker to an attacked piece with no adequate recapture or protection. | The threat may cost material; being attacked alone does not establish that. |
| Lane change | Draw the affected rook or cannon line, its blocker or screen, and its target. Compare before and after the move. | A file or rank opened, closed, or changed ownership. A cannon needs a screen to capture. |
| Candidate move | Draw a clear from-to arrow. | Engine recommendation or learner variation, explicitly labelled. |
| Future consequence | Mark the relevant step in the variation timeline. | The danger appears after a reply or sequence, rather than immediately. |
| Development change | Highlight newly useful squares, access routes, and coordinated pieces. | The move improves or harms the position's future options. |

Show only the hints relevant to the current lesson; provide controls to reveal more. Use shapes, strokes, and labels as well as color so the board works in grayscale and for color-blind users. Every visual claim needs an equivalent short text description. Support touch and keyboard interaction.

### Teaching positional development

The coach should explain how a move changes the battlefield, including cases without an immediate tactic. Its first positional concepts are rook and cannon access, horse mobility and leg blocks, soldier progress across the river, piece coordination, general safety, and control of useful central or palace-facing lines.

These are context-dependent facts, not fixed bonuses. An open lane can also help the opponent; a defended piece can still be lost in an unfavorable exchange. The explanation should connect a positional claim to concrete squares, pieces, and plausible future moves. When the engine prefers a move for a reason the app cannot establish, show the line and state that the positional reason is unresolved.

### Beginner progression

- Start with one visible question at a time: **What is threatened?**, **What changed?**, **What can the opponent do?**, **How should I improve this position?**
- Offer three levels of hint before revealing an answer.
- Revisit missed motifs in fresh positions, moving from one-move threats to two- and three-move calculation, then to development and planning.
- Track local progress by concepts attempted and understood, not only by engine move matching. Permit a learner to explain a different sound move.

## App and data design

- Create a separate coaching app under a dedicated path such as `coach/`, with its own board layout, lesson panel, variation timeline, local progress, and analysis worker. The existing PWA links to it using its configured base path.
- Keep the browser app functional offline after installation. Give coaching its own assets and service-worker scope; the current PWA service worker must not intercept or cache coaching routes indiscriminately. Preserve the cross-origin isolation needed by the bundled threaded Fairy-Stockfish build.
- Extract a tested Xiangqi rules and replay module from `pwa/src/App.tsx` for both browser apps. Keep the coaching interface independent of the current play screen and its state model.
- Define a versioned, serializable coaching record: starting position, learner move, recommended and played variations, normalized evaluations, search metadata, detected board events, explanation steps, and overlay geometry.
- Generate first-release explanations from verified board events and searched continuations. Any future free-form explanation system must be checked against those facts before display.
- Start coaching with a new training game or lesson. Add an explicit **Analyse this game** handoff from the play PWA after the independent flow works; validate imported history rather than reading the play app's storage format directly.
- Keep engine-backed verdicts unavailable when Fairy-Stockfish cannot run. Rule-derived board hints may still work, clearly identified as such.

## Delivery sequence and completion gates

### Stage 1 — Separate app and analysis foundation

Build the coaching entry point, app shell, shared rules/replay module, full-strength engine analysis request, and structured result format. Verify that play and coaching launch independently at the configured base path, the browser engine works in the deployed environment, and a position's best line can be replayed legally.

### Stage 2 — Tactical teaching loop

Implement move comparison, threatened-piece and lane overlays, progressive hints, and concise explanations grounded in board changes. Test curated positions covering rook lines, cannon screens, horse legs, checks, defenders, and exchanges. A learner must be able to point to the evidence for each displayed claim.

### Stage 3 — Multi-step calculation

Implement opponent-reply prediction, learner continuation, two-branch playback, and explanations tied to later steps. Include scenarios where the learner's best follow-up still leaves a disadvantage. Verify that exploration never mutates the played game and that score comparisons stay from the same side's perspective.

### Stage 4 — Positional development and progression

Teach activity, access, coordination, and battlefield control through concrete before/after visuals and transfer positions. Add local concept progress and revisit missed motifs. Review the explanations with beginning Xiangqi players: they should be able to predict a plausible reply and state why a plan improves or damages their position.

### Stage 5 — Play-app handoff and platform assessment

Add **Analyse this game** to the PWA. Assess PortMaster and Kindle using the proven coaching record and lesson patterns, adapting analysis budgets and visuals to each device.

The first complete coaching release includes Stages 1–4. Each stage can be built and evaluated independently.

## Quality bar

- Curated tactical and positional examples produce legal, reproducible lines and accurate overlays.
- The coach distinguishes immediate attack, genuine material danger, and a threat several moves ahead.
- Explanations identify a visible cause and consequence, or explicitly acknowledge uncertainty.
- Coaching stays responsive on a representative mobile browser; analysis has a bounded budget and can be interrupted.
- A beginner can use hints to find a plan, predict a reply, and explain the outcome without relying on a raw evaluation number.

## Implementation checkpoint (2026-10-01)

The browser coaching app, PWA launch link, shared rules module, full-strength
analysis worker, grounded tactical and activity hints, active threat scan,
reply prediction, variation playback, local progress, a Simple guided view with
skippable steps, an Advanced view for tools and scenarios, and a scoped offline
shell are implemented. The staged plan above remains the reference for further
teaching depth. Broader motif-specific exercises, deeper positional explanations,
play-app game handoff, and native platform adaptations remain to be developed.

## Repository starting point

- `pwa/src/App.tsx`: rules, board markers, game history, and review navigation currently live together.
- `pwa/src/fairyStockfishEngine.ts` and `pwa/public/engine/fairy-stockfish/engine-worker.js`: current browser engine bridge returns only `bestmove` and applies playing difficulty.
- `pwa/public/sw.js`: current service worker handles requests beneath the PWA scope and needs deliberate routing when coaching is deployed beside it.
- `portmaster/src/engine.c` and `pikafish_uci.c`: native UCI bridges provide later platform starting points.
