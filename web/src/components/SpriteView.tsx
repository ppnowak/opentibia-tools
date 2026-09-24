import { useMemo, useState } from 'preact/hooks';
import type { ThingCategory } from '../../../src/core/dat/types.ts';
import { encodePng } from '../../../src/core/image/png.ts';
import { spriteImage } from '../lib/canvas.ts';
import { decodeImageFile, download, filesFromDrop, pickFiles, zipFiles } from '../lib/files.ts';
import { project, revision, select, selected, spriteRevision, toast, touch, withBusy } from '../state.ts';
import { Thumb } from './Thumb.tsx';

export function SpriteView() {
  const p = project.value!;
  revision.value;
  const spriteRev = spriteRevision.value;
  const id = selected.value.sprite;
  const [usages, setUsages] = useState<Array<{ category: ThingCategory; id: number }> | null>(null);
  const [range, setRange] = useState({ from: 1, to: Math.min(p.spr.count, 1000) });
  const hi = useMemo(() => (id ? p.getHiRes(id) : undefined), [id, spriteRev, p.hiRes.size]);
  const exists = id >= 1 && id <= p.spr.count;

  const replace = async (file?: File) => {
    const f = file ?? (await pickFiles('image/*', false))[0];
    if (!f) return;
    p.setSpriteImage(id, await decodeImageFile(f));
    touch(true);
    toast(`Sprite ${id} replaced (affects every thing using it)`, 'success');
  };

  const addSprites = async (files: File[]) => {
    const images = files.filter((f) => /\.(png|bmp|gif|webp|jpe?g)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!images.length) return;
    let first = 0;
    await withBusy('Adding sprites…', async (progress) => {
      for (let i = 0; i < images.length; i++) {
        const nid = p.spr.count + 1;
        p.setSpriteImage(nid, await decodeImageFile(images[i]));
        if (!first) first = nid;
        await progress(i + 1, images.length);
      }
    });
    touch(true);
    if (first) select('sprite', first);
    toast(`Added ${images.length} sprites starting at ${first}`, 'success');
  };

  const findUsages = () => {
    const out: Array<{ category: ThingCategory; id: number }> = [];
    for (const category of ['item', 'outfit', 'effect', 'missile'] as const)
      for (const t of p.list(category)) if (t.groups.some((g) => g.sprites.includes(id))) out.push({ category, id: t.id });
    setUsages(out);
  };

  const exportRange = async () => {
    const from = Math.max(1, range.from);
    const to = Math.min(p.spr.count, range.to);
    if (to - from > 50_000 && !confirm(`Export ${to - from + 1} sprites? This may take a while.`)) return;
    await withBusy('Exporting sprites…', async (progress) => {
      const entries: Record<string, Uint8Array> = {};
      for (let i = from; i <= to; i++) {
        if (!p.spr.isEmpty(i)) entries[`${i}.png`] = encodePng(spriteImage(p, i), 1);
        if (i % 500 === 0) await progress(i - from, to - from);
      }
      download(`sprites-${from}-${to}.zip`, zipFiles(entries), 'application/zip');
    });
  };

  return (
    <section
      class="center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={async (e) => {
        e.preventDefault();
        await addSprites(await filesFromDrop(e));
      }}
    >
      <div class="preview-head">
        <h2>Sprite {id}</h2>
        <div class="row wrap">
          <button disabled={!exists} onClick={() => replace()}>
            Replace…
          </button>
          <button disabled={!exists} onClick={() => download(`${id}.png`, encodePng(spriteImage(p, id)), 'image/png')}>
            Export PNG
          </button>
          {hi && (
            <button onClick={() => download(`${id}-hires.png`, encodePng(hi), 'image/png')}>Export high-res</button>
          )}
          <button
            disabled={!exists}
            class="danger"
            onClick={() => {
              p.spr.clear(id);
              p.hiRes.delete(id);
              touch(true);
            }}
          >
            Clear
          </button>
          <button onClick={async () => addSprites(await pickFiles('image/*', true))}>Add sprites…</button>
        </div>
      </div>

      <div class="sprite-previews">
        <div
          class="stage bg-checker"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const f = e.dataTransfer?.files[0];
            if (f) await replace(f);
          }}
          title="Drop an image here to replace this sprite"
        >
          {exists ? <Thumb zoom={8} image={() => spriteImage(p, id)} deps={[id, spriteRev]} /> : <p>Sprite does not exist</p>}
        </div>
        {hi && (
          <div class="stage bg-checker">
            <Thumb zoom={Math.max(1, Math.floor(256 / hi.width))} image={() => hi} deps={[hi]} />
            <p class="muted small">High-res {hi.width}×{hi.height}</p>
          </div>
        )}
      </div>
      <p class="hint">Drop an image on the preview to replace this sprite; drop files anywhere else to append them as new sprites.</p>

      <div class="card">
        <div class="row">
          <button onClick={findUsages}>Find things using sprite {id}</button>
          {usages && <span class="muted">{usages.length} found</span>}
        </div>
        {usages && (
          <div class="usages">
            {usages.slice(0, 200).map((u) => (
              <button key={`${u.category}${u.id}`} class="chip" onClick={() => select(u.category, u.id)}>
                {u.category} {u.id}
              </button>
            ))}
          </div>
        )}
      </div>

      <div class="card">
        <h3>Export sprites as PNG (zip)</h3>
        <div class="row">
          <label class="field inline">
            <span>From</span>
            <input type="number" min={1} value={range.from} onChange={(e) => setRange({ ...range, from: Number((e.target as HTMLInputElement).value) })} />
          </label>
          <label class="field inline">
            <span>To</span>
            <input type="number" min={1} value={range.to} onChange={(e) => setRange({ ...range, to: Number((e.target as HTMLInputElement).value) })} />
          </label>
          <button onClick={exportRange}>Export</button>
        </div>
      </div>
    </section>
  );
}
