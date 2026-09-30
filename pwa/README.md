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

## Coaching Companion

The coaching app opens at `/coach/` under the configured PWA base path. It has
its own interface, browser storage, service worker, and full-strength analysis
worker. Learners can select guided starting positions, play Red, scan for Black
capture routes, reveal hints in steps, predict Black's reply, and compare the
played line with the engine line.
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
