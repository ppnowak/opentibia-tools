import { useMemo, useState } from 'preact/hooks';
import { Eraser, FileDown, Replace } from 'lucide-preact';
import { encodePng } from '../../../../src/core/image/png.ts';
import { spriteImage } from '../../lib/canvas.ts';
import { decodeImageFile, download, pickFiles, zipFiles } from '../../lib/files.ts';
import { project, revision, selectThing, spriteRevision, toast, touch, withBusy } from '../../state.ts';
import { Thumb } from '../Thumb.tsx';
import type { ThingCategory } from '../../../../src/core/dat/types.ts';

export function SpriteDoc({ id }: { id: number }) {
  const p = project.value;
  revision.value;
  const spriteRev = spriteRevision.value;
  const [usages, setUsages] = useState<Array<{ category: ThingCategory; id: number }> | null>(null);
  const [range, setRange] = useState({ from: Math.max(1, id - 50), to: Math.min(p?.spr.count ?? 1, id + 50) });
  const hi = useMemo(() => p?.getHiRes(id), [p, id, spriteRev, p?.hiRes.size]);
  if (!p) return null;
  const exists = id >= 1 && id <= p.spr.count;

  const replace = async (file?: File) => {
    const f = file ?? (await pickFiles('image/*', false))[0];
    if (!f) return;
    p.setSpriteImage(id, await decodeImageFile(f));
    touch(true);
    toast(`Sprite ${id} replaced from ${f.name} (affects every thing using it)`, 'success');
  };

  const findUsages = () => {
    const out: Array<{ category: ThingCategory; id: number }> = [];
    for (const category of ['item', 'outfit', 'effect', 'missile'] as const)
      for (const t of p.list(category)) if (t.groups.some((g) => g.sprites.includes(id))) out.push({ category, id: t.id });
    setUsages(out);
  };

  const exportRange = () =>
    withBusy('Exporting sprites…', async (progress) => {
      const from = Math.max(1, range.from);
      const to = Math.min(p.spr.count, range.to);
      const entries: Record<string, Uint8Array> = {};
      for (let i = from; i <= to; i++) {
        if (!p.spr.isEmpty(i)) entries[`${i}.png`] = encodePng(spriteImage(p, i), 1);
        if (i % 500 === 0) await progress(i - from, to - from);
      }
      download(`sprites-${from}-${to}.zip`, zipFiles(entries), 'application/zip');
    });

  return (
    <div class="doc">
      <div class="doc-toolbar">
        <span class="doc-title">Sprite {id}</span>
        <span class="grow" />
        <button class="ghost" disabled={!exists} onClick={() => replace()}>
          <Replace size={14} /> Replace…
        </button>
        <button class="ghost" disabled={!exists} onClick={() => download(`${id}.png`, encodePng(spriteImage(p, id)), 'image/png')}>
          <FileDown size={14} /> Export PNG
        </button>
        {hi && (
          <button class="ghost" onClick={() => download(`${id}-hires.png`, encodePng(hi), 'image/png')}>
            <FileDown size={14} /> Export high-res
          </button>
        )}
        <button
          class="ghost danger"
          disabled={!exists}
          onClick={() => {
            p.spr.clear(id);
            p.hiRes.delete(id);
            touch(true);
          }}
        >
          <Eraser size={14} /> Clear
        </button>
      </div>
      <div
        class="stage checker"
        onDragOver={(e) => e.preventDefault()}
        onDrop={async (e) => {
          e.preventDefault();
          e.stopPropagation();
          const f = e.dataTransfer?.files[0];
          if (f) await replace(f);
        }}
        title="Drop an image to replace this sprite"
      >
        <div class="row" style={{ gap: 32, alignItems: 'flex-end' }}>
          {exists ? (
            <figure style={{ margin: 0, textAlign: 'center' }}>
              <Thumb zoom={8} image={() => spriteImage(p, id)} deps={[id, spriteRev]} />
              <figcaption class="muted small">32×32</figcaption>
            </figure>
          ) : (
            <p class="muted">Sprite {id} does not exist</p>
          )}
          {hi && (
            <figure style={{ margin: 0, textAlign: 'center' }}>
              <Thumb zoom={Math.max(1, Math.floor(256 / hi.width))} image={() => hi} deps={[hi]} />
              <figcaption class="muted small">
                high-res {hi.width}×{hi.height}
              </figcaption>
            </figure>
          )}
        </div>
      </div>
      <div class="dock" style={{ padding: '8px 12px' }}>
        <div class="row wrap">
          <button onClick={findUsages}>Find things using sprite {id}</button>
          {usages && <span class="muted">{usages.length ? `${usages.length} found:` : 'not used by any thing'}</span>}
          {usages?.slice(0, 60).map((u) => (
            <button key={`${u.category}${u.id}`} class="ghost small" onClick={() => selectThing(u.category, u.id, { pin: true })}>
              {u.category} {u.id}
            </button>
          ))}
        </div>
        <div class="row wrap" style={{ marginTop: 8 }}>
          <span class="muted small">Export range as PNG zip</span>
          <input type="number" min={1} value={range.from} onChange={(e) => setRange({ ...range, from: Number((e.target as HTMLInputElement).value) })} />
          <span class="muted">–</span>
          <input type="number" min={1} value={range.to} onChange={(e) => setRange({ ...range, to: Number((e.target as HTMLInputElement).value) })} />
          <button onClick={exportRange}>Export</button>
        </div>
      </div>
    </div>
  );
}
