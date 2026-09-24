import { useState } from 'preact/hooks';
import { FIRST_ID, type ThingCategory } from '../../../src/core/dat/types.ts';
import { thingThumbnail, spriteImage } from '../lib/canvas.ts';
import { project, revision, select, selected, spriteRevision, tab, type Tab } from '../state.ts';
import { Thumb } from './Thumb.tsx';
import { VirtualGrid } from './VirtualGrid.tsx';

const TABS: Array<[Tab, string]> = [
  ['item', 'Items'],
  ['outfit', 'Outfits'],
  ['effect', 'Effects'],
  ['missile', 'Missiles'],
  ['sprite', 'Sprites'],
];

const CELL = 76;

export function Sidebar() {
  const p = project.value!;
  revision.value; // subscribe
  const t = tab.value;
  const counts = { ...p.counts(), sprite: p.spr.count };
  const first = t === 'sprite' ? 1 : FIRST_ID[t];
  const count = counts[t];
  const sel = selected.value[t];
  const [goto, setGoto] = useState('');
  const spriteRev = spriteRevision.value;

  const jump = () => {
    const id = Number.parseInt(goto, 10);
    if (Number.isFinite(id) && id >= first && id < first + count) select(t, id);
  };

  return (
    <aside class="sidebar">
      <nav class="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={t === key} class={t === key ? 'active' : ''} onClick={() => (tab.value = key)}>
            {label}
            <small>{counts[key]}</small>
          </button>
        ))}
      </nav>
      <div class="sidebar-search">
        <input
          type="number"
          placeholder={`Go to id (${first}–${first + count - 1})`}
          value={goto}
          onInput={(e) => setGoto((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => e.key === 'Enter' && jump()}
        />
        <button onClick={jump}>Go</button>
      </div>
      <VirtualGrid
        count={count}
        cellWidth={CELL}
        cellHeight={CELL + 14}
        selected={sel - first}
        scrollKey={`${t}:${sel}`}
        renderCell={(i) => {
          const id = first + i;
          if (t === 'sprite') {
            return (
              <button class={`cell ${id === sel ? 'selected' : ''}`} onClick={() => select('sprite', id)}>
                <Thumb box={64} image={() => spriteImage(p, id)} deps={[id, spriteRev, p]} />
                <span>{id}</span>
              </button>
            );
          }
          const thing = p.get(t as ThingCategory, id)!;
          return (
            <button class={`cell ${id === sel ? 'selected' : ''}`} onClick={() => select(t, id)}>
              <Thumb box={64} image={() => thingThumbnail(p, thing, spriteRev)} deps={[thing, spriteRev]} />
              <span>{id}</span>
            </button>
          );
        }}
      />
    </aside>
  );
}
