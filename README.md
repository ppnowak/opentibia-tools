# OpenTibia Tools

Toolkit for Tibia client files — `Tibia.dat`, `Tibia.spr` and OTClientV8's `Tibia.cwm` — for **every protocol
version from 7.10 to 15.x**:

- **OpenTibia Tools editor**: an installable, offline-capable editor that runs in the browser
  (nothing is uploaded) — <https://ppnowak.github.io/opentibia-tools/>
- **`opentibia-tools` CLI and GitHub Action** for scripts and CI: validate, diff, convert and build clients from
  dat/spr/cwm/json sources
- a shared, dependency-light **TypeScript core** (`src/core`) that runs in Node and browsers

Every data pack from <https://downloads.ots.me/data/tibia-clients/dat_and_spr/> (100 packs, 7.10 → 15.10) is
verified to load and re-save **byte for byte**, and to convert to 7.40, 7.72, 8.54, 8.60 and 10.98
(`npm run verify-packs`).

## Supported protocols

| Versions      | dat layout                                                                        |
| ------------- | --------------------------------------------------------------------------------- |
| 7.10 – 7.30   | v1: original flag set, no pattern Z                                               |
| 7.40 – 7.50   | v2: hangable/hooks added                                                          |
| 7.55 – 7.72   | v3: ground border, pattern Z, offsets with data                                   |
| 7.80 – 8.54   | v4: chargeable flag (8.50+: ignore look)                                          |
| 8.55 – 9.86   | v5: translucent, cloth, market; 9.60+ **extended** (u32 sprite ids & count)       |
| 10.00 – 15.x  | v6: no-move-animation, default action, wrap, top effect, usable                   |
|               | 10.50+ **improved animations** (frame durations), 10.57+ outfit **frame groups**  |

Layout options (`extended`, `transparency`, `improved animations`, `frame groups`) can be overridden for custom
clients (e.g. OTClient builds with extended sprites or alpha channel on 8.60). When the version is not given it is
**auto-detected**: known signatures first, then every layout is probed until one parses the whole file (several
published packs don't match their label — e.g. the "10.00" pack uses the 10.57+ layout).

## Installation

```
npm install
```

Requires Node.js 18+. `npm install` also builds the standalone CLI (`dist-cli/opentibia-tools.mjs`). To get the
`opentibia-tools` command globally: `npm install -g github:ppnowak/opentibia-tools`.

## Editor

```
npm run dev       # development server
npm run build     # production build in ./dist (static files, deploy anywhere)
npm run preview   # serve the production build
```

Every push to `main` publishes the editor to GitHub Pages via the `gh-pages` branch
(`.github/workflows/pages.yml`; repository Settings → Pages → "Deploy from a branch" → `gh-pages`).

The editor is laid out like an IDE:

| Area            | What it does                                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------------------------------- |
| Menu bar        | File / Edit / View / Tools / Help with keyboard shortcuts; **Ctrl+Shift+P** command palette (also "item 2400")    |
| Activity bar    | Switches the side bar between Explorer, Sprites, Library and Data Packs                                          |
| Explorer        | Items / outfits / effects / missiles with id, range, market-name and flag filters, multi-select, context menu     |
| Sprites         | All sprites; add sprites from images                                                                             |
| Library         | A second client of **any version**: select things, **Ctrl+C**, then **Ctrl+V** into the edited client (converted) |
| Data Packs      | Preload any pack from downloads.ots.me (see below)                                                               |
| Editor tabs     | Preview tabs (single click) and pinned tabs (double-click) for things, sprites, the CWM packer and reference docs |
| Thing editor    | Animated preview, directions/addons/mounts/layers, zoom, backgrounds, high-res (CWM) view, frame timeline, sprite tiles (drop images to replace) |
| Inspector       | Properties, flags (filterable), frame group sizes, animation timing, outfit preview colors                       |
| Panel           | **Problems** (validation, click to jump) and **Output** (log of everything that happened)                        |
| Status bar      | Client version and layout, problem counts, unsaved state, clipboard, selection                                    |

Other features: undo/redo, drag & drop of files anywhere, create things from images (animation frames, directional
outfits including the classic `11.png … 43.png` layout, sprite sheets), sprite sheet export/import, things bundles
(`*.otthings.json`), **Save** (Ctrl+S, remembers the folder) and **Save As / Convert** to any protocol version with
an optional `Tibia.cwm`.

### Data packs

Pick a pack in the Data Packs view and click *Open* (or *Into Library*). The pack is downloaded by **your own
browser straight from downloads.ots.me to your computer** and extracted locally — OpenTibia Tools never hosts,
mirrors or proxies client files. Because downloads.ots.me does not allow cross-site script access, the zip is saved
as a normal download and you open it with *Open …zip*; if the server ever enables CORS, packs open in one step.
Pack `.zip` files can also be dropped on the window.

## CLI

```
opentibia-tools <command> <args> [options]     # or: npx tsx src/cli/index.ts <command> ...
opentibia-tools help
```

`<client>` can be `Tibia.dat Tibia.spr`, `Tibia.json [Tibia.spr]`, a directory containing `Tibia.dat`/`Tibia.spr`
(`Tibia.cwm` is picked up too) or a source tree created by `unpack-client`.

| Command | Description |
| --- | --- |
| `info <client>` | Version, layout, signatures and counts |
| `validate <client> [--cwm=f] [--strict] [--empty-things]` | Structural checks; exit 1 on errors (`--strict`: warnings too) |
| `diff <client A> <client B> [--fail-on-change]` | Added / removed / changed things (flags, sizes, sprites) and sprites |
| `convert <client> <out dir> --target=10.98` | Convert to another protocol version |
| `build <manifest.json> [--out=dir]` | Build a client from a declarative manifest (see below) |
| `unpack-client <client> <dir>` | Git-friendly source tree: `client.json`, `Tibia.json`, `sprites/<id>.png`, `hires/<id>.png` |
| `pack-client <dir> <out dir> [--target=v]` | Compile a source tree back to `Tibia.dat`/`.spr`(/`.cwm`) |
| `unpack-dat` / `pack-dat` | dat ↔ version-independent JSON (`pack-dat --target` converts) |
| `unpack-spr` / `pack-spr` | spr ↔ `<id>.png`/`.bmp` images |
| `unpack-cwm` / `pack-cwm` / `spr-to-cwm` | OTClientV8 high-res sprites |
| `convert-to-png <from> <to> [size]` | bmp/png → png, magenta → transparent, resize |
| `export-images`, `export-things`, `import-things` | Render things; copy things between clients via bundles |
| `e2e` | The `.env` outfit pipeline (below) |
| `versions` | Supported protocol versions |

Common options: `--client=<version>` (auto-detected when omitted), `--extended`, `--transparency`,
`--improved-animations`, `--frame-groups` (`--no-…` to disable), `--json` (machine readable output on stdout,
logs on stderr). Exit codes: `0` success, `1` failure or validation errors, `2` usage error. When
`GITHUB_STEP_SUMMARY` is set, `info`, `validate`, `diff` and `build` append a Markdown report to the job summary.

The original commands keep working unchanged: `npm run unpack-dat -- ./binary/Tibia.dat ./binary/Tibia.json`,
`npm run pack-dat …`, `npm run unpack-spr …`, `npm run convert-to-png …`, `npm run unpack-cwm …`,
`npm run pack-cwm …`, `npm run e2e`, as well as the `--mode=<command>` form.

### Build manifests

`opentibia-tools build client.build.json` assembles a client declaratively — ideal for keeping a custom client in
git and producing the binaries in CI. Paths are relative to the manifest; the schema is
[`schemas/build.schema.json`](schemas/build.schema.json) (add `"$schema"` for editor completion).

```json
{
  "$schema": "https://ppnowak.github.io/opentibia-tools/schemas/build.schema.json",
  "client": "8.60",
  "base": { "dat": "original/Tibia.dat", "spr": "original/Tibia.spr" },
  "things": ["bundles/"],
  "outfits": [{ "images": "outfits/wizard", "looktype": 1000 }],
  "objects": [{ "category": "item", "images": "items/torch", "id": 30001, "flags": { "light": { "level": 6, "color": 206 } } }],
  "sprites": "sprite-overrides/",
  "patches": [{ "category": "item", "id": "2400-2410", "set": { "pickupable": true }, "unset": ["unmoveable"] }],
  "output": { "dir": "build", "client": "10.98", "cwm": { "size": 64, "mode": "all" }, "json": true },
  "validate": "strict"
}
```

- `base`: `dat`+`spr`, `json` (+`spr`) or `source` (an `unpack-client` tree); omit it to start from an empty client.
- `things`: `*.otthings.json` bundles (or folders of them) to append.
- `outfits`: folders of `<direction><frame>.png` (1 = south, 2 = east, 3 = west, 4 = north); `looktype` replaces
  that outfit or pads up to it, so builds are repeatable. 64px images become high-res CWM sprites.
- `objects`: items/effects/missiles from images (one per animation frame).
- `sprites`: `<id>.png` replacements. `patches`: set/unset flags on ids or ranges.
- `output`: target version, file names, `cwm` (`false`, or size and `all`/`hires`), `json`, signatures.
- `validate`: `true` (default) fails on errors, `"strict"` also on warnings.

A complete example lives in [`examples/ci`](examples/ci).

### GitHub Action

```yaml
- uses: ppnowak/opentibia-tools@main
  with:
    args: build client.build.json --out=build

- uses: ppnowak/opentibia-tools@main
  with:
    args: validate build/Tibia.dat build/Tibia.spr --cwm=build/Tibia.cwm --strict

- uses: ppnowak/opentibia-tools@main      # on pull requests: what changed?
  with:
    args: diff release/Tibia.dat release/Tibia.spr build/Tibia.dat build/Tibia.spr

- id: info
  uses: ppnowak/opentibia-tools@main
  with:
    args: info build --json                  # JSON available as steps.info.outputs.json
```

Inputs: `args` (required), `node-version` (default 22), `working-directory`. See
[`examples/ci/workflow.yml`](examples/ci/workflow.yml) for a full workflow; this repository's own CI runs the
action against the example on every push.

### E2E outfit adding

The original `.env` pipeline still works (a build manifest is the recommended replacement). Create `.env`:

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

Each outfit directory holds `<direction><frame>.png` files (`11.png` … `43.png`). Run `npm run e2e`; it writes
`Tibia.dat`, `Tibia.spr` and `Tibia.cwm` to `BINARIES_PUBLISH_DIR`.

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
npm test                                             # unit + CLI integration tests
npm run typecheck
TIBIA_PACKS_DIR=./packs npm test                     # + round-trip tests on extracted real packs
npm run verify-packs -- [--versions=710,860] [--keep] # download & verify all published packs
npm run build:cli                                    # rebuild dist-cli/opentibia-tools.mjs
```

```
src/core     codecs, version registry & detection, conversion, validation, diff, rendering, builders, Project API
src/cli      opentibia-tools command line (index.ts), build manifests, client source trees, e2e pipeline
web          editor (Preact + Vite + vite-plugin-pwa)
schemas      JSON schema of build manifests
examples/ci  example client sources, manifest and workflow
test         vitest suites
```

## Legal

OpenTibia Tools does not include, host, mirror or redistribute any Tibia client files. Tibia is a trademark of
CipSoft GmbH; this project is not affiliated with CipSoft.
