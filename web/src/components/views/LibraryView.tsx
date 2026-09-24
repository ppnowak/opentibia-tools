import { useState } from 'preact/hooks';
import { ClipboardPaste, Copy, FolderOpen, Package, X } from 'lucide-preact';
import { CATEGORIES, FIRST_ID, type ThingCategory } from '../../../../src/core/dat/types.ts';
import { thingThumbnail } from '../../lib/canvas.ts';
import { copySelection, paste } from '../../lib/commands.ts';
import { pickFiles } from '../../lib/files.ts';
import { classifyFiles, loadClient } from '../../lib/loader.ts';
import { expandZips } from '../../lib/packs.ts';
import { clipboard, layout, library, libraryCategory, librarySelection, project, showActivity, toast, withBusy } from '../../state.ts';
import { Thumb } from '../Thumb.tsx';
import { VirtualGrid } from '../VirtualGrid.tsx';

const LABELS: Record<ThingCategory, string> = { item: 'Items', outfit: 'Outfits', effect: 'Effects', missile: 'Missiles' };

/** Load a client (files or pack zip) into the library side panel. */
export async function openLibrary(input: File[], version?: number): Promise<void> {
  const loaded = await withBusy('Loading library client…', async () => {
    const { files, version: hint } = await expandZips(input);
    const req = classifyFiles(files);
    if (!req.dat || !req.spr) throw new Error('The library needs Tibia.dat and Tibia.spr (or a data pack .zip)');
    const p = await loadClient({ ...req, version: version ?? hint });
    return { project: p, name: `${req.dat.name.replace(/\.dat$/i, '')} ${p.label}` };
  });
  if (!loaded) return;
  library.value = loaded;
  librarySelection.value = new Set();
  showActivity('library');
  toast(`Library: client ${loaded.project.label} with ${loaded.project.dat.outfits.length} outfits and ${loaded.project.dat.items.length} items`, 'success');
}

export function LibraryView() {
  const lib = library.value;
  const target = project.value;
  const category = libraryCategory.value;
  const [anchor, setAnchor] = useState<number | null>(null);
  const sel = librarySelection.value;

  if (!lib) {
    return (
      <>
        <div class="pane-head">
          <span class="grow">Library</span>
        </div>
        <div class="empty-pane">
          <p>Open a second client to copy items, outfits, effects or missiles from it — any version. Things are converted to the edited client's layout on paste.</p>
          <div class="col">
            <button class="primary" onClick={async () => openLibrary(await pickFiles('.dat,.spr,.zip'))}>
              <FolderOpen size={14} /> Open Client into Library…
            </button>
            <button onClick={() => showActivity('packs')}>
              <Package size={14} /> Preload a Data Pack…
            </button>
          </div>
        </div>
      </>
    );
  }

  const list = lib.project.list(category);
  const first = FIRST_ID[category];
  const cell = layout.value.thumb;

  return (
    <>
      <div class="pane-head">
        <span class="grow" title={lib.name}>
          Library · {lib.name}
        </span>
        <button class="icon" title="Copy selection (Ctrl+C)" disabled={!sel.size} onClick={copySelection}>
          <Copy size={15} />
        </button>
        <button
          class="icon"
          title="Paste selection into the edited client"
          disabled={!target || !sel.size}
          onClick={() => {
            copySelection();
            void paste();
          }}
        >
          <ClipboardPaste size={15} />
        </button>
        <button
          class="icon"
          title="Close library client"
          onClick={() => {
            library.value = null;
            if (clipboard.value?.source === lib.project) clipboard.value = null;
          }}
        >
          <X size={15} />
        </button>
      </div>
      <div class="cat-tabs">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            class={c === category ? 'on' : ''}
            onClick={() => {
              libraryCategory.value = c;
              librarySelection.value = new Set();
            }}
          >
            {LABELS[c]} <small>{lib.project.list(c).length}</small>
          </button>
        ))}
      </div>
      <div class="muted small" style={{ padding: '0 12px 4px' }}>
        {sel.size ? `${sel.size} selected — Ctrl+C to copy, Ctrl+V in the editor to paste` : 'Click, Ctrl+click or Shift+click to select'}
      </div>
      <VirtualGrid
        label="Library"
        count={list.length}
        cellWidth={cell + 12}
        cellHeight={cell + 24}
        renderCell={(i) => {
          const id = first + i;
          const thing = list[i];
          return (
            <div
              class={`cell ${sel.has(id) ? 'selected' : ''}`}
              onClick={(e) => {
                const ev = e as MouseEvent;
                const next = ev.ctrlKey || ev.metaKey ? new Set(sel) : new Set<number>();
                if (ev.shiftKey && anchor !== null) {
                  for (let x = Math.min(anchor, id); x <= Math.max(anchor, id); x++) next.add(x);
                } else if (next.has(id)) next.delete(id);
                else next.add(id);
                if (!ev.shiftKey) setAnchor(id);
                librarySelection.value = next;
              }}
            >
              <Thumb box={cell} image={() => thingThumbnail(lib.project, thing, 0)} deps={[thing, cell]} />
              <span>{id}</span>
            </div>
          );
        }}
      />
    </>
  );
}
