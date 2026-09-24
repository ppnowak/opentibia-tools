import { FilePlus2, FolderOpen, Library, Package } from 'lucide-preact';
import { DAT_FORMATS } from '../../../../src/core/dat/flags.ts';
import { ALL_VERSIONS } from '../../../../src/core/versions.ts';
import { COMMANDS, runCommand } from '../../lib/commands.ts';
import { project, showActivity } from '../../state.ts';

export function WelcomeDoc() {
  const p = project.value;
  const start: Array<[string, string, () => void, preact.ComponentChildren]> = [
    ['Open Client…', 'Ctrl+O', () => runCommand('file.open'), <FolderOpen size={15} />],
    ['Preload a Data Pack…', '', () => showActivity('packs'), <Package size={15} />],
    ['New Client…', 'Alt+Shift+N', () => runCommand('file.new'), <FilePlus2 size={15} />],
    ['Open a Second Client into the Library…', '', () => showActivity('library'), <Library size={15} />],
  ];
  return (
    <div class="doc-scroll">
      <div class="welcome">
        <div class="welcome-head">
          <img src="./icons/icon.svg" alt="" width={52} height={52} />
          <div>
            <h1>OpenTibia Tools</h1>
            <p class="muted" style={{ margin: 0 }}>
              Tibia client editor for every protocol from 7.10 to 15.x — dat, spr and OTClientV8 cwm. Runs entirely in your browser; nothing is
              uploaded.
            </p>
          </div>
        </div>
        <div class="welcome-grid">
          <div>
            <h3>Start</h3>
            <div class="start-list">
              {start.map(([label, keys, run, icon]) => (
                <button key={label} onClick={run}>
                  {icon} {label}
                  {keys && <span class="keys">{keys}</span>}
                </button>
              ))}
            </div>
            <div class="dropzone">Drop Tibia.dat + Tibia.spr, a data pack .zip, a .cwm or a .json anywhere in this window.</div>
            {p && (
              <p class="hint" style={{ marginTop: 12 }}>
                Editing client {p.label} — pick a thing in the Explorer to edit it.
              </p>
            )}
          </div>
          <div>
            <h3>Walkthrough</h3>
            <ul class="tips">
              <li>
                <strong>Explorer</strong> lists items, outfits, effects and missiles. Click to preview in a tab, double-click to keep the tab open,
                Ctrl/Shift+click to select several.
              </li>
              <li>
                <strong>Inspector</strong> (right) edits flags, sizes, patterns, animation timing and outfit preview colors.
              </li>
              <li>
                Drop images on the <strong>sprite tiles</strong> below the preview to replace sprites; 64px art is kept as high-res CWM sprites.
              </li>
              <li>
                <strong>Library</strong>: open another client (any version), select things, <kbd>Ctrl</kbd>+<kbd>C</kbd>, then <kbd>Ctrl</kbd>+
                <kbd>V</kbd> into yours — they are converted automatically.
              </li>
              <li>
                <strong>File › Save As / Convert</strong> writes any other protocol version; <strong>Tools › Validate</strong> lists problems.
              </li>
              <li>
                <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> opens the command palette — type a command or “item 2400”.
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VersionsDoc() {
  return (
    <div class="doc-scroll">
      <h2>Supported protocol versions ({ALL_VERSIONS.length})</h2>
      <p class="muted">Every version reads and writes byte for byte; layout options can be changed for custom clients.</p>
      <table class="data">
        <thead>
          <tr>
            <th>Version</th>
            <th>dat layout</th>
            <th>Extended</th>
            <th>Improved animations</th>
            <th>Frame groups</th>
          </tr>
        </thead>
        <tbody>
          {ALL_VERSIONS.map((v) => (
            <tr key={v.value}>
              <td class="mono">{v.label}</td>
              <td>{DAT_FORMATS[v.features.datFormat].label}</td>
              <td>{v.features.extended ? '✓' : ''}</td>
              <td>{v.features.enhancedAnimations ? '✓' : ''}</td>
              <td>{v.features.frameGroups ? '✓' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ShortcutsDoc() {
  const extra: Array<[string, string]> = [
    ['Space', 'Play / pause animation (thing editor)'],
    [', / .', 'Previous / next frame'],
    ['+ / -, Ctrl+wheel', 'Zoom'],
    ['Arrows, Home, End, PgUp/PgDn', 'Move through the explorer grid'],
    ['Enter', 'Open the selected thing in a pinned tab'],
    ['Ctrl/Shift+click', 'Multi-select in the explorer and library'],
  ];
  return (
    <div class="doc-scroll">
      <h2>Keyboard shortcuts</h2>
      <table class="data" style={{ maxWidth: 720 }}>
        <tbody>
          {COMMANDS.filter((c) => c.keys && c.menu).map((c) => (
            <tr key={c.id}>
              <td style={{ width: 200 }}>
                <kbd>{c.keys}</kbd>
              </td>
              <td>
                {c.menu} › {c.label}
              </td>
            </tr>
          ))}
          {extra.map(([k, d]) => (
            <tr key={k}>
              <td>
                <kbd>{k}</kbd>
              </td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
