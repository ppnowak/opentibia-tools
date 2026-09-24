import { useEffect, useState } from 'preact/hooks';
import { Boxes, Image, Library, Package, Settings2 } from 'lucide-preact';
import { handleShortcut, runCommand } from './lib/commands.ts';
import { filesFromDrop } from './lib/files.ts';
import { openFiles } from './lib/loader.ts';
import {
  activity,
  busy,
  dialog,
  dirty,
  layout,
  paletteOpen,
  setLayout,
  toggleActivity,
  toasts,
  type Activity,
} from './state.ts';
import { CommandPalette } from './components/CommandPalette.tsx';
import { Dialogs } from './components/Dialogs.tsx';
import { Editors } from './components/Editors.tsx';
import { Inspector } from './components/Inspector.tsx';
import { MenuBar } from './components/MenuBar.tsx';
import { Panel } from './components/Panel.tsx';
import { StatusBar } from './components/StatusBar.tsx';
import { Splitter } from './components/ui.tsx';
import { ExplorerView } from './components/views/ExplorerView.tsx';
import { LibraryView } from './components/views/LibraryView.tsx';
import { PacksView } from './components/views/PacksView.tsx';
import { SpritesView } from './components/views/SpritesView.tsx';

const ACTIVITIES: Array<[Activity, string, preact.ComponentChildren]> = [
  ['explorer', 'Explorer (Ctrl+Shift+E)', <Boxes size={22} />],
  ['sprites', 'Sprites (Ctrl+Shift+U)', <Image size={22} />],
  ['library', 'Library — another client (Ctrl+Shift+L)', <Library size={22} />],
  ['packs', 'Data packs', <Package size={22} />],
];

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function App() {
  const [dragging, setDragging] = useState(false);
  const l = layout.value;

  useEffect(() => {
    // small screens: side panes overlay the editor, so start with only one of them open
    if (window.innerWidth < 900 && layout.value.inspector && layout.value.sidebar) setLayout({ inspector: false });
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.value) e.preventDefault();
    };
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'F1') {
        e.preventDefault();
        paletteOpen.value = true;
        return;
      }
      handleShortcut(e);
    };
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      depth++;
      setDragging(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setDragging(false);
    };
    const over = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const drop = async (e: DragEvent) => {
      depth = 0;
      setDragging(false);
      if (e.defaultPrevented || !e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      await openFiles(await filesFromDrop(e));
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('keydown', keys);
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('keydown', keys);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  return (
    <div class="wb">
      <MenuBar />
      <div class="wb-main">
        <nav class="activitybar" aria-label="Views">
          {ACTIVITIES.map(([key, label, icon]) => (
            <button key={key} title={label} aria-label={label} class={l.sidebar && activity.value === key ? 'on' : ''} onClick={() => toggleActivity(key)}>
              {icon}
            </button>
          ))}
          <span class="spacer" />
          <button title="Command palette (Ctrl+Shift+P)" aria-label="Command palette" onClick={() => runCommand('view.palette')}>
            <Settings2 size={20} />
          </button>
        </nav>
        {l.sidebar && (
          <>
            <aside class="sidebar" style={{ width: l.sidebarWidth }} aria-label="Side bar">
              {activity.value === 'explorer' && <ExplorerView />}
              {activity.value === 'sprites' && <SpritesView />}
              {activity.value === 'library' && <LibraryView />}
              {activity.value === 'packs' && <PacksView />}
            </aside>
            <Splitter dir="v" onDrag={(d) => setLayout({ sidebarWidth: clamp(layout.value.sidebarWidth + d, 200, 700) })} />
          </>
        )}
        <main class="wb-center">
          <Editors />
          {l.panel && (
            <>
              <Splitter dir="h" onDrag={(d) => setLayout({ panelHeight: clamp(layout.value.panelHeight - d, 90, 600) })} />
              <Panel />
            </>
          )}
        </main>
        {l.inspector && (
          <>
            <Splitter dir="v" onDrag={(d) => setLayout({ inspectorWidth: clamp(layout.value.inspectorWidth - d, 220, 600) })} />
            <Inspector width={l.inspectorWidth} />
          </>
        )}
      </div>
      <StatusBar />

      {dialog.value && <Dialogs />}
      {paletteOpen.value && <CommandPalette />}
      {dragging && <div class="drop-overlay">Drop to open — Tibia.dat + Tibia.spr, a data pack .zip, a .cwm or a .json</div>}
      {busy.value && (
        <div class="overlay busy" role="status" aria-live="polite">
          <div class="busy-box">
            <div class="spinner" />
            <div>{busy.value.label}</div>
            {busy.value.total ? <progress value={busy.value.done} max={busy.value.total} /> : null}
          </div>
        </div>
      )}
      <div class="toasts" aria-live="polite">
        {toasts.value.map((t) => (
          <div key={t.id} class={`toast lvl-${t.kind}`}>
            <span style={{ color: 'var(--text)' }}>{t.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
