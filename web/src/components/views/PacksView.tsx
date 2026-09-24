import { useState } from 'preact/hooks';
import { Download, ExternalLink } from 'lucide-preact';
import { versionLabel } from '../../../../src/core/versions.ts';
import { pickFiles } from '../../lib/files.ts';
import { openFiles } from '../../lib/loader.ts';
import { DATA_PACKS, downloadPackToComputer, PACKS_BASE_URL, packUrl, preloadPack, type DataPack } from '../../lib/packs.ts';
import { project, withBusy } from '../../state.ts';
import { openLibrary } from './LibraryView.tsx';

function packLabel(p: DataPack): string {
  const extra = p.name.includes('_') ? p.name.split('_').slice(1).join(' ') : p.name.split('.').length > 2 ? p.name : '';
  return extra ? `${versionLabel(p.version)} (${extra})` : versionLabel(p.version);
}

/**
 * Public data packs. The user's own browser downloads a pack straight from downloads.ots.me
 * to their computer; the app only extracts it locally. Nothing is hosted or proxied.
 */
export function PacksView() {
  const [name, setName] = useState('860');
  const [waiting, setWaiting] = useState<{ pack: DataPack; target: 'editor' | 'library' } | null>(null);
  const [filter, setFilter] = useState('');
  const pack = DATA_PACKS.find((p) => p.name === name) ?? DATA_PACKS[0];
  const shown = [...DATA_PACKS].reverse().filter((p) => !filter || packLabel(p).includes(filter.trim()) || p.name.includes(filter.trim()));

  const deliver = async (files: File[], target: 'editor' | 'library', version: number) => {
    if (target === 'library') await openLibrary(files, version);
    else await openFiles(files, { version });
  };

  const preload = async (target: 'editor' | 'library') => {
    const result = await withBusy(`Downloading ${pack.name}.zip from downloads.ots.me…`, (progress) => preloadPack(pack, (d, t) => progress(d, t)));
    if (!result) return;
    if (result.kind === 'files') {
      setWaiting(null);
      await deliver(result.files, target, pack.version);
    } else setWaiting({ pack, target });
  };

  return (
    <>
      <div class="pane-head">
        <span class="grow">Data Packs</span>
        <a class="icon" href={PACKS_BASE_URL} target="_blank" rel="noopener noreferrer" title="Open downloads.ots.me">
          <ExternalLink size={14} />
        </a>
      </div>
      <div class="pane-tools">
        <input type="search" placeholder="Filter versions, e.g. 8.6" value={filter} onInput={(e) => setFilter((e.target as HTMLInputElement).value)} />
      </div>
      <div class="pane-body">
        <div class="pack-list" role="listbox" aria-label="Data packs">
          {shown.map((p) => (
            <div
              key={p.name}
              role="option"
              aria-selected={p.name === pack.name}
              class={`pack ${p.name === pack.name ? 'on' : ''}`}
              onClick={() => setName(p.name)}
              onDblClick={() => {
                setName(p.name);
                void preload('editor');
              }}
            >
              <span class="ver">{packLabel(p)}</span>
              <span class="size">{p.size}B</span>
            </div>
          ))}
        </div>
      </div>
      {waiting && (
        <div class="notice" role="status">
          <p>
            Your browser is downloading <strong>{waiting.pack.name}.zip</strong> ({waiting.pack.size}B) from downloads.ots.me. When it finishes, open the
            downloaded file:
          </p>
          <div class="row wrap">
            <button
              class="primary"
              onClick={async () => {
                const files = await pickFiles('.zip,.dat,.spr', true);
                if (files.length) {
                  setWaiting(null);
                  await deliver(files, waiting.target, waiting.pack.version);
                }
              }}
            >
              Open {waiting.pack.name}.zip…
            </button>
            <button class="ghost" onClick={() => downloadPackToComputer(waiting.pack)}>
              Download again
            </button>
            <a class="small" href={packUrl(waiting.pack)} target="_blank" rel="noopener noreferrer">
              direct link
            </a>
          </div>
        </div>
      )}
      <div style={{ padding: 8, borderTop: '1px solid var(--border)' }}>
        <div class="row wrap">
          <button class="primary" onClick={() => preload('editor')}>
            <Download size={14} /> Open {packLabel(pack)}
          </button>
          <button disabled={!project.value} title="Load as the Library client to copy things from" onClick={() => preload('library')}>
            Into Library
          </button>
        </div>
        <p class="hint">
          Packs come straight from downloads.ots.me to your computer and are only extracted locally. OpenTibia Tools does not host, mirror or
          redistribute client files; you are responsible for having the right to use them.
        </p>
      </div>
    </>
  );
}
