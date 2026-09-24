import { useEffect, useRef, useState } from 'preact/hooks';
import { FileDown, FileUp, ImageDown, Layers, Pause, Play, SkipBack, SkipForward, ZoomIn, ZoomOut } from 'lucide-preact';
import { importSheet, sliceTiles } from '../../../../src/core/builder.ts';
import { FrameGroupType, spriteIndex, type FrameGroup, type ThingCategory, type ThingType } from '../../../../src/core/dat/types.ts';
import { encodePng } from '../../../../src/core/image/png.ts';
import type { Project } from '../../../../src/core/project.ts';
import { renderSheet, renderThing } from '../../../../src/core/render.ts';
import { SPRITE_SIZE } from '../../../../src/core/spr/spr.ts';
import { paint, paintFit, spriteImage, toImageData } from '../../lib/canvas.ts';
import { useDocState } from '../../lib/docstate.ts';
import { decodeImageFile, download, pickFiles } from '../../lib/files.ts';
import { commitThing, outfitColors, project, revision, selectSprite, spriteRevision, toast, touch } from '../../state.ts';
import { Thumb } from '../Thumb.tsx';

const BACKGROUNDS = ['checker', 'dark', 'light', 'grass'] as const;
const DIRECTIONS = ['North', 'East', 'South', 'West'];
const ZOOMS = [1, 2, 3, 4, 6, 8, 12];

export function ThingDoc({ docKey, category, id }: { docKey: string; category: ThingCategory; id: number }) {
  const p = project.value;
  revision.value;
  const thing = p?.get(category, id);
  if (!p || !thing) {
    return (
      <div class="doc-scroll">
        <p class="muted">
          {category} {id} does not exist (anymore).
        </p>
      </div>
    );
  }
  return <ThingEditor key={docKey} docKey={docKey} p={p} thing={thing} />;
}

function frameMs(g: FrameGroup, f: number, category: ThingCategory): number {
  const d = g.animation?.durations[f];
  if (d) return Math.max(40, (d.min + d.max) / 2);
  return category === 'item' ? 400 : category === 'outfit' ? 150 : 100;
}

function ThingEditor({ docKey, p, thing }: { docKey: string; p: Project; thing: ThingType }) {
  const spriteRev = spriteRevision.value;
  const isOutfit = thing.category === 'outfit';
  const [groupIdx, setGroupIdx] = useDocState(docKey, 'group', isOutfit && thing.groups.length > 1 ? 1 : 0);
  const [frame, setFrame] = useDocState(docKey, 'frame', 0);
  const [px, setPx] = useDocState(docKey, 'px', isOutfit ? 2 : 0);
  const [py, setPy] = useDocState(docKey, 'py', 0);
  const [pz, setPz] = useDocState(docKey, 'pz', 0);
  const [layerMode, setLayerMode] = useDocState(docKey, 'layer', 'auto');
  const [zoom, setZoom] = useDocState(docKey, 'zoom', 4);
  const [playing, setPlaying] = useDocState(docKey, 'playing', true);
  const [bg, setBg] = useDocState<(typeof BACKGROUNDS)[number]>(docKey, 'bg', 'checker');
  const [useHiRes, setUseHiRes] = useDocState(docKey, 'hires', false);
  const [dropSlot, setDropSlot] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const colors = outfitColors.value;

  const gi = Math.min(groupIdx, thing.groups.length - 1);
  const g = thing.groups[gi];
  const f = frame % g.frames;
  const cx = Math.min(px, g.patternX - 1);
  const cy = Math.min(py, g.patternY - 1);
  const cz = Math.min(pz, g.patternZ - 1);
  const layer: number | 'all' | undefined = layerMode === 'auto' ? undefined : layerMode === 'all' ? 'all' : Number(layerMode);
  const colorize = isOutfit && g.layers > 1 && layerMode === 'auto';
  const hiResOn = useHiRes && p.hiRes.size > 0;
  const renderOpts = { group: gi, frame: f, patternX: cx, patternY: cy, patternZ: cz, layer, outfitColors: colorize ? colors : undefined };

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    if (!hiResOn) {
      paint(c, renderThing(thing, p.spr, renderOpts), zoom);
      return;
    }
    // high-res (CWM) preview: draw each sprite from its high resolution version
    const cell = SPRITE_SIZE * zoom;
    c.width = g.width * cell;
    c.height = g.height * cell;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    const layers = layer === 'all' ? [...Array(g.layers).keys()] : [typeof layer === 'number' ? layer : 0];
    for (const l of layers)
      for (let h = 0; h < g.height; h++)
        for (let w = 0; w < g.width; w++) {
          const sid = g.sprites[spriteIndex(g, w, h, l, cx, cy, cz, f)];
          if (!sid) continue;
          const img = p.getHiRes(sid) ?? spriteImage(p, sid);
          const tmp = document.createElement('canvas');
          tmp.width = img.width;
          tmp.height = img.height;
          tmp.getContext('2d')!.putImageData(toImageData(img), 0, 0);
          ctx.drawImage(tmp, (g.width - 1 - w) * cell, (g.height - 1 - h) * cell, cell, cell);
        }
  }, [thing, gi, f, cx, cy, cz, layerMode, zoom, colors, spriteRev, hiResOn]);

  useEffect(() => {
    if (!playing || g.frames <= 1) return;
    const t = setTimeout(() => setFrame((x) => (x + 1) % g.frames), frameMs(g, f, thing.category));
    return () => clearTimeout(t);
  }, [playing, f, g]);

  const replaceGroup = (ng: FrameGroup) => {
    const groups = thing.groups.slice();
    groups[gi] = ng;
    commitThing({ ...thing, groups });
  };

  const setSlot = (w: number, h: number, l: number, sid: number) => {
    const ng = { ...g, sprites: g.sprites.slice() };
    ng.sprites[spriteIndex(g, w, h, l, cx, cy, cz, f)] = sid;
    replaceGroup(ng);
  };

  const importFrameImage = async (l: number, file?: File) => {
    const src = file ?? (await pickFiles('image/*', false))[0];
    if (!src) return;
    const img = await decodeImageFile(src);
    const tileSize = img.width >= g.width * SPRITE_SIZE * 2 && img.height >= g.height * SPRITE_SIZE * 2 ? SPRITE_SIZE * 2 : SPRITE_SIZE;
    const tiles = sliceTiles(img, g.width, g.height, tileSize);
    const ng = { ...g, sprites: g.sprites.slice() };
    for (let h = 0; h < g.height; h++)
      for (let w = 0; w < g.width; w++) ng.sprites[spriteIndex(g, w, h, l, cx, cy, cz, f)] = p.addSpriteImage(tiles[h * g.width + w]);
    touch(true);
    replaceGroup(ng);
    toast(`Frame ${f + 1} of ${thing.category} ${thing.id} updated from ${src.name}${tileSize > SPRITE_SIZE ? ' (kept high-res copy)' : ''}`, 'success');
  };

  const importSheetImage = async () => {
    const [file] = await pickFiles('image/*', false);
    if (!file) return;
    const img = await decodeImageFile(file);
    const cols = g.patternX * g.frames;
    const rows = g.patternY * g.patternZ * g.layers;
    const tile = img.width / (cols * g.width);
    if (tile !== SPRITE_SIZE && tile !== SPRITE_SIZE * 2) {
      toast(`Sheet must be ${cols * g.width * 32}×${rows * g.height * 32}px (columns: frames × pattern X, rows: layers × pattern Z × pattern Y)`, 'error', 9000);
      return;
    }
    const ng = importSheet({ spr: p.spr, hiRes: p.hiRes as never, dedupe: true }, img, { ...g, tileSize: tile });
    ng.type = g.type;
    ng.exactSize = g.exactSize;
    if (g.animation) ng.animation = g.animation;
    touch(true);
    replaceGroup(ng);
    toast(`Sprite sheet imported into ${thing.category} ${thing.id}`, 'success');
  };

  const zoomBy = (dir: number) => {
    const i = ZOOMS.indexOf(zoom);
    setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 3 : i) + dir))]);
  };

  const slotLayers = layer === 'all' || colorize ? [...Array(g.layers).keys()] : [typeof layer === 'number' ? layer : 0];
  const name = thing.flags.market?.name;

  return (
    <div class="doc" onKeyDown={(e) => {
      if ((e.target as HTMLElement).closest('input, select')) return;
      if (e.key === ' ') { e.preventDefault(); setPlaying(!playing); }
      else if (e.key === ',') setFrame((x) => (x - 1 + g.frames) % g.frames);
      else if (e.key === '.') setFrame((x) => (x + 1) % g.frames);
      else if (e.key === '+' || e.key === '=') zoomBy(1);
      else if (e.key === '-') zoomBy(-1);
    }} tabIndex={-1}>
      <div class="doc-toolbar">
        <span class="doc-title">
          {thing.category} {thing.id}
          {name ? <span class="muted"> · {name}</span> : null}
        </span>
        {thing.groups.length > 1 && (
          <select title="Frame group" value={gi} onChange={(e) => { setGroupIdx(Number((e.target as HTMLSelectElement).value)); setFrame(0); }}>
            {thing.groups.map((grp, i) => (
              <option key={i} value={i}>
                {grp.type === FrameGroupType.Moving ? 'Moving' : 'Idle'}
              </option>
            ))}
          </select>
        )}
        {g.patternX > 1 && (
          <select title={isOutfit || thing.category === 'missile' ? 'Direction' : 'Pattern X'} value={cx} onChange={(e) => setPx(Number((e.target as HTMLSelectElement).value))}>
            {[...Array(g.patternX).keys()].map((i) => (
              <option key={i} value={i}>
                {isOutfit && g.patternX === 4 ? DIRECTIONS[i] : `X ${i}`}
              </option>
            ))}
          </select>
        )}
        {g.patternY > 1 && (
          <select title={isOutfit ? 'Addons' : 'Pattern Y'} value={cy} onChange={(e) => setPy(Number((e.target as HTMLSelectElement).value))}>
            {[...Array(g.patternY).keys()].map((i) => (
              <option key={i} value={i}>
                {isOutfit ? (i ? `Addon ${i}` : 'No addon') : `Y ${i}`}
              </option>
            ))}
          </select>
        )}
        {g.patternZ > 1 && (
          <select title={isOutfit ? 'Mount' : 'Pattern Z'} value={cz} onChange={(e) => setPz(Number((e.target as HTMLSelectElement).value))}>
            {[...Array(g.patternZ).keys()].map((i) => (
              <option key={i} value={i}>
                {isOutfit ? (i ? 'Mounted' : 'Unmounted') : `Z ${i}`}
              </option>
            ))}
          </select>
        )}
        {g.layers > 1 && (
          <select title="Layers" value={layerMode} onChange={(e) => setLayerMode((e.target as HTMLSelectElement).value)}>
            <option value="auto">{isOutfit ? 'Colorized' : 'Layer 0'}</option>
            <option value="all">All layers</option>
            {[...Array(g.layers).keys()].map((i) => (
              <option key={i} value={i}>
                Layer {i}
                {isOutfit && i === 1 ? ' (mask)' : ''}
              </option>
            ))}
          </select>
        )}
        <span class="sep" />
        <button class="icon" title="Previous frame (,)" disabled={g.frames < 2} onClick={() => { setPlaying(false); setFrame((x) => (x - 1 + g.frames) % g.frames); }}>
          <SkipBack size={15} />
        </button>
        <button class={`icon ${playing && g.frames > 1 ? 'on' : ''}`} title="Play / pause (Space)" disabled={g.frames < 2} onClick={() => setPlaying(!playing)}>
          {playing ? <Pause size={15} /> : <Play size={15} />}
        </button>
        <button class="icon" title="Next frame (.)" disabled={g.frames < 2} onClick={() => { setPlaying(false); setFrame((x) => (x + 1) % g.frames); }}>
          <SkipForward size={15} />
        </button>
        <span class="zoom">
          {f + 1}/{g.frames}
        </span>
        <span class="sep" />
        <button class="icon" title="Zoom out (-)" onClick={() => zoomBy(-1)}>
          <ZoomOut size={15} />
        </button>
        <span class="zoom">{zoom * 100}%</span>
        <button class="icon" title="Zoom in (+)" onClick={() => zoomBy(1)}>
          <ZoomIn size={15} />
        </button>
        <select title="Background" value={bg} onChange={(e) => setBg((e.target as HTMLSelectElement).value as typeof bg)}>
          {BACKGROUNDS.map((b) => (
            <option key={b} value={b}>
              {b[0].toUpperCase() + b.slice(1)}
            </option>
          ))}
        </select>
        {p.hiRes.size > 0 && (
          <button class={`icon ${useHiRes ? 'on' : ''}`} title="Show high-res (CWM) sprites" onClick={() => setUseHiRes(!useHiRes)}>
            <Layers size={15} />
          </button>
        )}
        <span class="grow" />
        <button class="icon" title="Export this frame as PNG" onClick={() => download(`${thing.category}-${thing.id}.png`, encodePng(renderThing(thing, p.spr, renderOpts)), 'image/png')}>
          <ImageDown size={15} />
        </button>
        <button class="icon" title="Export sprite sheet (all frames and patterns)" onClick={() => download(`${thing.category}-${thing.id}-sheet.png`, encodePng(renderSheet(thing, p.spr, gi)), 'image/png')}>
          <FileDown size={15} />
        </button>
        <button class="icon" title="Import sprite sheet into this frame group" onClick={importSheetImage}>
          <FileUp size={15} />
        </button>
      </div>

      <div class={`stage ${bg === 'checker' ? 'checker' : `bg-${bg}`}`} onWheel={(e) => {
        if (!e.ctrlKey) return;
        e.preventDefault();
        zoomBy(e.deltaY < 0 ? 1 : -1);
      }}>
        <canvas ref={canvas} class="pixel" />
        <span class="stage-info">
          {g.width * SPRITE_SIZE}×{g.height * SPRITE_SIZE}px · {g.layers} layer(s) · patterns {g.patternX}×{g.patternY}×{g.patternZ} · {g.frames} frame(s)
          {g.frames > 1 ? ` · ${frameMs(g, f, thing.category)}ms` : ''}
        </span>
      </div>

      <div class="dock">
        {g.frames > 1 && (
          <>
            <div class="dock-head">Timeline</div>
            <div class="timeline">
              {[...Array(g.frames).keys()].map((i) => (
                <div key={i} class={`frame ${i === f ? 'on' : ''}`} onClick={() => { setPlaying(false); setFrame(i); }} title={g.animation ? `${g.animation.durations[i]?.min}–${g.animation.durations[i]?.max} ms` : undefined}>
                  <FrameThumb p={p} thing={thing} opts={{ ...renderOpts, frame: i }} deps={[thing, gi, cx, cy, cz, layerMode, colors, spriteRev]} />
                  <span>{i + 1}</span>
                </div>
              ))}
            </div>
          </>
        )}
        <div class="dock-head">
          Sprites · frame {f + 1}
          <span class="faint" style={{ textTransform: 'none', letterSpacing: 0 }}>
            drop an image on a tile, or on the layer title to replace the whole frame
          </span>
        </div>
        <div class="slot-layers">
          {slotLayers.map((l) => (
            <div
              key={l}
              class="slot-layer"
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault();
                const file = e.dataTransfer?.files[0];
                if (file) await importFrameImage(l, file);
              }}
            >
              <div class="lbl">
                Layer {l}
                {isOutfit && l === 1 ? ' (mask)' : ''}
                <button class="ghost small" style={{ height: 20 }} onClick={() => importFrameImage(l)}>
                  Replace frame…
                </button>
              </div>
              <div class="slot-grid" style={{ gridTemplateColumns: `repeat(${g.width}, auto)` }}>
                {[...Array(g.height).keys()].reverse().map((h) =>
                  [...Array(g.width).keys()].reverse().map((w) => {
                    const sid = g.sprites[spriteIndex(g, w, h, l, cx, cy, cz, f)] ?? 0;
                    const key = `${l}-${w}-${h}`;
                    return (
                      <div
                        key={key}
                        class={`slot ${dropSlot === key ? 'drop' : ''}`}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDropSlot(key);
                        }}
                        onDragLeave={() => setDropSlot(null)}
                        onDrop={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setDropSlot(null);
                          const file = e.dataTransfer?.files[0];
                          if (!file) return;
                          const nid = p.addSpriteImage(await decodeImageFile(file));
                          touch(true);
                          setSlot(w, h, l, nid);
                        }}
                      >
                        <button class="slot-img" title={sid ? `Open sprite ${sid}` : 'Empty tile'} onClick={() => sid && selectSprite(sid, true)}>
                          <Thumb zoom={2} image={() => spriteImage(p, sid)} deps={[sid, spriteRev]} />
                        </button>
                        <input
                          type="number"
                          min={0}
                          max={p.spr.count}
                          value={sid}
                          aria-label={`Sprite id of tile ${w},${h}`}
                          onChange={(e) => {
                            const v = Number((e.target as HTMLInputElement).value);
                            if (v >= 0 && v <= p.spr.count) setSlot(w, h, l, v);
                          }}
                        />
                      </div>
                    );
                  }),
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FrameThumb({ p, thing, opts, deps }: { p: Project; thing: ThingType; opts: Parameters<typeof renderThing>[2]; deps: unknown[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) paintFit(ref.current, renderThing(thing, p.spr, opts), 48);
  }, deps);
  return <canvas ref={ref} class="pixel checker" />;
}
