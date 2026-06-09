# Exact Chinese Chess PortMaster Notes

These notes describe the current PortMaster package for Exact Chinese Chess.
They are meant as maintainer notes for this repo, not as user-facing
documentation.

## Current Target

- Architecture: `aarch64` only.
- Runtime binary: `exactcc.aarch64`.
- Engine bundle: optional Pikafish under `bin/aarch64/`.
- UI backend: SDL2 with native controller input.
- Layout model: fixed `640x480` logical canvas scaled by SDL to the real
  fullscreen display.

Do not advertise `armhf` in `port.json` until an `exactcc.armhf` binary is built
and tested on an armhf PortMaster target.

## Package Layout

The repository staging tree is:

```text
portmaster/port/exact_chinesechess/
  Exact Chinese Chess.sh
  port.json
  README.md
  screenshot.png
  gameinfo.xml
  exact_chinesechess/
    README.txt
    exact_chinesechess.gptk
    exactcc.aarch64
    assets/
    bin/aarch64/
    licenses/
```

For a PortMaster autoinstall zip, the zip root must contain the launcher and
runtime directory directly:

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

In other words, move `port.json`, `README.md`, `screenshot.png`, and
`gameinfo.xml` into `exact_chinesechess/` when producing the zip.

## Build

Build the PortMaster frontend with the aarch64 PortMaster builder from the repo
root:

```sh
docker run --rm --platform=linux/arm64 \
  -v "$PWD:/src/exact-chinesechess" \
  -w /src/exact-chinesechess/portmaster \
  ghcr.io/monkeyx-net/portmaster-build-templates/portmaster-builder:aarch64-latest \
  make clean all package-layout DEVICE_ARCH=aarch64
```

Strip the frontend binary:

```sh
docker run --rm --platform=linux/arm64 \
  -v "$PWD:/src/exact-chinesechess" \
  -w /src/exact-chinesechess/portmaster \
  ghcr.io/monkeyx-net/portmaster-build-templates/portmaster-builder:aarch64-latest \
  strip exactcc port/exact_chinesechess/exact_chinesechess/exactcc.aarch64
```

Build the bundled aarch64 Pikafish binary from the repo root:

```sh
./build_pikafish_aarch64.sh
```

That script writes:

```text
bin/aarch64/pikafish
bin/aarch64/pikafish.nnue
```

`make package-layout DEVICE_ARCH=aarch64` copies those files into the staged
PortMaster package when they are present.

## Launcher

The launcher currently uses the standard PortMaster control file discovery and
sets:

```sh
GAMEDIR=/$directory/ports/exact_chinesechess/
CONFDIR="$GAMEDIR/conf/"
BIN="$GAMEDIR/exactcc.${DEVICE_ARCH}"
```

It starts `gptokeyb` with the package `.gptk` file and then launches the native
SDL2 frontend:

```sh
$GPTOKEYB "exactcc.${DEVICE_ARCH}" -c "$GAMEDIR/exact_chinesechess.gptk" &
pm_platform_helper "$BIN"
"$BIN"
```

The `.gptk` file is intentionally minimal. Gameplay input is handled by SDL2
controller events inside the game.

## Resolution Handling

The frontend always lays out the game at `640x480`:

```c
#define APP_LOGICAL_WIDTH 640
#define APP_LOGICAL_HEIGHT 480
SDL_RenderSetLogicalSize(app.renderer, APP_LOGICAL_WIDTH, APP_LOGICAL_HEIGHT);
```

SDL scales that logical canvas to the real fullscreen display. This preserves
the side menu across non-`640x480` devices by letterboxing or pillarboxing
instead of recomputing the UI against the physical resolution.

Expected behavior:

| Display | Result |
| --- | --- |
| 640x480 | Native 4:3 |
| 480x320 | Scaled down to 426x320 with side pillarboxes |
| 720x720 | Scaled up to 720x540 with top/bottom letterboxes |
| 1280x720 | Scaled up to 960x720 with side pillarboxes |

The current package intentionally favors a consistent 4:3 UI over per-device
custom layouts.

## Input

The SDL frontend initializes:

```c
SDL_INIT_VIDEO | SDL_INIT_GAMECONTROLLER | SDL_INIT_JOYSTICK
```

Current controller mapping:

| Control | Action |
| --- | --- |
| D-pad | Move board cursor |
| A | Select piece / move, or click side panel when pointer is over it |
| B | Cancel selection / close dropdown |
| X | Undo |
| Y | New game |
| L1 | Previous reviewed move |
| R2 | Next reviewed move |
| Right stick | Move UI pointer |
| R1 / R3 | Pointer click |
| Start | Cycle Main / Moves / Help side-panel page |
| Select / Back | Quit |

Keyboard fallback remains available for desktop testing.

## UI

The current UI is a fixed board plus right-side panel:

- Main page: new game, undo, mode dropdown, difficulty dropdown, save/load,
  quit, status.
- Moves page: playback buttons, ply counter, scrollable move list.
- Help page: controller reference.

Mode and difficulty are real dropdowns. The shared rectangle helpers in
`ui.c` are used for both hit testing and drawing, so changes to widget geometry
should update the helper functions rather than duplicating magic coordinates.

The startup splash is drawn immediately after the SDL renderer and logical size
are ready, before controller probing, asset loading, and Pikafish startup.

## Assets

Runtime artwork uses BMP files so the port does not depend on `SDL2_image`.

Current staged assets:

- `assets/xiangqi/board.bmp`
- pre-rendered piece sets under `assets/xiangqi/pieces_*`

The frontend chooses the nearest pre-rendered piece size for the current board
cell. This avoids relying on heavy runtime downscaling of large source images.

Regenerate piece assets from the repo root with:

```sh
python3 portmaster/scripts/generate_piece_assets.py
```

## Licenses And Attribution

The staged package includes third-party license and attribution files under:

```text
exact_chinesechess/licenses/
```

Keep these files with any distributed package:

- `COPYING.GPL3`
- `COPYING.XMULI.GPL3`
- `COPYING.AUGUS.MIT`
- `COPYING.PIKAFISH.GPL3`
- `PIKAFISH_AUTHORS`
- `THIRD_PARTY_NOTICES.md`

Pikafish is GPLv3. If distributing a package with the bundled Pikafish binary,
also provide clear corresponding source/build information through the project
release notes or source repository.

## Verification

Before publishing a tester build:

1. Build with the aarch64 PortMaster Docker builder.
2. Strip `exactcc.aarch64`.
3. Confirm the package includes `bin/aarch64/pikafish` and
   `bin/aarch64/pikafish.nnue` if testing the Pikafish startup path.
4. Create the autoinstall zip with `Exact Chinese Chess.sh` at the zip root.
5. Check the zip contains `exact_chinesechess/port.json`, `README.md`,
   `screenshot.png`, and `gameinfo.xml`.
6. Verify the launcher with `bash -n`.
7. Install and launch on at least one aarch64 PortMaster device.

Useful local checks:

```sh
make -C portmaster
file portmaster/port/exact_chinesechess/exact_chinesechess/exactcc.aarch64
python3 -m zipfile -l portmaster/exact_chinesechess.zip
```

For resolution confidence without owning every device, ask testers to verify:

- 640x480
- 480x320
- 720x720
- widescreen targets such as 1280x720

Because the app uses SDL logical scaling, these should all show the complete
4:3 UI with letterbox or pillarbox bars.
