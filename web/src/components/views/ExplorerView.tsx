import { useMemo, useState } from 'preact/hooks';
import { Plus } from 'lucide-preact';
import { FLAG_INFO, supportedFlags, type FlagName } from '../../../../src/core/dat/flags.ts';
import { CATEGORIES, type ThingCategory, type ThingType } from '../../../../src/core/dat/types.ts';
import { thingThumbnail } from '../../lib/canvas.ts';
import { copySelection, duplicateSelection, exportSelectionBundle, paste, removeSelection } from '../../lib/commands.ts';
import {
  clipboard,
  docKey,
  activeDoc,
  explorerCategory,
  layout,
  multi,
  openDialog,
  project,
  revision,
  selectThing,
  selected,
  setLayout,
  spriteRevision,
} from '../../state.ts';
import { Thumb } from '../Thumb.tsx';
import { Dropdown, type MenuItem } from '../ui.tsx';
import { VirtualGrid } from '../VirtualGrid.tsx';
import { NoClient } from './NoClient.tsx';

const LABELS: Record<ThingCategory, string> = { item: 'Items', outfit: 'Outfits', effect: 'Effects', missile: 'Missiles' };

export function matchesQuery(t: ThingType, q: string): boolean {
  if (!q) return true;
  const range = /^(\d+)\s*-\s*(\d+)$/.exec(q);
  if (range) return t.id >= Number(range[1]) && t.id <= Number(range[2]);
  if (/^\d+$/.test(q)) return String(t.id).startsWith(q);
  return t.flags.market?.name.toLowerCase().includes(q.toLowerCase()) ?? false;
}

export function ExplorerView() {
  const p = project.value;
  revision.value;
  const spriteRev = spriteRevision.value;
  const category = explorerCategory.value;
  const [query, setQuery] = useState('');
  const [flag, setFlag] = useState<FlagName | ''>('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [anchor, setAnchor] = useState<number | null>(null);

  const list = p?.list(category) ?? [];
  const ids = useMemo(() => {
    if (!p) return [];
    const q = query.trim();
    if (!q && !flag) return list.map((t) => t.id);
    return list.filter((t) => (!flag || t.flags[flag] !== undefined) && matchesQuery(t, q)).map((t) => t.id);
  }, [p, category, query, flag, revision.value, list.length]);

  if (!p) return <NoClient />;

  const cell = layout.value.thumb;
  const sel = selected.value[category];
  const selIndex = ids.indexOf(sel);
  const activeKey = activeDoc.value;

  const click = (id: number, e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey) {
      const next = new Set(multi.value);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      multi.value = next;
      setAnchor(id);
      return;
    }
    if (e.shiftKey && anchor !== null) {
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(id);
      multi.value = new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
      selectThing(category, id, { keepMulti: true });
      return;
    }
    setAnchor(id);
    selectThing(category, id);
  };

  const contextItems: MenuItem[] = [
    { label: 'Open in New Tab', run: () => selectThing(category, sel, { pin: true, keepMulti: true }) },
    { label: 'Copy', keys: 'Ctrl+C', run: copySelection, section: true },
    { label: 'Paste', keys: 'Ctrl+V', run: () => void paste(category), enabled: !!clipboard.value },
    { label: 'Duplicate', keys: 'Ctrl+D', run: duplicateSelection },
    { label: 'Export as Bundle…', run: exportSelectionBundle, section: true },
    { label: `New ${category} from Images…`, run: () => openDialog('new-thing', { category }) },
    { label: 'Remove', keys: 'Delete', run: removeSelection, section: true },
  ];

  return (
    <>
      <div class="pane-head">
        <span class="grow">Explorer</span>
        <button class="icon" title={`New ${category} from images (Alt+N)`} onClick={() => openDialog('new-thing', { category })}>
          <Plus size={15} />
        </button>
      </div>
      <div class="cat-tabs" role="tablist">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={c === category}
            class={c === category ? 'on' : ''}
            onClick={() => {
              explorerCategory.value = c;
              multi.value = new Set();
            }}
          >
            {LABELS[c]} <small>{p.list(c).length}</small>
          </button>
        ))}
      </div>
      <div class="pane-tools">
        <input type="search" placeholder="Filter id / name" title="Id prefix, a range like 100-200, or a market name" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
        <select title="Only things with this flag" value={flag} onChange={(e) => setFlag((e.target as HTMLSelectElement).value as FlagName | '')}>
          <option value="">All flags</option>
          {supportedFlags(p.features.datFormat).map((f) => (
            <option key={f} value={f}>
              {FLAG_INFO[f].label}
            </option>
          ))}
        </select>
        <div class="seg" title="Thumbnail size">
          {[48, 64, 96].map((s) => (
            <button key={s} class={cell === s ? 'on' : ''} onClick={() => setLayout({ thumb: s })}>
              {s === 48 ? 'S' : s === 64 ? 'M' : 'L'}
            </button>
          ))}
        </div>
      </div>
      <div class="muted small" style={{ padding: '0 12px 4px' }}>
        {ids.length === list.length ? `${list.length} ${LABELS[category].toLowerCase()}` : `${ids.length} of ${list.length} shown`}
        {multi.value.size > 1 ? ` · ${multi.value.size} selected` : ''}
      </div>
      <VirtualGrid
        label={LABELS[category]}
        count={ids.length}
        cellWidth={cell + 12}
        cellHeight={cell + 24}
        selected={selIndex}
        scrollKey={`${category}:${sel}:${ids.length}`}
        onNavigate={(i, shift) => {
          const id = ids[i];
          if (shift && anchor !== null) {
            const a = ids.indexOf(anchor);
            multi.value = new Set(ids.slice(Math.min(a, i), Math.max(a, i) + 1));
            selectThing(category, id, { keepMulti: true });
          } else {
            setAnchor(id);
            selectThing(category, id);
          }
        }}
        onActivate={(i) => selectThing(category, ids[i], { pin: true })}
        renderCell={(i) => {
          const id = ids[i];
          const thing = p.get(category, id)!;
          const isOpen = activeKey === docKey('thing', category, id);
          return (
            <div
              class={`cell ${id === sel && isOpen ? 'selected' : ''} ${multi.value.has(id) && multi.value.size > 1 ? 'multi' : ''}`}
              title={thing.flags.market?.name ? `${category} ${id} — ${thing.flags.market.name}` : `${category} ${id}`}
              onClick={(e) => click(id, e as MouseEvent)}
              onDblClick={() => selectThing(category, id, { pin: true, keepMulti: true })}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!multi.value.has(id)) selectThing(category, id);
                setMenu({ x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY });
              }}
            >
              <Thumb box={cell} image={() => thingThumbnail(p, thing, spriteRev)} deps={[thing, spriteRev, cell]} />
              <span>{id}</span>
            </div>
          );
        }}
      />
      {menu && <Dropdown x={menu.x} y={menu.y} items={contextItems} onClose={() => setMenu(null)} />}
    </>
  );
}


