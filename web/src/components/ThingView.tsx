import { useEffect, useRef, useState } from 'preact/hooks';
import { importSheet, sliceTiles } from '../../../src/core/builder.ts';
import { spriteIndex, FrameGroupType, type FrameGroup, type ThingCategory, type ThingType } from '../../../src/core/dat/types.ts';
import { exportThings } from '../../../src/core/json.ts';
import { encodePng } from '../../../src/core/image/png.ts';
import { OUTFIT_COLOR_COUNT, outfitColor, renderSheet, renderThing, type OutfitColors } from '../../../src/core/render.ts';
import { SPRITE_SIZE } from '../../../src/core/spr/spr.ts';
import { paint, spriteImage } from '../lib/canvas.ts';
import { decodeImageFile, download, pickFiles } from '../lib/files.ts';
import { commitRemove, commitThing, commitAdd, project, revision, select, selected, spriteRevision, tab, toast, touch } from '../state.ts';
import { Thumb } from './Thumb.tsx';

const BACKGROUNDS = ['checker', 'dark', 'light', 'grass'] as const;
const DIRECTIONS = ['North', 'East', 'South', 'West'];

export function ThingView() {
  const p = project.value!;
  revision.value;
  const category = tab.value as ThingCategory;
  const id = selected.value[category];
  const thing = p.get(category, id);
  if (!thing) {
    return (
      <section class="center empty-state">
        <p>No {category}s in this client yet.</p>
        <button onClick={() => select(category, p.add(category).id)}>Add an empty {category}</button>
      </section>
    );
  }
  return <ThingPreview key={`${category}`} thing={thing} />;
}

function ThingPreview({ thing }: { thing: ThingType }) {
  const p = project.value!;
  const spriteRev = spriteRevision.value;
  const [groupIdx, setGroupIdx] = useState(0);
  const [frame, setFrame] = useState(0);
  const [px, setPx] = useState(thing.category === 'outfit' ? 2 : 0);
  const [py, setPy] = useState(0);
  const [pz, setPz] = useState(0);
  const [layerMode, setLayerMode] = useState<string>('auto');
  const [zoom, setZoom] = useState(3);
  const [playing, setPlaying] = useState(true);
  const [bg, setBg] = useState<(typeof BACKGROUNDS)[number]>('checker');
  const [colors, setColors] = useState<OutfitColors>({ head: 78, body: 69, legs: 58, feet: 76 });
  const [useHiRes, setUseHiRes] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);

  const g: FrameGroup = thing.groups[Math.min(groupIdx, thing.groups.length - 1)];
  const f = frame % g.frames;
  const clampedPx = Math.min(px, g.patternX - 1);
  const clampedPy = Math.min(py, g.patternY - 1);
  const clampedPz = Math.min(pz, g.patternZ - 1);
  const isOutfit = thing.category === 'outfit';
  const layer: number | 'all' | undefined = layerMode === 'auto' ? undefined : layerMode === 'all' ? 'all' : Number(layerMode);
  const colorize = isOutfit && g.layers > 1 && layerMode === 'auto';

  // reset view state when switching things
  useEffect(() => {
    setFrame(0);
    setGroupIdx(isOutfit && thing.groups.length > 1 ? 1 : 0);
  }, [thing.id, thing.category]);

  useEffect(() => {
    if (!canvas.current) return;
    if (useHiRes && p.hiRes.size > 0) {
      paintHiRes(canvas.current, g, f, clampedPx, clampedPy, clampedPz, zoom);
      return;
    }
    const img = renderThing(thing, p.spr, {
      group: groupIdx,
      frame: f,
      patternX: clampedPx,
      patternY: clampedPy,
      patternZ: clampedPz,
      layer,
      outfitColors: colorize ? colors : undefined,
    });
    paint(canvas.current, img, zoom);
  }, [thing, groupIdx, f, clampedPx, clampedPy, clampedPz, layerMode, zoom, colors, spriteRev, useHiRes]);

  // animation
  useEffect(() => {
    if (!playing || g.frames <= 1) return;
    const d = g.animation?.durations[f];
    const ms = d ? Math.max(40, (d.min + d.max) / 2) : thing.category === 'item' ? 400 : thing.category === 'outfit' ? 150 : 100;
    const t = setTimeout(() => setFrame((x) => (x + 1) % g.frames), ms);
    return () => clearTimeout(t);
  }, [playing, f, g]);

  const paintHiRes = (c: HTMLCanvasElement, grp: FrameGroup, fr: number, x: number, y: number, z: number, zm: number) => {
    c.width = grp.width * SPRITE_SIZE * zm;
    c.height = grp.height * SPRITE_SIZE * zm;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = false;
    const layers = layer === 'all' ? [...Array(grp.layers).keys()] : [typeof layer === 'number' ? layer : 0];
    for (const l of layers)
      for (let h = 0; h < grp.height; h++)
        for (let w = 0; w < grp.width; w++) {
          const sid = grp.sprites[spriteIndex(grp, w, h, l, x, y, z, fr)];
          if (!sid) continue;
          const hi = p.getHiRes(sid);
          const img = hi ?? spriteImage(p, sid);
          const tmp = document.createElement('canvas');
          tmp.width = img.width;
          tmp.height = img.height;
          tmp.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(img.data), img.width, img.height), 0, 0);
          const cell = SPRITE_SIZE * zm;
          ctx.drawImage(tmp, (grp.width - 1 - w) * cell, (grp.height - 1 - h) * cell, cell, cell);
        }
  };

  const update = (next: ThingType) => commitThing(next);
  const replaceGroup = (ng: FrameGroup) => {
    const groups = thing.groups.slice();
    groups[Math.min(groupIdx, groups.length - 1)] = ng;
    update({ ...thing, groups });
  };

  const setSlot = (w: number, h: number, l: number, sid: number) => {
    const ng = { ...g, sprites: g.sprites.slice() };
    ng.sprites[spriteIndex(g, w, h, l, clampedPx, clampedPy, clampedPz, f)] = sid;
    replaceGroup(ng);
  };

  const importFrameImage = async (l: number, file?: File) => {
    const f0 = file ?? (await pickFiles('image/*', false))[0];
    if (!f0) return;
    const img = await decodeImageFile(f0);
    const tileSize = img.width >= g.width * SPRITE_SIZE * 2 && img.height >= g.height * SPRITE_SIZE * 2 ? SPRITE_SIZE * 2 : SPRITE_SIZE;
    const tiles = sliceTiles(img, g.width, g.height, tileSize);
    const ng = { ...g, sprites: g.sprites.slice() };
    for (let h = 0; h < g.height; h++)
      for (let w = 0; w < g.width; w++) {
        ng.sprites[spriteIndex(g, w, h, l, clampedPx, clampedPy, clampedPz, f)] = p.addSpriteImage(tiles[h * g.width + w]);
      }
    touch(true);
    replaceGroup(ng);
    toast(`Frame ${f + 1} updated from ${f0.name}${tileSize > SPRITE_SIZE ? ' (kept high-res copy)' : ''}`, 'success');
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
    toast('Sprite sheet imported', 'success');
  };

  const cur = { px: clampedPx, py: clampedPy, pz: clampedPz };
  const slotLayers = layer === 'all' || colorize ? [...Array(g.layers).keys()] : [typeof layer === 'number' ? layer : 0];

  return (
    <section class="center">
      <div class="preview-head">
        <h2>
          {thing.category} {thing.id}
        </h2>
        <div class="row wrap">
          <button onClick={() => download(`${thing.category}-${thing.id}.png`, encodePng(renderThing(thing, p.spr, { group: groupIdx, frame: f, ...{ patternX: cur.px, patternY: cur.py, patternZ: cur.pz }, layer, outfitColors: colorize ? colors : undefined })), 'image/png')}>
            Export PNG
          </button>
          <button title="All frames and patterns in one image" onClick={() => download(`${thing.category}-${thing.id}-sheet.png`, encodePng(renderSheet(thing, p.spr, groupIdx)), 'image/png')}>
            Export sheet
          </button>
          <button title="Replace all sprites of this frame group from a sheet laid out like 'Export sheet'" onClick={importSheetImage}>
            Import sheet
          </button>
          <button
            title="Portable bundle (things + sprites) that can be imported into any client version"
            onClick={() => download(`${thing.category}-${thing.id}.otthings.json`, JSON.stringify(exportThings(p, [thing])), 'application/json')}
          >
            Export bundle
          </button>
          <button
            onClick={() => {
              const copy = p.duplicate(thing.category, thing.id);
              commitAdd(copy);
              select(thing.category, copy.id);
            }}
          >
            Duplicate
          </button>
          <button
            class="danger"
            title="The last thing is removed; others are cleared so following ids stay stable"
            onClick={() => {
              if (confirm(`Remove ${thing.category} ${thing.id}?`)) commitRemove(thing.category, thing.id);
            }}
          >
            Remove
          </button>
        </div>
      </div>

      <div class={`stage bg-${bg}`}>
        <canvas ref={canvas} class="pixel" />
      </div>

      <div class="controls">
        {thing.groups.length > 1 && (
          <label class="field inline">
            <span>Group</span>
            <select value={groupIdx} onChange={(e) => setGroupIdx(Number((e.target as HTMLSelectElement).value))}>
              {thing.groups.map((grp, i) => (
                <option key={i} value={i}>
                  {grp.type === FrameGroupType.Moving ? 'Moving' : 'Idle'}
                </option>
              ))}
            </select>
          </label>
        )}
        {g.patternX > 1 && (
          <label class="field inline">
            <span>{isOutfit || thing.category === 'missile' ? 'Direction' : 'Pattern X'}</span>
            <select value={cur.px} onChange={(e) => setPx(Number((e.target as HTMLSelectElement).value))}>
              {[...Array(g.patternX).keys()].map((i) => (
                <option key={i} value={i}>
                  {isOutfit && g.patternX === 4 ? DIRECTIONS[i] : i}
                </option>
              ))}
            </select>
          </label>
        )}
        {g.patternY > 1 && (
          <label class="field inline">
            <span>{isOutfit ? 'Addon' : 'Pattern Y'}</span>
            <select value={cur.py} onChange={(e) => setPy(Number((e.target as HTMLSelectElement).value))}>
              {[...Array(g.patternY).keys()].map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
        )}
        {g.patternZ > 1 && (
          <label class="field inline">
            <span>{isOutfit ? 'Mount' : 'Pattern Z'}</span>
            <select value={cur.pz} onChange={(e) => setPz(Number((e.target as HTMLSelectElement).value))}>
              {[...Array(g.patternZ).keys()].map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>
        )}
        {g.layers > 1 && (
          <label class="field inline">
            <span>Layer</span>
            <select value={layerMode} onChange={(e) => setLayerMode((e.target as HTMLSelectElement).value)}>
              <option value="auto">{isOutfit ? 'Colorized' : 'Layer 0'}</option>
              <option value="all">All blended</option>
              {[...Array(g.layers).keys()].map((i) => (
                <option key={i} value={i}>
                  Layer {i}
                  {isOutfit && i === 1 ? ' (template)' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        {g.frames > 1 && (
          <div class="field inline frame-ctl">
            <span>Frame</span>
            <button onClick={() => setPlaying(!playing)} title={playing ? 'Pause' : 'Play'}>
              {playing ? '❚❚' : '▶'}
            </button>
            <input type="range" min={0} max={g.frames - 1} value={f} onInput={(e) => { setPlaying(false); setFrame(Number((e.target as HTMLInputElement).value)); }} />
            <span class="muted">
              {f + 1}/{g.frames}
            </span>
          </div>
        )}
        <label class="field inline">
          <span>Zoom</span>
          <select value={zoom} onChange={(e) => setZoom(Number((e.target as HTMLSelectElement).value))}>
            {[1, 2, 3, 4, 6, 8].map((z) => (
              <option key={z} value={z}>
                {z}×
              </option>
            ))}
          </select>
        </label>
        <label class="field inline">
          <span>Background</span>
          <select value={bg} onChange={(e) => setBg((e.target as HTMLSelectElement).value as typeof bg)}>
            {BACKGROUNDS.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        {p.hiRes.size > 0 && (
          <label class="check">
            <input type="checkbox" checked={useHiRes} onChange={(e) => setUseHiRes((e.target as HTMLInputElement).checked)} /> High-res (CWM)
          </label>
        )}
      </div>

      {colorize && <OutfitColorPicker colors={colors} onChange={setColors} />}

      <div class="slots">
        <h3>
          Sprites — frame {f + 1}
          {g.patternX > 1 ? `, x ${cur.px}` : ''}
          {g.patternY > 1 ? `, y ${cur.py}` : ''}
          {g.patternZ > 1 ? `, z ${cur.pz}` : ''}
        </h3>
        <p class="hint">Drop an image on a layer to replace the whole frame, or on a tile to replace one sprite. Edit ids to reuse existing sprites.</p>
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
            <div class="row">
              <strong>Layer {l}</strong>
              <button class="small" onClick={() => importFrameImage(l)}>
                Replace frame from image…
              </button>
            </div>
            <div class="slot-grid" style={{ gridTemplateColumns: `repeat(${g.width}, auto)` }}>
              {[...Array(g.height).keys()].reverse().map((h) =>
                [...Array(g.width).keys()].reverse().map((w) => {
                  const sid = g.sprites[spriteIndex(g, w, h, l, cur.px, cur.py, cur.pz, f)] ?? 0;
                  return (
                    <SpriteSlot
                      key={`${w}-${h}`}
                      sid={sid}
                      onChange={(v) => setSlot(w, h, l, v)}
                      onImage={async (file) => {
                        const nid = p.addSpriteImage(await decodeImageFile(file));
                        touch(true);
                        setSlot(w, h, l, nid);
                      }}
                      spriteRev={spriteRev}
                    />
                  );
                }),
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SpriteSlot({ sid, onChange, onImage, spriteRev }: { sid: number; onChange(v: number): void; onImage(f: File): void; spriteRev: number }) {
  const p = project.value!;
  return (
    <div
      class="slot"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const file = e.dataTransfer?.files[0];
        if (file) onImage(file);
      }}
    >
      <button class="slot-img" title={sid ? `Open sprite ${sid}` : 'Empty'} onClick={() => sid && select('sprite', sid)}>
        <Thumb zoom={2} image={() => spriteImage(p, sid)} deps={[sid, spriteRev]} />
      </button>
      <input
        type="number"
        min={0}
        max={p.spr.count}
        value={sid}
        onChange={(e) => {
          const v = Number((e.target as HTMLInputElement).value);
          if (v >= 0 && v <= p.spr.count) onChange(v);
        }}
      />
    </div>
  );
}

function OutfitColorPicker({ colors, onChange }: { colors: OutfitColors; onChange(c: OutfitColors): void }) {
  const [part, setPart] = useState<keyof OutfitColors>('head');
  return (
    <div class="outfit-colors">
      <div class="row">
        {(['head', 'body', 'legs', 'feet'] as const).map((k) => {
          const [r, g, b] = outfitColor(colors[k]);
          return (
            <button key={k} class={part === k ? 'active' : ''} onClick={() => setPart(k)}>
              <span class="swatch" style={{ background: `rgb(${r},${g},${b})` }} /> {k} {colors[k]}
            </button>
          );
        })}
      </div>
      <div class="palette">
        {[...Array(OUTFIT_COLOR_COUNT).keys()].map((c) => {
          const [r, g, b] = outfitColor(c);
          return (
            <button
              key={c}
              title={String(c)}
              class={colors[part] === c ? 'active' : ''}
              style={{ background: `rgb(${r},${g},${b})` }}
              onClick={() => onChange({ ...colors, [part]: c })}
            />
          );
        })}
      </div>
    </div>
  );
}
