# OpenTibia Tools

Toolkit for Tibia client files — `Tibia.dat`, `Tibia.spr` and OTClientV8's `Tibia.cwm` — for **every protocol
version from 7.10 to 15.x**, with:

- a **PWA** that edits clients directly in the browser (nothing is uploaded, works offline, installable),
- a **CLI** for scripting (unpack/pack, convert between versions, sprite export, CWM, outfit pipeline),
- a shared, dependency-light **TypeScript core** (`src/core`) that runs in Node and browsers.

Every data pack from <https://downloads.ots.me/data/tibia-clients/dat_and_spr/> (100 packs, 7.10 → 15.10) is
verified to load and re-save **byte for byte**, and to convert to 7.40, 7.72, 8.54, 8.60 and 10.98
(`npm run verify-packs`).

## Supported protocols

| Versions      | dat layout                                                                   |
| ------------- | ---------------------------------------------------------------------------- |
| 7.10 – 7.30   | v1: original flag set, no pattern Z                                          |
| 7.40 – 7.50   | v2: hangable/hooks added                                                      |
| 7.55 – 7.72   | v3: ground border, pattern Z, offsets with data                              |
| 7.80 – 8.54   | v4: chargeable flag (8.50+: ignore look)                                     |
| 8.55 – 9.86   | v5: translucent, cloth, market; 9.60+ **extended** (u32 sprite ids & count)  |
| 10.00 – 15.x  | v6: no-move-animation, default action, wrap, top effect, usable              |
|               | 10.50+ **improved animations** (frame durations), 10.57+ outfit **frame groups** |

Layout options (`extended`, `transparency`, `improved animations`, `frame groups`) can be overridden for custom
clients (e.g. OTClient builds with extended sprites or alpha channel on 8.60). When the version is not given it is
**auto-detected**: known signatures first, then every layout is probed until one parses the whole file (several
published packs don't match their label — e.g. the "10.00" pack uses the 10.57+ layout).

## Installation

```
npm install
```

Requires Node.js 18+ (the CLI runs TypeScript through `tsx`, no build step).

## Web app (PWA)

```
npm run dev       # development server
npm run build     # production build in ./dist (static files, deploy anywhere)
npm run preview   # serve the production build
```

The CI workflow can deploy `dist` to GitHub Pages (Actions → CI → Run workflow → "Deploy the PWA").

Features:

- **Open** `Tibia.dat` + `Tibia.spr` (+ optional `Tibia.cwm`) by drag & drop, file picker, or "Open with…" once
  installed. Auto-detects the version or lets you pick it (with layout overrides). dat-only and spr-only work too.
- **Browse** items, outfits, effects, missiles and sprites in fast virtualized grids (50k+ things, 680k+ sprites).
- **Preview** with animation (using the file's frame durations), directions/patterns/addons/mounts, layers,
  outfit colorization with the Tibia palette, zoom, backgrounds and high-res CWM sprites.
- **Edit** every flag supported by the client version (light, offset, market, …), frame group dimensions, idle /
  moving groups and animation timings. Undo/redo (Ctrl+Z / Ctrl+Shift+Z).
- **Sprites**: replace a single tile or a whole frame by dropping an image, append sprites, export PNG / zip, find
  which things use a sprite. Images larger than 32px (e.g. 64px art) keep a high-resolution copy for CWM output.
- **Create things from images**: animation frames, directional outfit frames (including the classic
  `11.png … 43.png` layout, optional color template layer) or sprite sheets.
- **Import from another client** of any version: pick things in a second client and copy them (with sprites)
  into the open one — converted automatically (flags, frame groups, animations).
- **Things bundles** (`*.otthings.json`): portable export/import of things with their sprites.
- **Save / compile** to the same or **any other protocol version**, with a conversion report and optional
  `Tibia.cwm` (all sprites upscaled, or only high-res ones). Saves into a folder (File System Access API) or as
  downloads.
- **CWM packer**: inspect/extract `.cwm` files, pack PNG folders, build a CWM from the open client.

## CLI

All commands accept `--client=<version>` (auto-detected when omitted) and layout overrides
`--extended`, `--transparency`, `--improved-animations`, `--frame-groups` (use `--no-…` to disable).
`npm run versions` lists every supported version.

```
# dat <-> JSON
npm run unpack-dat -- ./binary/Tibia.dat ./binary/Tibia.json [--client=8.60]
npm run pack-dat   -- ./binary/Tibia.json ./binary/NewTibia.dat [--target=10.98]

# sprites
npm run unpack-spr -- ./binary/Tibia.spr ./sprites/tibia [--format=png|bmp] [--size=64]
npm run pack-spr   -- ./sprites/tibia ./binary/Tibia.spr --client=8.60 [base Tibia.spr]
npm run convert-to-png -- ./sprites/tibia ./sprites/png64 64      # bmp/png -> png, magenta -> transparent

# OTClientV8 high resolution sprites
npm run unpack-cwm -- ./binary/Tibia.cwm ./sprites/tibia-cwm
npm run pack-cwm   -- ./sprites/png64 ./binary/Tibia.cwm
npm run spr-to-cwm -- ./binary/Tibia.spr ./binary/Tibia.cwm --size=64 [--resize=nearest|bilinear]

# whole clients
npm run info    -- ./binary/Tibia.dat ./binary/Tibia.spr
npm run convert -- ./760/Tibia.dat ./760/Tibia.spr ./out --target=8.60

# copying things between versions
npm run cli -- --mode=export-things ./1098/Tibia.dat ./1098/Tibia.spr outfits.otthings.json --category=outfit --ids=128-140
npm run cli -- --mode=import-things ./860/Tibia.dat ./860/Tibia.spr outfits.otthings.json ./out
npm run cli -- --mode=export-images ./860/Tibia.dat ./860/Tibia.spr ./png --category=item --ids=100-200
```

`unpack-dat` JSON is version independent: it stores canonical flag names (`ground`, `light`, `market`, …) and
can be packed into another version with `--target`.

### E2E outfit adding

Create a `.env` file:

```
ORIGINAL_TIBIA_DAT_DIR=./binary/Tibia.dat
ORIGINAL_TIBIA_SPR_DIR=./binary/Tibia.spr
BINARIES_PUBLISH_DIR=./path/to/otclient

# optional
CLIENT_VERSION=8.60          # auto-detected when omitted
NEW_LOOKTYPE_START_ID=1000   # pads with empty outfits so new ones start here
SPRITE_SIZE=64               # Tibia.cwm sprite size
CWM_MODE=all                 # all | hires (only the new sprites) | none

OUTFITS_0=./sprites/first-outfit
OUTFITS_1=./sprites/second-outfit
```

Each outfit directory holds `<direction><frame>.png` files (direction 1 = south, 2 = east, 3 = west, 4 = north):

```
directory
-> 11.png 12.png 13.png
-> 21.png 22.png 23.png
-> 31.png 32.png 33.png
-> 41.png 42.png 43.png
```

Images may be 32px or high resolution (e.g. 64px): the 32px version goes to `Tibia.spr`, the original to
`Tibia.cwm`. Clients with frame groups (10.57+) get an idle group (frame 1) and a moving group (the rest).

```
npm run e2e
```

Writes `Tibia.dat`, `Tibia.spr` and `Tibia.cwm` to `BINARIES_PUBLISH_DIR`. All paths accept unix and windows styles.

## File formats

- **Tibia.dat** — `u32 signature, u16 item count (max id), u16 outfits, u16 effects, u16 missiles`, then every
  thing as flags (terminated by `0xFF`) and frame groups (size, layers, patterns, frames, optional animation data,
  sprite ids). Flag codes differ per layout; see `src/core/dat/flags.ts`.
- **Tibia.spr** — `u32 signature, u16/u32 count, u32 offsets[count]`, each sprite: `rgb color key, u16 size,
  RLE (u16 transparent, u16 colored, rgb[a] pixels…)` of 32×32 pixels.
- **Tibia.cwm** (OTClientV8) — `u8 version (1), u16 sprite size, u32 count`, entries
  `u32 data start, u32 length, u16 name length, name`, then PNG data named `<sprite id>.png`.

## Development

```
npm test              # unit tests
npm run typecheck
TIBIA_PACKS_DIR=./packs npm test                     # + round-trip tests on extracted real packs
npm run verify-packs -- [--versions=710,860] [--keep] # download & verify all published packs
```

Project layout:

```
src/core     dat/spr/cwm codecs, version registry & detection, conversion, rendering, builders, Project API
src/cli      command line tools (index.ts) and the e2e outfit pipeline (e2e.ts)
web          PWA (Preact + Vite + vite-plugin-pwa)
scripts      pack verification, icon generation
test         vitest suites
```
