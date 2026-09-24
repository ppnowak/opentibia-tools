import { useState } from 'preact/hooks';
import { Project } from '../../../src/core/project.ts';
import { ALL_VERSIONS } from '../../../src/core/versions.ts';
import { classifyFiles, openClient, openJson, type OpenRequest } from '../lib/loader.ts';
import { filesFromDrop, pickFiles } from '../lib/files.ts';
import { files, openDialog, project, resetHistory, select, toast, touch, withBusy } from '../state.ts';
import { expandZips } from '../lib/packs.ts';
import { DataPacks } from './DataPacks.tsx';
import { VersionPicker, type VersionChoice } from './VersionPicker.tsx';
import { DAT_FORMATS } from '../../../src/core/dat/flags.ts';

export function StartScreen() {
  const [picked, setPicked] = useState<OpenRequest>({});
  const [choice, setChoice] = useState<VersionChoice>({});
  const [over, setOver] = useState(false);
  const [newVersion, setNewVersion] = useState<VersionChoice>({ version: 860 });

  const accept = async (input: File[], packVersion?: number) => {
    let list = input;
    let hint = packVersion;
    if (input.some((f) => /\.zip$/i.test(f.name))) {
      const expanded = await withBusy('Extracting zip…', () => expandZips(input));
      if (!expanded) return;
      list = expanded.files;
      hint ??= expanded.version;
    }
    const req = classifyFiles(list);
    if (!req.dat && !req.spr && req.json) return openJson(req.json);
    if (req.other.length && !req.dat && !req.spr && !req.cwm) {
      toast('Drop Tibia.dat and Tibia.spr (optionally Tibia.cwm) files', 'error');
      return;
    }
    const next = { ...picked, ...Object.fromEntries(Object.entries(req).filter(([k, v]) => v && k !== 'other')) };
    setPicked(next);
    if (next.dat && next.spr) await openClient({ ...next, ...(choice.version || !hint ? choice : { version: hint }) });
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    await accept(await filesFromDrop(e));
  };

  return (
    <div class="start">
      <header class="start-header">
        <img src="./icons/icon.svg" alt="" width={48} height={48} />
        <div>
          <h1>OpenTibia Tools</h1>
          <p>Edit Tibia client files of every protocol version — 7.10 to 15.x — right in your browser. Nothing is uploaded.</p>
        </div>
      </header>

      <div class="start-grid">
        <section
          class={`card dropzone ${over ? 'over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <h2>Open a client</h2>
          <p>
            Drop <code>Tibia.dat</code> + <code>Tibia.spr</code> here (optionally an OTClientV8 <code>Tibia.cwm</code>) or a data pack{' '}
            <code>.zip</code>, or pick them:
          </p>
          <div class="row">
            <button class="primary" onClick={async () => accept(await pickFiles('.dat,.spr,.cwm,.json,.zip'))}>
              Choose files…
            </button>
          </div>
          <ul class="picked">
            <li class={picked.dat ? 'ok' : ''}>dat: {picked.dat?.name ?? '—'}</li>
            <li class={picked.spr ? 'ok' : ''}>spr: {picked.spr?.name ?? '—'}</li>
            <li class={picked.cwm ? 'ok' : ''}>cwm: {picked.cwm?.name ?? 'optional'}</li>
          </ul>
          <VersionPicker value={choice} onChange={setChoice} allowAuto />
          <div class="row">
            <button disabled={!picked.dat && !picked.spr} onClick={() => openClient({ ...picked, ...choice })}>
              Open {picked.dat && !picked.spr ? 'dat only' : !picked.dat && picked.spr ? 'sprites only' : ''}
            </button>
            {(picked.dat || picked.spr || picked.cwm) && <button class="ghost" onClick={() => setPicked({})}>Clear</button>}
          </div>
        </section>

        <DataPacks onFiles={(list, version) => accept(list, version)} onZip={(list) => accept(list)} />

        <section class="card">
          <h2>Start from scratch</h2>
          <p>Create an empty client of any version and add items, outfits, effects and missiles from images.</p>
          <VersionPicker value={newVersion} onChange={setNewVersion} />
          <button
            onClick={() => {
              const p = Project.create(newVersion.version ?? 860, newVersion.features);
              project.value = p;
              files.value = {};
              resetHistory();
              select('item', 100);
              touch(true);
            }}
          >
            Create empty client
          </button>
        </section>

        <section class="card">
          <h2>Other tools</h2>
          <ul class="tools">
            <li>
              <button class="link" onClick={() => openDialog('cwm-tool')}>OTClientV8 CWM packer</button> — inspect, extract and
              build <code>Tibia.cwm</code> high resolution sprite files.
            </li>
            <li>
              <button class="link" onClick={async () => { const [f] = await pickFiles('.json', false); if (f) await openJson(f); }}>
                Open dat JSON
              </button>{' '}
              — load a dat exported with <code>npm run unpack-dat</code>.
            </li>
          </ul>
          <details>
            <summary>Supported protocol versions ({ALL_VERSIONS.length})</summary>
            <table class="versions">
              <thead>
                <tr>
                  <th>Version</th>
                  <th>dat format</th>
                  <th>Features</th>
                </tr>
              </thead>
              <tbody>
                {ALL_VERSIONS.map((v) => (
                  <tr key={v.value}>
                    <td>{v.label}</td>
                    <td>{DAT_FORMATS[v.features.datFormat].label}</td>
                    <td>
                      {[v.features.extended && 'extended', v.features.enhancedAnimations && 'improved animations', v.features.frameGroups && 'frame groups']
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </div>
    </div>
  );
}
