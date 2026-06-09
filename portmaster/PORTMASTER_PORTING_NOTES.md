# PortMaster Small Board Game Porting Notes

These notes capture the practical lessons from porting Exact Chinese Chess to
PortMaster on an RG35XX-H running muOS. They are intended to be reused for
other small board and puzzle games in this repository, especially controller
driven games that were originally designed for Kindle, GTK, browser, or touch.

## Target Assumptions

PortMaster devices vary a lot. Treat the RG35XX-H as one useful baseline, not
as the only target.

- Low-resolution handheld screens are common: 640x480, 480x320, 854x480,
  720x720, 1280x720, and portrait variants can all happen.
- Screen size is often 3.5 to 5 inches, so pixel resolution alone is
  misleading. Text that is readable in a desktop screenshot can be too small on
  the actual device.
- Input is controller-first: D-pad, ABXY, Start/Select, shoulders, and
  sometimes analog sticks. Do not assume a touchscreen.
- Some firmware exposes controller input as normal SDL controller events; some
  ports use `gptokeyb`; some frontends can accidentally receive the same
  injected input if launch handling is wrong.
- Firmware SDL2 is often preferable to a bundled SDL2 on these devices because
  it has the right video backend. On the RG35XX-H/muOS test device, firmware
  SDL2 exposed the `mali` backend while the bundled builder SDL2 fell back to
  non-visible/offscreen behavior.

## Build Pattern

Use SDL2 for new handheld frontends. SDL1 is not required for PortMaster, and
many existing ports use SDL2 successfully.

Recommended build path for aarch64:

```sh
cd path/to/exact-chinesechess
docker run --rm --platform=linux/arm64 \
  -v "$PWD:/src/exact-chinesechess" \
  -w /src/exact-chinesechess/portmaster \
  ghcr.io/monkeyx-net/portmaster-build-templates/portmaster-builder:aarch64-latest \
  make clean all package-layout DEVICE_ARCH=aarch64
```

Strip the final binary:

```sh
docker run --rm --platform=linux/arm64 \
  -v "$PWD:/src/exact-chinesechess" \
  -w /src/exact-chinesechess/portmaster \
  ghcr.io/monkeyx-net/portmaster-build-templates/portmaster-builder:aarch64-latest \
  strip exactcc port/exact_chinesechess/exact_chinesechess/exactcc.aarch64
```

Run these commands from the `exact-chinesechess` repo root. If you are one
directory above it, change the volume mount to
`-v "$PWD/exact-chinesechess:/src/exact-chinesechess"`.

Prefer a short runtime binary name. Linux process names are truncated to 15
characters in places, and muOS foreground-process matching can be sensitive to
that. `exactcc.aarch64` worked better than a longer
`exact_chinesechess.aarch64`.

The current release package is aarch64-only because only `exactcc.aarch64` is
included. Do not advertise `armhf` in `port.json` until an `exactcc.armhf`
binary is built and tested.

For bundled UCI engines, match the engine binary to the PortMaster architecture.
This port uses `bin/aarch64/pikafish` built with Pikafish `ARCH=armv8`.
The older `bin/armhf/pikafish` is a Kindle/ARMv7 build and should not be used
as the preferred engine on aarch64 handhelds.

Use `./build_pikafish_aarch64.sh` from the `exact-chinesechess` directory to
rebuild the PortMaster engine binary.

## Launcher Pattern

Use the PortMaster control files when present, then apply device-specific
fallbacks.

Important muOS findings:

- The running frontend was not just `muxlaunch`; it was launched through
  `/opt/muos/script/mux/frontend.sh`.
- Restarting the frontend directly through `/opt/muos/extra/muxlaunch` was not
  reliable over SSH. Prefer `/opt/muos/script/mux/frontend.sh`.
- For SSH testing, stop the mux frontend before launching the game, otherwise
  input and redraws can fight the SDL window.
- For normal menu launch, avoid killing more than necessary. The launcher path
  from muOS already has different process context than an SSH shell.
- Set the muOS foreground process to the actual binary basename when possible:
  `exactcc.aarch64`.

The SSH testing flow should be explicit:

```sh
EXACT_CC_KILL_FRONTEND=1 ./Exact\ Chinese\ Chess.sh
```

The normal menu launcher should not require that environment variable.

For official packaging, follow the PortMaster structure:

```text
port/exact_chinesechess/
  port.json
  README.md
  screenshot.png
  gameinfo.xml
  Exact Chinese Chess.sh
  exact_chinesechess/
    exactcc.aarch64
    licenses/
    assets/
    bin/
```

For PortMaster autoinstall zips, avoid an extra wrapper directory. The zip root
should contain the launch script and the port directory directly:

```text
Exact Chinese Chess.sh
exact_chinesechess/
  exactcc.aarch64
  assets/
  bin/
  licenses/
  port.json
  README.md
  README.txt
  screenshot.png
  gameinfo.xml
```

This differs from the repo staging tree, where `port.json`, `README.md`,
`screenshot.png`, and `gameinfo.xml` may sit next to the launch script before
being moved into the runtime directory for autoinstall. If the zip root is
`exact_chinesechess/Exact Chinese Chess.sh`, autoinstall can install one level
too deep.

Launcher paths must match the autoinstall layout. For the flat autoinstall
runtime, use:

```sh
GAMEDIR=/$directory/ports/exact_chinesechess/
cd "$GAMEDIR" || exit 1
BIN="$GAMEDIR/exactcc.${DEVICE_ARCH}"
```

Do not use a stale nested runtime assumption such as
`RUNDIR="$GAMEDIR/exact_chinesechess"` unless the installed package really has
that second level.

Current release checklist:

- `port.json` is present and advertises only architectures with included
  binaries.
- `README.md` is present in the port folder and includes credits and controls.
- `screenshot.png` is top-level, 4:3, at least 640x480, and shows gameplay.
- `gameinfo.xml` points at `./screenshot.png`.
- The launch script has capital letters, ends in `.sh`, and the port directory
  name matches the containing directory.
- License files for source and bundled engine/assets are under
  `exact_chinesechess/licenses/`.
- Bundled GPL engine binaries should include the upstream license, authors, and
  source/commit notice. If the release is distributed outside the source repo,
  publish the corresponding source archive or clear source link with the same
  release.
- Runtime files live under `exact_chinesechess/`.
- Autoinstall zip root contains `Exact Chinese Chess.sh` and
  `exact_chinesechess/` directly.
- Launch scripts do not start `gptokeyb` when the game already consumes native
  SDL controller input. Running both paths causes double input.

## Input Pattern

Prefer native SDL2 controller input first.

The Exact Chinese Chess port originally tried `gptokeyb`, but on muOS this
caused uinput events to leak into the frontend in some launch modes. The
working pattern was:

- Use `SDL_INIT_GAMECONTROLLER | SDL_INIT_JOYSTICK`.
- Open the SDL controller directly.
- Disable `gptokeyb` by default.
- Keep `gptokeyb` as an opt-in fallback only.

Suggested bindings for board games:

| Control | Meaning |
| --- | --- |
| D-pad | Move board cursor |
| A | Select / confirm board action |
| B | Cancel selection / close dropdown |
| X | Undo |
| Y | New game |
| L1/R2 | Previous/next move review |
| Select | Quit |
| Start | Toggle the side panel, pause menu, or help, not destructive mode changes |
| Right stick | Optional pointer for UI widgets |
| R1 | Pointer click |

Avoid mapping Start to cycle major game modes. It is too easy to enter an
unexpected AI or demo mode and corrupt the user's mental model of the current
game.

## UI Layout Pattern

The best current layout for 640x480 board games is:

- Board on the left.
- A fixed right rail for menu, settings, playback, and optional help/moves.
- No separate bottom bar. It competes with the board and is hard to read.
- The side rail should avoid duplicate instructions. Use one collapsible area
  that toggles between move history and help.

For a 640x480 screen, a right rail around 174 to 184 pixels wide leaves enough
room for a readable 9x10 Xiangqi board while still allowing real controls.

Recommended right-rail order:

1. Title
2. Actions: New, Undo, Quit, Save, Load
3. Settings: Mode dropdown, Difficulty dropdown
4. Status: turn, AI engine, current message
5. Playback: first, previous, next, latest, plus ply count
6. Toggle: Show Help / Show Moves
7. Large remaining panel: move list or help text

Do not put a persistent controls block below the help/moves panel if the help
panel says the same thing. The lower rail space is more valuable as move-list
or readable help space.

## Reusable SDL Widget Pattern

SDL2 does not provide buttons, dropdowns, scrollbars, or tabs. For small
PortMaster board games, the current recommended pattern is a tiny immediate
mode widget layer drawn with SDL rectangles and bitmap text. Keep it copyable
between ports rather than tying it too deeply to one game.

Core helper set:

```c
static bool point_in_rect(int x, int y, SDL_Rect rect);
static void draw_bezel(SDL_Renderer *r, SDL_Rect rect, bool pressed);
static void draw_button(SDL_Renderer *r, const char *label, SDL_Rect rect);
static void draw_dropdown(SDL_Renderer *r, const char *value, SDL_Rect rect, bool open);
static void draw_dropdown_menu(SDL_Renderer *r, SDL_Rect rect,
                               const char **items, int count, int selected);
static void draw_scroll_button(SDL_Renderer *r, SDL_Rect rect, bool up);
static void draw_page_tabs(SDL_Renderer *r, const App *app, int panel_x);
```

Recommended visual language:

- Use a light top/left edge and dark bottom/right edge for buttons. This gives
  a simple embossed/beveled look that reads as clickable on low-resolution LCDs.
- Use the inverse bevel for pressed/active state.
- Give controls a small shadow offset if the background is flat.
- Use the same bezel treatment for buttons, dropdown boxes, save/load buttons,
  scroll arrows, and page tabs.
- Keep section labels unboxed; controls should be boxed.
- Highlight the active tab by drawing it pressed and inverting the text color.

Recommended interaction model:

- Each widget has one `SDL_Rect` used by both drawing and hit testing.
- Dropdowns have explicit open state. Do not make dropdowns cycle values on
  click.
- Click outside an open dropdown closes it.
- `B` closes an open dropdown before it cancels board selection.
- Scrollbars should have visible up/down buttons even if the thumb is tiny.
- Page tabs are preferable to cramming all controls into one right rail page.

AI difficulty should change engine strength, not just the label. Strong UCI
engines remain difficult even with short move times. Prefer explicit search
limits for low levels: `go depth 1` or `go nodes N` is more predictable than a
tiny `go movetime`. In this port, Easy and Medium use Pikafish with `MultiPV 4`
and `go depth 1`; they sometimes choose candidates 2-4 instead of the top move.
Hard uses `MultiPV 1` and `go movetime 1200`.

For reuse across games, separate the widget helpers from game state. A later
cleanup could move the generic drawing functions into files such as:

```text
portmaster/shared/handheld_ui.h
portmaster/shared/handheld_ui.c
```

The shared module should not know about Xiangqi, chess, reversi, etc. It should
only know about rectangles, labels, selected/open state, and colors.

The visual widgets are portable across screen sizes, but the current absolute
rectangles are not. To reuse the UX on other PortMaster targets, keep the
widget functions generic and compute rectangles from a per-device layout:

```c
typedef struct {
    SDL_Rect board;
    SDL_Rect panel;
    SDL_Rect tabs[3];
    int font_track;
    int button_h;
    int row_gap;
    int panel_margin;
} HandheldUiLayout;
```

Resolution-dependent parts:

- Board rectangle and side-panel rectangle.
- Button widths/heights and gaps.
- Page tab locations.
- Scrollbar top/bottom positions.
- Font tracking and whether labels use one or two lines.

Reusable parts:

- Beveled button drawing.
- Dropdown open/select/close behavior.
- Scroll up/down button behavior.
- Page model: Main / Moves / Help.
- Controller mapping: D-pad for board, right stick for UI pointer, R1 click.

For pointer movement, tune stick divisor per device. On the RG35XX-H the right
stick pointer started too slow at `axis / 6000`; `axis / 4000` is a better
baseline, about 50% faster. Devices with larger screens may need a lower
divisor or acceleration based on how long the stick is held.

## Text And Touch Target Sizing

The current 5x7 bitmap font at scale 1 is too small for sustained use on a
3.5-inch 640x480 handheld. It is acceptable only for dense move lists and
secondary labels.

Use these practical tiers:

| UI Element | Suggested Text Scale | Notes |
| --- | ---: | --- |
| Title | 2 | Good for orientation |
| Primary help text | 2 | More comfortable on 3.5-inch screens |
| Button labels | 1 or 2 | Use 2 if the button is wide enough |
| Dropdown values | 1 currently, prefer 2 if rail width increases |
| Move list | 1 | Dense history is the one place small text is acceptable |
| Status text | 1 or 2 | Use 2 for short status; avoid long strings |

Minimum comfortable button sizes on this class of device:

- Tiny icon button: 24x24 minimum.
- Normal text button: 44x24 minimum.
- Comfortable text button: 56x28 or larger.
- Dropdown row: at least 24 pixels high; 28 is better if using scale-2 text.

If text still feels small, the next design step is not more squeezing. Instead:

- Make the board/rail split adaptive.
- Consider a slightly narrower board when the side panel is open.
- Use icon-only actions with a larger help/menu overlay.
- Move settings into a modal menu opened by Start, leaving only moves/status in
  the rail during play.
- Add a real bitmap font with better legibility than the simple 5x7 debug font.

## Dropdown Pattern

Do not implement mode and difficulty as simple cycle buttons when the options
have very different consequences.

Use a real open/select/close dropdown:

- First click opens the list.
- Second click on an option selects it.
- Clicking outside closes it.
- `B` closes it.
- Highlight the current option.
- Draw the dropdown list above other panel content.

This matters most for game mode. Accidentally cycling into `AI DEMO` is
surprising and can make the game look like it is playing itself or changing
state unexpectedly.

## Move Review Pattern

For board games with history, the move panel should be single-column and
chronological. One move per line is easier to scan than wrapping moves into
multiple columns on a tiny handheld.

Recommended behavior:

- Show `<<`, `<`, `>`, `>>` for first, previous, next, latest.
- Show a ply counter on its own row, never between buttons.
- Highlight the reviewed move row.
- Keep the move panel collapsible or toggleable with help.
- Reset scroll to the latest moves after a new move, undo, load, or AI move.

## Rendering And Assets

Use visual assets for pieces and boards. The BMP conversion used here avoids an
`SDL2_image` dependency:

- Convert the board PNG to a package-local BMP asset.
- Pre-render pieces to several package-local BMP sizes such as `pieces_24`,
  `pieces_28`, `pieces_34`, `pieces_40`, `pieces_42`, `pieces_46`,
  `pieces_52`, `pieces_60`, `pieces_72`, `pieces_84`, `pieces_96`, and
  `pieces_128`.
- At runtime, choose the closest pre-rendered piece size for the current board
  cell. This avoids downsampling 180px artwork to 40px-class pieces every
  frame, which creates visible aliasing on small LCDs.
- Load through SDL2's built-in BMP loader.
- Keep a fallback ASCII/vector rendering path for debugging.

Use firmware SDL2 and software rendering unless testing proves accelerated
rendering is stable on the target. On the RG35XX-H/muOS, this combination was
stable:

```sh
SDL_VIDEODRIVER=mali
SDL_RENDER_DRIVER=software
```

## Resolution Adaptation

Do not hardcode only 640x480 assumptions for future ports. Build a layout
function that chooses among these modes:

| Screen Class | Suggested Layout |
| --- | --- |
| 640x480 landscape | Board left, right rail |
| 480x320 landscape | Board mostly full-screen, modal menu/help; no persistent rail |
| 854x480 landscape | Board left, wider right rail with scale-2 labels |
| 720x720 square | Board top or left depending board aspect; rail can be wider |
| Portrait | Board top, controls below; avoid right rail |

Base decisions on physical readability, not just pixels. A 640x480 3.5-inch
screen needs larger text than a 640x480 desktop window.

Use a shared layout model:

```c
typedef struct {
    SDL_Rect board;
    SDL_Rect panel;
    int font_small;
    int font_normal;
    int button_h;
    bool persistent_panel;
} HandheldLayout;
```

Then derive all hitboxes and draw positions from that model. Avoid duplicating
the same magic coordinates in input handling and rendering.

## Resolution Test Plan

Test resolution support in two layers: deterministic desktop/layout tests and
real-device framebuffer tests.

Desktop/layout pass:

1. Add debug environment overrides for logical size, such as
   `EXACT_CC_WIDTH` and `EXACT_CC_HEIGHT`.
2. Start the SDL frontend at representative logical sizes:
   `480x320`, `640x480`, `720x720`, `854x480`, and `1280x720`.
3. Capture one screenshot per side-panel page: Main, Moves, Help.
4. Check for text clipping, overlapped scroll buttons, dropdowns leaving the
   panel, board shrinkage, and tabs that no longer fit.
5. Keep a small screenshot gallery under `portmaster/test-shots/` or similar
   for visual regressions.

Real-device pass:

1. Install the package through the firmware menu where possible.
2. For SSH testing, launch with `EXACT_CC_KILL_FRONTEND=1` only when needed.
3. Capture the framebuffer with `fbgrab /tmp/game.png`.
4. Copy screenshots back with `scp DEVICE_HOST:/tmp/game.png .`.
5. Test at least one 4:3 device, one 16:9 device, and one lower-resolution
   480x320-class device before claiming broad support.

Practical rule: if a target is too small for a persistent right rail, switch to
a full-board play view plus modal/paged settings instead of shrinking all text.

## Verification Pattern

Use real-device screenshots early. Desktop screenshots hide the main problems.

On muOS, `fbgrab` can capture the framebuffer:

```sh
fbgrab /tmp/game.png
scp DEVICE_HOST:/tmp/game.png .
```

Check screenshots for:

- Text clipped inside buttons.
- Playback counters colliding with buttons.
- Status strings colliding with AI labels.
- Repeated help/control text.
- Board too small when the move panel is visible.
- Pointer unable to reach controls comfortably.
- Frontend flicker or menu bleed-through after button presses.

## Open Design Debt From This Port

The current Exact Chinese Chess UI is functional on RG35XX-H 640x480, but broad
screen-size support still needs layout work:

- The 5x7 font is too crude for long-term readability.
- The current right-panel rectangles are mostly hardcoded for 640x480.
- The Main / Moves / Help page model should be kept, but generated from a
  `HandheldUiLayout`.
- Lower-resolution devices likely need a modal menu instead of a persistent
  right rail.

Likely next improvement:

1. Replace the built-in 5x7 font with a clearer bitmap font.
2. Extract the widget helpers into `portmaster/shared/handheld_ui.c/.h`.
3. Add logical-size overrides and screenshot tests.
4. Replace hardcoded coordinates with computed layout structs.
5. Add an armhf build only after testing on an armhf-capable target.
