import { DAT_FORMATS } from '../../../src/core/dat/flags.ts';
import { versionLabel } from '../../../src/core/versions.ts';
import { datToJson } from '../../../src/core/json.ts';
import { download, pickFiles } from '../lib/files.ts';
import { openCwmIntoProject, openJson } from '../lib/loader.ts';
import { dirty, files, historySize, openDialog, project, redo, revision, tab, undo } from '../state.ts';
import { PropertiesPanel } from './PropertiesPanel.tsx';
import { Sidebar } from './Sidebar.tsx';
import { SpriteView } from './SpriteView.tsx';
import { ThingView } from './ThingView.tsx';

export function Editor() {
  const p = project.value!;
  revision.value;
  const f = p.features;
  const layout = [
    `dat ${DAT_FORMATS[f.datFormat].label}`,
    f.extended && 'extended',
    f.transparency && 'transparency',
    f.enhancedAnimations && 'improved animations',
    f.frameGroups && 'frame groups',
  ]
    .filter(Boolean)
    .join(' · ');

  const close = () => {
    if (dirty.value && !confirm('Discard unsaved changes?')) return;
    project.value = null;
    dirty.value = false;
  };

  return (
    <div class="editor">
      <header class="toolbar">
        <div class="brand" title={layout}>
          <img src="./icons/icon.svg" alt="" width={26} height={26} />
          <strong>Client {p.label}</strong>
          {p.sameSignatureVersions.length > 0 && (
            <span class="muted small" title="These versions share the same signature and file layout">
              (= {p.sameSignatureVersions.map(versionLabel).join(', ')})
            </span>
          )}
          <span class="muted small">{layout}</span>
          {dirty.value && <span class="dirty" title="Unsaved changes">●</span>}
        </div>
        <div class="actions">
          <button title="Undo (Ctrl+Z)" disabled={!historySize.value.undo} onClick={undo}>
            ↶
          </button>
          <button title="Redo (Ctrl+Shift+Z)" disabled={!historySize.value.redo} onClick={redo}>
            ↷
          </button>
          <button onClick={() => openDialog('new-thing', { category: tab.value === 'sprite' ? 'item' : tab.value })}>+ New from images</button>
          <button onClick={() => openDialog('import-client')}>Import from client…</button>
          <details class="menu">
            <summary>More</summary>
            <div class="menu-items">
              <button
                onClick={async () => {
                  const [file] = await pickFiles('.json', false);
                  if (file) await openJson(file);
                }}
              >
                Import things bundle (.json)…
              </button>
              <button
                onClick={async () => {
                  const [file] = await pickFiles('.cwm', false);
                  if (file) await openCwmIntoProject(file);
                }}
              >
                Load OTCv8 high-res sprites (.cwm)…
              </button>
              <button onClick={() => openDialog('cwm-tool')}>CWM packer tool…</button>
              <button onClick={() => download(`Tibia-${p.label}.json`, JSON.stringify(datToJson(p.dat, p.version, p.features), null, 1), 'application/json')}>
                Export dat as JSON
              </button>
              <button onClick={close}>Close client</button>
            </div>
          </details>
          <button class="primary" onClick={() => openDialog('compile')}>
            Save / Compile…
          </button>
        </div>
      </header>
      <div class="files muted small">
        {[files.value.dat, files.value.spr, files.value.cwm].filter(Boolean).join(' · ') || 'new client'} · {p.spr.count} sprites
        {p.hiRes.size ? ` · ${p.hiRes.size} high-res` : ''}
      </div>
      <main class="workspace">
        <Sidebar />
        {tab.value === 'sprite' ? <SpriteView /> : <ThingView />}
        {tab.value !== 'sprite' && <PropertiesPanel />}
      </main>
    </div>
  );
}
