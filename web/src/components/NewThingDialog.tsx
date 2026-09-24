import { useEffect, useRef, useState } from 'preact/hooks';
import { buildOutfit, DIRECTIONS, importSheet, parseLegacyOutfitName, type Direction } from '../../../src/core/builder.ts';
import { CATEGORIES, type FrameGroup, type ThingCategory } from '../../../src/core/dat/types.ts';
import type { RgbaImage } from '../../../src/core/image/image.ts';
import { SPRITE_SIZE } from '../../../src/core/spr/spr.ts';
import { paintFit } from '../lib/canvas.ts';
import { decodeImageFile, filesFromDrop, pickFiles } from '../lib/files.ts';
import { closeDialog, commitAdd, project, select, toast, touch, withBusy } from '../state.ts';
import { Modal } from './ui.tsx';

type Mode = 'frames' | 'outfit' | 'sheet';

interface Named {
  name: string;
  image: RgbaImage;
}

function Preview({ image, size = 64 }: { image?: RgbaImage; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current && image) paintFit(ref.current, image, size);
  }, [image]);
  return image ? <canvas ref={ref} class="pixel" /> : <div class="empty-cell" style={{ width: size, height: size }} />;
}

async function decodeAll(files: File[]): Promise<Named[]> {
  const images = files.filter((f) => /\.(png|bmp|gif|webp|jpe?g)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return Promise.all(images.map(async (f) => ({ name: f.name, image: await decodeImageFile(f) })));
}

export function NewThingDialog({ category: initial }: { category?: string }) {
  const p = project.value!;
  const [category, setCategory] = useState<ThingCategory>((CATEGORIES as readonly string[]).includes(initial ?? '') ? (initial as ThingCategory) : 'item');
  const [mode, setMode] = useState<Mode>(initial === 'outfit' ? 'outfit' : 'frames');
  const [frames, setFrames] = useState<Named[]>([]);
  const [outfit, setOutfit] = useState<Partial<Record<Direction, RgbaImage[]>>>({});
  const [templates, setTemplates] = useState<Partial<Record<Direction, RgbaImage[]>>>({});
  const [withTemplate, setWithTemplate] = useState(false);
  const [sheet, setSheet] = useState<Named | null>(null);
  const [layout, setLayout] = useState({ width: 1, height: 1, layers: 1, patternX: 1, patternY: 1, patternZ: 1, frames: 1 });
  const [hiRes, setHiRes] = useState(false);
  const [outfitFrames, setOutfitFrames] = useState(3);

  const tileSize = hiRes ? SPRITE_SIZE * 2 : SPRITE_SIZE;

  const addOutfitFiles = async (files: File[], target: 'frames' | 'templates') => {
    const decoded = await decodeAll(files);
    const set = target === 'frames' ? setOutfit : setTemplates;
    const current = target === 'frames' ? outfit : templates;
    const next: Partial<Record<Direction, RgbaImage[]>> = Object.fromEntries(Object.entries(current).map(([k, v]) => [k, [...v]]));
    let unmatched = 0;
    for (const d of decoded) {
      const parsed = parseLegacyOutfitName(d.name);
      if (!parsed) {
        unmatched++;
        continue;
      }
      (next[parsed.direction] ??= [])[parsed.frame] = d.image;
    }
    set(next);
    const max = Math.max(0, ...DIRECTIONS.map((dir) => next[dir]?.length ?? 0));
    if (max > outfitFrames) setOutfitFrames(max);
    if (unmatched) toast(`${unmatched} files were ignored: name them <direction><frame>.png (1=south, 2=east, 3=west, 4=north), e.g. 11.png`, 'error', 9000);
  };

  const setCell = async (dir: Direction, frame: number, file: File, target: 'frames' | 'templates') => {
    const img = await decodeImageFile(file);
    const set = target === 'frames' ? setOutfit : setTemplates;
    set((cur) => {
      const arr = [...(cur[dir] ?? [])];
      arr[frame] = img;
      return { ...cur, [dir]: arr };
    });
  };

  const create = async () => {
    await withBusy('Creating…', async () => {
      let groups: FrameGroup[];
      if (mode === 'outfit') {
        const fill = (src: Partial<Record<Direction, RgbaImage[]>>) =>
          Object.fromEntries(DIRECTIONS.map((d) => [d, Array.from({ length: outfitFrames }, (_, i) => src[d]?.[i] ?? { width: 1, height: 1, data: new Uint8Array(4) })]));
        if (!DIRECTIONS.some((d) => outfit[d]?.some(Boolean))) throw new Error('Add at least one outfit image');
        groups = buildOutfit(
          { spr: p.spr, hiRes: p.hiRes as Map<number, RgbaImage>, dedupe: true },
          { frames: fill(outfit), templates: withTemplate ? fill(templates) : undefined },
          { tileSize, frameGroups: p.features.frameGroups && category === 'outfit' },
        );
      } else if (mode === 'sheet') {
        if (!sheet) throw new Error('Choose a sprite sheet image');
        groups = [importSheet({ spr: p.spr, hiRes: p.hiRes as Map<number, RgbaImage>, dedupe: true }, sheet.image, { ...layout, tileSize })];
      } else {
        if (!frames.length) throw new Error('Add at least one image');
        groups = [p.buildGroup(frames.map((f, i) => ({ image: f.image, frame: i })), { tileSize })];
      }
      const thing = p.add(category, { groups });
      touch(true);
      commitAdd(thing);
      select(category, thing.id);
      closeDialog();
      toast(`Created ${category} ${thing.id}`, 'success');
    });
  };

  const expectedSheet = `${layout.patternX * layout.frames * layout.width * tileSize}×${layout.patternY * layout.patternZ * layout.layers * layout.height * tileSize}px`;

  return (
    <Modal title="New thing from images" wide>
      <div class="row wrap">
        <label class="field inline">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory((e.target as HTMLSelectElement).value as ThingCategory)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label class="field inline">
          <span>Source</span>
          <select value={mode} onChange={(e) => setMode((e.target as HTMLSelectElement).value as Mode)}>
            <option value="frames">Images → animation frames</option>
            <option value="outfit">Directional frames (outfit / creature)</option>
            <option value="sheet">Sprite sheet</option>
          </select>
        </label>
        <label class="check" title="Images are drawn at 2× (64px per tile). A 32px version goes into Tibia.spr and the original is kept for OTClientV8's Tibia.cwm.">
          <input type="checkbox" checked={hiRes} onChange={(e) => setHiRes((e.target as HTMLInputElement).checked)} /> High-res source (64px tiles)
        </label>
      </div>

      {mode === 'frames' && (
        <div
          class="dropzone small"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            setFrames([...frames, ...(await decodeAll(await filesFromDrop(e)))]);
          }}
        >
          <p>Drop images (one per animation frame, sorted by name). Things larger than {tileSize}px span several tiles, anchored bottom-right.</p>
          <button onClick={async () => setFrames([...frames, ...(await decodeAll(await pickFiles('image/*')))])}>Choose images…</button>
          <div class="frames">
            {frames.map((f, i) => (
              <figure key={i}>
                <Preview image={f.image} />
                <figcaption>
                  {i + 1}. {f.name}
                  <button class="ghost small" onClick={() => setFrames(frames.filter((_, j) => j !== i))}>
                    ✕
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}

      {mode === 'outfit' && (
        <div
          class="dropzone small"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            await addOutfitFiles(await filesFromDrop(e), 'frames');
          }}
        >
          <p>
            Drop a folder named like the classic e2e layout (<code>11.png</code> … <code>43.png</code>: first digit 1=south 2=east 3=west 4=north,
            second digit = frame) or click cells to fill them. Frame 1 is the standing pose
            {p.features.frameGroups ? '; with frame groups it becomes the idle group and the rest the walking group.' : '.'}
          </p>
          <div class="row wrap">
            <button onClick={async () => addOutfitFiles(await pickFiles('image/*'), 'frames')}>Choose files…</button>
            <label class="field inline">
              <span>Frames</span>
              <input type="number" min={1} max={32} value={outfitFrames} onChange={(e) => setOutfitFrames(Math.max(1, Number((e.target as HTMLInputElement).value)))} />
            </label>
            <label class="check" title="Second layer with yellow (head), red (body), green (legs), blue (feet) masks used for outfit colors">
              <input type="checkbox" checked={withTemplate} onChange={(e) => setWithTemplate((e.target as HTMLInputElement).checked)} /> Color template layer
            </label>
          </div>
          {(['frames', ...(withTemplate ? ['templates'] : [])] as Array<'frames' | 'templates'>).map((target) => (
            <table class="outfit-grid" key={target}>
              <caption>{target === 'frames' ? 'Outfit' : 'Color template'}</caption>
              <thead>
                <tr>
                  <th />
                  {Array.from({ length: outfitFrames }, (_, i) => (
                    <th key={i}>Frame {i + 1}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DIRECTIONS.map((dir) => (
                  <tr key={dir}>
                    <th>{dir}</th>
                    {Array.from({ length: outfitFrames }, (_, i) => {
                      const img = (target === 'frames' ? outfit : templates)[dir]?.[i];
                      return (
                        <td key={i}>
                          <button
                            class="cell-btn"
                            title="Click or drop an image"
                            onClick={async () => {
                              const [f] = await pickFiles('image/*', false);
                              if (f) await setCell(dir, i, f, target);
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onDrop={async (e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const f = e.dataTransfer?.files[0];
                              if (f) await setCell(dir, i, f, target);
                            }}
                          >
                            <Preview image={img} size={48} />
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      )}

      {mode === 'sheet' && (
        <div class="dropzone small">
          <p>
            Sheet layout (same as “Export sheet”): columns = frames × pattern X, rows = layers × pattern Z × pattern Y. Expected size: <strong>{expectedSheet}</strong>
          </p>
          <div class="dims">
            {(Object.keys(layout) as Array<keyof typeof layout>).map((k) => (
              <label key={k}>
                {k}
                <input type="number" min={1} max={k === 'frames' ? 255 : 16} value={layout[k]} onChange={(e) => setLayout({ ...layout, [k]: Math.max(1, Number((e.target as HTMLInputElement).value)) })} />
              </label>
            ))}
          </div>
          <div class="row">
            <button
              onClick={async () => {
                const [f] = await pickFiles('image/*', false);
                if (f) setSheet({ name: f.name, image: await decodeImageFile(f) });
              }}
            >
              Choose sheet…
            </button>
            {sheet && (
              <span class="muted">
                {sheet.name} ({sheet.image.width}×{sheet.image.height})
              </span>
            )}
          </div>
          {sheet && <Preview image={sheet.image} size={192} />}
        </div>
      )}

      <div class="row end">
        <button class="ghost" onClick={closeDialog}>
          Cancel
        </button>
        <button class="primary" onClick={create}>
          Create {category}
        </button>
      </div>
    </Modal>
  );
}
