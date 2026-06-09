# Exact Chinese Chess PortMaster

SDL2 PortMaster frontend for `exact-chinesechess`. It is controller-first and
targets small handhelds without touchscreen or desktop UI.

The current release package is `aarch64` only and has been tested on RG35XX-H
with muOS. It uses firmware SDL2 by default, native SDL controller input, PNG
art converted to BMP assets, and optional bundled Pikafish for stronger AI.
Easy and Medium use shallow Pikafish searches with MultiPV randomness; Hard
uses a longer single-line Pikafish search.

Reusable lessons from this port are documented in
[`PORTMASTER_PORTING_NOTES.md`](PORTMASTER_PORTING_NOTES.md).

## Controls

| Button | Action |
|--|--|
| D-pad | Move board cursor |
| A | Select piece / move selected piece |
| B | Cancel selection / close dropdown |
| X | Undo |
| Y | New game |
| L1 | Previous reviewed move |
| R2 | Next reviewed move |
| Right stick | Move UI pointer |
| R1 | Click UI pointer |
| Start | Cycle right-panel page |
| Select / Back | Quit |

Keyboard fallback for desktop testing: arrows, Enter/Space, Esc, `u`, `n`,
`m`, `d`, `q`.

## Build

Build with the PortMaster aarch64 builder:

```sh
cd path/to/exact-chinesechess
docker run --rm --platform=linux/arm64 \
  -v "$PWD:/src/exact-chinesechess" \
  -w /src/exact-chinesechess/portmaster \
  ghcr.io/monkeyx-net/portmaster-build-templates/portmaster-builder:aarch64-latest \
  make clean all package-layout DEVICE_ARCH=aarch64
```

Run this from the `exact-chinesechess` repo root. If you are one directory
above it, change the volume mount to
`-v "$PWD/exact-chinesechess:/src/exact-chinesechess"`.

Strip the binary:

```sh
docker run --rm --platform=linux/arm64 \
  -v "$PWD:/src/exact-chinesechess" \
  -w /src/exact-chinesechess/portmaster \
  ghcr.io/monkeyx-net/portmaster-build-templates/portmaster-builder:aarch64-latest \
  strip exactcc port/exact_chinesechess/exact_chinesechess/exactcc.aarch64
```

The runtime binary is intentionally named `exactcc.aarch64`, which fits Linux's
15-character process-name limit and works better with muOS foreground-process
matching.

The full PortMaster package uses a native aarch64 Pikafish build at
`exact_chinesechess/bin/aarch64/pikafish`. The older `bin/armhf/pikafish`
binary was for Kindle/ARMv7 compatibility and is not used by the aarch64
PortMaster package.

Piece artwork is checked in as multiple pre-rendered BMP size sets under
`assets/xiangqi/pieces_*`. Regenerate them from the source PNG artwork with:

```sh
cd exact-chinesechess
python3 portmaster/scripts/generate_piece_assets.py
```

To rebuild the PortMaster Pikafish binary:

```sh
cd exact-chinesechess
./build_pikafish_aarch64.sh
```

## Package

The source staging tree lives at:

```text
port/exact_chinesechess/
  Exact Chinese Chess.sh
  port.json
  README.md
  screenshot.png
  gameinfo.xml
  exact_chinesechess/
    exactcc.aarch64
    assets/
    bin/
    licenses/
```

For PortMaster autoinstall, the zip must contain the contents of that staging
folder, not the staging folder itself. The root of the zip should look like:

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

This is easy to get wrong. If the zip root is
`exact_chinesechess/Exact Chinese Chess.sh` instead, autoinstall can place an
extra directory level around the launcher and the port may not appear or launch
correctly.

Create the autoinstall zip from the staging folder like this:

```sh
cd path/to/exact-chinesechess
workdir="$(mktemp -d)"
cp -a portmaster/port/exact_chinesechess/. "$workdir/"
mv "$workdir/port.json" "$workdir/exact_chinesechess/"
mv "$workdir/README.md" "$workdir/exact_chinesechess/"
mv "$workdir/screenshot.png" "$workdir/exact_chinesechess/"
mv "$workdir/gameinfo.xml" "$workdir/exact_chinesechess/"
python3 - <<PY
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path("$workdir")
out = Path("portmaster/exact_chinesechess.zip")
with ZipFile(out, "w", ZIP_DEFLATED, compresslevel=9) as zf:
    for path in sorted(root.rglob("*")):
        if path.is_file():
            zf.write(path, path.relative_to(root).as_posix())
PY
rm -rf "$workdir"
```

The launcher should use the autoinstall runtime root:

```sh
GAMEDIR=/$directory/ports/exact_chinesechess/
BIN="$GAMEDIR/exactcc.${DEVICE_ARCH}"
cd "$GAMEDIR" || exit 1
```

## Release Checklist

- Zip root contains `Exact Chinese Chess.sh`.
- Zip root contains `exact_chinesechess/`.
- `exact_chinesechess/port.json` is present and currently advertises `aarch64`.
- `exact_chinesechess/README.md` is present.
- `exact_chinesechess/screenshot.png` is present, 640x480, and shows gameplay.
- `exact_chinesechess/gameinfo.xml` is present.
- `exact_chinesechess/` contains the runtime files and licenses.
- `exact_chinesechess/exactcc.aarch64` is stripped.
- The launcher passes `bash -n`.
- Pikafish GPL, author, and source notices are included when the bundled
  Pikafish binary is packaged.

## Resolution Testing

The current UI was designed on 640x480. To test other targets without owning
every device:

1. Add a desktop/debug mode that accepts logical size overrides, for example
   `EXACT_CC_WIDTH=480 EXACT_CC_HEIGHT=320`.
2. Run the SDL frontend locally or under the PortMaster Docker image with
   logical sizes for 480x320, 640x480, 854x480, 720x720, and 1280x720.
3. Capture screenshots for each size and check board scale, page tabs, dropdown
   fit, move-list rows, and pointer reach.
4. On real hardware, use `fbgrab /tmp/game.png` and copy the image back with
   `scp`.
5. Promote the current hardcoded panel rectangles into a computed
   `HandheldUiLayout` before claiming broad resolution support.
