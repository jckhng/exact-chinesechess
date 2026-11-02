# Exact Chinese Chess PWA

This folder contains a browser/PWA version of Exact Chinese Chess. It is
intentionally isolated from the native e-ink/KUAL build in the parent project.

The separate coaching companion is described in
[`docs/COACHING_APP_PLAN.md`](../docs/COACHING_APP_PLAN.md). It is built alongside
the play app at `coach/` and opens from the **Coaching** control.

## What It Does

- Runs in Chrome and other modern browsers.
- Can be installed from Chrome using Add to Home screen / install app.
- Works offline after first load through a small service worker.
- Saves the current game automatically in browser `localStorage`.
- Supports manual Save and Load restore points.
- Supports Play Red, Play Black, 2 Player, and AI Demo modes.
- Supports direct friend games through a manually shared invitation and reply.
- Offers independent **Threats** and **Lanes** board guides, off by default and
  remembered between visits. Threats mark threatened pieces on both sides;
  selecting a piece reveals its capture routes. Thin, offset guides keep the
  board grid visible and combine duplicate routes. Lanes
  show the side to move's longest rook/cannon routes and focus on a selected
  rook or cannon. Both guides follow board flipping and move review, and work
  offline without the analysis engine.
- Uses a standalone TypeScript Xiangqi rules engine adapted from the native
  `xiangqi_engine.c` implementation.
- Uses Fairy-Stockfish WASM for Xiangqi engine play when the browser supports
  threaded WebAssembly.
- Falls back to the built-in minimax/alpha-beta AI when Fairy-Stockfish cannot
  run.
- Keeps the interface intentionally grayscale to match the e-ink direction of
  the native app.
- Reuses the native Xiangqi board and piece PNG assets from
  `../assets/xiangqi/`.

## Build And Run

```bash
cd pwa
npm install
npm run dev
```

For a production build:

```bash
npm run build
npm run preview
```

The production output is generated in:

```text
pwa/dist
```

## Play a Friend

1. Choose **Play friend**, then **Create invitation**. You play Red.
2. Copy or share the invitation link. Keep the original game tab open.
3. Your friend opens the link and chooses **Accept invitation**. They play Black
   and send their generated **reply code** back to you.
4. Paste that reply code into your original waiting game and choose
   **Connect to friend**. Play starts when both browsers have connected.

The invitation and reply carry the WebRTC connection details; they expire after
30 minutes. There is no application signaling endpoint, room database, or TURN
relay. Public Google STUN endpoints help discover a direct route; if discovery
is blocked, locally gathered routes can still work on the same network. Some
networks will not connect without a relay, so direct connectivity is not
guaranteed. The invitation data lives in the URL fragment, which is not sent
to the static hosting server, and in the messaging service you choose to share
it through.

Moves use an ordered, encrypted WebRTC data channel. Both browsers check move
legality, turn, sequence, and resulting board, and acknowledge received moves.
Play pauses on a lost connection or mismatched board. Keep both tabs open:
refreshing or leaving requires a new invitation and starts a new friend game.
**Save** keeps a local copy for later offline play. The solo game remains
separate and returns when you leave the friend game. AI, Undo, Load, and mode
changes are disabled during a friend match.

`npm run test:friend` checks invitation encoding and validation, direct-only
configuration, move validation, acknowledgments, and synchronization failures.

## Coaching Companion

The coaching app opens at `/coach/` under the configured PWA base path. It has
its own interface, browser storage, service worker, and full-strength analysis
worker. The default Simple view guides learners through a threat scan, a move, a
reply prediction, and a short explanation, with skips at each teaching step.
Advanced shows board tools, full variations, progress, and prepared practice
scenarios. Learners can switch views without losing the current game.
Board guides show capture routes, legal rook/cannon lanes, and the move at each
step. The report describes verified threats, activity changes, and concrete
consequences. Engine verdicts are withheld if the browser cannot run
Fairy-Stockfish; rule-based guides and fallback practice remain usable.

`npm run test:coach` checks Xiangqi-specific threat geometry, variation replay,
move comparison, and UCI analysis parsing. Both browser entries are included in
`npm run build`.

## Engine

The native ARM Pikafish binary used by the e-ink/KUAL package cannot run inside
Chrome. I did not find a credible browser-ready FOSS Pikafish JavaScript/WASM
package to bundle here. Instead, this PWA bundles `fairy-stockfish-nnue.wasm`,
a GPL-3.0 Fairy-Stockfish WebAssembly build that supports Xiangqi through
`UCI_Variant=xiangqi`.

Fairy-Stockfish WASM uses pthreads and requires `SharedArrayBuffer`. For local
development, the included Vite config sends the required COOP/COEP headers. For
static hosting, configure equivalent headers if your host supports them. The
service worker also re-serves same-origin app files with COOP/COEP headers and
reloads once after installation; if that is blocked by the host or browser, the
PWA automatically uses the built-in fallback AI.

## Licensing

This PWA remains part of the Exact Chinese Chess derivative project. The parent
project's GPL-family license and provenance notes still apply.

Additional browser-side dependencies:

- `React`, MIT, https://react.dev/
- `Vite`, MIT, https://vite.dev/
- `TypeScript`, Apache-2.0, https://www.typescriptlang.org/
- `fairy-stockfish-nnue.wasm`, GPL-3.0,
  https://github.com/fairy-stockfish/fairy-stockfish.wasm

Project lineage credited by the parent project:

- XMuli ChineseChess, GPL-3.0-or-later, https://github.com/XMuli/ChineseChess
- Augus1217 Chinese-Chess, MIT per local `package.json`, https://github.com/Augus1217/Chinese-Chess
- official Pikafish, GPLv3, https://github.com/official-pikafish/Pikafish
- GnomeGames4Kindle, originally by crazy-electron, and later contributors.
