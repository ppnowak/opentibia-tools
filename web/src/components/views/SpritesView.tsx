import { useState } from 'preact/hooks';
import { ImagePlus } from 'lucide-preact';
import { spriteImage } from '../../lib/canvas.ts';
import { decodeImageFile, pickFiles } from '../../lib/files.ts';
import { activeDoc, docKey, layout, project, revision, selectSprite, selected, spriteRevision, toast, touch, withBusy } from '../../state.ts';
import { Thumb } from '../Thumb.tsx';
import { VirtualGrid } from '../VirtualGrid.tsx';
import { NoClient } from './NoClient.tsx';

export async function addSpriteFiles(files: File[]): Promise<void> {
  const p = project.value;
  if (!p) return;
  const images = files.filter((f) => /\.(png|bmp|gif|webp|jpe?g)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  if (!images.length) return;
  let first = 0;
  await withBusy('Adding sprites…', async (progress) => {
    for (let i = 0; i < images.length; i++) {
      const id = p.spr.count + 1;
      p.setSpriteImage(id, await decodeImageFile(images[i]));
      first ||= id;
      await progress(i + 1, images.length);
    }
  });
  touch(true);
  if (first) selectSprite(first, true);
  toast(`Added ${images.length} sprite(s) starting at ${first}`, 'success');
}

export function SpritesView() {
  const p = project.value;
  revision.value;
  const spriteRev = spriteRevision.value;
  const [goto, setGoto] = useState('');
  if (!p) return <NoClient />;
  const sel = selected.value.sprite;
  const cell = Math.min(layout.value.thumb, 64);
  const jump = () => {
    const id = Number.parseInt(goto, 10);
    if (id >= 1 && id <= p.spr.count) selectSprite(id, true);
  };
  return (
    <>
      <div class="pane-head">
        <span class="grow">Sprites</span>
        <button class="icon" title="Add sprites from images" onClick={async () => addSpriteFiles(await pickFiles('image/*'))}>
          <ImagePlus size={15} />
        </button>
      </div>
      <div class="pane-tools">
        <input type="search" placeholder={`Go to sprite (1–${p.spr.count})`} value={goto} onInput={(e) => setGoto((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && jump()} />
      </div>
      <div class="muted small" style={{ padding: '0 12px 4px' }}>
        {p.spr.count} sprites{p.hiRes.size ? ` · ${p.hiRes.size} high-res` : ''}
      </div>
      <VirtualGrid
        label="Sprites"
        count={p.spr.count}
        cellWidth={cell + 12}
        cellHeight={cell + 24}
        selected={sel - 1}
        scrollKey={sel}
        onNavigate={(i) => selectSprite(i + 1)}
        onActivate={(i) => selectSprite(i + 1, true)}
        renderCell={(i) => {
          const id = i + 1;
          return (
            <div class={`cell ${id === sel && activeDoc.value === docKey('sprite', undefined, id) ? 'selected' : ''}`} onClick={() => selectSprite(id)} onDblClick={() => selectSprite(id, true)}>
              <Thumb box={cell} image={() => spriteImage(p, id)} deps={[id, spriteRev, p, cell]} />
              <span>{id}</span>
            </div>
          );
        }}
      />
    </>
  );
}
